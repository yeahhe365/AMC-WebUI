import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GoogleGenAI } from '@google/genai';
import { getLiveApiClient } from './liveApiAuth';
type MockGoogleGenAIConfig = {
  apiKey: string;
  httpOptions?: {
    apiVersion?: 'v1alpha';
    baseUrl?: string;
  };
};

vi.mock('@google/genai', () => ({
  GoogleGenAI: vi.fn(function (this: { config: MockGoogleGenAIConfig }, config: MockGoogleGenAIConfig) {
    this.config = config;
  }),
}));

describe('getLiveApiClient', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('throws a configuration error when no browser API key is available for Live', async () => {
    await expect(
      getLiveApiClient(
        {
          useCustomApiConfig: false,
          useApiProxy: false,
          apiProxyUrl: null,
        },
        { apiVersion: 'v1alpha' },
        null,
      ),
    ).rejects.toMatchObject({
      name: 'LiveApiAuthConfigurationError',
      code: 'MISSING_API_KEY',
    });
  });

  it('creates the Live client directly with the browser API key', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await getLiveApiClient(
      {
        useCustomApiConfig: false,
        useApiProxy: false,
        apiProxyUrl: null,
      },
      { apiVersion: 'v1alpha' },
      'browser-key',
    );

    expect(fetchMock).not.toHaveBeenCalled();
    expect(GoogleGenAI).toHaveBeenCalledWith({
      apiKey: 'browser-key',
      httpOptions: { apiVersion: 'v1alpha' },
    });

    vi.unstubAllGlobals();
  });

  it('falls back to the server-managed sentinel when no browser key is given but a proxy baseUrl is configured', async () => {
    await getLiveApiClient(
      {
        useCustomApiConfig: true,
        useApiProxy: true,
        apiProxyUrl: 'https://proxy.example.com/v1beta/',
      },
      { apiVersion: 'v1alpha' },
      null,
    );

    expect(GoogleGenAI).toHaveBeenCalledWith({
      apiKey: '__SERVER_MANAGED_API_KEY__',
      httpOptions: {
        apiVersion: 'v1alpha',
        baseUrl: 'https://proxy.example.com',
      },
    });
  });

  it('applies an absolute proxy baseUrl to the browser-direct Live client when proxying is enabled', async () => {
    await getLiveApiClient(
      {
        useCustomApiConfig: true,
        useApiProxy: true,
        apiProxyUrl: 'https://proxy.example.com/v1beta/',
      },
      { apiVersion: 'v1alpha' },
      'browser-key',
    );

    expect(GoogleGenAI).toHaveBeenCalledWith({
      apiKey: 'browser-key',
      httpOptions: {
        apiVersion: 'v1alpha',
        baseUrl: 'https://proxy.example.com',
      },
    });
  });

  it('does not apply a relative frontend proxy path to the browser-direct Live client', async () => {
    await getLiveApiClient(
      {
        useCustomApiConfig: true,
        useApiProxy: true,
        apiProxyUrl: '/api/gemini',
      },
      { apiVersion: 'v1alpha' },
      'browser-key',
    );

    expect(GoogleGenAI).toHaveBeenCalledWith({
      apiKey: 'browser-key',
      httpOptions: { apiVersion: 'v1alpha' },
    });
  });

  it('trims the browser API key before creating the Live client', async () => {
    await getLiveApiClient(
      {
        useCustomApiConfig: false,
        useApiProxy: false,
        apiProxyUrl: null,
      },
      { apiVersion: 'v1alpha' },
      '  browser-key  ',
    );

    expect(GoogleGenAI).toHaveBeenCalledWith({
      apiKey: 'browser-key',
      httpOptions: { apiVersion: 'v1alpha' },
    });
  });
});

describe('createLiveEphemeralToken', () => {
  it('posts to the ephemeral token endpoint and returns token data', async () => {
    const { createLiveEphemeralToken } = await import('./liveApiAuth');
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        token: 'mock-ephemeral-token',
        name: 'authTokens/mock-ephemeral-token',
        expireTime: '2026-09-01T22:00:00Z',
      }),
    });
    vi.stubGlobal('fetch', mockFetch);

    const result = await createLiveEphemeralToken(
      {
        useCustomApiConfig: false,
        useApiProxy: false,
        apiProxyUrl: null,
      },
      { model: 'gemini-3.1-flash-live-preview', apiKey: 'custom-key' },
    );

    expect(mockFetch).toHaveBeenCalledWith(
      '/api/live/ephemeral-token',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'x-goog-api-key': 'custom-key',
          'Content-Type': 'application/json',
        }),
      }),
    );
    expect(result.token).toBe('mock-ephemeral-token');

    vi.unstubAllGlobals();
  });
});
