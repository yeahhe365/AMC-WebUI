import {
  sanitizeThirdPartyExtraHeaders,
  THIRD_PARTY_EXTRA_HEADERS_HEADER,
} from '../../../shared/thirdPartyExtraHeaders';

const THIRD_PARTY_PROVIDER_HEADER = 'x-third-party-provider';
const THIRD_PARTY_BASE_URL_HEADER = 'x-third-party-base-url';

export const buildThirdPartyForwardHeaders = (options: {
  proxyProviderId?: string | null;
  baseUrl?: string | null;
  extraHeaders?: Record<string, string> | null;
}): Record<string, string> => {
  const headers: Record<string, string> = {};
  if (options.proxyProviderId) {
    headers[THIRD_PARTY_PROVIDER_HEADER] = options.proxyProviderId;
  }
  if (options.baseUrl) {
    headers[THIRD_PARTY_BASE_URL_HEADER] = options.baseUrl;
  }

  const extra = sanitizeThirdPartyExtraHeaders(options.extraHeaders);
  if (Object.keys(extra).length > 0) {
    Object.assign(headers, extra);
    headers[THIRD_PARTY_EXTRA_HEADERS_HEADER] = JSON.stringify(extra);
  }

  return headers;
};
