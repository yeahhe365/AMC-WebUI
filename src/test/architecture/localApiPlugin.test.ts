// @vitest-environment node
import type { Buffer } from 'node:buffer';
import { Readable } from 'node:stream';
import { EventEmitter } from 'node:events';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createLocalApiPlugin } from '../../../vite/localApiPlugin';

// Image proxy resolves hostnames before fetch (DNS rebinding guard). Keep suites offline.
const dnsLookup = vi.hoisted(() => vi.fn(async () => [{ address: '1.2.3.4', family: 4 as const }]));

vi.mock('node:dns/promises', () => ({
  default: {
    lookup: dnsLookup,
  },
  lookup: dnsLookup,
}));

type Middleware = (
  request: { method?: string; url?: string; headers?: Record<string, string> } & Partial<
    AsyncIterable<Buffer | string | Uint8Array>
  >,
  response: {
    writeHead: (status: number, headers: Record<string, string>) => void;
    end: (body?: string | Uint8Array) => void;
  },
  next: () => void,
) => void;

const getRegisteredMiddleware = (): Middleware => {
  let middleware: Middleware | null = null;
  const plugin = createLocalApiPlugin() as {
    configureServer?: (server: { middlewares: { use: (handler: Middleware) => void } }) => void;
  };

  plugin.configureServer?.({
    middlewares: {
      use: (handler: Middleware) => {
        middleware = handler;
      },
    },
  } as never);

  if (!middleware) {
    throw new Error('Expected local API middleware to be registered.');
  }

  const registered = middleware as Middleware;
  return (request, response, next) =>
    registered(
      request instanceof Readable ? request : Object.assign(new EventEmitter(), { headers: {} }, request),
      Object.assign(new EventEmitter(), response, { destroyed: false, headersSent: false }),
      next,
    );
};

const waitForAsyncMiddleware = async () => {
  await Promise.resolve();
  await Promise.resolve();
  await new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
};

describe('createLocalApiPlugin', () => {
  const originalFetch = globalThis.fetch;
  const originalMcpApiBaseUrl = process.env.MCP_API_BASE_URL;

  afterEach(() => {
    vi.unstubAllEnvs();
    globalThis.fetch = originalFetch;
    dnsLookup.mockReset();
    dnsLookup.mockResolvedValue([{ address: '1.2.3.4', family: 4 }]);
    if (originalMcpApiBaseUrl === undefined) {
      delete process.env.MCP_API_BASE_URL;
    } else {
      process.env.MCP_API_BASE_URL = originalMcpApiBaseUrl;
    }
  });

  it('uses production Live token key priority, target and normalized constraints', async () => {
    vi.stubEnv('GEMINI_API_KEY', 'regular-server-key');
    vi.stubEnv('LIVE_GEMINI_API_KEY', 'dedicated-live-key');
    vi.stubEnv('SERVER_KEY_PRIORITY', 'true');
    vi.stubEnv('GEMINI_API_BASE', 'https://configured.example');
    let outgoing: { url: string; key: string | null; body: Record<string, unknown> } | undefined;
    globalThis.fetch = vi.fn(async (input, init) => {
      outgoing = {
        url: String(input),
        key: new Headers(init?.headers).get('x-goog-api-key'),
        body: JSON.parse(String(init?.body)),
      };
      return new Response(JSON.stringify({ name: 'authTokens/test-token' }));
    });
    const middleware = getRegisteredMiddleware();
    const request = Object.assign(
      Readable.from([JSON.stringify({ model: 'gemini-live', config: { temperature: 0.5 } })]),
      {
        method: 'POST',
        url: '/api/live/ephemeral-token',
        headers: { 'x-goog-api-key': 'browser-key' },
      },
    );
    const finished = Promise.withResolvers<string | Uint8Array | undefined>();
    middleware(request, { writeHead: () => undefined, end: finished.resolve }, () => {
      throw new Error('token request was not handled');
    });
    const body = await finished.promise;
    expect(outgoing).toMatchObject({
      url: 'https://configured.example/v1beta/auth_tokens',
      key: 'dedicated-live-key',
      body: {
        uses: 1,
        bidiGenerateContentSetup: { model: 'models/gemini-live', generationConfig: { temperature: 0.5 } },
      },
    });
    expect(typeof outgoing?.body.expireTime).toBe('string');
    expect(JSON.parse(String(body)).token).toBe('test-token');
  });

  it('proxies local MCP API requests to the configured API server', async () => {
    process.env.MCP_API_BASE_URL = 'http://127.0.0.1:3999';
    const fetchMock = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) =>
        new Response(JSON.stringify({ ok: true }), {
          status: 202,
          headers: {
            'content-type': 'application/json; charset=utf-8',
          },
        }),
    );
    globalThis.fetch = fetchMock as typeof fetch;
    const middleware = getRegisteredMiddleware();
    const response = {
      writeHead: vi.fn((_status: number, _headers: Record<string, string>) => undefined),
      end: vi.fn((_body?: string | Uint8Array) => undefined),
    };
    const next = vi.fn();
    const requestBody = JSON.stringify({ servers: [] });

    middleware(
      {
        method: 'POST',
        url: '/api/mcp/tools',
        headers: {
          'content-type': 'application/json',
        },
        async *[Symbol.asyncIterator]() {
          yield requestBody;
        },
      },
      response,
      next,
    );
    await waitForAsyncMiddleware();

    expect(next).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0] as [RequestInfo | URL, RequestInit | undefined];
    expect(url).toBe('http://127.0.0.1:3999/api/mcp/tools');
    expect(init).toMatchObject({ method: 'POST' });
    expect(init?.headers).toBeInstanceOf(Headers);
    expect((init?.headers as Headers).get('content-type')).toBe('application/json');
    expect(await (init?.body as Blob).text()).toBe(requestBody);
    expect(response.writeHead).toHaveBeenCalledWith(
      202,
      expect.objectContaining({
        'content-type': 'application/json; charset=utf-8',
      }),
    );
    const [body] = response.end.mock.calls[0] as [string | Uint8Array | undefined];
    expect(new TextDecoder().decode(body as Uint8Array)).toContain('"ok":true');
  });

  it('rejects oversized MCP bodies instead of forwarding an empty replacement', async () => {
    const upstream = vi.fn(async () => new Response('{"ok":true}'));
    globalThis.fetch = upstream;
    const finished = Promise.withResolvers<string | Uint8Array | undefined>();
    let status = 0;
    getRegisteredMiddleware()(
      {
        method: 'POST',
        url: '/api/mcp/tools',
        headers: {},
        async *[Symbol.asyncIterator]() {
          yield 'x'.repeat(1024 * 1024 + 1);
        },
      },
      {
        writeHead: (code) => {
          status = code;
        },
        end: finished.resolve,
      },
      () => undefined,
    );
    await finished.promise;
    expect(status).toBe(413);
    expect(upstream).not.toHaveBeenCalled();
  });

  it('rejects image-proxy redirects that land on a private address', async () => {
    const finished = Promise.withResolvers<void>();
    const fetchMock = vi.fn(
      async () =>
        new Response(null, {
          status: 302,
          headers: { location: 'http://169.254.169.254/latest/meta-data' },
        }),
    );
    globalThis.fetch = fetchMock as typeof fetch;
    const middleware = getRegisteredMiddleware();
    const response = {
      writeHead: vi.fn((_status: number, _headers: Record<string, string>) => undefined),
      end: vi.fn((_body?: string | Uint8Array) => finished.resolve()),
    };
    const next = vi.fn();

    middleware(
      {
        method: 'GET',
        url: `/api/image-proxy?url=${encodeURIComponent('https://cdn.example.com/redirect')}`,
      },
      response,
      next,
    );
    await finished.promise;

    expect(next).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledOnce();
    const firstCall = fetchMock.mock.calls[0] as unknown as [RequestInfo | URL, RequestInit | undefined] | undefined;
    expect(firstCall?.[1]).toMatchObject({ redirect: 'manual' });
    expect(response.writeHead).toHaveBeenCalledWith(
      400,
      expect.objectContaining({ 'content-type': 'application/json; charset=utf-8' }),
    );
    expect(response.end).toHaveBeenCalledWith(
      JSON.stringify({ error: 'Image proxy target attempted an unsafe redirect.' }),
    );
  });

  it('follows a safe image-proxy redirect with redirect: manual', async () => {
    const finished = Promise.withResolvers<void>();
    const pngBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(null, {
          status: 302,
          headers: { location: 'https://cdn.example.com/final.png' },
        }),
      )
      .mockResolvedValueOnce(
        new Response(pngBytes, {
          status: 200,
          headers: { 'content-type': 'image/png' },
        }),
      );
    globalThis.fetch = fetchMock as typeof fetch;
    const middleware = getRegisteredMiddleware();
    const response = {
      writeHead: vi.fn((_status: number, _headers: Record<string, string>) => undefined),
      end: vi.fn((_body?: string | Uint8Array) => finished.resolve()),
    };
    const next = vi.fn();

    middleware(
      {
        method: 'GET',
        url: `/api/image-proxy?url=${encodeURIComponent('https://cdn.example.com/signed')}`,
      },
      response,
      next,
    );
    await finished.promise;

    expect(next).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(response.writeHead).toHaveBeenCalledWith(
      200,
      expect.objectContaining({
        'content-type': 'image/png',
        'x-content-type-options': 'nosniff',
      }),
    );
  });
});
