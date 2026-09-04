// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WebSocket, WebSocketServer } from 'ws';
import http from 'node:http';
import { createHttpServerCleanup, startHttpServer } from '../test/httpServer';
import { createServer } from './createServer';
import { attachLiveWsUpgrade, resolveUpstream } from './liveWsProxy';
import type { ApiServerConfig } from './config';

const serverCleanup = createHttpServerCleanup();

beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => undefined);
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(async () => {
  // Some WebSocket upgrades keep an HTTP server's close() waiting indefinitely
  // (a peer still CONNECTING won't release its handle). Bound the cleanup so a
  // leaked socket can't hang the suite; force-close any stragglers.
  await Promise.race([serverCleanup.cleanup(), new Promise((resolve) => setTimeout(resolve, 5000))]);
  vi.restoreAllMocks();
});

const buildConfig = (overrides: Partial<ApiServerConfig> = {}): ApiServerConfig => ({
  port: 3001,
  geminiApiBase: 'https://generativelanguage.googleapis.com',
  geminiApiKey: undefined,
  allowedOrigins: [],
  enableMcpStdio: false,
  enableMcpPrivateHttp: false,
  enableLiveWsProxy: true,
  liveWsIdleTimeoutMs: 300_000,
  serverKeyPriority: false,
  thirdPartyRoutes: {},
  ...overrides,
});

describe('Live WS proxy health + capability bits', () => {
  it('reports Live WS + third-party proxy capability bits on /health', async () => {
    const app = createServer(buildConfig({ thirdPartyRoutes: { openai: { baseUrl: 'https://api.openai.com/v1' } } }));
    const started = serverCleanup.track(await startHttpServer(app));

    const response = await fetch(`${started.baseUrl}/health`);
    const body = (await response.json()) as { capabilities?: { liveWsProxy?: boolean; thirdPartyProxy?: boolean } };

    expect(response.status).toBe(200);
    expect(body.capabilities?.liveWsProxy).toBe(true);
    expect(body.capabilities?.thirdPartyProxy).toBe(true);
  });

  it('reports the third-party proxy disabled when no routes are configured', async () => {
    const app = createServer(buildConfig());
    const started = serverCleanup.track(await startHttpServer(app));

    const response = await fetch(`${started.baseUrl}/health`);
    const body = (await response.json()) as { capabilities?: { thirdPartyProxy?: boolean } };

    expect(body.capabilities?.thirdPartyProxy).toBe(false);
  });
});

describe('resolveUpstream (BYOK 兜底 unit)', () => {
  it('keeps a real browser key and flags it as BYOK', () => {
    const result = resolveUpstream(new URL('http://localhost/api/live?key=byok-key'), 'wss://host', 'server-key');
    expect(result?.hadBrowserKey).toBe(true);
    expect(result?.url).toContain('key=byok-key');
  });

  it('swaps the sentinel for the server-managed key', () => {
    const result = resolveUpstream(
      new URL('http://localhost/api/live?key=__SERVER_MANAGED_API_KEY__'),
      'wss://host',
      'server-key',
    );
    expect(result?.hadBrowserKey).toBe(false);
    expect(result?.url).toContain('key=server-key');
  });

  it('returns null when no browser key and no server key are present', () => {
    expect(resolveUpstream(new URL('http://localhost/api/live'), 'wss://host', undefined)).toBeNull();
    expect(
      resolveUpstream(new URL('http://localhost/api/live?key=__SERVER_MANAGED_API_KEY__'), 'wss://host', undefined),
    ).toBeNull();
  });

  it('handles access_token (ephemeral token) auth the same way', () => {
    const result = resolveUpstream(
      new URL('http://localhost/api/live?access_token=__SERVER_MANAGED_API_KEY__'),
      'wss://host',
      'server-key',
    );
    expect(result?.hadBrowserKey).toBe(false);
    expect(result?.url).toContain('access_token=server-key');
  });

  it('builds the upstream URL from the configured base (scheme + host + rest path)', () => {
    const result = resolveUpstream(
      new URL('http://localhost/api/live/generateContent?key=byok-key'),
      'wss://generativelanguage.googleapis.com',
      'server-key',
    );
    expect(result?.url).toContain('wss://generativelanguage.googleapis.com/generateContent');
  });
});

describe('Live WS proxy bridging', () => {
  it('buffers client frames sent before the upstream handshake completes and flushes them on open', async () => {
    // A local upstream that delays accepting the upgrade, so a client frame
    // sent immediately after its socket opens lands while the bridge's upstream
    // is still CONNECTING. Without the fix those frames are silently dropped
    // and the Live session hangs until the idle timeout.
    const received: string[] = [];
    const upstreamHttp = http.createServer((_req, res) => res.end());
    upstreamHttp.on('upgrade', (request, socket, head) => {
      const wss = new WebSocketServer({ noServer: true });
      setTimeout(() => {
        if (socket.destroyed) return;
        wss.handleUpgrade(request, socket, head, (ws) => {
          ws.on('message', (data) => received.push(data.toString()));
        });
      }, 80);
    });
    const upstream = serverCleanup.track(await startHttpServer(upstreamHttp));
    const upstreamWsBase = upstream.baseUrl.replace('http', 'ws');

    // Point the bridge at the slow local upstream and serve the app.
    const app = createServer(buildConfig());
    attachLiveWsUpgrade(app, buildConfig({ liveWsUpstreamBase: upstreamWsBase }));
    const appServer = serverCleanup.track(await startHttpServer(app));

    // Connect a client and send immediately — before the upstream has opened.
    const client = new WebSocket(`${appServer.baseUrl.replace('http', 'ws')}/api/live?key=byok-key`);
    await new Promise<void>((resolve, reject) => {
      client.on('open', resolve);
      client.on('error', reject);
    });
    client.send('setup');
    client.send('second');

    // Wait for the delayed upstream to open and the flushed frames to arrive.
    await new Promise<void>((resolve) => setTimeout(resolve, 350));

    expect(received).toEqual(['setup', 'second']);

    // Tear down the client socket and force-close every upgraded connection on
    // both HTTP servers, so the tracked servers release their handles for
    // afterEach (server.close() waits on open connections otherwise).
    client.terminate();
    await new Promise<void>((resolve) => setTimeout(resolve, 100));
    app.closeAllConnections?.();
    upstreamHttp.closeAllConnections?.();
  });
});

describe('Live WS upgrade security', () => {
  it('rejects upgrades whose Origin is not in the allowlist (CSWSH)', async () => {
    const config = buildConfig({ allowedOrigins: ['https://app.example.com'] });
    const app = createServer(config);
    attachLiveWsUpgrade(app, config);
    const appServer = serverCleanup.track(await startHttpServer(app));

    const evil = new WebSocket(`${appServer.baseUrl.replace('http', 'ws')}/api/live?key=byok-key`, {
      headers: { origin: 'https://evil.example' },
    });
    const outcome = await new Promise<string>((resolve) => {
      evil.on('open', () => resolve('open'));
      evil.on('error', () => resolve('error'));
      evil.on('unexpected-response', () => resolve('unexpected-response'));
    });
    expect(outcome).not.toBe('open');
    evil.terminate();
  });

  it('still bridges upgrades whose Origin is in the allowlist', async () => {
    const upstreamHttp = http.createServer((_req, res) => res.end());
    upstreamHttp.on('upgrade', (request, socket, head) => {
      const wss = new WebSocketServer({ noServer: true });
      wss.handleUpgrade(request, socket, head, (ws) => {
        ws.on('message', () => undefined);
      });
    });
    const upstream = serverCleanup.track(await startHttpServer(upstreamHttp));

    const config = buildConfig({
      allowedOrigins: ['https://app.example.com'],
      liveWsUpstreamBase: upstream.baseUrl.replace('http', 'ws'),
    });
    const app = createServer(config);
    attachLiveWsUpgrade(app, config);
    const appServer = serverCleanup.track(await startHttpServer(app));

    const client = new WebSocket(`${appServer.baseUrl.replace('http', 'ws')}/api/live?key=byok-key`, {
      headers: { origin: 'https://app.example.com' },
    });
    const outcome = await new Promise<string>((resolve) => {
      client.on('open', () => resolve('open'));
      client.on('error', () => resolve('error'));
      client.on('unexpected-response', () => resolve('unexpected-response'));
    });
    expect(outcome).toBe('open');
    client.terminate();
    await new Promise<void>((resolve) => setTimeout(resolve, 100));
    app.closeAllConnections?.();
    upstreamHttp.closeAllConnections?.();
  });

  it('destroys the socket for upgrade requests outside /api/live instead of leaving them open', async () => {
    const config = buildConfig();
    const app = createServer(config);
    attachLiveWsUpgrade(app, config);
    const appServer = serverCleanup.track(await startHttpServer(app));
    const { hostname, port } = new URL(appServer.baseUrl);

    const outcome = await new Promise<string>((resolve) => {
      const request = http.request({
        hostname,
        port: Number(port),
        path: '/v1/other-upgrade',
        headers: { connection: 'Upgrade', upgrade: 'websocket' },
      });
      request.on('upgrade', () => resolve('upgraded'));
      request.on('close', () => resolve('closed'));
      request.on('error', () => resolve('error'));
      request.end();
      setTimeout(() => resolve('timeout'), 1500);
    });
    expect(outcome).not.toBe('upgraded');
    expect(outcome).not.toBe('timeout');
    app.closeAllConnections?.();
  });
});
