import type { IncomingMessage, ServerResponse } from 'node:http';
import { sendJson } from '../cors.js';
import { maybeStreamWithJob } from '../stream-jobs/streamJobs.js';
import { forwardUpstream, guardPublicHttpsUrl } from './proxyForward.js';
import { buildGeminiProxyHeaders } from './proxyHeaders.js';
import { resolveApiKeyPrecedence } from './apiKeyPrecedence.js';
import { createConnectionSafeFetch } from '../../../shared/connectionSafeFetch.js';

export const GEMINI_PROXY_PREFIX = '/api/gemini';
const GEMINI_UPSTREAM_BASE_HEADER = 'x-gemini-upstream-base-url';

export interface GeminiProxyConfig {
  geminiApiBase: string;
  geminiApiKey?: string;
  allowedOrigins: string[];
  // When false (default): a browser-supplied x-goog-api-key wins, the server
  // key is the fallback (BYOK 兜底). When true: the server key wins.
  serverKeyPriority?: boolean;
}

/**
 * Parse and validate the x-gemini-upstream-base-url header. Returns a validated
 * trailing-slash-stripped base URL string, or null when the header is absent or
 * fails SSRF validation. When present and valid, the proxy uses this as the
 * upstream target instead of config.geminiApiBase.
 *
 * Security constraints (shared guardPublicHttpsUrl):
 *  - https only
 *  - no embedded credentials
 *  - non-private network host (SSRF guard via isPrivateNetworkHostname)
 */
function resolveUpstreamBaseOverride(request: IncomingMessage): string | null {
  const raw = request.headers[GEMINI_UPSTREAM_BASE_HEADER];
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (!value || typeof value !== 'string') return null;

  const trimmed = value.trim();
  if (!trimmed) return null;

  const guard = guardPublicHttpsUrl(trimmed, { rejectEmbeddedCredentials: true });
  return guard.ok ? trimmed.replace(/\/$/, '') : null;
}

export async function proxyGeminiRequest(
  request: IncomingMessage,
  response: ServerResponse,
  config: GeminiProxyConfig,
  fetchImpl: typeof fetch,
): Promise<void> {
  const rawBrowserKey = request.headers['x-goog-api-key'];
  const selectedKey = resolveApiKeyPrecedence({
    browserKey: (Array.isArray(rawBrowserKey) ? rawBrowserKey[0] : rawBrowserKey)?.trim(),
    serverKey: config.geminiApiKey,
    serverKeyPriority: config.serverKeyPriority,
  });
  const apiKeyForProxy = selectedKey?.apiKey;

  if (!apiKeyForProxy) {
    sendJson(request, response, 500, { error: 'GEMINI_API_KEY is not configured.' }, config.allowedOrigins);
    return;
  }

  const requestUrl = new URL(request.url || '/', 'http://localhost');
  const upstreamPath = requestUrl.pathname.slice(GEMINI_PROXY_PREFIX.length) || '/';

  // A browser-selected target may receive only browser-selected credentials.
  // Server credentials always stay on the administrator-configured target.
  const upstreamBaseOverride = selectedKey?.isBrowserKey ? resolveUpstreamBaseOverride(request) : null;
  const targetBase = upstreamBaseOverride ?? config.geminiApiBase.replace(/\/$/, '');
  const upstreamUrl = `${targetBase}${upstreamPath}${requestUrl.search}`;
  // Administrator-configured Gemini endpoints may be private (self-hosted
  // gateways); browser-selected endpoints always use the public policy.
  const safeFetch = createConnectionSafeFetch(fetchImpl, { allowPrivate: !upstreamBaseOverride });

  // Stream journal: when the browser sends an x-amc-job-id header on a
  // streamGenerateContent request, the upstream is buffered independently of
  // the browser connection so a page refresh can resume from the last seq.
  // No header → ordinary pass-through (today's behavior), fully reversible.
  if (
    await maybeStreamWithJob(request, response, upstreamPath, upstreamUrl, {
      geminiApiBase: config.geminiApiBase,
      geminiApiKey: config.geminiApiKey,
      allowedOrigins: config.allowedOrigins,
      serverKeyPriority: config.serverKeyPriority,
      fetchImpl: safeFetch,
    })
  ) {
    return;
  }

  await forwardUpstream(request, response, {
    upstreamUrl,
    allowedOrigins: config.allowedOrigins,
    fetchImpl: safeFetch,
    buildHeaders: () => buildGeminiProxyHeaders(request, apiKeyForProxy),
    logTag: '[gemini]',
    errorLabel: 'Gemini',
  });
}
