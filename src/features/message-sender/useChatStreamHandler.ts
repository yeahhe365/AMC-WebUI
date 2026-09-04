import { type MutableRefObject, useCallback } from 'react';
import { deferToNextTick } from '@/utils/deferToNextTick';
import {
  type AppSettings,
  type SavedChatSession,
  type ChatSettings as IndividualChatSettings,
  type UploadedFile,
} from '@/types';
import type { Part, UsageMetadata } from '@google/genai';
import { useApiErrorHandler } from './useApiErrorHandler';
import { logService } from '@/services/logService';
import { calculateTokenStats } from '@/utils/model/modelUsageStats';
import { finalizeMessages } from '@/features/chat-streaming/processors';
import { streamingStore } from '@/stores/streamingStore';
import { buildExactPricingFromUsageMetadata } from '@/utils/usagePricingTelemetry';
import { resolveChatExactPricing } from '@/utils/chatPricingEvidence';
import { updateMessageInSession, updateSessionById } from '@/utils/chat/sessionMutations';
import { createMessageStreamState, reduceMessageStreamEvent } from '@/features/chat-streaming/messageStreamReducer';
import { getContentDeltaFromPart, mergeUniqueFiles } from '@/features/chat-streaming/messageStreamParts';
import {
  createInlineThinkingParserState,
  pushInlineThinkingChunk,
} from '@/features/chat-streaming/inlineThinkingParser';
import { finishActiveGenerationJob } from './activeGenerationJobs';
import { clearOwnedPendingStreamJob } from '@/features/stream-jobs/amcStreamJobs';
import { buildCompletionNotificationBody, emitCompletionFeedback } from './completionFeedback';
import { getTranslator } from '@/i18n/translations';
import { resolveAppLanguage } from '@/i18n/languageRegistry';
import { useChatStore } from '@/stores/chatStore';
import type { StreamHandlerOptions } from './messageSenderTypes';

type SessionsUpdater = (
  updater: (prev: SavedChatSession[]) => SavedChatSession[],
  options?: { persist?: boolean },
) => void;

interface ChatStreamHandlerProps {
  appSettings: AppSettings;
  updateAndPersistSessions: SessionsUpdater;
  setSessionLoading: (sessionId: string, isLoading: boolean) => void;
  activeJobs: MutableRefObject<Map<string, AbortController>>;
}

export const useChatStreamHandler = ({
  appSettings,
  updateAndPersistSessions,
  setSessionLoading,
  activeJobs,
}: ChatStreamHandlerProps) => {
  const { handleApiError } = useApiErrorHandler(updateAndPersistSessions);

  const getStreamHandlers = useCallback(
    (
      currentSessionId: string,
      generationId: string,
      abortController: AbortController,
      generationStartTime: Date,
      currentChatSettings: IndividualChatSettings,
      requestParts: Part[] = [],
      onSuccess?: (generationId: string, finalContent: string) => void,
      transformFinalContent?: (finalContent: string) => string,
    ) => {
      const newModelMessageIds = new Set<string>([generationId]);
      let streamState = createMessageStreamState({ generationId, generationStartTime });
      let hasCommittedThinkingTime = false;

      // Reset store for this new generation
      streamingStore.clear(generationId);

      // Splits inline reasoning tags (<thinking>/<think>) out of text deltas
      // for third-party providers. Per-generation state lives here (the
      // reducer stays pure).
      const inlineThinkingParser = createInlineThinkingParserState();

      // Record the thinking provenance (Gemini-native vs third-party) on the
      // message the first time a thought arrives, so the renderer can force
      // third-party thinking into the flat strip. The patch is idempotent and
      // cheap; streaming calls it on every chunk via onFirstPart.
      const syncThinkingSource = (source?: 'gemini' | 'third-party') => {
        if (!source) {
          return;
        }
        updateAndPersistSessions(
          (prev) =>
            updateMessageInSession(prev, currentSessionId, generationId, (message) =>
              message.thinkingSource === source
                ? message
                : {
                    ...message,
                    thinkingSource: source,
                  },
            ),
          { persist: false },
        );
      };

      const syncFirstTokenTime = (previousFirstTokenTimeMs?: number) => {
        if (previousFirstTokenTimeMs === undefined && streamState.firstTokenTimeMs !== undefined) {
          updateAndPersistSessions(
            (prev) =>
              updateMessageInSession(prev, currentSessionId, generationId, {
                firstTokenTimeMs: streamState.firstTokenTimeMs,
              }),
            { persist: false },
          );
        }
      };

      // Thinking ends when the model visibly switches to answering. The
      // reducer marks that switch on the first text/inline-data part and keeps
      // interleaved code-execution and resumed thinking active. We commit
      // thinkingTimeMs exactly once per switch so ThinkingHeader settles while
      // the rest of the reply streams, then re-open thinking when the model
      // thinks again. Two details:
      //  - The "thoughts exist" check reads the post-reduce state, because an
      //    inline-reasoning chunk can carry both the closing tag and the answer
      //    (thought + content land in the same part, so pre-reduce thoughts are
      //    still empty).
      //  - The "new content" check compares lastContentPartTime, not a
      //    first-content-part flag: that flag stays true forever after the
      //    first content switch, which would block the second commit on
      //    interleaved thought/content streams (problem B).
      const syncThinkingEnd = (previousLastContentPartTime: Date | undefined) => {
        if (
          hasCommittedThinkingTime ||
          streamState.lastContentPartTime === undefined ||
          streamState.lastContentPartTime === previousLastContentPartTime ||
          !streamState.thoughts
        ) {
          return;
        }
        hasCommittedThinkingTime = true;
        const thinkingTimeMs = streamState.lastContentPartTime.getTime() - streamState.generationStartTime.getTime();
        updateAndPersistSessions(
          (prev) =>
            updateMessageInSession(prev, currentSessionId, generationId, {
              thinkingTimeMs,
              thinkingActive: false,
            }),
          { persist: false },
        );
      };

      // Re-entered thinking after a content switch (interleaved thought /
      // content streams, code-execution round trips): clear the settled value
      // so the strip and the live timer come back.
      const syncThinkingResume = (previousFirstContentPartTime: Date | null) => {
        if (previousFirstContentPartTime === null || streamState.firstContentPartTime === null) {
          return;
        }
        hasCommittedThinkingTime = false;
        updateAndPersistSessions(
          (prev) =>
            updateMessageInSession(prev, currentSessionId, generationId, (message) =>
              message.thinkingActive === true && message.thinkingTimeMs === undefined
                ? message
                : {
                    ...message,
                    thinkingTimeMs: undefined,
                    thinkingActive: true,
                  },
            ),
          { persist: false },
        );
      };

      const streamOnError = (error: Error) => {
        // Pass accumulated content so it can be saved even on error/abort
        handleApiError(error, currentSessionId, generationId, 'Error', streamState.content, streamState.thoughts, true);
        finishActiveGenerationJob({
          activeJobs,
          setSessionLoading,
          sessionId: currentSessionId,
          generationId,
        });
        // Reclaim the pending stream-job record so a later session reload does
        // not mistake a failed generation for an in-flight one and try to
        // resume it. The owned variant only clears this tab's record, so a
        // failure in one tab never deletes another tab's live job.
        clearOwnedPendingStreamJob(currentSessionId);
        streamingStore.clear(generationId);
      };

      const streamOnComplete = (
        usageMetadata?: UsageMetadata,
        groundingMetadata?: unknown,
        urlContextMetadata?: unknown,
        generatedFiles?: UploadedFile[],
      ) => {
        const lang = resolveAppLanguage(appSettings.language);

        streamState = reduceMessageStreamEvent(streamState, {
          type: 'complete',
          usage: usageMetadata,
          grounding: groundingMetadata,
          urlContext: urlContextMetadata,
          generatedFiles,
          aborted: abortController.signal.aborted,
        });

        // 空回复兜底：流正常结束（未中止）却没有任何正式内容产出时，不应静默
        // 保存一条空消息。上游/代理可能返回"只思考、不输出"的响应（O:0），或
        // SDK 解析漏掉文本 part——这两种情况前端此前都当作成功。改为走错误路径，
        // 保留思考内容并明确提示，避免用户看到"回复到一半中断且无任何提示"。
        if (!abortController.signal.aborted && streamState.content.trim() === '') {
          const hasMeaningfulApiPart = streamState.apiParts.some((part) => {
            const anyPart = part as Part & {
              text?: string;
              executableCode?: unknown;
              codeExecutionResult?: unknown;
              inlineData?: unknown;
              functionCall?: unknown;
            };
            return Boolean(
              (anyPart.text && anyPart.text.trim().length > 0) ||
              anyPart.executableCode ||
              anyPart.codeExecutionResult ||
              anyPart.inlineData ||
              anyPart.functionCall,
            );
          });
          if (!hasMeaningfulApiPart) {
            const t = getTranslator(lang);
            const emptyReplyError = new Error(
              t(streamState.thoughts.trim() ? 'messageSenderEmptyReplyWithThoughts' : 'messageSenderEmptyReply'),
            );
            emptyReplyError.name = 'EmptyReplyError';
            logService.warn(`Empty reply detected for message ${generationId} in session ${currentSessionId}`);
            handleApiError(
              emptyReplyError,
              currentSessionId,
              generationId,
              'Error',
              streamState.content,
              streamState.thoughts,
              true,
            );
            finishActiveGenerationJob({
              activeJobs,
              setSessionLoading,
              sessionId: currentSessionId,
              generationId,
            });
            clearOwnedPendingStreamJob(currentSessionId);
            streamingStore.clear(generationId);
            return;
          }
        }

        if (transformFinalContent) {
          streamState = {
            ...streamState,
            content: transformFinalContent(streamState.content),
          };
        }

        if (streamState.usage) {
          const {
            promptTokens,
            cachedPromptTokens,
            completionTokens,
            thoughtTokens,
            toolUsePromptTokens,
            totalTokens,
          } = calculateTokenStats(streamState.usage);
          const exactPricing = resolveChatExactPricing({
            providerExactPricing: buildExactPricingFromUsageMetadata('chat', streamState.usage),
            requestParts,
            responseParts: streamState.apiParts,
            promptTokens,
            cachedPromptTokens,
            toolUsePromptTokens,
            outputTokens: completionTokens + thoughtTokens,
          });
          logService.recordTokenUsage(
            currentChatSettings.modelId,
            {
              promptTokens,
              cachedPromptTokens,
              completionTokens,
              thoughtTokens,
              toolUsePromptTokens,
              totalTokens,
            },
            exactPricing,
          );
        }

        updateAndPersistSessions(
          (previousSessions) =>
            updateSessionById(previousSessions, currentSessionId, (sessionToUpdate) => {
              const updatedMessages = sessionToUpdate.messages.map((message) => {
                if (message.id === generationId) {
                  return {
                    ...message,
                    content: (message.content || '') + streamState.content,
                    thoughts: (message.thoughts || '') + streamState.thoughts,
                    files: streamState.files.length
                      ? mergeUniqueFiles(message.files, streamState.files)
                      : message.files,
                    apiParts: message.apiParts ? [...message.apiParts, ...streamState.apiParts] : streamState.apiParts,
                  };
                }
                return message;
              });

              const finalizationResult = finalizeMessages({
                messages: updatedMessages,
                generationStartTime,
                newModelMessageIds,
                currentChatSettings,
                language: lang,
                // Non-streaming replies are replayed at completion time
                // (recordFirstToken:false in standardChatApiCall), so there is
                // no per-chunk thought timing to separate from answer timing:
                // thinkingTimeMs for those runs means the whole round-trip
                // duration, which is the expected semantic here.
                firstContentPartTime: streamState.firstContentPartTime,
                lastThoughtChunkTimeMs: streamState.lastThoughtChunkTimeMs,
                usageMetadata: streamState.usage,
                groundingMetadata: streamState.grounding,
                urlContextMetadata: streamState.urlContext,
                isAborted: abortController.signal.aborted,
              });

              if (finalizationResult.completedMessageForNotification && !abortController.signal.aborted) {
                const t = getTranslator(lang);
                const notificationTitle =
                  finalizationResult.completedMessageForNotification.role === 'error'
                    ? t('messageSenderResponseErrorTitle')
                    : t('messageSenderResponseReadyTitle');
                void emitCompletionFeedback(
                  {
                    isCompletionNotificationEnabled: appSettings.isCompletionNotificationEnabled,
                    isCompletionSoundEnabled: appSettings.isCompletionSoundEnabled,
                    isCompletionSoundBackgroundOnly: appSettings.isCompletionSoundBackgroundOnly,
                  },
                  {
                    variant: finalizationResult.completedMessageForNotification.role === 'error' ? 'error' : 'success',
                    notification: {
                      title: notificationTitle,
                      body: buildCompletionNotificationBody(finalizationResult.completedMessageForNotification),
                    },
                  },
                );
              }

              return {
                ...sessionToUpdate,
                messages: finalizationResult.updatedMessages,
              };
            }),
          { persist: true },
        );

        // 流式、非流式、tool loop、stream resume 都汇聚到此处;仅未中止的成功
        // 路径写入完成标记。markSessionCompleted 内部会跳过当前活跃会话。
        if (!abortController.signal.aborted) {
          useChatStore.getState().markSessionCompleted(currentSessionId, 'success');
        }

        finishActiveGenerationJob({
          activeJobs,
          setSessionLoading,
          sessionId: currentSessionId,
          generationId,
        });
        streamingStore.clear(generationId);

        if (onSuccess && !abortController.signal.aborted) {
          deferToNextTick(() => onSuccess(generationId, streamState.content));
        }
      };

      const streamOnPart = (part: Part, options?: StreamHandlerOptions) => {
        const previousFirstTokenTimeMs = streamState.firstTokenTimeMs;
        const previousFirstContentPartTime = streamState.firstContentPartTime;
        const previousLastContentPartTime = streamState.lastContentPartTime;
        const previousFiles = streamState.files;

        // Stamp thinking provenance as soon as the stream produces anything —
        // the very first part/thought decides whether third-party thinking is
        // forced into the flat strip.
        syncThinkingSource(options?.source);

        // Split inline reasoning tags out of text deltas. Third-party providers
        // (DeepSeek-R1 style) stream their chain of thought inside the text
        // part; without this it would land in content, never feed thoughts, and
        // never be timed. Plain text passes through untouched, so Gemini and
        // Raw Mode paths are unaffected. Non-text parts keep the raw delta.
        const anyPart = part as Part & { text?: string };
        const split =
          typeof anyPart.text === 'string' ? pushInlineThinkingChunk(inlineThinkingParser, anyPart.text) : undefined;
        const contentDelta = split ? split.content : getContentDeltaFromPart(part);
        const thoughtDelta = split ? split.thought : '';

        streamState = reduceMessageStreamEvent(streamState, {
          type: 'part',
          part,
          contentDelta,
          thoughtDelta,
          receivedAt: new Date(),
          recordFirstToken: options?.recordFirstToken,
        });
        syncFirstTokenTime(previousFirstTokenTimeMs);

        // Re-entered thinking after a content switch (interleaved thought /
        // content streams): clear the settled value so the strip and the live
        // timer come back. Inline thought deltas need the same resume as
        // Gemini-native onThoughtChunk. When one chunk carries thought then
        // content (closer + answer together), resume runs before the end-sync
        // so the new segment still commits its own duration.
        if (thoughtDelta) {
          syncThinkingResume(previousFirstContentPartTime);
        }
        syncThinkingEnd(previousLastContentPartTime);

        if (contentDelta) {
          streamingStore.updateContent(generationId, contentDelta);
        }
        if (thoughtDelta) {
          streamingStore.updateThoughts(generationId, thoughtDelta);
        }

        const newFiles = streamState.files.filter((file) => !previousFiles.some((existing) => existing.id === file.id));
        if (newFiles.length > 0) {
          updateAndPersistSessions(
            (prev) =>
              updateMessageInSession(prev, currentSessionId, generationId, (message) => ({
                ...message,
                files: mergeUniqueFiles(message.files, newFiles),
              })),
            { persist: false },
          );
        }
      };

      const onThoughtChunk = (thoughtChunk: string, options?: StreamHandlerOptions) => {
        const previousFirstTokenTimeMs = streamState.firstTokenTimeMs;
        const previousFirstContentPartTime = streamState.firstContentPartTime;
        syncThinkingSource(options?.source);
        streamState = reduceMessageStreamEvent(streamState, {
          type: 'thought',
          text: thoughtChunk,
          receivedAt: new Date(),
          recordFirstToken: options?.recordFirstToken,
        });
        syncFirstTokenTime(previousFirstTokenTimeMs);
        syncThinkingResume(previousFirstContentPartTime);
        streamingStore.updateThoughts(generationId, thoughtChunk);
      };

      return { streamOnError, streamOnComplete, streamOnPart, onThoughtChunk };
    },
    [
      appSettings.isCompletionNotificationEnabled,
      appSettings.isCompletionSoundEnabled,
      appSettings.isCompletionSoundBackgroundOnly,
      appSettings.language,
      updateAndPersistSessions,
      handleApiError,
      setSessionLoading,
      activeJobs,
    ],
  );

  return { getStreamHandlers };
};
