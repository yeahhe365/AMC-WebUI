import type { UsageMetadata } from '@google/genai';
import type { ModelOption, NonStreamMessageSender, StreamMessageSender } from '@/types';
import { buildOpenAICompatibleRequestBody } from './openaiCompatibleMessages';
import {
  extractOpenAICompatibleFinishReason,
  extractOpenAICompatibleMessageText,
  extractOpenAICompatibleReasoningDelta,
  extractOpenAICompatibleReasoningText,
} from './openaiCompatibleResponses';
import { readOpenAICompatibleStreamEvents } from './openaiCompatibleStream';
import {
  asOpenAICompatibleConfig,
  mapOpenAICompatibleUsage,
  type OpenAIResponsePayload,
} from './openaiCompatibleTypes';
import { buildOpenAICompatibleChatCompletionsUrl, buildOpenAICompatibleModelsUrl } from './openaiCompatibleUrls';
import {
  createApiRequestInitFactory,
  executeNonStreamChatRequest,
  executeStreamChatRequest,
  fetchProviderModelOptions,
} from './requestFactory';

const openAiCompatibleAuthHeaders = (apiKey: string): Record<string, string> => ({
  authorization: `Bearer ${apiKey}`,
});

const TRUNCATION_NOTICE = '\n\n[Output truncated: the response hit max_tokens (finish_reason: length).]';

const appendTruncationNotice = (text: string): string => `${text}${TRUNCATION_NOTICE}`;

const { createRequestInit, createGetRequestInit } = createApiRequestInitFactory(openAiCompatibleAuthHeaders);

export const fetchOpenAICompatibleModels = async (
  apiKey: string,
  baseUrl: string | null | undefined,
  abortSignal: AbortSignal,
  providerId?: string | null,
  extraHeaders?: Record<string, string> | null,
): Promise<ModelOption[]> =>
  fetchProviderModelOptions({
    url: buildOpenAICompatibleModelsUrl(baseUrl),
    requestInit: createGetRequestInit(apiKey, abortSignal, providerId, baseUrl, extraHeaders),
    errorContextLabel: 'OpenAI-compatible',
  });

export const sendOpenAICompatibleMessageNonStream: NonStreamMessageSender = async (
  apiKey,
  modelId,
  history,
  parts,
  config,
  abortSignal,
  onError,
  onComplete,
  role = 'user',
  providerId,
) => {
  const compatibleConfig = asOpenAICompatibleConfig(config);
  await executeNonStreamChatRequest<OpenAIResponsePayload>({
    requestUrl: () => buildOpenAICompatibleChatCompletionsUrl(compatibleConfig.baseUrl),
    requestInit: () =>
      createRequestInit(
        apiKey,
        buildOpenAICompatibleRequestBody(modelId, history, parts, compatibleConfig, role, false),
        abortSignal,
        providerId,
        compatibleConfig.baseUrl,
        compatibleConfig.extraHeaders,
      ),
    errorContextLabel: 'OpenAI-compatible',
    failureLogLabel: 'OpenAI-compatible non-stream request failed:',
    abortSignal,
    onError,
    onComplete,
    toCompletionArgs: (payload) => {
      const finishReason = extractOpenAICompatibleFinishReason(payload);
      const text = extractOpenAICompatibleMessageText(payload);

      // Mirror the Gemini-native line's finishReason handling: a filtered
      // response with no content is an error, not a silent empty answer.
      if (finishReason === 'content_filter' && !text) {
        throw new Error(
          'The model returned no content because generation was filtered (finish_reason: content_filter).',
        );
      }

      return [
        text ? [{ text: finishReason === 'length' ? appendTruncationNotice(text) : text }] : [],
        extractOpenAICompatibleReasoningText(payload),
        mapOpenAICompatibleUsage(payload.usage),
      ];
    },
  });
};

export const sendOpenAICompatibleMessageStream: StreamMessageSender = async (
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
  providerId,
) => {
  const compatibleConfig = asOpenAICompatibleConfig(config);
  let finalUsage: UsageMetadata | undefined;
  await executeStreamChatRequest({
    requestUrl: () => buildOpenAICompatibleChatCompletionsUrl(compatibleConfig.baseUrl),
    requestInit: () =>
      createRequestInit(
        apiKey,
        buildOpenAICompatibleRequestBody(modelId, history, parts, compatibleConfig, role, true),
        abortSignal,
        providerId,
        compatibleConfig.baseUrl,
        compatibleConfig.extraHeaders,
      ),
    errorContextLabel: 'OpenAI-compatible',
    failureLogLabel: 'OpenAI-compatible stream request failed:',
    abortSignal,
    onError,
    onComplete,
    readStream: async (response) => {
      // The SSE reader swallows exceptions thrown from its event callback (it
      // treats them as malformed events), so a filtered finish_reason is
      // captured here and thrown after the loop — that lands in
      // executeStreamChatRequest's catch → onError, like the Gemini line.
      let contentFiltered = false;
      let truncationNoticeSent = false;
      // Some providers (web-session proxies in particular) deliver in-stream
      // failures as a data frame carrying {error:{message}} instead of a
      // non-200 response. Capture and throw after the loop — the reader wraps
      // the callback in try/catch, so throwing inside it would be swallowed.
      let streamErrorMessage: string | null = null;

      await readOpenAICompatibleStreamEvents(response, abortSignal, (payload) => {
        if (!streamErrorMessage && payload.error?.message) {
          streamErrorMessage = payload.error.message;
        }

        const finishReason = extractOpenAICompatibleFinishReason(payload);
        if (finishReason === 'content_filter') {
          contentFiltered = true;
        }

        if (finishReason === 'length' && !truncationNoticeSent) {
          truncationNoticeSent = true;
          onPart({ text: TRUNCATION_NOTICE });
        }

        const reasoningContent = extractOpenAICompatibleReasoningDelta(payload);
        if (reasoningContent) {
          onThoughtChunk(reasoningContent);
        }

        const content = payload.choices?.[0]?.delta?.content;
        if (content) {
          onPart({ text: content });
        }

        const usage = mapOpenAICompatibleUsage(payload.usage);
        if (usage) {
          finalUsage = usage;
        }
      });

      if (streamErrorMessage) {
        throw new Error(streamErrorMessage);
      }
      if (contentFiltered) {
        throw new Error(
          'The model returned no content because generation was filtered (finish_reason: content_filter).',
        );
      }
      return finalUsage;
    },
  });
};
