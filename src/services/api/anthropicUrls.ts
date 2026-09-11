import { resolveThirdPartyBaseUrl } from '@/runtime/runtimeConfig';
import { trimTrailingSlashes } from '@/utils/apiProxyUrl';

const DEFAULT_ANTHROPIC_BASE_URL = 'https://api.anthropic.com';

export const normalizeAnthropicBaseUrl = (baseUrl?: string | null): string =>
  trimTrailingSlashes(baseUrl?.trim() || DEFAULT_ANTHROPIC_BASE_URL);

const buildAnthropicPath = (path: string, baseUrl?: string | null): string => {
  const resolved = resolveThirdPartyBaseUrl(baseUrl);
  if (resolved) {
    return `${trimTrailingSlashes(resolved)}${path}`;
  }
  return `${normalizeAnthropicBaseUrl(baseUrl)}${path}`;
};

export const buildAnthropicMessagesUrl = (baseUrl?: string | null): string =>
  buildAnthropicPath('/v1/messages', baseUrl);

export const buildAnthropicUpstreamMessagesUrl = (baseUrl?: string | null): string =>
  `${normalizeAnthropicBaseUrl(baseUrl)}/v1/messages`;

export const buildAnthropicModelsUrl = (baseUrl?: string | null): string => buildAnthropicPath('/v1/models', baseUrl);
