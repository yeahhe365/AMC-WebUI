import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GoogleGenAI } from '@google/genai';
import { getClient, getConfiguredApiClient, getConfiguredApiClientContext } from './apiClient';
import { dbService } from '@/services/db/dbService';

const { mockGetRuntimeConfigAppSettingsOverrides, mockIsRuntimeApiConfigEnforced } = vi.hoisted(() => ({
  mockGetRuntimeConfigAppSettingsOverrides: vi.fn(() => ({})),
  mockIsRuntimeApiConfigEnforced: vi.fn(() => false),
}));

type MockGoogleGenAIConfig = {
  apiKey: string;
  httpOptions?: {
    apiVersion?: 'v1alpha';
    baseUrl?: string;
  };
};

type StoredAppSettings = NonNullable<
  Awaited<ReturnType<typeof import('@/services/db/dbService').dbService.getAppSettings>>
>;

vi.mock('@google/genai', () => ({
  GoogleGenAI: vi.fn(function (this: { config: MockGoogleGenAIConfig }, config: MockGoogleGenAIConfig) {
    this.config = config;
  }),
}));

vi.mock('@/services/db/dbService', async () => {
  const { createDbServiceMockModule } = await import('@/test/doubles/moduleMocks');

  return createDbServiceMockModule();
});

vi.mock('@/services/logService', async () => {
  const { createLogServiceMockModule } = await import('@/test/doubles/moduleMocks');

  return createLogServiceMockModule();
});

vi.mock('@/runtime/runtimeConfig', () => ({
  getRuntimeConfigAppSettingsOverrides: mockGetRuntimeConfigAppSettingsOverrides,
  isRuntimeApiConfigEnforced: mockIsRuntimeApiConfigEnforced,
}));

// ── getClient ──

describe('getClient', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates a GoogleGenAI client with API key', async () => {
    await getClient('test-key');
    expect(GoogleGenAI).toHaveBeenCalledWith({ apiKey: 'test-key' });
  });

  it('sanitizes smart quotes and dashes in API key', async () => {
    await getClient('test\u2019s-key\u2014value');
    expect(GoogleGenAI).toHaveBeenCalledWith({ apiKey: "test's-key-value" });
  });

  it('passes proxy baseUrl via httpOptions when provided', async () => {
    await getClient('key', 'https://proxy.example.com/');
    expect(GoogleGenAI).toHaveBeenCalledWith({
      apiKey: 'key',
      httpOptions: { baseUrl: 'https://proxy.example.com' },
    });
  });

  it('strips trailing slash from proxy baseUrl', async () => {
    await getClient('key', 'https://proxy.example.com/');
    expect(GoogleGenAI).toHaveBeenCalledWith(
      expect.objectContaining({
        httpOptions: { baseUrl: 'https://proxy.example.com' },
      }),
    );
  });

  it('normalizes version-suffixed proxy baseUrls before passing them to the SDK', async () => {
    await getClient('key', 'https://proxy.example.com/gemini/v1beta/');
    expect(GoogleGenAI).toHaveBeenCalledWith(
      expect.objectContaining({
        httpOptions: { baseUrl: 'https://proxy.example.com/gemini' },
      }),
    );
  });

  it('merges proxy baseUrl into existing httpOptions', async () => {
    await getClient('key', 'https://proxy.example.com/', { apiVersion: 'v1alpha' });
    expect(GoogleGenAI).toHaveBeenCalledWith({
      apiKey: 'key',
      httpOptions: {
        apiVersion: 'v1alpha',
        baseUrl: 'https://proxy.example.com',
      },
    });
  });

  it('throws on invalid initialization', async () => {
    vi.mocked(GoogleGenAI).mockImplementationOnce(() => {
      throw new Error('bad');
    });
    await expect(getClient('key')).rejects.toThrow('bad');
  });
});

// ── getConfiguredApiClient ──

describe('getConfiguredApiClient', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetRuntimeConfigAppSettingsOverrides.mockReturnValue({});
    mockIsRuntimeApiConfigEnforced.mockReturnValue(false);
  });

  it('uses proxy when both useCustomApiConfig and useApiProxy are true', async () => {
    vi.mocked(dbService.getAppSettings).mockResolvedValue({
      useCustomApiConfig: true,
      useApiProxy: true,
      apiProxyUrl: 'https://proxy.example.com',
    } as StoredAppSettings);
    await getConfiguredApiClient('key');
    expect(GoogleGenAI).toHaveBeenCalledWith(
      expect.objectContaining({
        httpOptions: { baseUrl: 'https://proxy.example.com' },
      }),
    );
  });

  it('skips proxy when useApiProxy is false', async () => {
    vi.mocked(dbService.getAppSettings).mockResolvedValue({
      useCustomApiConfig: true,
      useApiProxy: false,
      apiProxyUrl: 'https://proxy.example.com',
    } as StoredAppSettings);
    await getConfiguredApiClient('key');
    expect(GoogleGenAI).toHaveBeenCalledWith(
      expect.objectContaining({
        apiKey: 'key',
      }),
    );
    // baseUrl should not be in the config
    const callArgs = vi.mocked(GoogleGenAI).mock.calls[0][0] as MockGoogleGenAIConfig;
    expect(callArgs.httpOptions?.baseUrl).toBeUndefined();
  });

  it('forces an enforced runtime proxy over stale stored settings', async () => {
    mockIsRuntimeApiConfigEnforced.mockReturnValue(true);
    mockGetRuntimeConfigAppSettingsOverrides.mockReturnValue({
      serverManagedApi: true,
      useCustomApiConfig: true,
      useApiProxy: true,
      apiProxyUrl: '/api/gemini',
    });
    vi.mocked(dbService.getAppSettings).mockResolvedValue({
      useCustomApiConfig: false,
      useApiProxy: false,
      apiProxyUrl: 'https://generativelanguage.googleapis.com',
    } as StoredAppSettings);

    await getConfiguredApiClient('key');

    expect(GoogleGenAI).toHaveBeenCalledWith({
      apiKey: 'key',
      httpOptions: { baseUrl: 'http://localhost/api/gemini' },
    });
  });
});

describe('getConfiguredApiClientContext', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetRuntimeConfigAppSettingsOverrides.mockReturnValue({});
    mockIsRuntimeApiConfigEnforced.mockReturnValue(false);
  });

  it('builds the client and routing URLs from one settings read', async () => {
    vi.mocked(dbService.getAppSettings).mockResolvedValue({
      useCustomApiConfig: true,
      useApiProxy: true,
      apiProxyUrl: 'https://proxy.example.com/gemini/v1beta/',
    } as StoredAppSettings);

    const context = await getConfiguredApiClientContext('key');

    expect(dbService.getAppSettings).toHaveBeenCalledTimes(1);
    expect(GoogleGenAI).toHaveBeenCalledWith({
      apiKey: 'key',
      httpOptions: { baseUrl: 'https://proxy.example.com/gemini' },
    });
    expect(context).toMatchObject({
      apiBaseUrl: 'https://proxy.example.com/gemini',
      proxyBaseUrl: 'https://proxy.example.com/gemini',
    });
  });

  it('routes enforced-profile uploads through the same-origin proxy', async () => {
    mockIsRuntimeApiConfigEnforced.mockReturnValue(true);
    mockGetRuntimeConfigAppSettingsOverrides.mockReturnValue({
      serverManagedApi: true,
      useCustomApiConfig: true,
      useApiProxy: true,
      apiProxyUrl: '/api/gemini',
    });
    vi.mocked(dbService.getAppSettings).mockResolvedValue(undefined);

    const context = await getConfiguredApiClientContext('key');

    expect(context).toMatchObject({
      apiBaseUrl: 'http://localhost/api/gemini',
      proxyBaseUrl: '/api/gemini',
    });
  });
});
