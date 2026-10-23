// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createServer } from '../createServer';
import { createHttpServerCleanup, startHttpServer } from '../../test/httpServer';

const cleanup = createHttpServerCleanup();
afterEach(async () => {
  await cleanup.cleanup();
  vi.restoreAllMocks();
});

describe('Gemini upstream credential binding', () => {
  it.each([
    { journal: false, browserKey: '', priority: false },
    { journal: true, browserKey: '', priority: false },
    { journal: false, browserKey: '  __SERVER_MANAGED_API_KEY__  ', priority: false },
    { journal: true, browserKey: 'fake-browser-key', priority: true },
  ])('keeps a server key on its configured target (%j)', async ({ journal, browserKey, priority }) => {
    const destinations: string[] = [];
    const upstream = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      destinations.push(String(input));
      expect(new Headers(init?.headers).get('x-goog-api-key')).toBe('fake-server-key');
      return new Response('data: [DONE]\n\n', { headers: { 'content-type': 'text/event-stream' } });
    });
    const started = cleanup.track(
      await startHttpServer(
        createServer(
          {
            geminiApiBase: 'https://configured.example',
            geminiApiKey: 'fake-server-key',
            serverKeyPriority: priority,
          },
          { fetchImpl: upstream },
        ),
      ),
    );
    const response = await fetch(`${started.baseUrl}/api/gemini/v1beta/models/m:streamGenerateContent`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-gemini-upstream-base-url': 'https://attacker.example',
        ...(browserKey ? { 'x-goog-api-key': browserKey } : {}),
        ...(journal
          ? { 'x-amc-job-id': `credential-binding-${crypto.randomUUID()}`, 'x-amc-job-secret': 'test-secret' }
          : {}),
      },
      body: '{}',
    });
    await response.text();
    expect(response.status).toBe(200);
    expect(destinations).toEqual(['https://configured.example/v1beta/models/m:streamGenerateContent']);
  });

  it('preserves custom targets when the selected credential is browser BYOK', async () => {
    const upstream = vi.fn<typeof fetch>(async () => new Response('{}'));
    const started = cleanup.track(
      await startHttpServer(
        createServer(
          {
            geminiApiBase: 'https://configured.example',
            geminiApiKey: 'fake-server-key',
          },
          { fetchImpl: upstream },
        ),
      ),
    );
    const response = await fetch(`${started.baseUrl}/api/gemini/v1beta/models/m:generateContent`, {
      method: 'POST',
      headers: {
        'x-goog-api-key': 'fake-browser-key',
        'x-gemini-upstream-base-url': 'https://byok.example',
      },
      body: '{}',
    });
    await response.text();
    expect(String(upstream.mock.calls[0]?.[0])).toBe('https://byok.example/v1beta/models/m:generateContent');
  });
});
