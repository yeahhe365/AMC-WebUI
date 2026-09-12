const EXTRA_HEADER_NAME = /^[A-Za-z0-9-]+$/;
const BLOCKED_EXTRA_HEADER_NAMES = new Set([
  'host',
  'cookie',
  'authorization',
  'x-api-key',
  'content-length',
  'content-type',
]);

export const THIRD_PARTY_EXTRA_HEADERS_HEADER = 'x-third-party-extra-headers';

/**
 * Header names (lowercase) that are forwarded verbatim, in addition to every
 * `x-*` name. `user-agent` is here because some OpenAI-compatible relays route
 * or bill by client identity; it is not a credential, so forwarding it is safe.
 * Everything outside this set and `x-*` is dropped.
 */
const ALLOWED_NON_X_HEADER_NAMES = new Set(['referer', 'http-referer', 'x-title', 'x-openrouter-title', 'user-agent']);

const isBlockedHeaderName = (name: string): boolean => {
  if (BLOCKED_EXTRA_HEADER_NAMES.has(name)) {
    return true;
  }
  return name.startsWith('x-third-party-');
};

/**
 * Whether a configured extra header will actually be forwarded upstream.
 * Exposed so the settings UI can flag rows that would be dropped, instead of
 * silently discarding them at request time.
 */
export const isForwardedThirdPartyExtraHeader = (rawName: string): boolean => {
  const key = rawName.trim();
  if (!EXTRA_HEADER_NAME.test(key)) {
    return false;
  }

  const name = key.toLowerCase();
  if (isBlockedHeaderName(name)) {
    return false;
  }

  return name.startsWith('x-') || ALLOWED_NON_X_HEADER_NAMES.has(name);
};

export const sanitizeThirdPartyExtraHeaders = (value: unknown): Record<string, string> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }

  const headers: Record<string, string> = {};
  for (const [rawKey, rawValue] of Object.entries(value as Record<string, unknown>)) {
    const key = rawKey.trim();
    if (!EXTRA_HEADER_NAME.test(key) || typeof rawValue !== 'string') {
      continue;
    }

    if (!isForwardedThirdPartyExtraHeader(key)) {
      continue;
    }

    const headerValue = rawValue.trim();
    if (!headerValue) {
      continue;
    }
    headers[key] = headerValue;
  }

  return headers;
};

export const parseThirdPartyExtraHeadersHeader = (value: unknown): Record<string, string> => {
  if (typeof value !== 'string' || !value.trim()) {
    return {};
  }

  try {
    return sanitizeThirdPartyExtraHeaders(JSON.parse(value));
  } catch {
    return {};
  }
};
