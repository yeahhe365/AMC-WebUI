// @vitest-environment node
import dns from 'node:dns';
import { createServer } from 'node:http';
import { describe, expect, it, vi } from 'vitest';
import { startHttpServer } from '../../test/httpServer';
import { createSafeMcpFetch } from './mcpHttpSecurity';
import { getNetworkTargetError } from '../../../shared/connectionSafeFetch';
import type { NetworkDnsLookup } from '../../../shared/connectionSafeFetch';

const dnsLookup = vi.hoisted(() => vi.fn<NetworkDnsLookup>());
vi.mock('node:dns/promises', () => ({ default: { lookup: dnsLookup }, lookup: dnsLookup }));

describe('MCP connection DNS policy', () => {
  it('never reaches the listener when the DNS answer changes after preflight', async () => {
    let requests = 0;
    const listener = createServer((_request, response) => {
      requests += 1;
      response.end('private');
    });
    const started = await startHttpServer(listener);
    dnsLookup
      .mockResolvedValueOnce([{ address: '8.8.8.8', family: 4 }])
      .mockResolvedValue([{ address: '127.0.0.1', family: 4 }]);
    vi.spyOn(dns, 'lookup').mockImplementation((...args: unknown[]) => {
      const callback = args.at(-1) as (error: null, address: unknown, family?: number) => void;
      const options = args[1] as { all?: boolean };
      callback(null, options?.all ? [{ address: '127.0.0.1', family: 4 }] : '127.0.0.1', 4);
    });
    try {
      const error = await createSafeMcpFetch(false)(started.baseUrl.replace('127.0.0.1', 'rebound.example')).catch(
        (failure: unknown) => failure,
      );
      expect(requests).toBe(0);
      expect(getNetworkTargetError(error)?.message).toMatch(/private address 127.0.0.1/);
    } finally {
      vi.restoreAllMocks();
      listener.closeAllConnections();
      await started.close();
    }
  });
});
