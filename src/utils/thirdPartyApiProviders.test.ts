import { describe, expect, it } from 'vitest';

import { GEMINI_PROVIDER_ID, normalizeProviderId } from '@/types';
import { createAppSettings, createThirdPartyConnection } from '@/test/data/factories';
import {
  buildProviderAwareModelList,
  createDefaultThirdPartyApiSettings,
  getConnectionDisplayTemplateId,
  getProxyProviderHeader,
  getThirdPartyConnectionStatus,
  getThirdPartyTemplateLinks,
  isThirdPartyConnectionInUse,
  sanitizeThirdPartyApiSettings,
  resolveProviderForModelId,
  createConnectionFromTemplate,
} from './thirdPartyApiProviders';

describe('normalizeProviderId', () => {
  it('keeps UUIDs and official ids, and still drops openai-compatible', () => {
    expect(normalizeProviderId('openai')).toBe('openai');
    expect(normalizeProviderId('8f3c2a1e-4b5d-4c6a-9e0f-1234567890ab')).toBe('8f3c2a1e-4b5d-4c6a-9e0f-1234567890ab');
    expect(normalizeProviderId(GEMINI_PROVIDER_ID)).toBe(GEMINI_PROVIDER_ID);
    expect(normalizeProviderId('openai-compatible')).toBeUndefined();
    expect(normalizeProviderId('')).toBeUndefined();
  });
});

describe('sanitizeThirdPartyApiSettings', () => {
  it('returns an empty connection list for fresh settings', () => {
    expect(createDefaultThirdPartyApiSettings()).toEqual({ connections: [] });
    expect(sanitizeThirdPartyApiSettings({})).toEqual({ connections: [] });
  });

  it('passes through an existing connections array and ignores providers', () => {
    const result = sanitizeThirdPartyApiSettings({
      connections: [
        {
          id: 'conn-1',
          name: 'Home NewAPI',
          templateId: 'custom-openai',
          protocol: 'openai-compatible',
          apiKey: 'sk',
          baseUrl: 'https://newapi.example/v1',
          extraHeaders: { 'X-Title': 'AMC' },
          modelId: 'gpt-4o',
          models: [{ id: 'gpt-4o', name: 'GPT-4o' }],
          enabled: true,
        },
      ],
      providers: {
        openai: { enabled: true, apiKey: 'ignored' },
      },
    });

    expect(result.connections).toHaveLength(1);
    expect(result.connections[0]).toMatchObject({
      id: 'conn-1',
      name: 'Home NewAPI',
      templateId: 'custom-openai',
      extraHeaders: { 'X-Title': 'AMC' },
    });
  });

  it('migrates a legacy providers map and skips untouched default slots', () => {
    const result = sanitizeThirdPartyApiSettings({
      activeProvider: 'deepseek',
      providers: {
        openai: {
          enabled: true,
          apiKey: 'sk-openai',
          baseUrl: 'https://api.openai.com/v1',
          modelId: 'gpt-5.6-sol',
          models: [{ id: 'gpt-5.6-sol', name: 'GPT-5.6 Sol', isPinned: true }],
          protocol: 'openai-compatible',
        },
        custom: {
          enabled: false,
          apiKey: 'sk-custom',
          baseUrl: 'https://gateway.example/v1',
          modelId: 'custom-model',
          models: [{ id: 'custom-model', name: 'Custom Model', isPinned: true }],
          protocol: 'openai-compatible',
        },
      },
    });

    expect(result).not.toHaveProperty('activeProvider');
    expect(result).not.toHaveProperty('providers');
    expect(result.connections.map((connection) => connection.id)).toEqual(['openai', 'custom']);
    expect(result.connections[0]).toMatchObject({
      id: 'openai',
      templateId: 'openai',
      enabled: true,
      apiKey: 'sk-openai',
    });
    expect(result.connections[1]).toMatchObject({
      id: 'custom',
      templateId: 'custom-openai',
      extraHeaders: {},
    });
  });

  it('skips untouched default disabled slots so a fresh install stays empty', () => {
    const result = sanitizeThirdPartyApiSettings({
      providers: {
        openai: {
          enabled: false,
          apiKey: null,
          baseUrl: 'https://api.openai.com/v1',
          modelId: 'gpt-5.6-sol',
          models: [{ id: 'gpt-5.6-sol', name: 'GPT-5.6 Sol', isPinned: true }],
          protocol: 'openai-compatible',
        },
      },
    });

    expect(result.connections).toEqual([]);
  });
});

describe('createConnectionFromTemplate', () => {
  it('appends a numeric suffix when the template name is already used', () => {
    const first = createConnectionFromTemplate('openai', [], 'conn-1');
    const second = createConnectionFromTemplate('openai', [first], 'conn-2');

    expect(first.name).toBe('OpenAI');
    expect(second.name).toBe('OpenAI 2');
    expect(second.templateId).toBe('openai');
    expect(second.extraHeaders).toEqual({});
  });
});

describe('getProxyProviderHeader', () => {
  it('maps custom templates to the Docker custom route key', () => {
    expect(getProxyProviderHeader('openai')).toBe('openai');
    expect(getProxyProviderHeader('custom-openai')).toBe('custom');
    expect(getProxyProviderHeader('custom-anthropic')).toBe('custom');
    expect(getProxyProviderHeader('a1b2c3d4-uuid')).toBe('custom');
  });
});

describe('resolveProviderForModelId', () => {
  it('returns the enabled connection that contains the modelId', () => {
    const appSettings = createAppSettings({
      thirdPartyApi: {
        connections: [
          createThirdPartyConnection({
            id: 'openai',
            enabled: true,
            models: [{ id: 'gpt-5.6-sol', name: 'GPT-5.6 Sol' }],
          }),
        ],
      },
    });

    expect(resolveProviderForModelId(appSettings, 'gpt-5.6-sol')).toMatchObject({ id: 'openai' });
  });

  it('returns undefined when the modelId belongs to no enabled connection', () => {
    const appSettings = createAppSettings({
      thirdPartyApi: {
        connections: [
          createThirdPartyConnection({
            id: 'openai',
            enabled: true,
            models: [{ id: 'gpt-5.6-sol', name: 'GPT-5.6 Sol' }],
          }),
        ],
      },
    });

    expect(resolveProviderForModelId(appSettings, 'gemini-3.1-pro-preview')).toBeUndefined();
  });

  it('ignores disabled connections', () => {
    const appSettings = createAppSettings({
      thirdPartyApi: {
        connections: [
          createThirdPartyConnection({
            id: 'openai',
            enabled: false,
            models: [{ id: 'gpt-5.6-sol', name: 'GPT-5.6 Sol' }],
          }),
        ],
      },
    });

    expect(resolveProviderForModelId(appSettings, 'gpt-5.6-sol')).toBeUndefined();
  });
});

describe('buildProviderAwareModelList', () => {
  it('keeps same-named model ids from different connections both present', () => {
    const appSettings = createAppSettings({
      thirdPartyApi: {
        connections: [
          createThirdPartyConnection({
            id: 'openai',
            enabled: true,
            models: [{ id: 'gpt-4o', name: 'OpenAI GPT-4o' }],
          }),
          createThirdPartyConnection({
            id: 'kimi',
            templateId: 'kimi',
            enabled: true,
            models: [{ id: 'gpt-4o', name: 'Kimi GPT-4o' }],
          }),
        ],
      },
    });

    const result = buildProviderAwareModelList(appSettings, [{ id: 'gemini-3-flash', name: 'Gemini 3 Flash' }]);

    const gpt4o = result.filter((model) => model.id === 'gpt-4o');
    expect(gpt4o).toHaveLength(2);
    expect(gpt4o.map((model) => model.providerId).sort()).toEqual(['kimi', 'openai']);
    expect(gpt4o.map((model) => model.connectionName).sort()).toEqual(['Kimi', 'OpenAI']);
  });

  it('still deduplicates within a single connection list', () => {
    const appSettings = createAppSettings({
      thirdPartyApi: {
        connections: [
          createThirdPartyConnection({
            id: 'openai',
            enabled: true,
            models: [
              { id: 'gpt-4o', name: 'GPT-4o' },
              { id: 'gpt-4o', name: 'GPT-4o duplicate' },
            ],
          }),
        ],
      },
    });

    const result = buildProviderAwareModelList(appSettings, []);
    expect(result.filter((model) => model.id === 'gpt-4o')).toHaveLength(1);
  });

  it('keeps a gemini model id that collides with a third-party model id', () => {
    const appSettings = createAppSettings({
      thirdPartyApi: {
        connections: [
          createThirdPartyConnection({
            id: 'openai',
            enabled: true,
            models: [{ id: 'gemini-3-flash', name: 'Gemini via OpenAI' }],
          }),
        ],
      },
    });

    const result = buildProviderAwareModelList(appSettings, [{ id: 'gemini-3-flash', name: 'Gemini 3 Flash' }]);

    expect(result.filter((model) => model.id === 'gemini-3-flash')).toHaveLength(2);
  });

  it('injects the current session model when its connection is missing or disabled', () => {
    const appSettings = createAppSettings({
      thirdPartyApi: { connections: [] },
    });

    const result = buildProviderAwareModelList(appSettings, [], {
      modelId: 'gpt-4o',
      providerId: 'removed-connection',
    });

    expect(result).toEqual([
      expect.objectContaining({
        id: 'gpt-4o',
        providerId: 'removed-connection',
        unavailable: true,
      }),
    ]);
  });

  it('marks enabled connections that have no API key', () => {
    const appSettings = createAppSettings({
      thirdPartyApi: {
        connections: [
          createThirdPartyConnection({
            id: 'openai',
            enabled: true,
            apiKey: null,
            models: [{ id: 'gpt-4o', name: 'GPT-4o' }],
          }),
          createThirdPartyConnection({
            id: 'kimi',
            templateId: 'kimi',
            enabled: true,
            apiKey: 'kimi-key',
            models: [{ id: 'kimi-k3', name: 'Kimi K3' }],
          }),
        ],
      },
    });

    const result = buildProviderAwareModelList(appSettings, []);

    expect(result.find((model) => model.providerId === 'openai')).toMatchObject({ missingApiKey: true });
    expect(result.find((model) => model.providerId === 'kimi')?.missingApiKey).toBeUndefined();
  });

  it('uses a custom logo template when the wire protocol no longer matches the vendor template', () => {
    const appSettings = createAppSettings({
      thirdPartyApi: {
        connections: [
          createThirdPartyConnection({
            id: 'openai',
            templateId: 'openai',
            protocol: 'anthropic',
            enabled: true,
            apiKey: 'sk',
            models: [{ id: 'gpt-4o', name: 'GPT-4o' }],
          }),
        ],
      },
    });

    const result = buildProviderAwareModelList(appSettings, []);
    expect(result[0]).toMatchObject({ templateId: 'custom-anthropic', providerId: 'openai' });
  });
});

describe('getThirdPartyConnectionStatus', () => {
  it('requires an enabled connection, API key, and base URL to be ready', () => {
    const connection = createThirdPartyConnection({
      enabled: true,
      apiKey: 'sk',
      baseUrl: 'https://api.openai.com/v1',
    });

    expect(getThirdPartyConnectionStatus({ ...connection, enabled: false })).toBe('disabled');
    expect(getThirdPartyConnectionStatus({ ...connection, apiKey: null })).toBe('missing-key');
    expect(getThirdPartyConnectionStatus({ ...connection, apiKey: '  ' })).toBe('missing-key');
    expect(getThirdPartyConnectionStatus({ ...connection, baseUrl: null })).toBe('missing-url');
    expect(getThirdPartyConnectionStatus({ ...connection, baseUrl: '  ' })).toBe('missing-url');
    expect(getThirdPartyConnectionStatus(connection)).toBe('ready');
  });
});

describe('getConnectionDisplayTemplateId', () => {
  it('keeps the vendor logo until the protocol diverges from the template default', () => {
    expect(getConnectionDisplayTemplateId({ templateId: 'openai', protocol: 'openai-compatible' })).toBe('openai');
    expect(getConnectionDisplayTemplateId({ templateId: 'openai', protocol: 'anthropic' })).toBe('custom-anthropic');
    expect(getConnectionDisplayTemplateId({ templateId: 'anthropic', protocol: 'openai-compatible' })).toBe(
      'custom-openai',
    );
  });
});

describe('isThirdPartyConnectionInUse', () => {
  it('detects the default provider and saved sessions that still route to the connection', () => {
    expect(isThirdPartyConnectionInUse('openai', [], 'gemini-native')).toBe(false);
    expect(isThirdPartyConnectionInUse('openai', [], 'openai')).toBe(true);
    expect(isThirdPartyConnectionInUse('openai', [{ settings: { providerId: 'openai' } }], 'gemini-native')).toBe(true);
  });
});

describe('getThirdPartyTemplateLinks', () => {
  it('returns official API key and documentation links for known templates', () => {
    const openaiLinks = getThirdPartyTemplateLinks('openai');
    expect(openaiLinks.apiKeyUrl).toBe('https://platform.openai.com/api-keys');
    expect(openaiLinks.docUrl).toBe('https://platform.openai.com/docs');

    const deepseekLinks = getThirdPartyTemplateLinks('deepseek');
    expect(deepseekLinks.apiKeyUrl).toBe('https://platform.deepseek.com/api_keys');

    const customLinks = getThirdPartyTemplateLinks('custom-openai');
    expect(customLinks.apiKeyUrl).toBeUndefined();
    expect(customLinks.docUrl).toBeUndefined();
  });
});
