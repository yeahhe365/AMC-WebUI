import type { FunctionCall, Part, UsageMetadata } from '@google/genai';
import { getErrorMessage } from '@/utils/errorMessage';
import type { ChatHistoryItem, StandardClientFunctions, UploadedFile } from '@/types';
import { toStructuredToolResponse } from '@/features/chat-tools/toolResponse';
import { mergeUsageMetadata, mergeUrlContextMetadata } from '@/features/chat-streaming/messageStreamMetadata';
import { getGroundingChunkSource, type GroundingChunkLike, type GroundingSource } from '@/utils/groundingMetadata';
import { isRecord } from '../../../shared/predicates';

interface StandardToolTurnResult {
  modelContent: ChatHistoryItem;
  parts: Part[];
  thoughts?: string;
  functionCalls?: FunctionCall[];
  usage?: UsageMetadata;
  grounding?: unknown;
  urlContext?: unknown;
}

interface StandardToolLoopMessagePair {
  modelContent: ChatHistoryItem;
  functionResponseParts: Part[];
}

interface RunStandardToolLoopOptions {
  initialContents: ChatHistoryItem[];
  clientFunctions: StandardClientFunctions;
  runTurn: (contents: ChatHistoryItem[]) => Promise<StandardToolTurnResult>;
  abortSignal?: AbortSignal;
  /**
   * Maximum number of model turns (rounds) before the loop stops gracefully.
   * A model that repeats tool calls forever would otherwise issue billable API
   * turns without end. When the cap is reached, every completed round is kept,
   * the pending calls are not executed, and a notice text part is appended.
   */
  maxToolRounds?: number;
  /**
   * Fired the moment an iteration's calls begin executing, before any handler
   * resolves, so the caller can surface live tool cards while tools run.
   */
  onToolCallsStarted?: (modelContent: ChatHistoryItem) => void;
  /** Fired after an iteration's handlers have all settled, with their response parts. */
  onToolResponsesSettled?: (functionResponseParts: Part[]) => void;
}

interface GroundingCarryover {
  webSearchQueries?: string[];
  imageSearchQueries?: string[];
  citations?: GroundingSource[];
  searchEntryPoint?: unknown;
}

const mergeUniqueStrings = (existing: string[] = [], incoming: string[] = []) =>
  Array.from(new Set([...existing, ...incoming]));

const mergeGroundingSources = (
  existing: GroundingSource[] = [],
  incoming: GroundingSource[] = [],
): GroundingSource[] | undefined => {
  const merged = new Map<string, GroundingSource>();

  for (const source of [...existing, ...incoming]) {
    const uri = typeof source.uri === 'string' ? source.uri : '';
    const title = typeof source.title === 'string' ? source.title : '';
    const key = uri || JSON.stringify(source);
    if (!key) continue;
    merged.set(key, {
      ...(uri ? { uri } : {}),
      ...(title ? { title } : {}),
    });
  }

  return merged.size > 0 ? Array.from(merged.values()) : undefined;
};

const extractGroundingCarryover = (metadata: unknown): GroundingCarryover | undefined => {
  if (!isRecord(metadata)) {
    return undefined;
  }

  const webSearchQueries = Array.isArray(metadata.webSearchQueries)
    ? metadata.webSearchQueries.filter((value): value is string => typeof value === 'string')
    : [];
  const imageSearchQueries = Array.isArray(metadata.imageSearchQueries)
    ? metadata.imageSearchQueries.filter((value): value is string => typeof value === 'string')
    : [];
  const groundingChunkSources = Array.isArray(metadata.groundingChunks)
    ? metadata.groundingChunks
        .filter((chunk): chunk is GroundingChunkLike => isRecord(chunk))
        .map(getGroundingChunkSource)
        .filter((source): source is GroundingSource => Boolean(source?.uri))
    : [];
  const citations = Array.isArray(metadata.citations)
    ? metadata.citations
        .filter((citation): citation is GroundingSource => isRecord(citation))
        .filter((citation) => typeof citation.uri === 'string' && citation.uri.length > 0)
    : [];
  const mergedSources = mergeGroundingSources(groundingChunkSources, citations);
  const searchEntryPoint = metadata.searchEntryPoint;

  if (
    webSearchQueries.length === 0 &&
    imageSearchQueries.length === 0 &&
    !mergedSources?.length &&
    searchEntryPoint === undefined
  ) {
    return undefined;
  }

  return {
    ...(webSearchQueries.length ? { webSearchQueries } : {}),
    ...(imageSearchQueries.length ? { imageSearchQueries } : {}),
    ...(mergedSources?.length ? { citations: mergedSources } : {}),
    ...(searchEntryPoint !== undefined ? { searchEntryPoint } : {}),
  };
};

const mergeGroundingCarryover = (
  existing: GroundingCarryover | undefined,
  incoming: unknown,
): GroundingCarryover | undefined => {
  const incomingCarryover = extractGroundingCarryover(incoming);
  if (!incomingCarryover) {
    return existing;
  }

  if (!existing) {
    return incomingCarryover;
  }

  return {
    ...(existing.webSearchQueries || incomingCarryover.webSearchQueries
      ? {
          webSearchQueries: mergeUniqueStrings(existing.webSearchQueries, incomingCarryover.webSearchQueries),
        }
      : {}),
    ...(existing.imageSearchQueries || incomingCarryover.imageSearchQueries
      ? {
          imageSearchQueries: mergeUniqueStrings(existing.imageSearchQueries, incomingCarryover.imageSearchQueries),
        }
      : {}),
    ...(existing.citations || incomingCarryover.citations
      ? {
          citations: mergeGroundingSources(existing.citations, incomingCarryover.citations),
        }
      : {}),
    searchEntryPoint: incomingCarryover.searchEntryPoint ?? existing.searchEntryPoint,
  };
};

const mergeGroundingForFinalTurn = (finalGrounding: unknown, carryover: GroundingCarryover | undefined): unknown => {
  if (!carryover) {
    return finalGrounding;
  }

  if (!isRecord(finalGrounding)) {
    return {
      ...(carryover.webSearchQueries?.length ? { webSearchQueries: carryover.webSearchQueries } : {}),
      ...(carryover.imageSearchQueries?.length ? { imageSearchQueries: carryover.imageSearchQueries } : {}),
      ...(carryover.citations?.length ? { citations: carryover.citations } : {}),
      ...(carryover.searchEntryPoint !== undefined ? { searchEntryPoint: carryover.searchEntryPoint } : {}),
    };
  }

  const currentWebSearchQueries = Array.isArray(finalGrounding.webSearchQueries)
    ? finalGrounding.webSearchQueries.filter((value): value is string => typeof value === 'string')
    : [];
  const currentImageSearchQueries = Array.isArray(finalGrounding.imageSearchQueries)
    ? finalGrounding.imageSearchQueries.filter((value): value is string => typeof value === 'string')
    : [];
  const currentCitations = Array.isArray(finalGrounding.citations)
    ? finalGrounding.citations.filter((citation): citation is GroundingSource => isRecord(citation))
    : [];

  return {
    ...finalGrounding,
    ...(carryover.webSearchQueries?.length || currentWebSearchQueries.length
      ? {
          webSearchQueries: mergeUniqueStrings(carryover.webSearchQueries, currentWebSearchQueries),
        }
      : {}),
    ...(carryover.imageSearchQueries?.length || currentImageSearchQueries.length
      ? {
          imageSearchQueries: mergeUniqueStrings(carryover.imageSearchQueries, currentImageSearchQueries),
        }
      : {}),
    ...(carryover.citations?.length || currentCitations.length
      ? {
          citations: mergeGroundingSources(currentCitations, carryover.citations),
        }
      : {}),
    ...(finalGrounding.searchEntryPoint === undefined && carryover.searchEntryPoint !== undefined
      ? { searchEntryPoint: carryover.searchEntryPoint }
      : {}),
  };
};

/**
 * Round cap for the tool loop. Generous enough for long MCP workflows (multi-step
 * file exploration, deep research chains); a hard throw would discard the whole
 * turn, so hitting the cap returns the accumulated result with a notice instead.
 */
export const DEFAULT_TOOL_LOOP_ROUNDS = 50;

const TOOL_LOOP_CAP_NOTICE =
  '[Tool loop stopped: the model kept requesting tool calls after reaching the round limit, so the remaining calls were not executed. Try narrowing the task.]';

export const runStandardToolLoop = async ({
  initialContents,
  clientFunctions,
  runTurn,
  abortSignal,
  maxToolRounds,
  onToolCallsStarted,
  onToolResponsesSettled,
}: RunStandardToolLoopOptions): Promise<{
  finalTurn: StandardToolTurnResult;
  toolMessages: StandardToolLoopMessagePair[];
  generatedFiles: UploadedFile[];
}> => {
  const toolMessages: StandardToolLoopMessagePair[] = [];
  const generatedFiles: UploadedFile[] = [];
  let contents = [...initialContents];
  let aggregatedUsage: UsageMetadata | undefined;
  let groundingCarryover: GroundingCarryover | undefined;
  let aggregatedUrlContext: unknown;
  const maxRounds = maxToolRounds ?? DEFAULT_TOOL_LOOP_ROUNDS;
  let rounds = 0;

  for (;;) {
    const turn = await runTurn(contents);
    rounds += 1;
    aggregatedUsage = mergeUsageMetadata(aggregatedUsage, turn.usage);
    aggregatedUrlContext = mergeUrlContextMetadata(aggregatedUrlContext, turn.urlContext);
    const functionCalls = turn.functionCalls ?? [];

    if (functionCalls.length === 0) {
      return {
        finalTurn: {
          ...turn,
          usage: aggregatedUsage,
          grounding: mergeGroundingForFinalTurn(turn.grounding, groundingCarryover),
          urlContext: aggregatedUrlContext,
        },
        toolMessages,
        generatedFiles,
      };
    }

    // Cap reached: keep everything completed so far and stop without executing
    // this turn's calls (every earlier round was a real, finished API turn).
    if (rounds >= maxRounds) {
      return {
        finalTurn: {
          ...turn,
          parts: [...turn.parts, { text: TOOL_LOOP_CAP_NOTICE }],
          usage: aggregatedUsage,
          grounding: mergeGroundingForFinalTurn(turn.grounding, groundingCarryover),
          urlContext: aggregatedUrlContext,
        },
        toolMessages,
        generatedFiles,
      };
    }

    const functionResponseParts: Part[] = new Array(functionCalls.length);
    onToolCallsStarted?.(turn.modelContent);
    const results = await Promise.all(
      functionCalls.map(async (call, idx) => {
        const clientFunction = call.name ? clientFunctions[call.name] : undefined;
        if (!clientFunction) {
          return {
            idx,
            part: {
              functionResponse: {
                id: call.id,
                name: call.name || 'unknown',
                response: {
                  error: `Function ${call.name || 'unknown'} not implemented client-side.`,
                },
              },
            } as Part,
            generatedFiles: [] as UploadedFile[],
          };
        }
        try {
          const result = await clientFunction.handler(call.args as unknown, abortSignal ? { abortSignal } : undefined);
          return {
            idx,
            part: {
              functionResponse: {
                id: call.id,
                name: call.name,
                response: toStructuredToolResponse(result.response),
              },
            } as Part,
            generatedFiles: result.generatedFiles ?? [],
          };
        } catch (error) {
          return {
            idx,
            part: {
              functionResponse: {
                id: call.id,
                name: call.name,
                response: {
                  error: getErrorMessage(error),
                },
              },
            } as Part,
            generatedFiles: [] as UploadedFile[],
          };
        }
      }),
    );
    results
      .sort((a, b) => a.idx - b.idx)
      .forEach((r) => {
        functionResponseParts[r.idx] = r.part as Part;
        if (r.generatedFiles?.length) generatedFiles.push(...r.generatedFiles);
      });
    onToolResponsesSettled?.(functionResponseParts);

    toolMessages.push({
      modelContent: turn.modelContent,
      functionResponseParts,
    });

    contents = [
      ...contents,
      turn.modelContent,
      {
        role: 'user',
        parts: functionResponseParts,
      },
    ];
    groundingCarryover = mergeGroundingCarryover(groundingCarryover, turn.grounding);
  }
};
