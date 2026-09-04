import { getThirdPartyProxyBaseUrl } from '@/runtime/runtimeConfig';

const DEFAULT_ANTHROPIC_BASE_URL = 'https://api.anthropic.com';

export const normalizeAnthropicBaseUrl = (baseUrl?: string | null): string =>
  (baseUrl?.trim() || DEFAULT_ANTHROPIC_BASE_URL).replace(/\/+$/, '');

// When the Docker runtime injects a third-party proxy (/api/openai), Anthropic
// providers route through the api container too (the proxy handles both the
// OpenAI-compatible and Anthropic wire protocols via x-third-party-provider).
const resolveAnthropicBaseUrl = (baseUrl?: string | null): string | null => {
  const proxyUrl = getThirdPartyProxyBaseUrl();
  if (proxyUrl) {
    return proxyUrl;
  }
  return baseUrl?.trim() || null;
};

const buildAnthropicPath = (path: string, baseUrl?: string | null): string => {
  const resolved = resolveAnthropicBaseUrl(baseUrl);
  if (resolved) {
    if (!/^https?:\/\//i.test(resolved)) {
      // Relative proxy path — the api container appends /v1/messages itself
      // based on the provider, so we keep only the prefix + path.
      return `${resolved.replace(/\/+$/, '')}${path}`;
    }
    return `${resolved.replace(/\/+$/, '')}${path}`;
  }
  return `${normalizeAnthropicBaseUrl(baseUrl)}${path}`;
};

export const buildAnthropicMessagesUrl = (baseUrl?: string | null): string =>
  buildAnthropicPath('/v1/messages', baseUrl);

export const buildAnthropicUpstreamMessagesUrl = (baseUrl?: string | null): string =>
  `${normalizeAnthropicBaseUrl(baseUrl)}/v1/messages`;

export const buildAnthropicModelsUrl = (baseUrl?: string | null): string => buildAnthropicPath('/v1/models', baseUrl);
