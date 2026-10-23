import dns from 'node:dns/promises';
import net, { type LookupFunction } from 'node:net';
import { Agent } from 'undici';
import { isPrivateNetworkHostname } from './privateNetwork.js';

export type NetworkDnsLookup = (
  hostname: string,
  options: { all: true; verbatim: true },
) => Promise<Array<{ address: string; family?: number }>>;

const defaultLookup: NetworkDnsLookup = (hostname, options) => dns.lookup(hostname, options);
const dispatchers = new WeakMap<NetworkDnsLookup, Agent>();

/** Validation errors can be nested in the TypeError thrown by Node fetch. */
export class NetworkTargetError extends Error {}

export function getNetworkTargetError(error: unknown): NetworkTargetError | undefined {
  let current = error;
  for (let depth = 0; depth < 8 && current instanceof Error; depth += 1) {
    if (current instanceof NetworkTargetError) return current;
    current = current.cause;
  }
  return undefined;
}

function assertNetworkUrl(url: URL, allowPrivate = false): void {
  if (!['http:', 'https:'].includes(url.protocol)) throw new NetworkTargetError('Upstream URL must use HTTP or HTTPS.');
  if (url.username || url.password) throw new NetworkTargetError('Upstream URL must not include credentials.');
  if (!allowPrivate && isPrivateNetworkHostname(url.hostname)) {
    throw new NetworkTargetError('Upstream URL targets a private network host.');
  }
}

function publicDispatcher(lookup: NetworkDnsLookup): Agent {
  let agent = dispatchers.get(lookup);
  if (agent) return agent;
  const checkedLookup: LookupFunction = (hostname, options, callback) => {
    void lookup(hostname, { all: true, verbatim: true })
      .then((records) => {
        if (!records.length)
          throw new NetworkTargetError(`Upstream host "${hostname}" did not resolve to any addresses.`);
        const addresses = records.map(({ address }) => ({ address, family: net.isIP(address) }));
        for (const { address, family } of addresses) {
          if (!family || isPrivateNetworkHostname(address)) {
            throw new NetworkTargetError(`Upstream host "${hostname}" resolves to private address ${address}.`);
          }
        }
        const family = options.family === 'IPv4' ? 4 : options.family === 'IPv6' ? 6 : options.family;
        const selected = family ? addresses.filter((record) => record.family === family) : addresses;
        if (!selected.length)
          throw new NetworkTargetError(`Upstream host "${hostname}" has no address for the requested family.`);
        // Return these exact checked records to net.connect. No second resolver
        // can replace them; hostname, Host and TLS SNI remain the original URL.
        if (options.all) callback(null, selected);
        else callback(null, selected[0].address, selected[0].family);
      })
      .catch((error: unknown) => callback(error instanceof Error ? error : new Error(String(error)), []));
  };
  agent = new Agent({
    connect: { lookup: checkedLookup, timeout: 10_000 },
    maxOrigins: 128,
    connections: 8,
    keepAliveTimeout: 10_000,
    keepAliveMaxTimeout: 30_000,
  });
  dispatchers.set(lookup, agent);
  return agent;
}

/** Node's fetch honors undici dispatchers. Alternate transports supplied by
 * trusted callers must also honor dispatcher and redirect:'manual'. */
export function createConnectionSafeFetch(
  baseFetch: typeof fetch = fetch,
  options: { allowPrivate?: boolean; lookup?: NetworkDnsLookup } = {},
): typeof fetch {
  return async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    assertNetworkUrl(url, options.allowPrivate);
    const safeInit: RequestInit & { dispatcher?: Agent } = { ...init, redirect: 'manual' };
    if (!options.allowPrivate) safeInit.dispatcher = publicDispatcher(options.lookup ?? defaultLookup);
    return baseFetch(input, safeInit);
  };
}
