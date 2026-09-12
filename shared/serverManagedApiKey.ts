/**
 * Sentinel API key value the browser sends instead of a real key to signal
 * "authenticate this request with the server-managed key". Used by both the
 * web app (src/utils/apiKeySelection) and the API server (server/src).
 */
export const SERVER_MANAGED_API_KEY = '__SERVER_MANAGED_API_KEY__';

/**
 * Sentinel API key value returned by apiKeySelection for a third-party
 * connection flagged `authOptional` (local inference engines such as Ollama or
 * LM Studio that accept unauthenticated requests). It is never a real
 * credential: every auth-header builder must skip its auth header for this
 * value, otherwise the literal string is sent upstream as the key.
 */
export const AUTH_OPTIONAL_API_KEY = 'auth-optional';

/** Whether an API key value is the authOptional sentinel rather than a real key. */
export const isAuthOptionalApiKey = (apiKey: string | null | undefined): boolean => apiKey === AUTH_OPTIONAL_API_KEY;
