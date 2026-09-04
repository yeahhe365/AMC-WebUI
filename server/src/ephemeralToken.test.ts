import { describe, it, expect, vi } from 'vitest';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { EventEmitter } from 'node:events';
import { handleEphemeralTokenRequest } from './ephemeralToken';

interface MockResponse {
  writeHead: ReturnType<typeof vi.fn>;
  end: ReturnType<typeof vi.fn>;
  headers: Record<string, string>;
  statusCode: number;
}

const createMockResponse = (): MockResponse & ServerResponse => {
  const res = {
    statusCode: 200,
    headers: {} as Record<string, string>,
    writeHead: vi.fn((status: number, headers: Record<string, string>) => {
      res.statusCode = status;
      res.headers = headers;
    }),
    end: vi.fn(),
  };
  return res as unknown as MockResponse & ServerResponse;
};

const createMockRequest = (
  method: string,
  headers: Record<string, string> = {},
  body: unknown = null,
): IncomingMessage => {
  const req = new EventEmitter() as unknown as IncomingMessage;
  req.method = method;
  req.headers = headers;
  req.url = '/api/live/ephemeral-token';

  process.nextTick(() => {
    if (body !== null) {
      req.emit('data', JSON.stringify(body));
    }
    req.emit('end');
  });

  return req;
};

describe('handleEphemeralTokenRequest', () => {
  const baseConfig = {
    geminiApiBase: 'https://generativelanguage.googleapis.com',
    geminiApiKey: 'test-server-api-key',
    allowedOrigins: ['http://localhost:5175'],
  };

  it('rejects non-POST requests with 405', async () => {
    const req = createMockRequest('GET');
    const res = createMockResponse();

    await handleEphemeralTokenRequest(req, res, baseConfig);

    expect(res.writeHead).toHaveBeenCalledWith(405, expect.any(Object));
    expect(res.end).toHaveBeenCalledWith(JSON.stringify({ error: 'Method not allowed' }));
  });

  it('rejects when no API key is available with 401', async () => {
    const req = createMockRequest('POST');
    const res = createMockResponse();

    await handleEphemeralTokenRequest(req, res, {
      ...baseConfig,
      geminiApiKey: undefined,
    });

    expect(res.writeHead).toHaveBeenCalledWith(401, expect.any(Object));
    expect(res.end).toHaveBeenCalledWith(JSON.stringify({ error: 'Live API key is not configured' }));
  });

  it('creates an ephemeral token successfully with default constraints', async () => {
    const req = createMockRequest('POST', {}, { model: 'gemini-3.1-flash-live-preview' });
    const res = createMockResponse();

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        name: 'authTokens/test-ephemeral-token-123',
        expireTime: '2026-09-01T22:00:00Z',
        newSessionExpireTime: '2026-09-01T21:35:00Z',
      }),
    });

    await handleEphemeralTokenRequest(req, res, baseConfig, mockFetch as unknown as typeof fetch);

    expect(mockFetch).toHaveBeenCalledWith(
      'https://generativelanguage.googleapis.com/v1beta/auth_tokens',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'x-goog-api-key': 'test-server-api-key',
          'Content-Type': 'application/json',
        }),
      }),
    );

    expect(res.writeHead).toHaveBeenCalledWith(200, expect.any(Object));
    const responseBody = JSON.parse(res.end.mock.calls[0][0]);
    expect(responseBody).toEqual({
      token: 'test-ephemeral-token-123',
      name: 'authTokens/test-ephemeral-token-123',
      expireTime: '2026-09-01T22:00:00Z',
      newSessionExpireTime: '2026-09-01T21:35:00Z',
    });
  });

  it('respects browser-provided API key (BYOK)', async () => {
    const req = createMockRequest('POST', { 'x-goog-api-key': 'browser-custom-key' });
    const res = createMockResponse();

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        name: 'authTokens/token-byok-xyz',
      }),
    });

    await handleEphemeralTokenRequest(req, res, baseConfig, mockFetch as unknown as typeof fetch);

    expect(mockFetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: expect.objectContaining({
          'x-goog-api-key': 'browser-custom-key',
        }),
      }),
    );
  });

  it('uses dedicated liveGeminiApiKey over general geminiApiKey when provided', async () => {
    const req = createMockRequest('POST');
    const res = createMockResponse();

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        name: 'authTokens/token-live-key',
      }),
    });

    await handleEphemeralTokenRequest(
      req,
      res,
      {
        ...baseConfig,
        geminiApiKey: 'general-key',
        liveGeminiApiKey: 'dedicated-live-key',
      },
      mockFetch as unknown as typeof fetch,
    );

    expect(mockFetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: expect.objectContaining({
          'x-goog-api-key': 'dedicated-live-key',
        }),
      }),
    );
  });
});
