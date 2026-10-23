// @vitest-environment node
import { createServer } from 'node:http';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createHttpServerCleanup, startHttpServer } from '../../test/httpServer';
import { forwardUpstream } from './proxyForward';

const cleanup = createHttpServerCleanup();
afterEach(async () => {
  await cleanup.cleanup();
  vi.restoreAllMocks();
});

describe('ordinary proxy upstream budgets', () => {
  it('enforces a total budget even when response data keeps arriving', async () => {
    let canceled = false;
    let timer: ReturnType<typeof setInterval>;
    const fetchImpl: typeof fetch = async () =>
      new Response(
        new ReadableStream<Uint8Array>({
          start(controller) {
            timer = setInterval(() => controller.enqueue(new Uint8Array([65])), 10);
          },
          cancel() {
            canceled = true;
            clearInterval(timer);
          },
        }),
      );
    const server = createServer((request, response) => {
      void forwardUpstream(request, response, {
        upstreamUrl: 'https://upstream.example',
        fetchImpl,
        allowedOrigins: [],
        buildHeaders: () => new Headers(),
        logTag: '[test]',
        errorLabel: 'Test',
        idleTimeoutMs: 100,
        totalTimeoutMs: 60,
      });
    });
    const started = cleanup.track(await startHttpServer(server));
    try {
      const response = await fetch(started.baseUrl, { signal: AbortSignal.timeout(500) });
      await expect(response.text()).rejects.toThrow();
      expect(canceled).toBe(true);
    } finally {
      clearInterval(timer!);
    }
  });
  it('aborts a stalled upstream before headers and returns a timeout response', async () => {
    let aborted = false;
    const fetchImpl: typeof fetch = async (_input, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener(
          'abort',
          () => {
            aborted = true;
            reject(init.signal?.reason);
          },
          { once: true },
        );
      });
    const server = createServer((request, response) => {
      void forwardUpstream(request, response, {
        upstreamUrl: 'https://upstream.example',
        fetchImpl,
        allowedOrigins: [],
        buildHeaders: () => new Headers(),
        logTag: '[test]',
        errorLabel: 'Test',
        idleTimeoutMs: 25,
        totalTimeoutMs: 200,
      });
    });
    const started = cleanup.track(await startHttpServer(server));
    const response = await fetch(started.baseUrl, { signal: AbortSignal.timeout(1_000) });
    expect(response.status).toBe(504);
    expect(aborted).toBe(true);
    await response.text();
  });

  it('cancels a response body that stops producing data', async () => {
    let canceled = false;
    const fetchImpl: typeof fetch = async () =>
      new Response(
        new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(new TextEncoder().encode('partial'));
          },
          cancel() {
            canceled = true;
          },
        }),
      );
    const server = createServer((request, response) => {
      void forwardUpstream(request, response, {
        upstreamUrl: 'https://upstream.example',
        fetchImpl,
        allowedOrigins: [],
        buildHeaders: () => new Headers(),
        logTag: '[test]',
        errorLabel: 'Test',
        idleTimeoutMs: 25,
        totalTimeoutMs: 200,
      });
    });
    const started = cleanup.track(await startHttpServer(server));
    const response = await fetch(started.baseUrl, { signal: AbortSignal.timeout(1_000) });
    await expect(response.text()).rejects.toThrow();
    expect(canceled).toBe(true);
  });
});
