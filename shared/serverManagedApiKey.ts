/**
 * Sentinel API key value the browser sends instead of a real key to signal
 * "authenticate this request with the server-managed key". Used by both the
 * web app (src/utils/apiKeySelection) and the API server (server/src).
 */
export const SERVER_MANAGED_API_KEY = '__SERVER_MANAGED_API_KEY__';
