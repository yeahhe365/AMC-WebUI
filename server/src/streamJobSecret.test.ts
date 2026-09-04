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

// Upstream that emits two complete SSE events and ends — the job finishes and
// stays buffered (10 min TTL) so later attach requests exercise the replay path.
const completedSseUpstream = () =>
  vi.fn(
    async () =>
      new Response('data: {"delta":"one"}\n\ndata: {"delta":"two"}\n\n', {
        status: 200,
        headers: { 'content-type': 'text/event-stream' },
      }),
  );

const postWithJob = (baseUrl: string, jobId: string | null, secret: string | null, body = '{}'): Promise<Response> => {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (jobId) headers['x-amc-job-id'] = jobId;
  if (secret) headers['x-amc-job-secret'] = secret;
  return fetch(`${baseUrl}/api/openai/chat/completions`, {
    method: 'POST',
    headers,
    body,
  });
};

describe('stream job secret binding', () => {
  it('replays a finished job when the attach request presents the matching secret', async () => {
    const upstream = completedSseUpstream();
    const app = createServer(
      buildConfig({ thirdPartyRoutes: { openai: { baseUrl: 'https://upstream.example/v1', apiKey: 'k' } } }),
      { fetchImpl: upstream },
    );
    const started = serverCleanup.track(await startHttpServer(app));

    const first = await postWithJob(started.baseUrl, 'job-ok', 'right-secret');
    expect(first.status).toBe(200);
    await first.text();

    const replay = await postWithJob(started.baseUrl, 'job-ok', 'right-secret');
    expect(replay.status).toBe(200);
    const text = await replay.text();
    expect(text).toContain('data: {"delta":"one"}');
    expect(text).toContain('data: {"delta":"two"}');
  });

  it('rejects an attach with a missing or wrong secret (403)', async () => {
    const upstream = completedSseUpstream();
    const app = createServer(
      buildConfig({ thirdPartyRoutes: { openai: { baseUrl: 'https://upstream.example/v1', apiKey: 'k' } } }),
      { fetchImpl: upstream },
    );
    const started = serverCleanup.track(await startHttpServer(app));

    const first = await postWithJob(started.baseUrl, 'job-guarded', 'right-secret');
    expect(first.status).toBe(200);
    await first.text();

    for (const secret of [null, 'wrong-secret']) {
      const attach = await postWithJob(started.baseUrl, 'job-guarded', secret);
      expect(attach.status).toBe(403);
      const body = (await attach.json()) as { error?: string };
      expect(body.error).toBeTruthy();
    }
  });

  it('keeps secret-less jobs attachable without a secret (legacy clients)', async () => {
    const upstream = completedSseUpstream();
    const app = createServer(
      buildConfig({ thirdPartyRoutes: { openai: { baseUrl: 'https://upstream.example/v1', apiKey: 'k' } } }),
      { fetchImpl: upstream },
    );
    const started = serverCleanup.track(await startHttpServer(app));

    const first = await postWithJob(started.baseUrl, 'job-legacy', null);
    expect(first.status).toBe(200);
    await first.text();

    const replay = await postWithJob(started.baseUrl, 'job-legacy', null);
    expect(replay.status).toBe(200);
    expect(await replay.text()).toContain('data: {"delta":"one"}');
  });

  it('rejects the stream-abort endpoint with a wrong secret and accepts the right one', async () => {
    // Upstream that never ends, so the job stays in flight until aborted.
    // (Held in an object so TypeScript doesn't narrow it to `never` — the
    // assignment happens inside the stream's start callback.)
    const upstreamGate: { release: (() => void) | null } = { release: null };
    const upstream = vi.fn(
      async () =>
        new Response(
          new ReadableStream<Uint8Array>({
            start(controller) {
              controller.enqueue(new TextEncoder().encode('data: {"delta":"partial"}\n\n'));
              upstreamGate.release = () => controller.close();
            },
          }),
          { status: 200, headers: { 'content-type': 'text/event-stream' } },
        ),
    );
    const app = createServer(
      buildConfig({ thirdPartyRoutes: { openai: { baseUrl: 'https://upstream.example/v1', apiKey: 'k' } } }),
      { fetchImpl: upstream },
    );
    const started = serverCleanup.track(await startHttpServer(app));

    const first = await postWithJob(started.baseUrl, 'job-abort', 'right-secret', '{"model":"m"}');
    expect(first.status).toBe(200);
    // Consume one chunk so the attach has flushed, then hold the stream open.
    const reader = first.body?.getReader();
    await reader?.read();

    const wrongAbort = await fetch(`${started.baseUrl}/api/stream-abort/job-abort`, {
      method: 'POST',
      headers: { 'x-amc-job-secret': 'wrong-secret' },
    });
    expect(wrongAbort.status).toBe(404);
    await wrongAbort.text();

    const rightAbort = await fetch(`${started.baseUrl}/api/stream-abort/job-abort`, {
      method: 'POST',
      headers: { 'x-amc-job-secret': 'right-secret' },
    });
    expect(rightAbort.status).toBe(200);
    await rightAbort.text();

    upstreamGate.release?.();
    await reader?.cancel().catch(() => undefined);
    app.closeAllConnections?.();
  });
});
