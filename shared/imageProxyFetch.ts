import { assertImageProxyHostResolvesPublic, type ImageProxyDnsLookup } from './imageProxyDns.js';
import { isPrivateNetworkHostname } from './privateNetwork.js';
import { createConnectionSafeFetch, getNetworkTargetError } from './connectionSafeFetch.js';

/** Max redirects followed while re-validating each hop (CDN signed URLs often 302 once). */
const IMAGE_PROXY_MAX_REDIRECTS = 3;

const IMAGE_PROXY_REQUEST_HEADERS = {
  accept: 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
  'user-agent': 'AMC-WebUI image proxy',
} as const;

/**
 * Reject redirect targets that land on private hosts or carry credentials.
 * Guards against open redirects after the initial allowlist check passes.
 */
export const isUnsafeImageProxyRedirect = (redirectUrl: URL): boolean => {
  if (!['http:', 'https:'].includes(redirectUrl.protocol) || redirectUrl.username || redirectUrl.password) {
    return true;
  }
  try {
    return isPrivateNetworkHostname(redirectUrl.hostname);
  } catch {
    return true;
  }
};

type ImageProxyFetchResult =
  | { ok: true; response: Response }
  | { ok: false; kind: 'unsafe_redirect' }
  | { ok: false; kind: 'blocked'; message: string }
  | { ok: false; kind: 'fetch_error'; error: unknown }
  | { ok: false; kind: 'no_response' };

/**
 * Fetch an image-proxy target with redirect: 'manual', re-checking each hop for
 * private hostnames and DNS resolution to private addresses (DNS rebinding).
 * Shared by production API and Vite dev plugin.
 */
export async function fetchImageProxyWithSafeRedirects(
  targetUrl: URL,
  options: {
    fetchImpl?: typeof fetch;
    signal?: AbortSignal;
    maxRedirects?: number;
    /** Override DNS lookup (tests). Defaults to node:dns/promises.lookup. */
    lookup?: ImageProxyDnsLookup;
  } = {},
): Promise<ImageProxyFetchResult> {
  const fetchImpl = createConnectionSafeFetch(options.fetchImpl ?? fetch, { lookup: options.lookup });
  const maxRedirects = options.maxRedirects ?? IMAGE_PROXY_MAX_REDIRECTS;
  let currentUrl = targetUrl;

  for (let hop = 0; hop <= maxRedirects; hop += 1) {
    try {
      await assertImageProxyHostResolvesPublic(currentUrl, options.lookup);
    } catch (resolutionError) {
      const message = resolutionError instanceof Error ? resolutionError.message : 'Image proxy target is not allowed.';
      return { ok: false, kind: 'blocked', message };
    }

    let upstreamResponse: Response;
    try {
      upstreamResponse = await fetchImpl(currentUrl, {
        headers: { ...IMAGE_PROXY_REQUEST_HEADERS },
        redirect: 'manual',
        signal: options.signal,
      });
    } catch (upstreamFetchError) {
      const blocked = getNetworkTargetError(upstreamFetchError);
      if (blocked) return { ok: false, kind: 'blocked', message: blocked.message };
      return { ok: false, kind: 'fetch_error', error: upstreamFetchError };
    }

    if (upstreamResponse.status < 300 || upstreamResponse.status >= 400) {
      return { ok: true, response: upstreamResponse };
    }

    const location = upstreamResponse.headers.get('location');
    if (!location) {
      return { ok: true, response: upstreamResponse };
    }

    // Cancel unused bodies rather than buffering an untrusted redirect body.
    await upstreamResponse.body?.cancel().catch(() => undefined);

    let redirectUrl: URL;
    try {
      redirectUrl = new URL(location, currentUrl);
    } catch {
      return { ok: false, kind: 'unsafe_redirect' };
    }

    if (isUnsafeImageProxyRedirect(redirectUrl)) {
      return { ok: false, kind: 'unsafe_redirect' };
    }

    currentUrl = redirectUrl;
  }

  return { ok: false, kind: 'no_response' };
}

/**
 * Safely reads response body up to maxBytes without buffering unbounded chunks
 * in memory. Returns null if body exceeds maxBytes or stream fails.
 */
export async function readBoundedResponseBody(
  response: Response,
  maxBytes: number,
  signal?: AbortSignal,
): Promise<Uint8Array | null> {
  if (!response.body || typeof response.body.getReader !== 'function') {
    const buffer = await response.arrayBuffer().catch(() => new ArrayBuffer(0));
    if (buffer.byteLength > maxBytes) return null;
    return new Uint8Array(buffer);
  }

  const reader = response.body.getReader();
  const abortReader = () => {
    void reader.cancel(signal?.reason).catch(() => undefined);
  };
  signal?.addEventListener('abort', abortReader, { once: true });
  if (signal?.aborted) abortReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > maxBytes) {
        try {
          await reader.cancel();
        } catch {
          // ignore
        }
        return null;
      }
      chunks.push(value);
    }
  } catch {
    return null;
  } finally {
    signal?.removeEventListener('abort', abortReader);
    reader.releaseLock();
  }

  if (signal?.aborted) return null;

  const merged = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return merged;
}
