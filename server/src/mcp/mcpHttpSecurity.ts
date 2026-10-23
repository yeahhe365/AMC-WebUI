import dns from 'node:dns/promises';
import net from 'node:net';
import { isPrivateNetworkHostname } from '../../../shared/privateNetwork.js';
import { createConnectionSafeFetch } from '../../../shared/connectionSafeFetch.js';

export type FetchLike = (url: string | URL, init?: RequestInit) => Promise<Response>;

const MAX_REDIRECTS = 5;

/**
 * Reject hostnames that are private literals, or that resolve to private/link-local addresses
 * (DNS rebinding / SSRF protection). When allowPrivate is true, any host is permitted.
 */
export async function assertMcpHttpUrlAllowed(urlString: string, allowPrivate: boolean): Promise<void> {
  let parsed: URL;
  try {
    parsed = new URL(urlString);
  } catch {
    throw new Error('MCP HTTP server URL is invalid.');
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('MCP HTTP server URL must use http:// or https://.');
  }

  if (parsed.username || parsed.password) throw new Error('MCP HTTP server URL must not include credentials.');

  const hostname = parsed.hostname.replace(/^\[|\]$/g, '');
  if (!hostname) {
    throw new Error('MCP HTTP server URL is missing a hostname.');
  }

  if (allowPrivate) {
    return;
  }

  if (isPrivateNetworkHostname(hostname)) {
    throw new Error('Private MCP HTTP server URLs are disabled on this API server.');
  }

  // IP literals that are public already passed isPrivateNetworkHostname.
  if (net.isIP(hostname)) {
    return;
  }

  let addresses: Array<{ address: string }>;
  try {
    addresses = await dns.lookup(hostname, { all: true, verbatim: true });
  } catch (dnsLookupError) {
    const message = dnsLookupError instanceof Error ? dnsLookupError.message : String(dnsLookupError);
    throw new Error(`Failed to resolve MCP HTTP host "${hostname}": ${message}`, { cause: dnsLookupError });
  }

  if (addresses.length === 0) {
    throw new Error(`MCP HTTP host "${hostname}" did not resolve to any addresses.`);
  }

  for (const { address } of addresses) {
    if (isPrivateNetworkHostname(address)) {
      throw new Error(
        `MCP HTTP host "${hostname}" resolves to private address ${address}, which is disabled on this API server.`,
      );
    }
  }
}

/**
 * Fetch wrapper that re-validates redirect targets so a public URL cannot bounce to a private IP.
 */
export function createSafeMcpFetch(allowPrivate: boolean, baseFetch: FetchLike = fetch): FetchLike {
  const connectionFetch = createConnectionSafeFetch(baseFetch as typeof fetch, { allowPrivate });
  return async (input, init) => {
    const initialUrl = typeof input === 'string' ? input : input instanceof URL ? input.href : String(input);
    await assertMcpHttpUrlAllowed(initialUrl, allowPrivate);

    // Manual redirect handling so each hop is checked.
    let currentUrl = initialUrl;
    let currentInit: RequestInit | undefined = {
      ...init,
      redirect: 'manual',
    };

    for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
      const response: Response = await connectionFetch(currentUrl, currentInit);

      if (response.status < 300 || response.status >= 400) {
        return response;
      }

      const location = response.headers.get('location');
      if (!location) {
        return response;
      }

      // Release the response even when validation rejects the next hop.
      await response.body?.cancel().catch(() => undefined);
      const previous = new URL(currentUrl);
      const next = new URL(location, previous);
      if (next.origin !== previous.origin || (previous.protocol === 'https:' && next.protocol !== 'https:')) {
        throw new Error('MCP HTTP redirect must stay on the same origin without a protocol downgrade.');
      }
      const nextUrl = next.href;
      await assertMcpHttpUrlAllowed(nextUrl, allowPrivate);

      // Drop body on redirect for non-GET (matches common fetch redirect behavior for 301/302).
      const requestMethod: string = String(currentInit?.method ?? 'GET').toUpperCase();
      const redirectToGet: boolean =
        response.status === 303 ||
        ((response.status === 301 || response.status === 302) && requestMethod !== 'GET' && requestMethod !== 'HEAD');
      currentInit = {
        ...currentInit,
        method: redirectToGet ? 'GET' : requestMethod,
        body: redirectToGet ? undefined : currentInit?.body,
        redirect: 'manual',
      };
      currentUrl = nextUrl;
    }

    throw new Error(`MCP HTTP request exceeded ${MAX_REDIRECTS} redirects.`);
  };
}
