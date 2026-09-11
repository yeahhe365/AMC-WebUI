import { DEFAULT_OPENAI_COMPATIBLE_BASE_URL, trimTrailingSlashes } from '@/utils/apiProxyUrl';
import { resolveThirdPartyBaseUrl } from '@/runtime/runtimeConfig';

type OpenAICompatibleBaseUrlWarning = 'chat-completions-endpoint' | 'models-endpoint';

const normalizeOpenAICompatibleBaseUrl = (baseUrl?: string | null): string =>
  trimTrailingSlashes(baseUrl?.trim() || DEFAULT_OPENAI_COMPATIBLE_BASE_URL);

const getOpenAICompatibleBaseUrlPath = (baseUrl?: string | null): string =>
  trimTrailingSlashes(normalizeOpenAICompatibleBaseUrl(baseUrl).split(/[?#]/, 1)[0]).toLowerCase();

export const getOpenAICompatibleBaseUrlWarning = (baseUrl?: string | null): OpenAICompatibleBaseUrlWarning | null => {
  const baseUrlPath = getOpenAICompatibleBaseUrlPath(baseUrl);

  if (baseUrlPath.endsWith('/chat/completions')) {
    return 'chat-completions-endpoint';
  }

  if (baseUrlPath.endsWith('/models')) {
    return 'models-endpoint';
  }

  return null;
};

const resolveOpenAICompatibleEndpoint = (baseUrl: string | null | undefined, endpoint: string): string => {
  const resolved = resolveThirdPartyBaseUrl(baseUrl);
  if (resolved && !/^https?:\/\//i.test(resolved)) {
    return `${trimTrailingSlashes(resolved)}/${endpoint}`;
  }
  return `${normalizeOpenAICompatibleBaseUrl(resolved)}/${endpoint}`;
};

export const buildOpenAICompatibleChatCompletionsUrl = (baseUrl?: string | null): string =>
  resolveOpenAICompatibleEndpoint(baseUrl, 'chat/completions');

export const buildOpenAICompatibleUpstreamChatCompletionsUrl = (baseUrl?: string | null): string =>
  `${normalizeOpenAICompatibleBaseUrl(baseUrl)}/chat/completions`;

export const buildOpenAICompatibleModelsUrl = (baseUrl?: string | null): string =>
  resolveOpenAICompatibleEndpoint(baseUrl, 'models');
