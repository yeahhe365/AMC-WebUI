import type { GenerateContentResponse, Part, UsageMetadata } from '@google/genai';
import { type ChatHistoryItem, type StreamMessageSender, type NonStreamMessageSender } from '@/types';
import { logService } from '@/services/logService';
import { executeConfiguredApiRequest } from './apiExecutor';
import { adaptGenAiResponse, mergeGroundingMetadata, type MetadataWithCitations } from './chatResponseAdapter';
import { getHttpOptionsForContents, withHttpOptionHeaders } from './geminiApiVersion';
import { createStreamIdleTimeoutError, hasStreamIdleTimeoutElapsed } from './streamIdleTimeout';

const withAbortSignal = <T extends object>(
  config: T | undefined,
  abortSignal: AbortSignal,
): T & { abortSignal: AbortSignal } => ({
  ...(config || ({} as T)),
  abortSignal,
});

/**
 * FinishReason values that mean the response was withheld, not merely finished.
 * Mirrors the "Generation blocked" codes in the Gemini docs (safety, recitation,
 * language, other, prohibited_content, spii, blocklist, image_safety,
 * image_prohibited_content, image_recitation) plus the two no-content cases
 * that only exist as finish reasons (ESCALATION, NO_IMAGE).
 */
const CONTENT_BLOCKED_FINISH_REASONS = new Set([
  'SAFETY',
  'RECITATION',
  'LANGUAGE',
  'OTHER',
  'BLOCKLIST',
  'PROHIBITED_CONTENT',
  'SPII',
  'IMAGE_SAFETY',
  'IMAGE_PROHIBITED_CONTENT',
  'IMAGE_RECITATION',
  'ESCALATION',
  'NO_IMAGE',
]);

/**
 * Gemini docs best practice: always check finishReason so a failed turn is not
 * mistaken for a successful empty answer. The tool-loop case matters most —
 * MALFORMED_FUNCTION_CALL means the model intended to run an action but the
 * API discarded the invalid call, so silently ending the loop would hide a
 * step the user asked for.
 */
const assertUsableTurn = ({
  finishReason,
  blockReason,
  hasUsableParts,
}: {
  finishReason?: string;
  blockReason?: string;
  hasUsableParts: boolean;
}): void => {
  if (finishReason === 'MALFORMED_FUNCTION_CALL') {
    throw new Error(
      'The model tried to call a function but produced malformed arguments (finishReason: MALFORMED_FUNCTION_CALL). Try rephrasing the request or simplifying the tools involved.',
    );
  }

  if (!hasUsableParts && typeof finishReason === 'string' && CONTENT_BLOCKED_FINISH_REASONS.has(finishReason)) {
    throw new Error(`The model returned no content because generation was stopped (${finishReason}).`);
  }

  if (!hasUsableParts && blockReason) {
    throw new Error(`The prompt was blocked before generation could start (${blockReason}).`);
  }
};

const assertUsableTurnResponse = (response: GenerateContentResponse, extractedParts: Part[]): void =>
  assertUsableTurn({
    finishReason: response.candidates?.[0]?.finishReason,
    blockReason: response.promptFeedback?.blockReason,
    hasUsableParts: extractedParts.length > 0,
  });

export const generateContentTurnApi = async (
  apiKey: string,
  modelId: string,
  contents: ChatHistoryItem[],
  config: unknown,
  abortSignal: AbortSignal,
) => {
  const abortError = new Error('aborted');
  abortError.name = 'AbortError';

  if (abortSignal.aborted) {
    throw abortError;
  }

  const response = await executeConfiguredApiRequest({
    apiKey,
    label: `Generating content turn for ${modelId}`,
    errorLabel: `Error generating content turn for ${modelId}:`,
    abortSignal,
    httpOptions: getHttpOptionsForContents(contents),
    run: async ({ client: ai }) =>
      ai.models.generateContent({
        model: modelId,
        contents,
        config: withAbortSignal(config as Parameters<typeof ai.models.generateContent>[0]['config'], abortSignal),
      }),
  });

  if (abortSignal.aborted) {
    throw abortError;
  }

  const { parts, thoughts, usage, grounding, urlContext } = adaptGenAiResponse(response);
  assertUsableTurnResponse(response, parts);
  const candidateContent = response.candidates?.[0]?.content;

  return {
    modelContent: {
      role: 'model' as const,
      parts: candidateContent?.parts ?? parts,
    },
    parts,
    thoughts,
    usage,
    grounding,
    urlContext,
    functionCalls: response.functionCalls ?? [],
  };
};

export const sendStatelessMessageStreamApi: StreamMessageSender = async (
  apiKey,
  modelId,
  history,
  parts,
  config,
  abortSignal,
  onPart,
  onThoughtChunk,
  onError,
  onComplete,
  role = 'user',
  // Gemini-native calls ignore providerId; the param exists only so the shared
  // StreamMessageSender signature matches the OpenAI/Anthropic senders.
  _providerId,
  streamResume,
) => {
  logService.info(`Sending message via stateless generateContentStream for ${modelId} (Role: ${role})`);
  let finalUsageMetadata: UsageMetadata | undefined = undefined;
  let finalGroundingMetadata: MetadataWithCitations | null = null;
  let finalUrlContextMetadata: unknown = null;
  const contents = [...history, { role, parts }];
  // Set when the stream ended in a failure (watchdog timeout or upstream
  // error). The run callback can return normally after a timeout (the fetch was
  // aborted, not thrown), so this flag is what prevents a spurious onComplete.
  let streamFailed = false;

  // Stream-journal resume: stamp x-amc-job-id / x-amc-last-seq on the request
  // so the api container replays the buffered upstream from this cursor. The
  // secret authenticates the attach when the job was created with one.
  const resumeHeaders = streamResume
    ? {
        'x-amc-job-id': streamResume.jobId,
        'x-amc-last-seq': String(streamResume.lastSeq),
        ...(streamResume.jobSecret ? { 'x-amc-job-secret': streamResume.jobSecret } : {}),
      }
    : undefined;

  try {
    await executeConfiguredApiRequest({
      apiKey,
      label: `Sending message via stateless generateContentStream for ${modelId} (Role: ${role})`,
      errorLabel: 'Error sending message (stream):',
      httpOptions: withHttpOptionHeaders(getHttpOptionsForContents(contents), resumeHeaders),
      run: async ({ client: ai }) => {
        if (abortSignal.aborted) {
          logService.warn('Streaming aborted by signal before start.');
          return;
        }

        // Watchdog: each received chunk resets the timer; an idle window longer
        // than STREAM_IDLE_TIMEOUT_MS aborts the request. The abort goes to a
        // dedicated internal signal (also wired to the user's signal so either
        // direction cancels the fetch), which the SDK forwards into the fetch —
        // this settles a pending reader.read() that the `for await` is stuck on.
        // The `timedOut` flag then forces the loop to surface a stream error
        // rather than report success, and keeps the abort from masquerading as
        // a user-initiated stop in the caller's error handling.
        let timedOut = false;
        let lastActivityAt = Date.now();
        const watchdogController = new AbortController();
        // User abort cancels the watchdog too, so the SDK request still dies on
        // Esc even though the loop is iterating over the internal signal. Handle
        // the case where the signal was already aborted between the entry check
        // and this listener being attached (addEventListener never fires for an
        // already-aborted signal).
        const onUserAbort = () => watchdogController.abort();
        if (abortSignal.aborted) {
          watchdogController.abort();
        } else {
          abortSignal.addEventListener('abort', onUserAbort, { once: true });
        }
        const idleWatchdog = setInterval(() => {
          if (hasStreamIdleTimeoutElapsed(lastActivityAt)) {
            timedOut = true;
            watchdogController.abort();
          }
        }, 5_000);
        // The watchdog must not keep the process alive on its own; the user's
        // abort signal owns lifetime. Any live chunk clears the timer anyway.
        idleWatchdog.unref?.();

        let resumeSeq = streamResume?.lastSeq ?? 0;
        // The last chunk carries the terminal finishReason; prompt blocks arrive
        // as promptFeedback with no candidates. Both are only actionable once the
        // stream is exhausted, so track them and assert after the loop.
        let lastFinishReason: string | undefined;
        let lastBlockReason: string | undefined;
        let streamedAnyPart = false;

        try {
          const result = await ai.models.generateContentStream({
            model: modelId,
            contents,
            config: withAbortSignal(
              config as Parameters<typeof ai.models.generateContentStream>[0]['config'],
              watchdogController.signal,
            ),
          });

          for await (const chunkResponse of result) {
            if (abortSignal.aborted) {
              logService.warn('Streaming aborted by signal.');
              break;
            }
            lastActivityAt = Date.now();
            const adaptedChunk = adaptGenAiResponse(chunkResponse as GenerateContentResponse);

            const chunkFinishReason = (chunkResponse as GenerateContentResponse).candidates?.[0]?.finishReason;
            if (chunkFinishReason) {
              lastFinishReason = chunkFinishReason;
            }
            const chunkBlockReason = (chunkResponse as GenerateContentResponse).promptFeedback?.blockReason;
            if (chunkBlockReason) {
              lastBlockReason = chunkBlockReason;
            }
            if (adaptedChunk.parts.length > 0) {
              streamedAnyPart = true;
            }

            if (adaptedChunk.usage) {
              finalUsageMetadata = adaptedChunk.usage;
            }
            finalGroundingMetadata = mergeGroundingMetadata(finalGroundingMetadata, adaptedChunk.grounding);
            if (adaptedChunk.urlContext) {
              finalUrlContextMetadata = adaptedChunk.urlContext;
            }
            if (adaptedChunk.thoughts) {
              onThoughtChunk(adaptedChunk.thoughts);
            }
            for (const part of adaptedChunk.parts) {
              onPart(part);
            }
            // Each streamed chunk from the SDK maps to one journal event on the
            // wire (the proxy splits on \n\n). Advance the cursor so a future
            // resume picks up at the next boundary.
            if (streamResume?.onSeq) {
              resumeSeq += 1;
              streamResume.onSeq(resumeSeq);
            }
          }
        } catch (error) {
          // A watchdog abort makes the SDK's reader.read() settle, but whether
          // the stream then ends cleanly (done) or throws depends on the SDK
          // internals. Route a timeout to a surfaced stream error; never let it
          // masquerade as a user-initiated stop — but a real user abort wins
          // over a timeout that raced in the same tick, so check the user signal
          // first and let the caller's AbortError path handle it.
          if (abortSignal.aborted) {
            throw error;
          }
          if (timedOut) {
            streamFailed = true;
            onError(createStreamIdleTimeoutError());
            return;
          }
          throw error;
        } finally {
          clearInterval(idleWatchdog);
          abortSignal.removeEventListener('abort', onUserAbort);
        }

        if (!abortSignal.aborted && timedOut) {
          streamFailed = true;
          onError(createStreamIdleTimeoutError());
          return;
        }

        // Same contract as the non-streaming turn: a filtered or malformed
        // finish must surface as an error, not as a silently empty reply.
        if (!abortSignal.aborted) {
          assertUsableTurn({
            finishReason: lastFinishReason,
            blockReason: lastBlockReason,
            hasUsableParts: streamedAnyPart,
          });
        }
      },
    });
  } catch (error) {
    onError(error instanceof Error ? error : new Error(String(error) || 'Unknown error during streaming.'));
    return;
  } finally {
    logService.info('Streaming complete.', { usage: finalUsageMetadata, hasGrounding: !!finalGroundingMetadata });
  }

  if (!streamFailed) {
    onComplete(finalUsageMetadata, finalGroundingMetadata, finalUrlContextMetadata);
  }
};

export const sendStatelessMessageNonStreamApi: NonStreamMessageSender = async (
  apiKey,
  modelId,
  history,
  parts,
  config,
  abortSignal,
  onError,
  onComplete,
  role = 'user',
  _providerId,
) => {
  logService.info(`Sending message via stateless generateContent (non-stream) for model ${modelId}`);
  const contents = [...history, { role, parts }];

  try {
    await executeConfiguredApiRequest({
      apiKey,
      label: `Sending message via stateless generateContent (non-stream) for model ${modelId}`,
      errorLabel: `Error in stateless non-stream for ${modelId}:`,
      httpOptions: getHttpOptionsForContents(contents),
      run: async ({ client: ai }) => {
        if (abortSignal.aborted) {
          onComplete([], '', undefined, undefined, undefined);
          return;
        }

        const response = await ai.models.generateContent({
          model: modelId,
          contents,
          config: withAbortSignal(config as Parameters<typeof ai.models.generateContent>[0]['config'], abortSignal),
        });

        if (abortSignal.aborted) {
          onComplete([], '', undefined, undefined, undefined);
          return;
        }

        const { parts: responseParts, thoughts, usage, grounding, urlContext } = adaptGenAiResponse(response);
        assertUsableTurnResponse(response, responseParts);

        logService.info(`Stateless non-stream complete for ${modelId}.`, {
          usage,
          hasGrounding: !!grounding,
          hasUrlContext: !!urlContext,
        });
        onComplete(responseParts, thoughts, usage, grounding, urlContext);
      },
    });
  } catch (error) {
    onError(
      error instanceof Error ? error : new Error(String(error) || 'Unknown error during stateless non-streaming call.'),
    );
  }
};
