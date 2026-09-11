import net from 'node:net';

const isPrivateIpv4 = (ip: string): boolean => {
  const [first, second] = ip.split('.').map((part) => Number(part));
  return (
    first === 10 ||
    first === 127 ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 168) ||
    (first === 169 && second === 254) ||
    first === 0 ||
    // Carrier-grade NAT (RFC 6598) — reachable on many networks and must be treated as private.
    (first === 100 && second >= 64 && second <= 127) ||
    // Note: 198.18.0.0/15 (RFC 2544 benchmark range) is intentionally excluded from private IPs
    // because TUN mode proxy clients (Clash, Surge, Mihomo, Sing-box) use it as the Fake-IP DNS pool.
    // Documentation ranges (RFC 5737) — not private per se, but not real upstreams.
    (first === 192 && second === 0 && Number(ip.split('.')[2]) === 2) ||
    (first === 203 && second === 0 && Number(ip.split('.')[2]) === 113)
  );
};

// Extract the embedded IPv4 from an IPv4-mapped IPv6 address like "::ffff:127.0.0.1".
const extractMappedIpv4 = (lower: string): string | null => {
  const match = lower.match(/::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})/);
  return match ? match[1] : null;
};

/**
 * True when the hostname must not be contacted by SSRF-sensitive proxies
 * (image proxy, MCP HTTP, etc.). Shared by the production API server and the
 * Vite dev plugin so both enforce the same rules.
 */
export const isPrivateNetworkHostname = (hostname: string): boolean => {
  const normalizedHostname = hostname.replace(/^\[|\]$/g, '');
  const ipVersion = net.isIP(normalizedHostname);

  if (ipVersion === 4) {
    return isPrivateIpv4(normalizedHostname);
  }

  if (ipVersion === 6) {
    const lower = normalizedHostname.toLowerCase();
    // IPv4-mapped IPv6 addresses bypass the IPv6 private checks below — normalize and re-check.
    const mappedIpv4 = extractMappedIpv4(lower);
    if (mappedIpv4 && net.isIP(mappedIpv4) === 4) {
      return isPrivateIpv4(mappedIpv4);
    }
    // IPv6 link-local is fe80::/10 (fe80 through febf). ULA is fc00::/7 (fc, fd).
    const firstBlock = parseInt(lower.split(':')[0], 16);
    const isLinkLocal = firstBlock >= 0xfe80 && firstBlock <= 0xfebf;
    return lower === '::1' || lower.startsWith('fc') || lower.startsWith('fd') || isLinkLocal;
  }

  return ['localhost', 'localhost.localdomain'].includes(normalizedHostname.toLowerCase());
};
