import { describe, expect, it, vi } from 'vitest';
import { createVertexAuth } from './vertexAuth';

const makeAuth = (tokens: Array<{ token: string; expiry?: number | null }>) => {
  let i = 0;
  return {
    async getAccessToken() {
      return { token: tokens[i]?.token };
    },
    async getClient() {
      const current = tokens[i] ?? tokens[tokens.length - 1];
      i += 1;
      return { credentials: { expiry_date: current?.expiry ?? null } };
    },
  };
};

describe('createVertexAuth', () => {
  it('returns the access token from google-auth-library', async () => {
    const provider = createVertexAuth({
      auth: makeAuth([{ token: 'token-1', expiry: Date.now() + 60 * 60 * 1000 }]),
    });

    expect(await provider.getAccessToken()).toBe('token-1');
  });

  it('caches the token until the refresh leeway approaches expiry', async () => {
    const now = vi.fn(() => 1_000_000);
    const auth = makeAuth([
      { token: 'token-cache', expiry: 1_000_000 + 60 * 60 * 1000 },
      { token: 'token-refreshed', expiry: 1_000_000 + 120 * 60 * 1000 },
    ]);
    const spy = vi.spyOn(auth, 'getAccessToken');

    const provider = createVertexAuth({ auth, now });
    expect(await provider.getAccessToken()).toBe('token-cache');
    expect(await provider.getAccessToken()).toBe('token-cache');
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('refreshes when the cached token is within the refresh leeway', async () => {
    let nowMs = 1_000_000;
    const tokens = [
      { token: 'stale', expiry: nowMs + 60_000 },
      { token: 'fresh', expiry: nowMs + 60 * 60 * 1000 },
    ];
    const auth = makeAuth(tokens);
    const provider = createVertexAuth({ auth, now: () => nowMs });

    expect(await provider.getAccessToken()).toBe('stale');

    nowMs += 30_000;
    expect(await provider.getAccessToken()).toBe('fresh');
  });

  it('throws when google-auth-library returns no token', async () => {
    const provider = createVertexAuth({
      auth: {
        async getAccessToken() {
          return { token: null };
        },
        async getClient() {
          return { credentials: {} };
        },
      },
    });

    await expect(provider.getAccessToken()).rejects.toThrow(/empty access token/);
  });

  it('accepts the bare-string token shape that real GoogleAuth.getAccessToken returns', async () => {
    const provider = createVertexAuth({
      auth: {
        async getAccessToken() {
          return 'ya29.real-shape-token';
        },
        async getClient() {
          return { credentials: { expiry_date: Date.now() + 60 * 60 * 1000 } };
        },
      },
    });

    expect(await provider.getAccessToken()).toBe('ya29.real-shape-token');
  });

  it('coalesces concurrent token fetches into a single inflight request', async () => {
    let resolveFetch: ((value: { token: string }) => void) | undefined;
    const auth = {
      getAccessToken: vi.fn(
        () =>
          new Promise<{ token: string }>((resolve) => {
            resolveFetch = resolve;
          }),
      ),
      getClient: vi.fn(async () => ({ credentials: { expiry_date: Date.now() + 60 * 60 * 1000 } })),
    };

    const provider = createVertexAuth({ auth });
    const a = provider.getAccessToken();
    const b = provider.getAccessToken();

    expect(auth.getAccessToken).toHaveBeenCalledTimes(1);
    resolveFetch?.({ token: 'concurrent' });

    expect(await a).toBe('concurrent');
    expect(await b).toBe('concurrent');
  });
});
