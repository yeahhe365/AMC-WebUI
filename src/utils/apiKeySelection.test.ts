import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_APP_SETTINGS } from '@/constants/settingsDefaults';
import { createThirdPartyConnection } from '@/test/data/factories';
import { type ChatSettings, GEMINI_PROVIDER_ID } from '@/types';
import { API_KEY_LAST_USED_INDEX_BY_TARGET_KEY } from '@/constants/storageKeys';
import {
  formatApiKeyErrorMessage,
  getGeminiKeyForRequest,
  getKeyForRequest,
  getLiveApiKey,
  isServerManagedApiEnabledForProxyRequests,
  SERVER_MANAGED_API_KEY,
  THIRD_PARTY_CONNECTION_DISABLED_ERROR,
  THIRD_PARTY_CONNECTION_MISSING_ERROR,
} from './apiKeySelection';
import { logService } from '@/services/logService';

describe('getKeyForRequest', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.removeItem(API_KEY_LAST_USED_INDEX_BY_TARGET_KEY);
  });

  const chatSettings: ChatSettings = {
    modelId: 'gemini-2.5-flash-preview-09-2025',
    providerId: GEMINI_PROVIDER_ID,
    temperature: 1,
    topP: 0.95,
    topK: 64,
    showThoughts: false,
    systemInstruction: '',
    ttsVoice: 'Puck',
    thinkingBudget: 0,
  };

  const openaiProvider = createThirdPartyConnection({ id: 'openai', apiKey: 'openai-key' });

  it('returns server-managed marker key when using proxy custom config with no browser key', () => {
    const result = getKeyForRequest(
      {
        ...DEFAULT_APP_SETTINGS,
        serverManagedApi: true,
        useCustomApiConfig: true,
        useApiProxy: true,
        apiProxyUrl: 'https://proxy.example.com/v1beta',
        apiKey: null,
      },
      chatSettings,
    );

    expect(result).toEqual({
      key: SERVER_MANAGED_API_KEY,
      isNewKey: false,
    });
  });

  it('keeps legacy API key missing error when server-managed flow is not enabled', () => {
    const result = getKeyForRequest(
      {
        ...DEFAULT_APP_SETTINGS,
        serverManagedApi: false,
        useCustomApiConfig: true,
        useApiProxy: true,
        apiProxyUrl: 'https://proxy.example.com/v1beta',
        apiKey: null,
      },
      chatSettings,
    );

    expect(result).toEqual({ error: 'API Key not configured.' });
  });

  it('uses real configured API key when server-managed mode is enabled but key exists', () => {
    const result = getKeyForRequest(
      {
        ...DEFAULT_APP_SETTINGS,
        serverManagedApi: true,
        useCustomApiConfig: true,
        useApiProxy: true,
        apiProxyUrl: 'https://proxy.example.com/v1beta',
        apiKey: 'real-browser-key',
      },
      chatSettings,
    );

    expect(result).toEqual({
      key: 'real-browser-key',
      isNewKey: true,
    });
  });

  it('uses the provider key when the session routes to that third-party provider', () => {
    const result = getKeyForRequest(
      {
        ...DEFAULT_APP_SETTINGS,
        useCustomApiConfig: true,
        apiKey: 'gemini-key',
        thirdPartyApi: {
          connections: [openaiProvider],
        },
      },
      {
        ...chatSettings,
        modelId: openaiProvider.modelId,
        providerId: 'openai',
      },
    );

    expect(result).toEqual({
      key: 'openai-key',
      isNewKey: true,
    });
  });

  it('resolves the provider from the modelId when the session has no explicit providerId', () => {
    // A legacy session with no providerId whose modelId belongs to an enabled
    // provider routes there (composite-key lookup).
    const result = getKeyForRequest(
      {
        ...DEFAULT_APP_SETTINGS,
        useCustomApiConfig: true,
        apiKey: 'gemini-key',
        thirdPartyApi: {
          connections: [{ ...openaiProvider, enabled: true }],
        },
      },
      {
        ...chatSettings,
        modelId: 'gpt-5.6-sol',
        providerId: undefined,
      },
    );

    expect(result).toEqual({
      key: 'openai-key',
      isNewKey: true,
    });
  });

  it('uses the explicit session provider key over the default openai provider', () => {
    const kimiProvider = createThirdPartyConnection({ id: 'kimi', templateId: 'kimi', apiKey: 'kimi-key' });
    const result = getKeyForRequest(
      {
        ...DEFAULT_APP_SETTINGS,
        useCustomApiConfig: true,
        apiKey: 'gemini-key',
        thirdPartyApi: {
          connections: [
            { ...openaiProvider, enabled: true },
            { ...kimiProvider, enabled: true },
          ],
        },
      },
      {
        ...chatSettings,
        modelId: 'kimi-k3',
        providerId: 'kimi',
      },
    );

    expect(result).toEqual({ key: 'kimi-key', isNewKey: true });
  });

  it('reports a missing key when the routed provider has none', () => {
    const result = getKeyForRequest(
      {
        ...DEFAULT_APP_SETTINGS,
        useCustomApiConfig: true,
        apiKey: 'gemini-key',
        thirdPartyApi: {
          connections: [{ ...openaiProvider, apiKey: null }],
        },
      },
      {
        ...chatSettings,
        modelId: 'gpt-5.6-sol',
        providerId: 'openai',
      },
    );

    expect(result).toEqual({ error: 'API Key not configured.' });
  });

  it('uses Gemini key handling when the session routes to Gemini', () => {
    const result = getKeyForRequest(
      {
        ...DEFAULT_APP_SETTINGS,
        useCustomApiConfig: true,
        apiKey: 'gemini-key',
      },
      chatSettings,
    );

    expect(result).toEqual({
      key: 'gemini-key',
      isNewKey: true,
    });
  });

  it('can select a key without recording usage for Live token setup', () => {
    const result = getKeyForRequest(
      {
        ...DEFAULT_APP_SETTINGS,
        useCustomApiConfig: true,
        apiKey: 'real-browser-key',
      },
      chatSettings,
      { skipIncrement: true, skipUsageLogging: true },
    );

    expect(result).toEqual({
      key: 'real-browser-key',
      isNewKey: true,
    });
    expect(logService.recordApiKeyUsage).not.toHaveBeenCalled();
  });

  it('can force Gemini key handling while the session routes third-party', () => {
    const result = getGeminiKeyForRequest(
      {
        ...DEFAULT_APP_SETTINGS,
        useCustomApiConfig: true,
        apiKey: 'gemini-key',
        thirdPartyApi: {
          connections: [openaiProvider],
        },
      },
      {
        ...chatSettings,
        modelId: openaiProvider.modelId,
        providerId: 'openai',
        lockedApiKey: 'openai-key',
      },
      { skipIncrement: true },
    );

    expect(result).toEqual({
      key: 'gemini-key',
      isNewKey: true,
    });
  });

  it('does not fall back to the third-party provider key when forcing Gemini key handling', () => {
    const result = getGeminiKeyForRequest(
      {
        ...DEFAULT_APP_SETTINGS,
        useCustomApiConfig: true,
        apiKey: null,
        thirdPartyApi: {
          connections: [openaiProvider],
        },
      },
      {
        ...chatSettings,
        modelId: openaiProvider.modelId,
        providerId: 'openai',
      },
      { skipIncrement: true },
    );

    expect(result).toEqual({ error: 'API Key not configured.' });
  });

  it('resolves the anthropic provider key when the session routes there', () => {
    const anthropicProvider = createThirdPartyConnection({
      id: 'anthropic',
      templateId: 'anthropic',
      apiKey: 'sk-ant-test',
      modelId: 'claude-sonnet-5',
      models: [{ id: 'claude-sonnet-5', name: 'Claude Sonnet 5', isPinned: true }],
    });
    const result = getKeyForRequest(
      {
        ...DEFAULT_APP_SETTINGS,
        thirdPartyApi: {
          connections: [anthropicProvider],
        },
      },
      {
        ...chatSettings,
        modelId: 'claude-sonnet-5',
        providerId: 'anthropic',
      },
    );

    expect('key' in result).toBe(true);
    expect((result as { key: string }).key).toBe('sk-ant-test');
  });

  it('records third-party key usage even when Gemini custom config is off', () => {
    getKeyForRequest(
      {
        ...DEFAULT_APP_SETTINGS,
        useCustomApiConfig: false,
        thirdPartyApi: {
          connections: [openaiProvider],
        },
      },
      {
        ...chatSettings,
        modelId: openaiProvider.modelId,
        providerId: 'openai',
      },
    );

    expect(logService.recordApiKeyUsage).toHaveBeenCalledWith('openai-key');
  });

  it('returns a missing-connection error instead of falling back to Gemini', () => {
    const result = getKeyForRequest(
      {
        ...DEFAULT_APP_SETTINGS,
        useCustomApiConfig: true,
        apiKey: 'gemini-key',
        thirdPartyApi: { connections: [] },
      },
      {
        ...chatSettings,
        modelId: 'gpt-4o',
        providerId: 'removed-id',
      },
    );

    expect(result).toEqual({ error: THIRD_PARTY_CONNECTION_MISSING_ERROR });
  });

  it('returns a disabled-connection error instead of falling back to Gemini', () => {
    const result = getKeyForRequest(
      {
        ...DEFAULT_APP_SETTINGS,
        useCustomApiConfig: true,
        apiKey: 'gemini-key',
        thirdPartyApi: {
          connections: [createThirdPartyConnection({ id: 'openai', enabled: false, apiKey: 'openai-key' })],
        },
      },
      {
        ...chatSettings,
        modelId: 'gpt-5.6-sol',
        providerId: 'openai',
      },
    );

    expect(result).toEqual({ error: THIRD_PARTY_CONNECTION_DISABLED_ERROR });
  });

  it('rotates Gemini and connection keys independently', () => {
    const geminiSettings = {
      ...DEFAULT_APP_SETTINGS,
      useCustomApiConfig: true,
      apiKey: 'g1,g2',
    };
    const openaiSettings = {
      ...DEFAULT_APP_SETTINGS,
      thirdPartyApi: {
        connections: [createThirdPartyConnection({ id: 'openai', apiKey: 'o1,o2' })],
      },
    };
    const openaiChat = {
      ...chatSettings,
      modelId: 'gpt-5.6-sol',
      providerId: 'openai',
    };

    expect(getKeyForRequest(geminiSettings, chatSettings)).toEqual({ key: 'g1', isNewKey: true });
    expect(getKeyForRequest(openaiSettings, openaiChat)).toEqual({ key: 'o1', isNewKey: true });
    expect(getKeyForRequest(geminiSettings, chatSettings)).toEqual({ key: 'g2', isNewKey: true });
    expect(getKeyForRequest(openaiSettings, openaiChat)).toEqual({ key: 'o2', isNewKey: true });
  });

  it('returns error when third-party provider has no api key', () => {
    const result = getKeyForRequest(
      {
        ...DEFAULT_APP_SETTINGS,
        thirdPartyApi: {
          connections: [createThirdPartyConnection({ id: 'anthropic', templateId: 'anthropic', apiKey: null })],
        },
      },
      {
        ...chatSettings,
        modelId: 'claude-sonnet-5',
        providerId: 'anthropic',
      },
    );

    expect(result).toEqual({ error: 'API Key not configured.' });
  });
});

describe('isServerManagedApiEnabledForProxyRequests', () => {
  it('returns true only when all required server-managed proxy conditions are met', () => {
    expect(
      isServerManagedApiEnabledForProxyRequests({
        ...DEFAULT_APP_SETTINGS,
        serverManagedApi: true,
        useCustomApiConfig: true,
        useApiProxy: true,
        apiProxyUrl: 'https://proxy.example.com/v1beta',
      }),
    ).toBe(true);

    expect(
      isServerManagedApiEnabledForProxyRequests({
        ...DEFAULT_APP_SETTINGS,
        serverManagedApi: true,
        useCustomApiConfig: true,
        useApiProxy: true,
        apiProxyUrl: '   ',
      }),
    ).toBe(false);
  });
});

describe('formatApiKeyErrorMessage', () => {
  it('translates known API key errors and keeps unknown messages intact', () => {
    const translate = vi.fn((translationKey: string) => `translated:${translationKey}`);

    expect(formatApiKeyErrorMessage('API Key not configured.', translate)).toBe(
      'translated:apiRuntimeKeyNotConfigured',
    );
    expect(formatApiKeyErrorMessage(THIRD_PARTY_CONNECTION_MISSING_ERROR, translate)).toBe(
      'translated:apiRuntimeThirdPartyConnectionMissing',
    );
    expect(formatApiKeyErrorMessage(THIRD_PARTY_CONNECTION_DISABLED_ERROR, translate)).toBe(
      'translated:apiRuntimeThirdPartyConnectionDisabled',
    );
    expect(formatApiKeyErrorMessage('custom failure', translate)).toBe('custom failure');
  });
});

describe('getLiveApiKey', () => {
  it('prioritizes dedicated liveApiKey over general apiKey', () => {
    const key = getLiveApiKey({
      ...DEFAULT_APP_SETTINGS,
      useCustomApiConfig: true,
      apiKey: 'general-gemini-key',
      liveApiKey: 'dedicated-live-gemini-key',
    });

    expect(key).toBe('dedicated-live-gemini-key');
  });

  it('falls back to general Gemini API key when liveApiKey is not set', () => {
    const key = getLiveApiKey({
      ...DEFAULT_APP_SETTINGS,
      useCustomApiConfig: true,
      apiKey: 'general-gemini-key',
      liveApiKey: null,
    });

    expect(key).toBe('general-gemini-key');
  });

  it('returns null when server-managed key or missing key', () => {
    const key = getLiveApiKey({
      ...DEFAULT_APP_SETTINGS,
      useCustomApiConfig: false,
      serverManagedApi: false,
      apiKey: null,
      liveApiKey: null,
    });

    expect(key).toBeNull();
  });
});
