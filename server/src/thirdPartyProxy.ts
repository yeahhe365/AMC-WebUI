import type { IncomingMessage, ServerResponse } from 'node:http';
import {
  parseThirdPartyExtraHeadersHeader,
  THIRD_PARTY_EXTRA_HEADERS_HEADER,
} from '../../shared/thirdPartyExtraHeaders.js';
import { sendJson } from './cors.js';
import type { ThirdPartyProxyRoute } from './config.js';
import { forwardUpstream, guardPublicHttpsUrl } from './proxyForward.js';
import { runDetachedUpstream, maybeStreamWithSharedJob, type StreamJob } from './streamJobStore.js';
import { copyProxyRequestHeaders } from './proxyHeaders.js';

export const OPENAI_PROXY_PREFIX = '/api/openai';

const STRIPPED_PROXY_REQUEST_HEADERS = new Set([
  'accept-encoding',
  'content-length',
  'cookie',
  'host',
  // The browser sends its provider key as Authorization / x-api-key. Under
  // BYOK 兜底 the browser key wins; otherwise the server route table key wins.
  'authorization',
  'x-api-key',
  // The browser supplies the provider's real baseUrl in pure-BYOK mode (no
  // route table entry). It is consumed by resolveRoute and must not leak
  // upstream.
  'x-third-party-base-url',
  'x-third-party-extra-headers',
]);

const THIRD_PARTY_PROVIDER_HEADER = 'x-third-party-provider';
// When the server route table has no entry for a provider (pure BYOK), the
// browser supplies the provider's real baseUrl here so the proxy can still
// forward without a preconfigured THIRD_PARTY_ROUTES entry. Still SSRF-checked.
const THIRD_PARTY_BASE_URL_HEADER = 'x-third-party-base-url';

export interface ThirdPartyProxyConfig {
  thirdPartyRoutes: Record<string, ThirdPartyProxyRoute>;
  serverKeyPriority?: boolean;
  allowedOrigins: string[];
}

function resolveProviderId(request: IncomingMessage): string | null {
  const header = request.headers[THIRD_PARTY_PROVIDER_HEADER];
  const value = Array.isArray(header) ? header[0] : header;
  const trimmed = typeof value === 'string' ? value.trim().toLowerCase() : '';
  return trimmed || null;
}

interface ResolvedRoute {
  baseUrl: string;
  apiKey: string | null;
  isBrowserKey: boolean;
}

const resolveRoute = (
  request: IncomingMessage,
  routes: Record<string, ThirdPartyProxyRoute>,
): { route?: ResolvedRoute; providerId: string; error?: { status: number; message: string } } => {
  const providerId = resolveProviderId(request) ?? 'openai';
  const route = routes[providerId] ?? routes['openai'];

  const browserAuthorization = request.headers['authorization'];
  const browserBearer =
    typeof browserAuthorization === 'string' && browserAuthorization.toLowerCase().startsWith('bearer ')
      ? browserAuthorization.slice(7).trim()
      : '';
  const browserApiKeyHeader = request.headers['x-api-key'];
  const browserApiKey = Array.isArray(browserApiKeyHeader)
    ? (browserApiKeyHeader[0]?.trim() ?? '')
    : (browserApiKeyHeader?.trim() ?? '');

  const browserKey = browserBearer || browserApiKey;

  // Pure BYOK path: no route table entry. The browser must supply both a real
  // key (BYOK) and the provider's real baseUrl; the server has no upstream to
  // fall back to. Still SSRF-checked before forwarding.
  if (!route) {
    const browserBaseUrlHeader = request.headers[THIRD_PARTY_BASE_URL_HEADER];
    const browserBaseUrlRaw = Array.isArray(browserBaseUrlHeader)
      ? (browserBaseUrlHeader[0]?.trim() ?? '')
      : (browserBaseUrlHeader?.trim() ?? '');

    if (browserKey && browserBaseUrlRaw) {
      return { route: { baseUrl: browserBaseUrlRaw, apiKey: browserKey, isBrowserKey: true }, providerId };
    }

    return {
      providerId,
      error: {
        status: 400,
        message: `Third-party provider "${providerId}" is not configured. Set a server route in THIRD_PARTY_ROUTES, or supply a browser key and baseUrl.`,
      },
    };
  }

  // BYOK 兜底: a real browser key wins; otherwise use the server route key.
  if (browserKey) {
    return { route: { baseUrl: route.baseUrl, apiKey: browserKey, isBrowserKey: true }, providerId };
  }

  if (route.apiKey) {
    return { route: { baseUrl: route.baseUrl, apiKey: route.apiKey, isBrowserKey: false }, providerId };
  }

  return {
    providerId,
    error: { status: 500, message: `No API key configured for third-party provider "${providerId}".` },
  };
};

function buildProxyHeaders(request: IncomingMessage, route: ResolvedRoute, providerId: string): Headers {
  const headers = copyProxyRequestHeaders(request, STRIPPED_PROXY_REQUEST_HEADERS);

  headers.set(THIRD_PARTY_PROVIDER_HEADER, providerId);

  // Anthropic uses x-api-key + anthropic-version; OpenAI-compatible uses Bearer.
  // The browser already sets content-type / anthropic-version on these requests;
  // re-stamp the auth header with the resolved (browser or server) key.
  if (route.apiKey) {
    headers.set('authorization', `Bearer ${route.apiKey}`);
    headers.set('x-api-key', route.apiKey);
  }

  const extraHeadersHeader = request.headers[THIRD_PARTY_EXTRA_HEADERS_HEADER];
  const extraHeadersRaw = Array.isArray(extraHeadersHeader) ? extraHeadersHeader[0] : extraHeadersHeader;
  const extraHeaders = parseThirdPartyExtraHeadersHeader(extraHeadersRaw);
  for (const [name, value] of Object.entries(extraHeaders)) {
    headers.set(name, value);
  }

  return headers;
}

export async function proxyThirdPartyRequest(
  request: IncomingMessage,
  response: ServerResponse,
  config: ThirdPartyProxyConfig,
  fetchImpl: typeof fetch,
): Promise<void> {
  const requestUrl = new URL(request.url || '/', 'http://localhost');
  const upstreamPath = requestUrl.pathname.slice(OPENAI_PROXY_PREFIX.length) || '/';

  const resolved = resolveRoute(request, config.thirdPartyRoutes);
  if (resolved.error) {
    sendJson(request, response, resolved.error.status, { error: resolved.error.message }, config.allowedOrigins);
    return;
  }

  const route = resolved.route;
  if (!route) {
    sendJson(request, response, 400, { error: 'Third-party route could not be resolved.' }, config.allowedOrigins);
    return;
  }

  const targetBase = route.baseUrl.replace(/\/$/, '');
  const upstreamUrl = `${targetBase}${upstreamPath}${requestUrl.search}`;

  // SSRF guard: only allow https + non-private hosts from the route table.
  // Embedded credentials are NOT rejected here — this path has never checked
  // them, so the shared guard's credential check stays off to preserve the
  // behavior exactly (the Gemini override header does enable it).
  const upstreamGuard = guardPublicHttpsUrl(upstreamUrl);
  if (!upstreamGuard.ok) {
    const detail =
      upstreamGuard.rejection === 'invalid-url'
        ? 'Invalid third-party upstream URL.'
        : upstreamGuard.rejection === 'insecure-protocol'
          ? 'Third-party upstream must use HTTPS.'
          : `Third-party upstream host "${upstreamGuard.hostname}" is not allowed.`;
    sendJson(request, response, 400, { error: detail }, config.allowedOrigins);
    return;
  }

  // Stream journal: when the browser sends an x-amc-job-id header on a
  // streaming request, the upstream is buffered independently of the browser
  // connection so a page refresh can resume from the last seq — exactly like
  // the Gemini path. No header → ordinary pass-through (today's behavior),
  // fully reversible. The SSE split logic (\n\n boundaries, CRLF normalization)
  // in pumpUpstreamBodyIntoJob is provider-agnostic: OpenAI's `data: {...}\n\n`
  // frames, the trailing `[DONE]` marker, and Anthropic's `event:`/`data:`
  // blocks all split cleanly on \n\n and buffer as whole events.
  if (
    await maybeStreamWithSharedJob(request, response, { allowedOrigins: config.allowedOrigins }, (job) => {
      void runThirdPartyUpstream(job, request, upstreamUrl, route, resolved.providerId, fetchImpl);
    })
  ) {
    return;
  }

  await forwardUpstream(request, response, {
    upstreamUrl,
    allowedOrigins: config.allowedOrigins,
    fetchImpl,
    buildHeaders: () => buildProxyHeaders(request, route, resolved.providerId),
    logTag: '[third-party]',
    errorLabel: 'Third-party',
  });
}

/**
 * Detached upstream fetch for the third-party journal path. Mirrors the Gemini
 * runUpstream: fires the fetch on the job's abort signal (so the stream-abort
 * endpoint can kill it), pumps the SSE body into the job buffer, and finishes
 * the job on completion or error. A browser disconnect does NOT abort this —
 * only the stream-abort endpoint or the sweeper does.
 */
const runThirdPartyUpstream = (
  job: StreamJob,
  request: IncomingMessage,
  upstreamUrl: string,
  route: ResolvedRoute,
  providerId: string,
  fetchImpl: typeof fetch,
): Promise<void> =>
  runDetachedUpstream(job, request, upstreamUrl, () => buildProxyHeaders(request, route, providerId), fetchImpl);
