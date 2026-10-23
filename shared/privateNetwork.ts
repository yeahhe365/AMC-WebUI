import net from 'node:net';

const isPrivateIpv4 = (ip: string): boolean => {
  const [first, second, third, fourth] = ip.split('.').map(Number);
  return (
    first === 0 ||
    first === 10 ||
    first === 127 ||
    first >= 224 ||
    (first === 100 && second >= 64 && second <= 127) ||
    (first === 169 && second === 254) ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 168) ||
    (first === 192 && second === 0 && third === 0 && fourth !== 9 && fourth !== 10) ||
    (first === 192 && second === 0 && third === 2) ||
    (first === 192 && second === 88 && third === 99) ||
    (first === 198 && second === 51 && third === 100) ||
    (first === 203 && second === 0 && third === 113)
    // 198.18.0.0/15 intentionally remains allowed: supported TUN clients
    // (Clash, Surge, Mihomo, Sing-box) use it as their Fake-IP DNS pool.
  );
};

/** Expand a valid IPv6 literal after URL canonicalization, including mapped IPv4. */
function ipv6Words(address: string): number[] {
  const canonical = new URL(`http://[${address}]/`).hostname.slice(1, -1);
  const [left, right] = canonical.split('::');
  const head = left ? left.split(':') : [];
  const tail = right ? right.split(':') : [];
  const words =
    right === undefined ? head : [...head, ...Array<string>(8 - head.length - tail.length).fill('0'), ...tail];
  return words.map((word) => parseInt(word, 16));
}

/** Shared SSRF address policy. Non-global addresses are blocked, except the
 * documented IPv4 Fake-IP compatibility range above. */
export const isPrivateNetworkHostname = (hostname: string): boolean => {
  const normalized = hostname
    .replace(/^\[|\]$/g, '')
    .toLowerCase()
    .replace(/\.$/, '');
  const version = net.isIP(normalized);
  if (version === 4) return isPrivateIpv4(normalized);
  if (version === 6) {
    // Zone identifiers select local interfaces and are never public targets.
    if (normalized.includes('%')) return true;
    const words = ipv6Words(normalized);
    if (words.slice(0, 5).every((word) => word === 0) && words[5] === 0xffff) {
      return isPrivateIpv4(`${words[6] >>> 8}.${words[6] & 255}.${words[7] >>> 8}.${words[7] & 255}`);
    }
    // Global unicast is 2000::/3. Exclude special-use assignments and
    // transition ranges that can embed an otherwise forbidden IPv4 target.
    return (
      (words[0] & 0xe000) !== 0x2000 ||
      (words[0] === 0x2001 && words[1] < 0x0200) ||
      (words[0] === 0x2001 && words[1] === 0x0db8) ||
      words[0] === 0x2002 ||
      (words[0] === 0x3fff && words[1] < 0x1000)
    );
  }
  return normalized === 'localhost' || normalized.endsWith('.localhost') || normalized === 'localhost.localdomain';
};
