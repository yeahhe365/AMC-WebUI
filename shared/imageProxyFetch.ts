import { assertImageProxyHostResolvesPublic, type ImageProxyDnsLookup } from './imageProxyDns.js';
import { isPrivateNetworkHostname } from './privateNetwork.js';

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
  if (redirectUrl.username || redirectUrl.password) {
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
  const fetchImpl = options.fetchImpl ?? fetch;
  const maxRedirects = options.maxRedirects ?? IMAGE_PROXY_MAX_REDIRECTS;
  let currentUrl = targetUrl;

  for (let hop = 0; hop <= maxRedirects; hop += 1) {
    try {
      await assertImageProxyHostResolvesPublic(currentUrl, options.lookup);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Image proxy target is not allowed.';
      return { ok: false, kind: 'blocked', message };
    }

    let upstreamResponse: Response;
    try {
      upstreamResponse = await fetchImpl(currentUrl, {
        headers: { ...IMAGE_PROXY_REQUEST_HEADERS },
        redirect: 'manual',
        signal: options.signal,
      });
    } catch (error) {
      return { ok: false, kind: 'fetch_error', error };
    }

    if (upstreamResponse.status < 300 || upstreamResponse.status >= 400) {
      return { ok: true, response: upstreamResponse };
    }

    const location = upstreamResponse.headers.get('location');
    if (!location) {
      return { ok: true, response: upstreamResponse };
    }

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
