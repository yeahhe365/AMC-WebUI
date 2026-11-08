import { appendTurnToHistory } from '@/utils/chat/builder';
import { toError } from '@/utils/errorMessage';
import { createMessage } from '@/utils/chat/session';
import {
  generateOpenAICompatibleTurnApi,
  generateOpenAICompatibleTurnStreamApi,
  sendOpenAICompatibleMessageNonStream,
  sendOpenAICompatibleMessageStream,
} from '@/services/api/protocols/openai-compatible/openaiCompatibleApi';
import {
  generateOpenAIResponsesTurnApi,
  generateOpenAIResponsesTurnStreamApi,
  sendOpenAIResponsesNonStream,
  sendOpenAIResponsesStream,
} from '@/services/api/protocols/openai-responses/openaiResponsesApi';
import {
  generateAnthropicTurnApi,
  generateAnthropicTurnStreamApi,
  sendAnthropicMessageNonStream,
  sendAnthropicMessageStream,
} from '@/services/api/protocols/anthropic/anthropicApi';
import { toOpenAITools, toAnthropicTools, toOpenAIResponsesTools } from '@/features/chat-tools/toolSchemaAdapters';
import { runStandardToolLoop, TOOL_LOOP_CAP_NOTICE } from '@/features/standard-chat/standardToolLoop';
import { getProxyProviderHeader } from '@/utils/third-party/thirdPartyApiProviders';
import { isPdfMimeType } from '@/utils/file/fileTypeClassification';
import { extractPdfTextFromBase64WithMeta } from '@/utils/file/pdfTextExtraction';
import { buildAttachmentTextCacheKey, withAttachmentTextCache } from '@/utils/file/attachmentTextCache';
import { hashString } from '@/utils/format/stringHash';
import type {
  ChatMessage,
  ChatSettings as IndividualChatSettings,
  NonStreamMessageCompleteHandler,
  StandardClientFunctions,
  ThirdPartyConnection,
} from '@/types';
import type { ContentPart } from '@/types/chat';
import type { StreamHandlerFunctions } from './messageSenderTypes';

/**
 * PDF 的注入文本：带上"只取了前 N 页"的说明。
 * 抽取上限是 50 页 / 64000 字符（`pdfTextExtraction` 的默认值），此前是静默截断，
 * 模型拿到残缺文本仍会当成整份文档来总结。
 */
const formatExtractedPdfText = (extracted: {
  text: string;
  numPages?: number;
  pagesRead?: number;
  truncated?: boolean;
}) => {
  const trimmed = extracted.text.trim();
  if (!trimmed) {
    return '[Document (PDF)]\n(Text content could not be extracted from this PDF)';
  }
  const range =
    extracted.truncated && extracted.pagesRead && extracted.numPages
      ? ` [Pages 1-${extracted.pagesRead} of ${extracted.numPages} extracted; the rest is not included]`
      : '';
  return `[Document (PDF)]${range}\n${trimmed}`;
};

export const normalizePartsForNonAnthropicProvider = async (parts: ContentPart[]): Promise<ContentPart[]> => {
  const result: ContentPart[] = [];
  for (const part of parts) {
    const inlineData = (part as { inlineData?: { mimeType?: string; data?: string } })?.inlineData;
    if (inlineData?.data && isPdfMimeType(inlineData.mimeType)) {
      result.push({
        text: await readPdfPartText(inlineData.mimeType ?? 'application/pdf', inlineData.data),
      });
    } else {
      result.push(part);
    }
  }
  return result;
};

/**
 * PDF part 的文本化结果按**内容**缓存：第三方历史里每轮都会把所有 PDF part 重新走一遍，
 * 没有缓存时"一段对话里 3 个 PDF"就变成每发一条消息重新解析 3 次 pdf.js（CTX-1）。
 * 键里带长度和 32 位哈希，避免整段 base64 被当作 Map 的键长期驻留内存。
 */
const readPdfPartText = async (mimeType: string, base64: string): Promise<string> => {
  const cacheKey = buildAttachmentTextCacheKey('pdf', mimeType, base64.length, hashString(base64));
  return withAttachmentTextCache(cacheKey, async () =>
    formatExtractedPdfText(await extractPdfTextFromBase64WithMeta(base64)),
  );
};

export const normalizeHistoryForNonAnthropicProvider = async (
  history: Array<{ role: 'user' | 'model'; parts: ContentPart[] }>,
): Promise<Array<{ role: 'user' | 'model'; parts: ContentPart[] }>> => {
  return Promise.all(
    history.map(async (item) => ({
      ...item,
      parts: await normalizePartsForNonAnthropicProvider(item.parts),
    })),
  );
};

export const routeThrownStreamError = async (
  run: () => Promise<void>,
  streamOnError: (error: Error) => void | Promise<void>,
) => {
  try {
    await run();
  } catch (streamRunError) {
    await streamOnError(toError(streamRunError));
  }
};

export interface ExecuteThirdPartyChatParams {
  activeProvider: ThirdPartyConnection;
  apiModelId: string;
  keyToUse: string;
  effectiveSystemInstruction?: string;
  sessionToUpdate: IndividualChatSettings;
  historyForChat: Array<{ role: 'user' | 'model'; parts: ContentPart[] }>;
  finalRole: 'user' | 'model';
  finalParts: ContentPart[];
  combinedClientFunctions: StandardClientFunctions;
  newAbortController: AbortController;
  generationId: string;
  insertInternalToolMessages: (messages: ChatMessage[]) => void;
  streamOnPart: StreamHandlerFunctions['streamOnPart'];
  onThoughtChunk: StreamHandlerFunctions['onThoughtChunk'];
  streamOnError: (error: Error) => void | Promise<void>;
  streamOnComplete: StreamHandlerFunctions['streamOnComplete'];
  wrappedStreamOnComplete: StreamHandlerFunctions['streamOnComplete'];
  nonStreamOnComplete: NonStreamMessageCompleteHandler;
  isStreamingEnabled: boolean;
}

export const executeThirdPartyChat = async ({
  activeProvider,
  apiModelId,
  keyToUse,
  effectiveSystemInstruction,
  sessionToUpdate,
  historyForChat,
  finalRole,
  finalParts,
  combinedClientFunctions,
  newAbortController,
  generationId,
  insertInternalToolMessages,
  streamOnPart,
  onThoughtChunk,
  streamOnError,
  streamOnComplete: _streamOnComplete,
  wrappedStreamOnComplete,
  nonStreamOnComplete,
  isStreamingEnabled,
}: ExecuteThirdPartyChatParams): Promise<void> => {
  const activeModel = activeProvider.models?.find((model) => model.id === apiModelId);
  const params = activeModel?.parameters;
  const providerConfig = {
    baseUrl: activeProvider.baseUrl,
    templateId: activeProvider.templateId,
    systemInstruction: effectiveSystemInstruction,
    temperature: params?.temperature ?? sessionToUpdate.temperature,
    topP: params?.topP ?? sessionToUpdate.topP,
    topK: params?.topK ?? sessionToUpdate.topK,
    maxOutputTokens: params?.maxOutputTokens ?? sessionToUpdate.maxOutputTokens,
    stopSequences: params?.stopSequences ?? sessionToUpdate.stopSequences,
    presencePenalty: params?.presencePenalty ?? sessionToUpdate.presencePenalty,
    frequencyPenalty: params?.frequencyPenalty ?? sessionToUpdate.frequencyPenalty,
    seed: params?.seed ?? sessionToUpdate.seed,
    thinkingLevel: (activeModel?.enableThinking ?? true) ? sessionToUpdate.thinkingLevel : ('NONE' as const),
    thinkingBudget: params?.thinkingBudget ?? sessionToUpdate.thinkingBudget,
    reasoningEffort: params?.reasoningEffort,
    extraHeaders: activeProvider.extraHeaders,
  };
  const isAnthropic = activeProvider.protocol === 'anthropic';
  const isOpenAIResponses = activeProvider.protocol === 'openai-responses';
  // Docker THIRD_PARTY_ROUTES is keyed by template, not connection UUID.
  const providerId = getProxyProviderHeader(activeProvider.templateId);

  const effectiveHistoryForChat = !isAnthropic
    ? await normalizeHistoryForNonAnthropicProvider(historyForChat)
    : historyForChat;
  const effectiveFinalParts = !isAnthropic ? await normalizePartsForNonAnthropicProvider(finalParts) : finalParts;

  const allowsTools = activeModel?.enableTools ?? true;
  const hasClientFunctions = allowsTools && Object.keys(combinedClientFunctions).length > 0;
  if (hasClientFunctions) {
    try {
      const thirdPartyOnThoughtChunk = (chunk: string) => onThoughtChunk(chunk, { source: 'third-party' });
      const thirdPartyOnPart = (part: ContentPart) => streamOnPart(part, { source: 'third-party' });
      const streamCallbacks = isStreamingEnabled
        ? {
            onPart: thirdPartyOnPart,
            onThoughtChunk: thirdPartyOnThoughtChunk,
          }
        : undefined;

      const toolLoopResult = await runStandardToolLoop({
        initialContents: appendTurnToHistory(effectiveHistoryForChat, finalRole, effectiveFinalParts),
        clientFunctions: combinedClientFunctions,
        abortSignal: newAbortController.signal,
        streamCallbacks,
        onToolCallsStarted: (modelContent) => {
          insertInternalToolMessages([
            createMessage('model', '', {
              apiParts: modelContent.parts,
              isInternalToolMessage: true,
              toolParentMessageId: generationId,
            }),
          ]);
        },
        onToolResponsesSettled: (functionResponseParts) => {
          insertInternalToolMessages([
            createMessage('user', '', {
              apiParts: functionResponseParts,
              isInternalToolMessage: true,
              toolParentMessageId: generationId,
            }),
          ]);
        },
        runTurn: (contents, streamCb) => {
          if (isAnthropic) {
            if (isStreamingEnabled) {
              return generateAnthropicTurnStreamApi(
                keyToUse,
                apiModelId,
                contents,
                { ...providerConfig, tools: toAnthropicTools(combinedClientFunctions) },
                newAbortController.signal,
                providerId,
                streamCb,
              );
            }
            return generateAnthropicTurnApi(
              keyToUse,
              apiModelId,
              contents,
              { ...providerConfig, tools: toAnthropicTools(combinedClientFunctions) },
              newAbortController.signal,
              providerId,
            );
          }
          if (isOpenAIResponses) {
            if (isStreamingEnabled) {
              return generateOpenAIResponsesTurnStreamApi(
                keyToUse,
                apiModelId,
                contents,
                { ...providerConfig, tools: toOpenAIResponsesTools(combinedClientFunctions) },
                newAbortController.signal,
                providerId,
                streamCb,
              );
            }
            return generateOpenAIResponsesTurnApi(
              keyToUse,
              apiModelId,
              contents,
              { ...providerConfig, tools: toOpenAIResponsesTools(combinedClientFunctions) },
              newAbortController.signal,
              providerId,
            );
          }
          if (isStreamingEnabled) {
            return generateOpenAICompatibleTurnStreamApi(
              keyToUse,
              apiModelId,
              contents,
              { ...providerConfig, tools: toOpenAITools(combinedClientFunctions) },
              newAbortController.signal,
              providerId,
              streamCb,
            );
          }
          return generateOpenAICompatibleTurnApi(
            keyToUse,
            apiModelId,
            contents,
            { ...providerConfig, tools: toOpenAITools(combinedClientFunctions) },
            newAbortController.signal,
            providerId,
          );
        },
      });

      if (toolLoopResult.streamed) {
        for (const part of toolLoopResult.finalTurn.parts) {
          if (part.text === TOOL_LOOP_CAP_NOTICE || (!part.text && !part.functionCall)) {
            streamOnPart(part, { recordFirstToken: false, source: 'third-party' });
          }
        }
      } else {
        for (const part of toolLoopResult.finalTurn.parts) {
          streamOnPart(part, { recordFirstToken: false, source: 'third-party' });
        }
        if (toolLoopResult.finalTurn.thoughts) {
          onThoughtChunk(toolLoopResult.finalTurn.thoughts, { recordFirstToken: false, source: 'third-party' });
        }
      }

      wrappedStreamOnComplete(
        toolLoopResult.finalTurn.usage,
        toolLoopResult.finalTurn.grounding,
        toolLoopResult.finalTurn.urlContext,
        toolLoopResult.generatedFiles,
      );
    } catch (toolLoopError) {
      await streamOnError(toError(toolLoopError));
    }
    return;
  }

  if (isStreamingEnabled) {
    // Stamp thinking provenance on every third-party streaming callback; the
    // first chunk decides the strip mode, so wrapping here (single point for
    // both Anthropic and OpenAI-compatible streams) covers the whole run.
    const thirdPartyOnThoughtChunk = (chunk: string) => onThoughtChunk(chunk, { source: 'third-party' });
    const thirdPartyOnPart = (part: ContentPart) => streamOnPart(part, { source: 'third-party' });
    await routeThrownStreamError(
      () =>
        isAnthropic
          ? sendAnthropicMessageStream(
              keyToUse,
              apiModelId,
              historyForChat,
              finalParts,
              providerConfig,
              newAbortController.signal,
              thirdPartyOnPart,
              thirdPartyOnThoughtChunk,
              streamOnError,
              wrappedStreamOnComplete,
              finalRole,
              providerId,
            )
          : isOpenAIResponses
            ? sendOpenAIResponsesStream(
                keyToUse,
                apiModelId,
                effectiveHistoryForChat,
                effectiveFinalParts,
                providerConfig,
                newAbortController.signal,
                thirdPartyOnPart,
                thirdPartyOnThoughtChunk,
                streamOnError,
                wrappedStreamOnComplete,
                finalRole,
                providerId,
              )
            : sendOpenAICompatibleMessageStream(
                keyToUse,
                apiModelId,
                effectiveHistoryForChat,
                effectiveFinalParts,
                providerConfig,
                newAbortController.signal,
                thirdPartyOnPart,
                thirdPartyOnThoughtChunk,
                streamOnError,
                wrappedStreamOnComplete,
                finalRole,
                providerId,
              ),
      streamOnError,
    );
    return;
  }

  await routeThrownStreamError(
    () =>
      isAnthropic
        ? sendAnthropicMessageNonStream(
            keyToUse,
            apiModelId,
            historyForChat,
            finalParts,
            providerConfig,
            newAbortController.signal,
            streamOnError,
            nonStreamOnComplete,
            finalRole,
            providerId,
          )
        : isOpenAIResponses
          ? sendOpenAIResponsesNonStream(
              keyToUse,
              apiModelId,
              effectiveHistoryForChat,
              effectiveFinalParts,
              providerConfig,
              newAbortController.signal,
              streamOnError,
              nonStreamOnComplete,
              finalRole,
              providerId,
            )
          : sendOpenAICompatibleMessageNonStream(
              keyToUse,
              apiModelId,
              effectiveHistoryForChat,
              effectiveFinalParts,
              providerConfig,
              newAbortController.signal,
              streamOnError,
              nonStreamOnComplete,
              finalRole,
              providerId,
            ),
    streamOnError,
  );
};
