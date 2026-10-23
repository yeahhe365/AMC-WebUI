// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { assertMcpHttpUrlAllowed, createSafeMcpFetch } from './mcpHttpSecurity';

const dnsLookup = vi.hoisted(() => vi.fn());

vi.mock('node:dns/promises', () => ({
  default: {
    lookup: dnsLookup,
  },
  lookup: dnsLookup,
}));

describe('assertMcpHttpUrlAllowed', () => {
  afterEach(() => {
    dnsLookup.mockReset();
  });

  it('rejects private IP literals when private HTTP is disabled', async () => {
    await expect(assertMcpHttpUrlAllowed('http://127.0.0.1:3333/mcp', false)).rejects.toThrow(
      /Private MCP HTTP server URLs are disabled/,
    );
    expect(dnsLookup).not.toHaveBeenCalled();
  });

  it('allows private IP literals when private HTTP is enabled', async () => {
    await expect(assertMcpHttpUrlAllowed('http://127.0.0.1:3333/mcp', true)).resolves.toBeUndefined();
    expect(dnsLookup).not.toHaveBeenCalled();
  });

  it('rejects hostnames that resolve to private addresses (DNS rebinding)', async () => {
    dnsLookup.mockResolvedValue([{ address: '127.0.0.1', family: 4 }]);

    await expect(assertMcpHttpUrlAllowed('https://evil.example.com/mcp', false)).rejects.toThrow(
      /resolves to private address 127\.0\.0\.1/,
    );
    expect(dnsLookup).toHaveBeenCalledWith('evil.example.com', { all: true, verbatim: true });
  });

  it('allows hostnames that resolve only to public addresses', async () => {
    dnsLookup.mockResolvedValue([{ address: '8.8.8.8', family: 4 }]);

    await expect(assertMcpHttpUrlAllowed('https://mcp.example.com/mcp', false)).resolves.toBeUndefined();
  });
});

describe('createSafeMcpFetch', () => {
  it.each(['https://other.example.com/mcp', 'http://public.example.com/mcp'])(
    'rejects credential-bearing redirect to %s before making the next request',
    async (location) => {
      dnsLookup.mockResolvedValue([{ address: '1.2.3.4', family: 4 }]);
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce(new Response(null, { status: 307, headers: { location } }))
        .mockResolvedValueOnce(new Response('leaked'));
      const safeFetch = createSafeMcpFetch(false, fetchMock);
      await expect(
        safeFetch('https://public.example.com/mcp', {
          method: 'POST',
          headers: { authorization: 'Bearer fake-secret' },
          body: 'private payload',
        }),
      ).rejects.toThrow(/redirect/i);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    },
  );
  afterEach(() => {
    dnsLookup.mockReset();
  });

  it('blocks redirects that land on private addresses', async () => {
    dnsLookup.mockImplementation(async (hostname: string) => {
      if (hostname === 'public.example.com') {
        return [{ address: '1.2.3.4', family: 4 }];
      }
      throw new Error(`unexpected lookup ${hostname}`);
    });

    const baseFetch: typeof fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === 'https://public.example.com/mcp') {
        return new Response(null, {
          status: 302,
          headers: { location: 'http://127.0.0.1:9/secret' },
        });
      }
      throw new Error(`unexpected fetch ${url}`);
    });

    const safeFetch = createSafeMcpFetch(false, baseFetch);

    await expect(safeFetch('https://public.example.com/mcp')).rejects.toThrow(
      /Private MCP HTTP server URLs are disabled|resolves to private|redirect/,
    );
  });

  it('follows safe redirects and returns the final response', async () => {
    dnsLookup.mockResolvedValue([{ address: '1.2.3.4', family: 4 }]);

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(null, {
          status: 302,
          headers: { location: '/canonical/mcp' },
        }),
      )
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    const baseFetch = fetchMock as unknown as typeof fetch;

    const safeFetch = createSafeMcpFetch(false, baseFetch);
    const response = await safeFetch('https://public.example.com/mcp');

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[1][0])).toBe('https://public.example.com/canonical/mcp');
  });
});
