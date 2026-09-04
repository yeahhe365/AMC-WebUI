import type { IncomingMessage, ServerResponse } from 'node:http';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { ReadableStream as NodeReadableStream } from 'node:stream/web';
import { getCorsHeaders, sendJson } from './cors.js';
import { isPrivateNetworkHostname } from '../../shared/privateNetwork.js';
import { STRIPPED_PROXY_RESPONSE_HEADERS, getConnectionManagedHeaders } from './proxyHeaders.js';

// Shared upstream-forwarding pipeline for the Gemini and third-party HTTP
// proxies. The two proxies keep their own resolveRoute / request-header
// differences; everything from "attach abort hooks" to "pipe the body" lives
// here so the two paths cannot drift apart.

/**
 * Build the response headers for a proxied upstream response: copy the
 * upstream headers minus hop-by-hop / connection-managed / stripped headers,
 * then overlay the CORS headers. Shared by geminiProxy and thirdPartyProxy.
 */
function buildProxyResponseHeaders(
  request: IncomingMessage,
  upstreamResponse: Response,
  allowedOrigins: string[],
): Record<string, string> {
  const responseHeaders: Record<string, string> = {};
  const connectionManagedHeaders = getConnectionManagedHeaders(upstreamResponse.headers.get('connection'));

  upstreamResponse.headers.forEach((value, key) => {
    const normalizedName = key.toLowerCase();
    if (STRIPPED_PROXY_RESPONSE_HEADERS.has(normalizedName) || connectionManagedHeaders.has(normalizedName)) {
      return;
    }

    responseHeaders[normalizedName] = value;
  });

  Object.assign(responseHeaders, getCorsHeaders(request, allowedOrigins));
  return responseHeaders;
}

// ── SSRF guard ───────────────────────────────────────────────────────────────

export type UpstreamUrlRejection =
  'invalid-url' | 'insecure-protocol' | 'embedded-credentials' | 'private-network-host';

export type UpstreamUrlGuard =
  { ok: true; url: URL } | { ok: false; rejection: UpstreamUrlRejection; hostname?: string };

export interface UpstreamUrlGuardOptions {
  /**
   * Also reject URLs that embed userinfo credentials (https://user:pass@host).
   * The Gemini upstream-base override enables this; the third-party route
   * path has never rejected embedded credentials, so it keeps the flag off to
   * preserve its behavior exactly.
   */
  rejectEmbeddedCredentials?: boolean;
}

/**
 * Validate an upstream target URL for SSRF safety: it must parse, use https,
 * (optionally) carry no embedded credentials, and resolve to a non-private
 * network hostname. The checks run in that fixed order so callers can map
 * each rejection reason to their own error copy without behavior drift.
 */
export function guardPublicHttpsUrl(rawUrl: string, options: UpstreamUrlGuardOptions = {}): UpstreamUrlGuard {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return { ok: false, rejection: 'invalid-url' };
  }

  if (url.protocol !== 'https:') {
    return { ok: false, rejection: 'insecure-protocol', hostname: url.hostname };
  }

  if (options.rejectEmbeddedCredentials && (url.username || url.password)) {
    return { ok: false, rejection: 'embedded-credentials', hostname: url.hostname };
  }

  if (isPrivateNetworkHostname(url.hostname)) {
    return { ok: false, rejection: 'private-network-host', hostname: url.hostname };
  }

  return { ok: true, url };
}

// ── Forwarding pipeline ──────────────────────────────────────────────────────

export interface ForwardUpstreamOptions {
  upstreamUrl: string;
  allowedOrigins: string[];
  fetchImpl: typeof fetch;
  /**
   * Builds the upstream request headers. Invoked once, at the exact point
   * where the proxies used to assemble their RequestInit.
   */
  buildHeaders: () => Headers;
  /** Console-error tag, e.g. '[gemini]' / '[third-party]'. */
  logTag: string;
  /** Human-facing label inside 502 JSON error bodies, e.g. 'Gemini'. */
  errorLabel: string;
}

/**
 * Forward the incoming request to the upstream and pipe the response back.
 * Behavior contract (mirrors the original inline implementations in
 * geminiProxy / thirdPartyProxy):
 *  - abort hooks on request 'aborted' + response 'close' abort the fetch;
 *  - RequestInit always uses redirect: 'manual' and, for bodies,
 *    duplex: 'half' with the raw request as the body;
 *  - fetch rejection → 502 JSON (or a bare destroy when we aborted);
 *  - upstream 3xx → 502 JSON (redirects are never followed);
 *  - otherwise writeHead with buildProxyResponseHeaders and pipe the body;
 *  - abort hooks are always detached on every exit path.
 */
export async function forwardUpstream(
  request: IncomingMessage,
  response: ServerResponse,
  options: ForwardUpstreamOptions,
): Promise<void> {
  const { upstreamUrl, allowedOrigins, fetchImpl, buildHeaders, logTag, errorLabel } = options;

  const method = request.method || 'GET';
  const hasBody = !['GET', 'HEAD'].includes(method);
  const abortController = new AbortController();
  const abortUpstream = () => {
    if (!abortController.signal.aborted) {
      abortController.abort();
    }
  };

  const requestInit: RequestInit & { duplex?: 'half' } = {
    method,
    headers: buildHeaders(),
    signal: abortController.signal,
    // redirect: 'manual' so a public upstream base cannot 302 into a private
    // network host after the input URL passed validation.
    redirect: 'manual',
  };

  if (hasBody) {
    requestInit.body = request as unknown as BodyInit;
    requestInit.duplex = 'half';
  }

  request.once('aborted', abortUpstream);
  response.once('close', abortUpstream);

  let upstreamResponse: Response;
  try {
    upstreamResponse = await fetchImpl(upstreamUrl, requestInit);
  } catch (error) {
    request.off('aborted', abortUpstream);
    response.off('close', abortUpstream);
    if (abortController.signal.aborted) {
      if (!response.destroyed) {
        response.destroy();
      }
      return;
    }

    console.error(`${logTag} upstream request failed:`, error);
    sendJson(request, response, 502, { error: `${errorLabel} upstream request failed.` }, allowedOrigins);
    return;
  }

  // Block redirects: the API base should not legitimately redirect, and a 3xx
  // here would mean we did not follow it (good) but the upstream attempted to
  // point us elsewhere.
  if (upstreamResponse.status >= 300 && upstreamResponse.status < 400) {
    request.off('aborted', abortUpstream);
    response.off('close', abortUpstream);
    console.error(`${logTag} upstream returned redirect:`, upstreamResponse.status);
    sendJson(
      request,
      response,
      502,
      { error: `${errorLabel} upstream returned an unexpected redirect.` },
      allowedOrigins,
    );
    return;
  }

  response.writeHead(upstreamResponse.status, buildProxyResponseHeaders(request, upstreamResponse, allowedOrigins));

  if (!upstreamResponse.body) {
    request.off('aborted', abortUpstream);
    response.off('close', abortUpstream);
    response.end();
    return;
  }

  try {
    await pipeline(Readable.fromWeb(upstreamResponse.body as unknown as NodeReadableStream), response);
  } catch (error) {
    if (!abortController.signal.aborted && !response.destroyed) {
      response.destroy(error instanceof Error ? error : undefined);
    }
  } finally {
    request.off('aborted', abortUpstream);
    response.off('close', abortUpstream);
  }
}
