import type { IncomingMessage } from 'node:http';

// Shared proxy header machinery used by geminiProxy, thirdPartyProxy, and
// streamJobs. Each proxy keeps its own STRIPPED_PROXY_REQUEST_HEADERS set and
// auth-stamping logic (the three strip different sensitive/baseUrl headers and
// stamp different key headers), but the hop-by-hop set, the connection-managed
// header parsing, and the request-header copy loop are identical.

const HOP_BY_HOP_HEADERS = new Set([
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
]);

export const STRIPPED_PROXY_RESPONSE_HEADERS = new Set([...HOP_BY_HOP_HEADERS, 'content-encoding', 'content-length']);

/**
 * Parse a Connection header value into the set of header names it manages
 * (so those names are stripped from the forwarded request/response).
 */
export function getConnectionManagedHeaders(value: string | null | undefined): Set<string> {
  if (!value) {
    return new Set();
  }

  return new Set(
    value
      .split(',')
      .map((headerName) => headerName.trim().toLowerCase())
      .filter((headerName) => headerName.length > 0),
  );
}

/**
 * Copy the incoming request's headers into a fresh Headers object, always
 * dropping hop-by-hop headers (connection, transfer-encoding, etc.), the
 * connection-managed headers, and the caller's provider-specific stripped set.
 * Provider-specific auth / routing headers are stamped by the caller afterwards.
 */
export function copyProxyRequestHeaders(
  request: IncomingMessage,
  strippedRequestHeaders: ReadonlySet<string>,
): Headers {
  const headers = new Headers();
  const connectionManagedHeaders = getConnectionManagedHeaders(
    Array.isArray(request.headers.connection) ? request.headers.connection.join(',') : request.headers.connection,
  );

  for (const [name, value] of Object.entries(request.headers)) {
    if (typeof value === 'undefined') {
      continue;
    }

    const normalizedName = name.toLowerCase();
    if (
      HOP_BY_HOP_HEADERS.has(normalizedName) ||
      strippedRequestHeaders.has(normalizedName) ||
      connectionManagedHeaders.has(normalizedName)
    ) {
      continue;
    }

    if (Array.isArray(value)) {
      headers.set(normalizedName, value.join(','));
      continue;
    }

    headers.set(normalizedName, value);
  }

  return headers;
}

// ── Gemini proxy key/header helpers ─────────────────────────────────────────

const STRIPPED_GEMINI_REQUEST_HEADERS = new Set([
  'accept-encoding',
  'authorization',
  'content-length',
  'cookie',
  'host',
  'x-gemini-upstream-base-url',
]);

/**
 * Resolve the upstream API key for a Gemini proxy request with BYOK 兜底
 * semantics: a real browser-supplied x-goog-api-key wins; otherwise fall back
 * to the server key. When serverKeyPriority is set and a server key exists,
 * the server key wins. Used by geminiProxy and the streamJobs journal path.
 */
export function resolveGeminiRequestApiKey(
  request: { headers: IncomingMessage['headers'] },
  serverApiKey?: string,
  serverKeyPriority = false,
): string {
  const trimmedServerApiKey = serverApiKey?.trim();
  const browserApiKeyHeader = request.headers['x-goog-api-key'];
  const browserApiKey = Array.isArray(browserApiKeyHeader)
    ? (browserApiKeyHeader[0]?.trim() ?? '')
    : (browserApiKeyHeader?.trim() ?? '');

  if (serverKeyPriority && trimmedServerApiKey) {
    return trimmedServerApiKey;
  }

  if (browserApiKey) {
    return browserApiKey;
  }

  return trimmedServerApiKey ?? '';
}

/**
 * Build the outgoing header set for a Gemini upstream request: copy the
 * incoming request's headers minus hop-by-hop / connection-managed / sensitive
 * headers, then stamp the resolved API key. Shared by geminiProxy and the
 * streamJobs journal path so the two stay in sync.
 */
export function buildGeminiProxyHeaders(request: IncomingMessage, apiKey: string): Headers {
  const headers = copyProxyRequestHeaders(request, STRIPPED_GEMINI_REQUEST_HEADERS);

  headers.set('x-goog-api-key', apiKey);
  return headers;
}
