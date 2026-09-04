import { DEFAULT_OPENAI_COMPATIBLE_BASE_URL } from '@/utils/apiProxyUrl';
import { getThirdPartyProxyBaseUrl } from '@/runtime/runtimeConfig';

type OpenAICompatibleBaseUrlWarning = 'chat-completions-endpoint' | 'models-endpoint';

const normalizeOpenAICompatibleBaseUrl = (baseUrl?: string | null): string =>
  (baseUrl?.trim() || DEFAULT_OPENAI_COMPATIBLE_BASE_URL).replace(/\/+$/, '');

const getOpenAICompatibleBaseUrlPath = (baseUrl?: string | null): string =>
  normalizeOpenAICompatibleBaseUrl(baseUrl).split(/[?#]/, 1)[0].replace(/\/+$/, '').toLowerCase();

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

// When the Docker runtime injects a third-party proxy (/api/openai), all
// providers route through the api container, which selects the real upstream
// from THIRD_PARTY_ROUTES. Returns null in static deploys so callers fall back
// to the provider's own baseUrl.
const resolveOpenAICompatibleBaseUrl = (baseUrl?: string | null): string | null => {
  const proxyUrl = getThirdPartyProxyBaseUrl();
  if (proxyUrl) {
    return proxyUrl;
  }
  return baseUrl?.trim() || null;
};

export const buildOpenAICompatibleChatCompletionsUrl = (baseUrl?: string | null): string => {
  const resolved = resolveOpenAICompatibleBaseUrl(baseUrl);
  if (resolved) {
    // Relative proxy path: keep it relative so the browser posts same-origin.
    if (!/^https?:\/\//i.test(resolved)) {
      return `${resolved.replace(/\/+$/, '')}/chat/completions`;
    }
  }
  return `${normalizeOpenAICompatibleBaseUrl(resolved)}/chat/completions`;
};

export const buildOpenAICompatibleUpstreamChatCompletionsUrl = (baseUrl?: string | null): string =>
  `${normalizeOpenAICompatibleBaseUrl(baseUrl)}/chat/completions`;

export const buildOpenAICompatibleModelsUrl = (baseUrl?: string | null): string => {
  const resolved = resolveOpenAICompatibleBaseUrl(baseUrl);
  if (resolved) {
    if (!/^https?:\/\//i.test(resolved)) {
      return `${resolved.replace(/\/+$/, '')}/models`;
    }
  }
  return `${normalizeOpenAICompatibleBaseUrl(resolved)}/models`;
};
