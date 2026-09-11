import { DEFAULT_OPENAI_COMPATIBLE_BASE_URL, trimTrailingSlashes } from '@/utils/apiProxyUrl';
import { resolveThirdPartyBaseUrl } from '@/runtime/runtimeConfig';

export type OpenAIResponsesBaseUrlWarning = 'responses-endpoint' | 'chat-completions-endpoint' | 'models-endpoint';

const getRawBaseUrlPath = (baseUrl?: string | null): string =>
  trimTrailingSlashes((baseUrl?.trim() || DEFAULT_OPENAI_COMPATIBLE_BASE_URL).split(/[?#]/, 1)[0]).toLowerCase();

export const getOpenAIResponsesBaseUrlWarning = (baseUrl?: string | null): OpenAIResponsesBaseUrlWarning | null => {
  const baseUrlPath = getRawBaseUrlPath(baseUrl);

  if (baseUrlPath.endsWith('/responses')) {
    return 'responses-endpoint';
  }

  if (baseUrlPath.endsWith('/chat/completions')) {
    return 'chat-completions-endpoint';
  }

  if (baseUrlPath.endsWith('/models')) {
    return 'models-endpoint';
  }

  return null;
};

const normalizeOpenAIResponsesBaseUrl = (baseUrl?: string | null): string => {
  const raw = trimTrailingSlashes(baseUrl?.trim() || DEFAULT_OPENAI_COMPATIBLE_BASE_URL);
  if (raw.toLowerCase().endsWith('/responses')) {
    return trimTrailingSlashes(raw.slice(0, -'/responses'.length));
  }
  return raw;
};

const resolveOpenAIResponsesEndpoint = (baseUrl: string | null | undefined, endpoint: string): string => {
  const resolved = resolveThirdPartyBaseUrl(baseUrl);
  if (resolved && !/^https?:\/\//i.test(resolved)) {
    return `${trimTrailingSlashes(resolved)}/${endpoint}`;
  }
  return `${normalizeOpenAIResponsesBaseUrl(resolved)}/${endpoint}`;
};

export const buildOpenAIResponsesUrl = (baseUrl?: string | null): string =>
  resolveOpenAIResponsesEndpoint(baseUrl, 'responses');

export const buildOpenAIResponsesUpstreamUrl = (baseUrl?: string | null): string =>
  `${normalizeOpenAIResponsesBaseUrl(baseUrl)}/responses`;

export const buildOpenAIResponsesModelsUrl = (baseUrl?: string | null): string =>
  resolveOpenAIResponsesEndpoint(baseUrl, 'models');
