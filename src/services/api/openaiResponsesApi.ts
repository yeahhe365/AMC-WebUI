import type { UsageMetadata } from '@google/genai';
import type { ModelOption, NonStreamMessageSender, StreamMessageSender } from '@/types';
import { buildOpenAIResponsesRequestBody } from './openaiResponsesMessages';
import {
  extractOpenAIResponsesFinishReason,
  extractOpenAIResponsesMessageText,
  extractOpenAIResponsesMessageThoughts,
} from './openaiResponsesResponses';
import { readOpenAIResponsesStreamEvents } from './openaiResponsesStream';
import {
  asOpenAIResponsesConfig,
  mapOpenAIResponsesUsage,
  type OpenAIResponsesResponsePayload,
} from './openaiResponsesTypes';
import { buildOpenAIResponsesModelsUrl, buildOpenAIResponsesUrl } from './openaiResponsesUrls';
import {
  createApiRequestInitFactory,
  executeNonStreamChatRequest,
  executeStreamChatRequest,
  fetchProviderModelOptions,
} from './requestFactory';

const openAiResponsesAuthHeaders = (apiKey: string): Record<string, string> => ({
  authorization: `Bearer ${apiKey}`,
});

const TRUNCATION_NOTICE = '\n\n[Output truncated: the response hit max_output_tokens.]';

const appendTruncationNotice = (text: string): string => `${text}${TRUNCATION_NOTICE}`;

const { createRequestInit, createGetRequestInit } = createApiRequestInitFactory(openAiResponsesAuthHeaders);

export const fetchOpenAIResponsesModels = async (
  apiKey: string,
  baseUrl: string | null | undefined,
  abortSignal: AbortSignal,
  providerId?: string | null,
  extraHeaders?: Record<string, string> | null,
): Promise<ModelOption[]> =>
  fetchProviderModelOptions({
    url: buildOpenAIResponsesModelsUrl(baseUrl),
    requestInit: createGetRequestInit(apiKey, abortSignal, providerId, baseUrl, extraHeaders),
    errorContextLabel: 'OpenAI Responses',
  });

export const sendOpenAIResponsesNonStream: NonStreamMessageSender = async (
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
  const responsesConfig = asOpenAIResponsesConfig(config);
  await executeNonStreamChatRequest<OpenAIResponsesResponsePayload>({
    requestUrl: () => buildOpenAIResponsesUrl(responsesConfig.baseUrl),
    requestInit: () =>
      createRequestInit(
        apiKey,
        buildOpenAIResponsesRequestBody(modelId, history, parts, responsesConfig, role, false),
        abortSignal,
        providerId,
        responsesConfig.baseUrl,
        responsesConfig.extraHeaders,
      ),
    errorContextLabel: 'OpenAI Responses',
    failureLogLabel: 'OpenAI Responses non-stream request failed:',
    abortSignal,
    onError,
    onComplete,
    toCompletionArgs: (payload) => {
      const finishReason = extractOpenAIResponsesFinishReason(payload);
      const text = extractOpenAIResponsesMessageText(payload);

      if (finishReason === 'content_filter' && !text) {
        throw new Error('The model returned no content because generation was filtered (reason: content_filter).');
      }

      return [
        text ? [{ text: finishReason === 'length' ? appendTruncationNotice(text) : text }] : [],
        extractOpenAIResponsesMessageThoughts(payload),
        mapOpenAIResponsesUsage(payload.usage),
      ];
    },
  });
};

export const sendOpenAIResponsesStream: StreamMessageSender = async (
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
  const responsesConfig = asOpenAIResponsesConfig(config);
  let finalUsage: UsageMetadata | undefined;

  await executeStreamChatRequest({
    requestUrl: () => buildOpenAIResponsesUrl(responsesConfig.baseUrl),
    requestInit: () =>
      createRequestInit(
        apiKey,
        buildOpenAIResponsesRequestBody(modelId, history, parts, responsesConfig, role, true),
        abortSignal,
        providerId,
        responsesConfig.baseUrl,
        responsesConfig.extraHeaders,
      ),
    errorContextLabel: 'OpenAI Responses',
    failureLogLabel: 'OpenAI Responses stream request failed:',
    abortSignal,
    onError,
    onComplete,
    readStream: async (response) => {
      let contentFiltered = false;
      let truncationNoticeSent = false;
      let streamErrorMessage: string | null = null;

      await readOpenAIResponsesStreamEvents(response, abortSignal, (event) => {
        if (!streamErrorMessage && event.error?.message) {
          streamErrorMessage = event.error.message;
        }

        if (event.type === 'response.failed' && event.response?.error?.message) {
          streamErrorMessage = event.response.error.message;
        }

        if ((event.type === 'response.text.delta' || event.type === 'response.output_text.delta') && event.delta) {
          onPart({ text: event.delta });
        }

        if (
          (event.type === 'response.reasoning_text.delta' ||
            event.type === 'response.reasoning.delta' ||
            event.type === 'response.thought.delta') &&
          event.delta
        ) {
          onThoughtChunk(event.delta);
        }

        if (event.type === 'response.completed' && event.response) {
          const finishReason = extractOpenAIResponsesFinishReason(event.response);
          if (finishReason === 'content_filter') {
            contentFiltered = true;
          }
          if (finishReason === 'length' && !truncationNoticeSent) {
            truncationNoticeSent = true;
            onPart({ text: TRUNCATION_NOTICE });
          }
          const usage = mapOpenAIResponsesUsage(event.response.usage);
          if (usage) {
            finalUsage = usage;
          }
        }
      });

      if (streamErrorMessage) {
        throw new Error(streamErrorMessage);
      }
      if (contentFiltered) {
        throw new Error('The model returned no content because generation was filtered (reason: content_filter).');
      }
      return finalUsage;
    },
  });
};
