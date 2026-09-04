const BEARER_PATTERN = /Bearer\s+\S+/gi;
const SECRET_KEY_PATTERN = /\bsk-[A-Za-z0-9_-]{8,}\b/g;
const QUERY_SECRET_PATTERN = /\b(api[_-]?key|token|access[_-]?token)=([^\s&]+)/gi;

/**
 * Masks obvious credentials (bearer tokens, sk- keys, secret query params)
 * before a line enters the per-server log buffer.
 */
export const redactSensitiveText = (text: string): string =>
  text
    .replace(BEARER_PATTERN, 'Bearer ***')
    .replace(SECRET_KEY_PATTERN, '***')
    .replace(QUERY_SECRET_PATTERN, (_match, key: string) => `${key}=***`);
