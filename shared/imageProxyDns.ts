import dns from 'node:dns/promises';
import net from 'node:net';
import { isPrivateNetworkHostname } from './privateNetwork.js';

/**
 * Lookup used for image-proxy SSRF / DNS-rebinding checks.
 * Injectable in tests so unit suites stay offline.
 */
export type ImageProxyDnsLookup = (
  hostname: string,
  options: { all: true; verbatim: true },
) => Promise<Array<{ address: string; family?: number }>>;

const defaultLookup: ImageProxyDnsLookup = (hostname, options) => dns.lookup(hostname, options);

/**
 * Reject hosts that are private literals or that resolve to private/link-local
 * addresses (DNS rebinding / SSRF). Mirrors the MCP HTTP allowlist in
 * server/src/mcp/mcpHttpSecurity.ts so image-proxy and MCP share the same bar.
 *
 * This preflight gives callers a useful validation error. The fetch path must
 * also use connectionSafeFetch, which binds the check to its actual socket.
 */
export async function assertImageProxyHostResolvesPublic(
  url: URL,
  lookup: ImageProxyDnsLookup = defaultLookup,
): Promise<void> {
  if (url.username || url.password) {
    throw new Error('Image proxy URL must not include credentials.');
  }

  const hostname = url.hostname.replace(/^\[|\]$/g, '');
  if (!hostname) {
    throw new Error('Image proxy URL is missing a hostname.');
  }

  if (isPrivateNetworkHostname(hostname)) {
    throw new Error('Image proxy URL targets a private network host.');
  }

  // Public IP literals already passed isPrivateNetworkHostname — no DNS needed.
  if (net.isIP(hostname)) {
    return;
  }

  let addresses: Array<{ address: string }>;
  try {
    addresses = await lookup(hostname, { all: true, verbatim: true });
  } catch (dnsLookupError) {
    const message = dnsLookupError instanceof Error ? dnsLookupError.message : String(dnsLookupError);
    throw new Error(`Failed to resolve image proxy host "${hostname}": ${message}`, { cause: dnsLookupError });
  }

  if (addresses.length === 0) {
    throw new Error(`Image proxy host "${hostname}" did not resolve to any addresses.`);
  }

  for (const { address } of addresses) {
    if (isPrivateNetworkHostname(address)) {
      throw new Error(`Image proxy host "${hostname}" resolves to private address ${address}.`);
    }
  }
}
