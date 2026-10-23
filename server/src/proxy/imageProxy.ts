import type { IncomingMessage, ServerResponse } from 'node:http';
import { fetchImageProxyWithSafeRedirects, readBoundedResponseBody } from '../../../shared/imageProxyFetch.js';
import { parseAllowedImageProxyUrl } from '../../../shared/imageProxyUrl.js';
import { getCorsHeaders, sendJson } from '../cors.js';

export const IMAGE_PROXY_PATH = '/api/image-proxy';

const MAX_IMAGE_PROXY_BYTES = 25 * 1024 * 1024;
const IMAGE_PROXY_TIMEOUT_MS = 15_000;

export async function proxyExternalImage(
  request: IncomingMessage,
  response: ServerResponse,
  requestUrl: URL,
  allowedOrigins: string[],
  fetchImpl: typeof fetch,
  options: { timeoutMs?: number } = {},
): Promise<void> {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    sendJson(request, response, 405, { error: 'Method not allowed' }, allowedOrigins);
    return;
  }

  const targetUrl = parseAllowedImageProxyUrl(requestUrl.searchParams.get('url'));
  if (!targetUrl) {
    sendJson(request, response, 400, { error: 'Image proxy URL is not allowed.' }, allowedOrigins);
    return;
  }

  // Follow redirects with per-hop private-network + DNS rebinding checks (shared with Vite).
  const abortController = new AbortController();
  const abortUpstream = () => {
    if (!abortController.signal.aborted) {
      abortController.abort();
    }
  };
  const onClientClose = () => {
    if (!response.writableEnded) abortUpstream();
  };
  const timeout = setTimeout(abortUpstream, options.timeoutMs ?? IMAGE_PROXY_TIMEOUT_MS);
  timeout.unref();
  request.once('aborted', abortUpstream);
  response.once('close', onClientClose);
  if (request.aborted || response.destroyed) abortUpstream();

  let fetchResult: Awaited<ReturnType<typeof fetchImageProxyWithSafeRedirects>>;
  let finalUpstreamResponse: Response | undefined;
  try {
    fetchResult = await fetchImageProxyWithSafeRedirects(targetUrl, {
      fetchImpl,
      signal: abortController.signal,
    });

    if (!fetchResult.ok) {
      if (fetchResult.kind === 'unsafe_redirect') {
        sendJson(request, response, 400, { error: 'Image proxy target attempted an unsafe redirect.' }, allowedOrigins);
        return;
      }

      if (fetchResult.kind === 'blocked') {
        sendJson(request, response, 400, { error: fetchResult.message }, allowedOrigins);
        return;
      }

      const aborted = abortController.signal.aborted;
      const message =
        aborted && !request.destroyed
          ? 'Image proxy request timed out.'
          : fetchResult.kind === 'fetch_error' && fetchResult.error instanceof Error
            ? fetchResult.error.message
            : 'Unknown upstream error';
      console.error(
        '[image-proxy] upstream request failed:',
        fetchResult.kind === 'fetch_error' ? fetchResult.error : fetchResult.kind,
      );
      sendJson(
        request,
        response,
        aborted ? 504 : 502,
        { error: `Image proxy request failed: ${message}` },
        allowedOrigins,
      );
      return;
    }

    finalUpstreamResponse = fetchResult.response;

    if (!finalUpstreamResponse.ok) {
      sendJson(
        request,
        response,
        502,
        { error: `Image proxy target returned ${finalUpstreamResponse.status}.` },
        allowedOrigins,
      );
      return;
    }

    const contentType = finalUpstreamResponse.headers.get('content-type')?.split(';')[0].trim().toLowerCase() ?? '';
    if (!contentType.startsWith('image/')) {
      sendJson(request, response, 415, { error: 'Image proxy target did not return an image.' }, allowedOrigins);
      return;
    }

    const contentLength = Number(finalUpstreamResponse.headers.get('content-length') ?? '0');
    if (contentLength > MAX_IMAGE_PROXY_BYTES) {
      sendJson(request, response, 413, { error: 'Image proxy target is too large.' }, allowedOrigins);
      return;
    }

    const body =
      request.method === 'HEAD'
        ? new Uint8Array(0)
        : await readBoundedResponseBody(finalUpstreamResponse, MAX_IMAGE_PROXY_BYTES, abortController.signal);
    if (!body) {
      if (!response.destroyed) {
        sendJson(
          request,
          response,
          abortController.signal.aborted ? 504 : 413,
          {
            error: abortController.signal.aborted
              ? 'Image proxy request timed out.'
              : 'Image proxy target is too large.',
          },
          allowedOrigins,
        );
      }
      return;
    }

    response.writeHead(finalUpstreamResponse.status, {
      ...getCorsHeaders(request, allowedOrigins),
      'content-type': contentType,
      'cache-control': 'public, max-age=86400',
      'x-content-type-options': 'nosniff',
      'content-security-policy': "default-src 'none'; script-src 'none'",
    });

    if (request.method === 'HEAD') {
      response.end();
      return;
    }

    response.end(body);
  } finally {
    clearTimeout(timeout);
    request.off('aborted', abortUpstream);
    response.off('close', onClientClose);
    await finalUpstreamResponse?.body?.cancel().catch(() => undefined);
  }
}
