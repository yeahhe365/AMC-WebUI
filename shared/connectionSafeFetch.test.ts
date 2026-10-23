// @vitest-environment node
import { createServer } from 'node:http';
import { afterEach, describe, expect, it } from 'vitest';
import { createHttpServerCleanup, startHttpServer } from '../server/test/httpServer';
import { createConnectionSafeFetch, getNetworkTargetError } from './connectionSafeFetch';

const cleanup = createHttpServerCleanup();
afterEach(async () => cleanup.cleanup());

describe('connection safe fetch', () => {
  it.each(['::ffff:127.0.0.1', '0:0:0:0:0:ffff:7f00:1'])(
    'rejects the URL-normalized mapped address %s',
    async (address) => {
      const safeFetch = createConnectionSafeFetch();
      await expect(safeFetch(`http://[${address}]:9/private`)).rejects.toThrow(/private network/);
    },
  );

  it('checks all DNS records at connection time before any socket is connected', async () => {
    let requests = 0;
    const server = createServer((_request, response) => {
      requests += 1;
      response.end('private');
    });
    const started = cleanup.track(await startHttpServer(server));
    const safeFetch = createConnectionSafeFetch(fetch, {
      lookup: async () => [
        { address: '8.8.8.8', family: 4 },
        { address: '::ffff:7f00:1', family: 6 },
      ],
    });
    const error = await safeFetch(started.baseUrl.replace('127.0.0.1', 'mixed.example')).catch(
      (failure: unknown) => failure,
    );
    expect(getNetworkTargetError(error)?.message).toMatch(/private address ::ffff:7f00:1/);
    expect(requests).toBe(0);
  });

  it('allows an explicitly enabled local endpoint and preserves its host', async () => {
    let host: string | undefined;
    const server = createServer((request, response) => {
      host = request.headers.host;
      response.end('local model');
    });
    const started = cleanup.track(await startHttpServer(server));
    const response = await createConnectionSafeFetch(fetch, { allowPrivate: true })(started.baseUrl);
    expect(await response.text()).toBe('local model');
    expect(host).toBe(new URL(started.baseUrl).host);
  });
});
