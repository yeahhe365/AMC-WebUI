// @vitest-environment node
import { createServer } from 'node:http';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createHttpServerCleanup, startHttpServer } from '../../test/httpServer';
import { proxyExternalImage } from './imageProxy';
import type { NetworkDnsLookup } from '../../../shared/connectionSafeFetch';

const dnsLookup = vi.hoisted(() => vi.fn<NetworkDnsLookup>());
vi.mock('node:dns/promises', () => ({ default: { lookup: dnsLookup }, lookup: dnsLookup }));

const cleanup = createHttpServerCleanup();
afterEach(async () => {
  await cleanup.cleanup();
  vi.restoreAllMocks();
  dnsLookup.mockReset();
});

describe('image proxy response lifecycle', () => {
  it('times out and cancels an image body stalled after headers', async () => {
    dnsLookup.mockResolvedValue([{ address: '8.8.8.8', family: 4 }]);
    let canceled = false;
    const fetchImpl: typeof fetch = async () =>
      new Response(
        new ReadableStream<Uint8Array>({
          cancel() {
            canceled = true;
          },
        }),
        { headers: { 'content-type': 'image/png' } },
      );
    const server = createServer((request, response) => {
      void proxyExternalImage(
        request,
        response,
        new URL('/?url=https://images.example/a.png', 'http://localhost'),
        [],
        fetchImpl,
        { timeoutMs: 25 },
      );
    });
    const started = cleanup.track(await startHttpServer(server));
    const response = await fetch(started.baseUrl, { signal: AbortSignal.timeout(500) });
    expect(response.status).toBe(504);
    expect(canceled).toBe(true);
    await response.text();
  });

  it('answers HEAD after headers and cancels the unused upstream body', async () => {
    dnsLookup.mockResolvedValue([{ address: '8.8.8.8', family: 4 }]);
    let canceled = false;
    const fetchImpl: typeof fetch = async () =>
      new Response(
        new ReadableStream<Uint8Array>({
          cancel() {
            canceled = true;
          },
        }),
        { headers: { 'content-type': 'image/png' } },
      );
    const server = createServer((request, response) => {
      void proxyExternalImage(
        request,
        response,
        new URL('/?url=https://images.example/a.png', 'http://localhost'),
        [],
        fetchImpl,
        { timeoutMs: 200 },
      );
    });
    const started = cleanup.track(await startHttpServer(server));
    const response = await fetch(started.baseUrl, { method: 'HEAD', signal: AbortSignal.timeout(500) });
    expect(response.status).toBe(200);
    expect(canceled).toBe(true);
  });
});
