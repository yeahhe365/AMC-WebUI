import type { UsageMetadata } from '@google/genai';
import type { ModelOption, NonStreamMessageSender, StreamMessageSender } from '@/types';
import { buildAnthropicRequestBody } from './anthropicMessages';
import { extractAnthropicMessageText, extractAnthropicMessageThoughts } from './anthropicResponses';
import { readAnthropicStreamEvents } from './anthropicStream';
import {
  asAnthropicChatConfig,
  mapAnthropicUsage,
  type AnthropicResponsePayload,
  type AnthropicStreamEvent,
} from './anthropicTypes';
import { buildAnthropicMessagesUrl, buildAnthropicModelsUrl } from './anthropicUrls';
import {
  createApiRequestInitFactory,
  executeNonStreamChatRequest,
  executeStreamChatRequest,
  fetchProviderModelOptions,
} from './requestFactory';

const ANTHROPIC_VERSION = '2023-06-01';

const anthropicAuthHeaders = (apiKey: string): Record<string, string> => ({
  'x-api-key': apiKey,
  'anthropic-version': ANTHROPIC_VERSION,
});

const { createRequestInit, createGetRequestInit } = createApiRequestInitFactory(anthropicAuthHeaders);

export const fetchAnthropicModels = async (
  apiKey: string,
  baseUrl: string | null | undefined,
  abortSignal: AbortSignal,
  providerId?: string | null,
  extraHeaders?: Record<string, string> | null,
): Promise<ModelOption[]> =>
  fetchProviderModelOptions({
    url: buildAnthropicModelsUrl(baseUrl),
    requestInit: createGetRequestInit(apiKey, abortSignal, providerId, baseUrl, extraHeaders),
    errorContextLabel: 'Anthropic',
  });

export const sendAnthropicMessageNonStream: NonStreamMessageSender = async (
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
  const anthropicConfig = asAnthropicChatConfig(config);
  await executeNonStreamChatRequest<AnthropicResponsePayload>({
    requestUrl: () => buildAnthropicMessagesUrl(anthropicConfig.baseUrl),
    requestInit: () =>
      createRequestInit(
        apiKey,
        buildAnthropicRequestBody(modelId, history, parts, anthropicConfig, role, false),
        abortSignal,
        providerId,
        anthropicConfig.baseUrl,
        anthropicConfig.extraHeaders,
      ),
    errorContextLabel: 'Anthropic',
    failureLogLabel: 'Anthropic non-stream request failed:',
    abortSignal,
    onError,
    onComplete,
    toCompletionArgs: (payload) => {
      const text = extractAnthropicMessageText(payload);
      return [text ? [{ text }] : [], extractAnthropicMessageThoughts(payload), mapAnthropicUsage(payload.usage)];
    },
  });
};

export const sendAnthropicMessageStream: StreamMessageSender = async (
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
  const anthropicConfig = asAnthropicChatConfig(config);
  let finalUsage: UsageMetadata | undefined;
  await executeStreamChatRequest({
    requestUrl: () => buildAnthropicMessagesUrl(anthropicConfig.baseUrl),
    requestInit: () =>
      createRequestInit(
        apiKey,
        buildAnthropicRequestBody(modelId, history, parts, anthropicConfig, role, true),
        abortSignal,
        providerId,
        anthropicConfig.baseUrl,
        anthropicConfig.extraHeaders,
      ),
    errorContextLabel: 'Anthropic',
    failureLogLabel: 'Anthropic stream request failed:',
    abortSignal,
    onError,
    onComplete,
    readStream: async (response) => {
      // Anthropic 把完整 usage 拆在两个事件里：message_start 携带 input_tokens，
      // message_delta 只带累计 output_tokens；必须合并才能得到真实的 token 统计。
      let inputTokens: number | undefined;
      await readAnthropicStreamEvents(response, abortSignal, (event: AnthropicStreamEvent) => {
        if (event.type === 'content_block_delta' && event.delta?.text) {
          onPart({ text: event.delta.text });
        }
        if (event.type === 'content_block_delta' && event.delta?.type === 'thinking_delta' && event.delta.thinking) {
          onThoughtChunk(event.delta.thinking);
        }
        // 流中 error 事件（如 overloaded_error）：不抛出会把截断的回答当成功收尾。
        // 抛出让 executeStreamChatRequest 走 onError，已流出的部分内容由上层保留。
        if (event.type === 'error') {
          throw new Error(event.error?.message || 'Anthropic stream error');
        }
        if (event.type === 'message_start' && event.message?.usage) {
          inputTokens = event.message.usage.input_tokens;
          const startUsage = mapAnthropicUsage(event.message.usage);
          if (startUsage) finalUsage = startUsage;
        }
        if (event.usage) {
          const usage = mapAnthropicUsage({
            input_tokens: event.usage.input_tokens ?? inputTokens,
            output_tokens: event.usage.output_tokens,
          });
          if (usage) finalUsage = usage;
        }
      });
      return finalUsage;
    },
  });
};
