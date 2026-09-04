// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createHttpServerCleanup, startHttpServer } from '../test/httpServer';
import { createServer } from './createServer';
import type { ApiServerConfig } from './config';

const serverCleanup = createHttpServerCleanup();

beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => undefined);
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(async () => {
  await serverCleanup.cleanup();
  vi.restoreAllMocks();
});

const buildConfig = (overrides: Partial<ApiServerConfig> = {}): ApiServerConfig => ({
  port: 3001,
  geminiApiBase: 'https://generativelanguage.googleapis.com',
  geminiApiKey: undefined,
  allowedOrigins: [],
  enableMcpStdio: false,
  enableMcpPrivateHttp: false,
  enableLiveWsProxy: false,
  liveWsIdleTimeoutMs: 300_000,
  serverKeyPriority: false,
  thirdPartyRoutes: {},
  ...overrides,
});

interface FetchCall {
  url: string;
  init: RequestInit;
}

const fetchRecorder = (response: { status: number; body: string } = { status: 200, body: '{}' }) => {
  const calls: FetchCall[] = [];
  const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(input), init: init ?? {} });
    return new Response(response.body, {
      status: response.status,
      headers: { 'content-type': 'application/json' },
    });
  });
  return { fetchImpl, calls };
};

describe('third-party proxy routing + BYOK 兜底', () => {
  it('rejects an unknown provider with a 400', async () => {
    const app = createServer(buildConfig({ thirdPartyRoutes: {} }));
    const started = serverCleanup.track(await startHttpServer(app));

    // unknown provider, no browser key, no browser baseUrl -> 400 (pure BYOK
    // not satisfied either).
    const response = await fetch(`${started.baseUrl}/api/openai/chat/completions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-third-party-provider': 'unknown' },
      body: JSON.stringify({}),
    });

    expect(response.status).toBe(400);
  });

  it('routes to the configured provider and uses the server route key when no browser key is sent', async () => {
    const { fetchImpl, calls } = fetchRecorder();
    const app = createServer(
      buildConfig({
        thirdPartyRoutes: {
          deepseek: { baseUrl: 'https://api.deepseek.com', apiKey: 'server-route-key' },
        },
      }),
      { fetchImpl },
    );
    const started = serverCleanup.track(await startHttpServer(app));

    const response = await fetch(`${started.baseUrl}/api/openai/chat/completions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-third-party-provider': 'deepseek' },
      body: JSON.stringify({ model: 'deepseek-v4-flash' }),
    });

    expect(response.status).toBe(200);
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe('https://api.deepseek.com/chat/completions');
    const headers = new Headers(calls[0].init.headers as HeadersInit);
    expect(headers.get('authorization')).toBe('Bearer server-route-key');
    expect(headers.get('x-api-key')).toBe('server-route-key');
    expect(headers.get('x-third-party-provider')).toBe('deepseek');
  });

  it('lets a browser BYOK key win over the server route key', async () => {
    const { fetchImpl, calls } = fetchRecorder();
    const app = createServer(
      buildConfig({
        thirdPartyRoutes: {
          openai: { baseUrl: 'https://api.openai.com/v1', apiKey: 'server-route-key' },
        },
      }),
      { fetchImpl },
    );
    const started = serverCleanup.track(await startHttpServer(app));

    await fetch(`${started.baseUrl}/api/openai/chat/completions`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-third-party-provider': 'openai',
        authorization: 'Bearer browser-byok-key',
      },
      body: JSON.stringify({}),
    });

    const headers = new Headers(calls[0].init.headers as HeadersInit);
    expect(headers.get('authorization')).toBe('Bearer browser-byok-key');
    expect(headers.get('x-api-key')).toBe('browser-byok-key');
  });

  it('forwards to a browser-supplied baseUrl in pure-BYOK mode (no route table)', async () => {
    const { fetchImpl, calls } = fetchRecorder();
    const app = createServer(buildConfig({ thirdPartyRoutes: {} }), { fetchImpl });
    const started = serverCleanup.track(await startHttpServer(app));

    const response = await fetch(`${started.baseUrl}/api/openai/chat/completions`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-third-party-provider': 'kimi',
        authorization: 'Bearer browser-byok-key',
        'x-third-party-base-url': 'https://api.moonshot.ai/v1',
      },
      body: JSON.stringify({ model: 'kimi-k3' }),
    });

    expect(response.status).toBe(200);
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe('https://api.moonshot.ai/v1/chat/completions');
    const headers = new Headers(calls[0].init.headers as HeadersInit);
    expect(headers.get('authorization')).toBe('Bearer browser-byok-key');
    expect(headers.get('x-api-key')).toBe('browser-byok-key');
    expect(headers.get('x-third-party-base-url')).toBeNull();
  });

  it('rejects a private-network browser-supplied baseUrl in pure-BYOK mode', async () => {
    const app = createServer(buildConfig({ thirdPartyRoutes: {} }));
    const started = serverCleanup.track(await startHttpServer(app));

    const response = await fetch(`${started.baseUrl}/api/openai/chat/completions`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-third-party-provider': 'kimi',
        authorization: 'Bearer browser-byok-key',
        'x-third-party-base-url': 'http://127.0.0.1:4444',
      },
      body: JSON.stringify({}),
    });

    expect(response.status).toBe(400);
  });

  it('uses the browser x-api-key header when no Authorization Bearer is present', async () => {
    const { fetchImpl, calls } = fetchRecorder();
    const app = createServer(
      buildConfig({
        thirdPartyRoutes: {
          anthropic: { baseUrl: 'https://api.anthropic.com', apiKey: 'server-route-key' },
        },
      }),
      { fetchImpl },
    );
    const started = serverCleanup.track(await startHttpServer(app));

    await fetch(`${started.baseUrl}/api/openai/v1/messages`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-third-party-provider': 'anthropic',
        'x-api-key': 'browser-byok-key',
      },
      body: JSON.stringify({}),
    });

    const headers = new Headers(calls[0].init.headers as HeadersInit);
    expect(headers.get('authorization')).toBe('Bearer browser-byok-key');
    expect(headers.get('x-api-key')).toBe('browser-byok-key');
    expect(calls[0].url).toBe('https://api.anthropic.com/v1/messages');
  });

  it('rejects a private-network upstream host from the route table (SSRF guard)', async () => {
    const app = createServer(
      buildConfig({
        thirdPartyRoutes: {
          openai: { baseUrl: 'http://127.0.0.1:4444', apiKey: 'server-route-key' },
        },
      }),
    );
    const started = serverCleanup.track(await startHttpServer(app));

    const response = await fetch(`${started.baseUrl}/api/openai/chat/completions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-third-party-provider': 'openai' },
      body: JSON.stringify({}),
    });

    expect(response.status).toBe(400);
  });

  it('rejects a non-https upstream from the route table', async () => {
    const app = createServer(
      buildConfig({
        thirdPartyRoutes: {
          openai: { baseUrl: 'http://api.public.example.com/v1', apiKey: 'k' },
        },
      }),
    );
    const started = serverCleanup.track(await startHttpServer(app));

    const response = await fetch(`${started.baseUrl}/api/openai/chat/completions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-third-party-provider': 'openai' },
      body: JSON.stringify({}),
    });

    expect(response.status).toBe(400);
  });

  it('returns 500 when the provider has no key at all', async () => {
    const app = createServer(
      buildConfig({
        thirdPartyRoutes: {
          openai: { baseUrl: 'https://api.openai.com/v1' },
        },
      }),
    );
    const started = serverCleanup.track(await startHttpServer(app));

    const response = await fetch(`${started.baseUrl}/api/openai/chat/completions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-third-party-provider': 'openai' },
      body: JSON.stringify({}),
    });

    expect(response.status).toBe(500);
  });

  it('strips hop-by-hop and sensitive request headers before forwarding', async () => {
    const { fetchImpl, calls } = fetchRecorder();
    const app = createServer(
      buildConfig({
        thirdPartyRoutes: {
          openai: { baseUrl: 'https://api.openai.com/v1', apiKey: 'server-route-key' },
        },
      }),
      { fetchImpl },
    );
    const started = serverCleanup.track(await startHttpServer(app));

    await fetch(`${started.baseUrl}/api/openai/chat/completions`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-third-party-provider': 'openai',
        connection: 'keep-alive',
        cookie: 'session=abc',
        'accept-encoding': 'gzip',
        'x-client-header': 'present',
      },
      body: JSON.stringify({}),
    });

    const headers = new Headers(calls[0].init.headers as HeadersInit);
    expect(headers.get('cookie')).toBeNull();
    expect(headers.get('accept-encoding')).toBeNull();
    expect(headers.get('x-client-header')).toBe('present');
  });

  it('applies allowlisted extra headers from JSON and does not forward the envelope header', async () => {
    const { fetchImpl, calls } = fetchRecorder();
    const app = createServer(buildConfig({ thirdPartyRoutes: {} }), { fetchImpl });
    const started = serverCleanup.track(await startHttpServer(app));

    const response = await fetch(`${started.baseUrl}/api/openai/chat/completions`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-third-party-provider': 'openai',
        authorization: 'Bearer browser-byok-key',
        'x-third-party-base-url': 'https://openrouter.ai/api/v1',
        'x-third-party-extra-headers': JSON.stringify({
          'HTTP-Referer': 'https://example.com',
          'X-Title': 'AMC',
          Cookie: 'secret',
          'x-api-key': 'should-not-override',
        }),
      },
      body: JSON.stringify({}),
    });

    expect(response.status).toBe(200);
    const headers = new Headers(calls[0].init.headers as HeadersInit);
    expect(headers.get('http-referer')).toBe('https://example.com');
    expect(headers.get('x-title')).toBe('AMC');
    expect(headers.get('cookie')).toBeNull();
    expect(headers.get('x-third-party-extra-headers')).toBeNull();
    expect(headers.get('x-api-key')).toBe('browser-byok-key');
  });
});
