import { describe, expect, it } from 'vitest';
import type { AppSettings } from '@/types';
import {
  REDACTED_SECRET_SENTINEL,
  redactExportedAppSettings,
  redactExportedSessionSettings,
  restoreRedactedSecrets,
} from './secretRedaction';

const createAppSettings = (overrides: Partial<AppSettings> = {}): AppSettings =>
  ({
    apiKey: 'gemini-key-123',
    thirdPartyApi: {
      connections: [
        {
          id: 'conn-1',
          name: 'OpenRouter',
          templateId: 'openrouter',
          protocol: 'openai',
          apiKey: 'or-key-456',
          baseUrl: 'https://openrouter.ai',
          extraHeaders: {},
          modelId: 'model-a',
          models: [],
          enabled: true,
        },
        {
          id: 'conn-2',
          name: 'Keyless',
          templateId: 'custom-openai',
          protocol: 'openai',
          apiKey: null,
          baseUrl: null,
          extraHeaders: {},
          modelId: 'model-b',
          models: [],
          enabled: false,
        },
      ],
    },
    ...overrides,
  }) as AppSettings;

describe('redactExportedAppSettings', () => {
  it('replaces every API key with the sentinel and keeps null keys untouched', () => {
    const redacted = redactExportedAppSettings(createAppSettings());

    expect(redacted.apiKey).toBe(REDACTED_SECRET_SENTINEL);
    expect(redacted.thirdPartyApi.connections[0].apiKey).toBe(REDACTED_SECRET_SENTINEL);
    expect(redacted.thirdPartyApi.connections[1].apiKey).toBeNull();
    expect(JSON.stringify(redacted)).not.toContain('gemini-key-123');
    expect(JSON.stringify(redacted)).not.toContain('or-key-456');
  });

  it('keeps non-secret connection fields intact', () => {
    const redacted = redactExportedAppSettings(createAppSettings());

    expect(redacted.thirdPartyApi.connections[0].baseUrl).toBe('https://openrouter.ai');
    expect(redacted.thirdPartyApi.connections[0].name).toBe('OpenRouter');
  });
});

describe('restoreRedactedSecrets', () => {
  it('restores redacted keys from the locally stored settings', () => {
    const imported = redactExportedAppSettings(createAppSettings());
    const current = createAppSettings({ apiKey: 'current-gemini-key' });

    const restored = restoreRedactedSecrets(imported, current);

    expect(restored.apiKey).toBe('current-gemini-key');
    expect(restored.thirdPartyApi.connections[0].apiKey).toBe('or-key-456');
    expect(restored.thirdPartyApi.connections[1].apiKey).toBeNull();
  });

  it('nulls a redacted connection key when no local connection matches', () => {
    const imported = redactExportedAppSettings(createAppSettings());
    const current = createAppSettings({ thirdPartyApi: { connections: [] } });

    const restored = restoreRedactedSecrets(imported, current);

    expect(restored.thirdPartyApi.connections[0].apiKey).toBeNull();
  });

  it('keeps explicit keys from the imported file untouched', () => {
    const imported = createAppSettings({ apiKey: 'imported-key' });
    const current = createAppSettings({ apiKey: 'current-key' });

    expect(restoreRedactedSecrets(imported, current).apiKey).toBe('imported-key');
  });
});

describe('redactExportedSessionSettings', () => {
  it('replaces a locked API key with the sentinel', () => {
    const redacted = redactExportedSessionSettings({
      modelId: 'gemini-2.5-pro',
      temperature: 1,
      topP: 0.95,
      topK: 64,
      showThoughts: true,
      systemInstruction: '',
      ttsVoice: '',
      thinkingBudget: 8192,
      lockedApiKey: 'locked-key-789',
    });

    expect(redacted.lockedApiKey).toBe(REDACTED_SECRET_SENTINEL);
    expect(redacted.modelId).toBe('gemini-2.5-pro');
  });
});
