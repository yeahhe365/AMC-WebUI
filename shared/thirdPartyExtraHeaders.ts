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

const isBlockedHeaderName = (name: string): boolean => {
  if (BLOCKED_EXTRA_HEADER_NAMES.has(name)) {
    return true;
  }
  return name.startsWith('x-third-party-');
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

    const name = key.toLowerCase();
    if (isBlockedHeaderName(name)) {
      continue;
    }

    if (
      name !== 'http-referer' &&
      name !== 'referer' &&
      name !== 'x-title' &&
      name !== 'x-openrouter-title' &&
      !name.startsWith('x-')
    ) {
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
