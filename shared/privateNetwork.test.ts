// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { isPrivateNetworkHostname } from './privateNetwork.js';

describe('isPrivateNetworkHostname', () => {
  it('blocks IPv4 private and link-local ranges', () => {
    expect(isPrivateNetworkHostname('127.0.0.1')).toBe(true);
    expect(isPrivateNetworkHostname('10.0.0.1')).toBe(true);
    expect(isPrivateNetworkHostname('169.254.169.254')).toBe(true);
    expect(isPrivateNetworkHostname('192.168.1.1')).toBe(true);
    expect(isPrivateNetworkHostname('172.16.0.1')).toBe(true);
    expect(isPrivateNetworkHostname('0.0.0.0')).toBe(true);
  });

  it('allows public IPv4 addresses', () => {
    expect(isPrivateNetworkHostname('8.8.8.8')).toBe(false);
    expect(isPrivateNetworkHostname('1.1.1.1')).toBe(false);
  });

  it('blocks CGNAT, benchmark, and documentation IPv4 ranges', () => {
    // Carrier-grade NAT 100.64.0.0/10
    expect(isPrivateNetworkHostname('100.64.0.1')).toBe(true);
    expect(isPrivateNetworkHostname('100.127.255.254')).toBe(true);
    expect(isPrivateNetworkHostname('100.63.0.1')).toBe(false);
    expect(isPrivateNetworkHostname('100.128.0.1')).toBe(false);
    // Benchmarking 198.18.0.0/15 is allowed for TUN / Fake-IP compatibility
    expect(isPrivateNetworkHostname('198.18.0.1')).toBe(false);
    expect(isPrivateNetworkHostname('198.19.255.254')).toBe(false);
    expect(isPrivateNetworkHostname('198.17.0.1')).toBe(false);
    expect(isPrivateNetworkHostname('198.20.0.1')).toBe(false);
    // Documentation ranges (RFC 5737)
    expect(isPrivateNetworkHostname('192.0.2.1')).toBe(true);
    expect(isPrivateNetworkHostname('203.0.113.1')).toBe(true);
  });

  it('blocks IPv6 loopback, ULA, and full link-local range', () => {
    expect(isPrivateNetworkHostname('::1')).toBe(true);
    expect(isPrivateNetworkHostname('fc00::1')).toBe(true);
    expect(isPrivateNetworkHostname('fd12:3456::1')).toBe(true);
    expect(isPrivateNetworkHostname('fe80::1')).toBe(true);
    // fe80::/10 covers fe80 through febf, not just the fe80: prefix.
    expect(isPrivateNetworkHostname('fe90::1')).toBe(true);
    expect(isPrivateNetworkHostname('febf::1')).toBe(true);
    expect(isPrivateNetworkHostname('fec0::1')).toBe(false);
  });

  it('blocks IPv4-mapped IPv6 addresses (the rebinding bypass)', () => {
    expect(isPrivateNetworkHostname('::ffff:127.0.0.1')).toBe(true);
    expect(isPrivateNetworkHostname('::ffff:169.254.169.254')).toBe(true);
    expect(isPrivateNetworkHostname('::ffff:10.0.0.1')).toBe(true);
    expect(isPrivateNetworkHostname('::ffff:192.168.0.1')).toBe(true);
    // bracketed form as produced by URL.hostname for IPv6 literals
    expect(isPrivateNetworkHostname('[::ffff:169.254.169.254]')).toBe(true);
  });

  it('allows public IPv4-mapped IPv6 addresses', () => {
    expect(isPrivateNetworkHostname('::ffff:8.8.8.8')).toBe(false);
  });

  it('blocks localhost hostnames', () => {
    expect(isPrivateNetworkHostname('localhost')).toBe(true);
    expect(isPrivateNetworkHostname('localhost.localdomain')).toBe(true);
  });
});
