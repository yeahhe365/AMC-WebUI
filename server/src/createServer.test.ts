// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createServer, readMacOsClipboardPng } from './createServer';
import { createHttpServerCleanup, startHttpServer } from '../test/httpServer';
import http from 'node:http';
import { Buffer } from 'node:buffer';

// Image proxy resolves hostnames before fetch (DNS rebinding guard). Keep suites offline.
const dnsLookup = vi.hoisted(() => vi.fn(async () => [{ address: '1.2.3.4', family: 4 as const }]));

vi.mock('node:dns/promises', () => ({
  default: {
    lookup: dnsLookup,
  },
  lookup: dnsLookup,
}));

const serverCleanup = createHttpServerCleanup();

afterEach(async () => {
  await serverCleanup.cleanup();
  dnsLookup.mockReset();
  dnsLookup.mockResolvedValue([{ address: '1.2.3.4', family: 4 }]);
});

describe('createServer', () => {
  it('returns health details from GET /health', async () => {
    const app = createServer({
      geminiApiBase: 'https://generativelanguage.googleapis.com',
      geminiApiKey: 'server-key',
    });
    const started = serverCleanup.track(await startHttpServer(app));

    const response = await fetch(`${started.baseUrl}/health`);
    const body = (await response.json()) as Record<string, unknown>;

    expect(response.status).toBe(200);
    expect(body.status).toBe('ok');
    expect(body.capabilities).toEqual({
      liveWsProxy: expect.any(Boolean),
      thirdPartyProxy: expect.any(Boolean),
      mcpStdio: false,
      mcpPrivateHttp: false,
    });
    expect(typeof body.timestamp).toBe('string');
  });

  it('logs the error before returning 500 when a handler throws unexpectedly', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const app = createServer(
      {
        geminiApiBase: 'https://generativelanguage.googleapis.com',
        geminiApiKey: 'server-key',
      },
      {
        readLocalClipboardImage: async () => {
          throw new Error('clipboard reader exploded');
        },
      },
    );
    const started = serverCleanup.track(await startHttpServer(app));

    const response = await fetch(`${started.baseUrl}/api/local-clipboard-image`);
    const body = (await response.json()) as Record<string, unknown>;

    expect(response.status).toBe(500);
    expect(body).toEqual({ error: 'Internal server error' });
    expect(errorSpy).toHaveBeenCalled();
    const logged = errorSpy.mock.calls.map((call) => call.join(' ')).join('\n');
    expect(logged).toContain('clipboard reader exploded');
    errorSpy.mockRestore();
  });

  it('does not expose a Live API token endpoint', async () => {
    const app = createServer({
      geminiApiBase: 'https://generativelanguage.googleapis.com',
      geminiApiKey: 'server-key',
    });
    const started = serverCleanup.track(await startHttpServer(app));

    const response = await fetch(`${started.baseUrl}/api/live-token`, { method: 'POST' });
    const body = (await response.json()) as Record<string, unknown>;

    expect(response.status).toBe(404);
    expect(body).toEqual({ error: 'Not found' });
  });

  it('proxies /api/gemini/* preserving method/path/query/body and streaming response', async () => {
    const upstreamRequests: Array<{
      method: string;
      url: string;
      body: string;
      headers: http.IncomingHttpHeaders;
    }> = [];

    const upstream = http.createServer((request, response) => {
      const bodyChunks: Buffer[] = [];
      request.on('data', (chunk) => bodyChunks.push(Buffer.from(chunk)));
      request.on('end', () => {
        upstreamRequests.push({
          method: request.method ?? '',
          url: request.url ?? '',
          body: Buffer.concat(bodyChunks).toString('utf8'),
          headers: request.headers,
        });

        response.writeHead(201, {
          'content-type': 'text/event-stream',
          'x-upstream': 'yes',
        });
        response.write('chunk-1\n');
        setTimeout(() => {
          response.write('chunk-2\n');
          response.end();
        }, 25);
      });
    });

    const upstreamStarted = serverCleanup.track(await startHttpServer(upstream));

    const app = createServer({
      geminiApiBase: upstreamStarted.baseUrl,
      geminiApiKey: 'server-key',
    });
    const appStarted = serverCleanup.track(await startHttpServer(app));

    const proxyResponse = await fetch(
      `${appStarted.baseUrl}/api/gemini/v1beta/models/gemini-2.5-flash:streamGenerateContent?alt=sse`,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-client-header': 'present',
        },
        body: JSON.stringify({ prompt: 'hello' }),
      },
    );

    const proxyBody = await proxyResponse.text();

    expect(proxyResponse.status).toBe(201);
    expect(proxyResponse.headers.get('content-type')).toContain('text/event-stream');
    expect(proxyResponse.headers.get('x-upstream')).toBe('yes');
    expect(proxyBody).toContain('chunk-1');
    expect(proxyBody).toContain('chunk-2');

    expect(upstreamRequests).toHaveLength(1);
    expect(upstreamRequests[0].method).toBe('POST');
    expect(upstreamRequests[0].url).toBe('/v1beta/models/gemini-2.5-flash:streamGenerateContent?alt=sse');
    expect(upstreamRequests[0].body).toBe(JSON.stringify({ prompt: 'hello' }));
    expect(upstreamRequests[0].headers['x-goog-api-key']).toBe('server-key');
    expect(upstreamRequests[0].headers['x-client-header']).toBe('present');
  });

  it('filters hop-by-hop and sensitive request headers before proxying', async () => {
    const fetchImpl = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => {
      return new Response('proxied', { status: 202 });
    });
    const app = createServer(
      {
        geminiApiBase: 'https://example.test',
        geminiApiKey: 'server-key',
      },
      { fetchImpl },
    );
    const started = serverCleanup.track(await startHttpServer(app));

    const response = await new Promise<{ statusCode: number }>((resolve, reject) => {
      const request = http.request(`${started.baseUrl}/api/gemini/v1beta/models`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          connection: 'keep-alive',
          te: 'trailers',
          authorization: 'Bearer user-token',
          cookie: 'session=abc',
          'accept-encoding': 'gzip',
          'x-client-header': 'present',
        },
      });

      request.on('response', (proxyResponse) => {
        proxyResponse.resume();
        proxyResponse.on('end', () => {
          resolve({ statusCode: proxyResponse.statusCode ?? 0 });
        });
      });
      request.on('error', reject);
      request.end(JSON.stringify({ prompt: 'hello' }));
    });

    expect(response.statusCode).toBe(202);
    expect(fetchImpl).toHaveBeenCalledTimes(1);

    const firstCall = fetchImpl.mock.calls[0];
    expect(firstCall).toBeDefined();
    if (!firstCall) {
      throw new Error('Expected fetchImpl to be called once');
    }

    const init = firstCall[1];
    expect(init).toBeDefined();
    if (!init) {
      throw new Error('Expected fetchImpl to receive RequestInit');
    }

    const headers = init.headers;
    expect(headers).toBeInstanceOf(Headers);
    if (!(headers instanceof Headers)) {
      throw new Error('Expected proxy request headers to be a Headers instance');
    }

    expect(headers.get('content-type')).toBe('application/json');
    expect(headers.get('x-client-header')).toBe('present');
    expect(headers.get('x-goog-api-key')).toBe('server-key');
    expect(headers.get('connection')).toBeNull();
    expect(headers.get('te')).toBeNull();
    expect(headers.get('authorization')).toBeNull();
    expect(headers.get('cookie')).toBeNull();
    expect(headers.get('accept-encoding')).toBeNull();
  });

  it('uses the browser-provided Gemini API key for proxy requests when no server key is configured', async () => {
    const fetchImpl = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => {
      return new Response('proxied', { status: 202 });
    });
    const app = createServer(
      {
        geminiApiBase: 'https://example.test',
        geminiApiKey: '',
      },
      { fetchImpl },
    );
    const started = serverCleanup.track(await startHttpServer(app));

    const response = await fetch(`${started.baseUrl}/api/gemini/v1beta/models`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-goog-api-key': 'browser-key',
      },
      body: JSON.stringify({ prompt: 'hello' }),
    });

    expect(response.status).toBe(202);
    expect(fetchImpl).toHaveBeenCalledTimes(1);

    const init = fetchImpl.mock.calls[0][1];
    if (!init?.headers || !(init.headers instanceof Headers)) {
      throw new Error('Expected proxy request headers to be a Headers instance');
    }

    expect(init.headers.get('x-goog-api-key')).toBe('browser-key');
  });

  it('returns a 502 JSON error when Gemini upstream fetch fails', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error('network down');
    });
    const app = createServer(
      {
        geminiApiBase: 'https://example.test',
        geminiApiKey: 'server-key',
      },
      { fetchImpl },
    );
    const started = serverCleanup.track(await startHttpServer(app));

    const response = await fetch(`${started.baseUrl}/api/gemini/v1beta/models`);
    const body = (await response.json()) as Record<string, unknown>;

    expect(response.status).toBe(502);
    expect(body).toEqual({
      error: 'Gemini upstream request failed.',
    });
  });

  it('proxies external images through GET /api/image-proxy for PDF export', async () => {
    const app = createServer(
      {
        geminiApiBase: 'https://example.test',
        geminiApiKey: 'server-key',
      },
      {
        fetchImpl: vi.fn(async () => {
          return new Response(new Uint8Array([137, 80, 78, 71]), {
            status: 200,
            headers: {
              'content-type': 'image/png',
            },
          });
        }),
      },
    );
    const started = serverCleanup.track(await startHttpServer(app));

    const response = await fetch(
      `${started.baseUrl}/api/image-proxy?url=${encodeURIComponent('https://cdn.example.com/diagram.png')}`,
    );
    const bytes = new Uint8Array(await response.arrayBuffer());

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('image/png');
    expect(response.headers.get('cache-control')).toContain('max-age');
    expect(Array.from(bytes)).toEqual([137, 80, 78, 71]);
  });

  it('rejects non-image image proxy responses', async () => {
    const app = createServer(
      {
        geminiApiBase: 'https://example.test',
        geminiApiKey: 'server-key',
      },
      {
        fetchImpl: vi.fn(async () => {
          return new Response('not an image', {
            status: 200,
            headers: {
              'content-type': 'text/html',
            },
          });
        }),
      },
    );
    const started = serverCleanup.track(await startHttpServer(app));

    const response = await fetch(
      `${started.baseUrl}/api/image-proxy?url=${encodeURIComponent('https://cdn.example.com/not-image')}`,
    );
    const body = (await response.json()) as Record<string, unknown>;

    expect(response.status).toBe(415);
    expect(body).toEqual({ error: 'Image proxy target did not return an image.' });
  });

  it('rejects private network image proxy targets', async () => {
    const fetchImpl = vi.fn();
    const app = createServer(
      {
        geminiApiBase: 'https://example.test',
        geminiApiKey: 'server-key',
      },
      { fetchImpl },
    );
    const started = serverCleanup.track(await startHttpServer(app));

    const response = await fetch(
      `${started.baseUrl}/api/image-proxy?url=${encodeURIComponent('http://127.0.0.1/private.png')}`,
    );
    const body = (await response.json()) as Record<string, unknown>;

    expect(response.status).toBe(400);
    expect(body).toEqual({ error: 'Image proxy URL is not allowed.' });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('follows a safe image-redirect chain to the final image', async () => {
    const calls: string[] = [];
    const fetchImpl = vi.fn(async (input: URL | RequestInfo) => {
      const url = String(input);
      calls.push(url);
      if (url.startsWith('https://cdn.example.com/signed')) {
        return new Response(null, {
          status: 302,
          headers: { location: 'https://cdn.example.com/final/diagram.png' },
        });
      }
      return new Response(new Uint8Array([137, 80, 78, 71]), {
        status: 200,
        headers: { 'content-type': 'image/png' },
      });
    });
    const app = createServer({ geminiApiBase: 'https://example.test', geminiApiKey: 'server-key' }, { fetchImpl });
    const started = serverCleanup.track(await startHttpServer(app));

    const response = await fetch(
      `${started.baseUrl}/api/image-proxy?url=${encodeURIComponent('https://cdn.example.com/signed')}`,
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('image/png');
    expect(calls).toContain('https://cdn.example.com/final/diagram.png');
  });

  it('rejects a redirect to a private network host', async () => {
    const fetchImpl = vi.fn(async () => {
      return new Response(null, {
        status: 302,
        headers: { location: 'http://127.0.0.1/private.png' },
      });
    });
    const app = createServer({ geminiApiBase: 'https://example.test', geminiApiKey: 'server-key' }, { fetchImpl });
    const started = serverCleanup.track(await startHttpServer(app));

    const response = await fetch(
      `${started.baseUrl}/api/image-proxy?url=${encodeURIComponent('https://cdn.example.com/redirect')}`,
    );
    const body = (await response.json()) as Record<string, unknown>;

    expect(response.status).toBe(400);
    expect(body).toEqual({ error: 'Image proxy target attempted an unsafe redirect.' });
  });

  it('rejects image-proxy hosts that resolve to private addresses (DNS rebinding)', async () => {
    dnsLookup.mockResolvedValue([{ address: '127.0.0.1', family: 4 }]);
    const fetchImpl = vi.fn();
    const app = createServer({ geminiApiBase: 'https://example.test', geminiApiKey: 'server-key' }, { fetchImpl });
    const started = serverCleanup.track(await startHttpServer(app));

    const response = await fetch(
      `${started.baseUrl}/api/image-proxy?url=${encodeURIComponent('https://evil.example.com/img.png')}`,
    );
    const body = (await response.json()) as Record<string, unknown>;

    expect(response.status).toBe(400);
    expect(body).toEqual({
      error: 'Image proxy host "evil.example.com" resolves to private address 127.0.0.1.',
    });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(dnsLookup).toHaveBeenCalledWith('evil.example.com', { all: true, verbatim: true });
  });

  it('returns the local clipboard image when available', async () => {
    const readLocalClipboardImage = vi.fn(async () => ({
      data: Buffer.from([137, 80, 78, 71]),
      mimeType: 'image/png',
      fileName: 'clipboard-image.png',
    }));
    const app = createServer(
      {
        geminiApiBase: 'https://example.test',
        geminiApiKey: 'server-key',
      },
      { readLocalClipboardImage },
    );
    const started = serverCleanup.track(await startHttpServer(app));

    const response = await fetch(`${started.baseUrl}/api/local-clipboard-image`);
    const bytes = new Uint8Array(await response.arrayBuffer());

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('image/png');
    expect(response.headers.get('x-clipboard-file-name')).toBe('clipboard-image.png');
    expect(Array.from(bytes)).toEqual([137, 80, 78, 71]);
  });

  it('returns 404 when no local clipboard image is available', async () => {
    const readLocalClipboardImage = vi.fn(async () => null);
    const app = createServer(
      {
        geminiApiBase: 'https://example.test',
        geminiApiKey: 'server-key',
      },
      { readLocalClipboardImage },
    );
    const started = serverCleanup.track(await startHttpServer(app));

    const response = await fetch(`${started.baseUrl}/api/local-clipboard-image`);
    const body = (await response.json()) as Record<string, unknown>;

    expect(response.status).toBe(404);
    expect(body).toEqual({ error: 'No local clipboard image is available.' });
  });

  it('reads macOS clipboard PNG data from the JXA public.png pasteboard type', async () => {
    const pngBytes = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3]);
    const execFileImpl = vi.fn(async () => ({
      stdout: `${pngBytes.toString('base64')}\n`,
      stderr: '',
    }));

    const image = await readMacOsClipboardPng(execFileImpl, 'darwin');

    expect(execFileImpl).toHaveBeenCalledWith(
      'osascript',
      ['-l', 'JavaScript', '-e', expect.stringContaining("dataForType($('public.png'))")],
      expect.objectContaining({
        encoding: 'utf8',
      }),
    );
    expect(image).not.toBeNull();
    expect(image?.mimeType).toBe('image/png');
    expect(image?.fileName).toBe('clipboard-image.png');
    expect(image?.data.equals(pngBytes)).toBe(true);
  });
});
