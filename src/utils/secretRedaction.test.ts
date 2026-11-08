import { describe, expect, it } from 'vitest';
import type { AppSettings } from '@/types';
import {
  APP_SETTINGS_CREDENTIAL_FIELDS,
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

  // P0-7：这 5 个字段此前完全没脱敏，导出文件里是明文（含 Docker 下发的部署口令）。
  it('redacts every credential field in the settings export', () => {
    const secrets = {
      serverAccessPassword: 'deploy-password-xyz',
      liveApiKey: 'live-key-xyz',
      tokenCalculatorApiKey: 'token-key-xyz',
      embeddingApiKey: 'embedding-key-xyz',
      lockedApiKey: 'locked-key-xyz',
    };
    const redacted = redactExportedAppSettings(createAppSettings(secrets));
    const serialized = JSON.stringify(redacted);

    for (const [field, raw] of Object.entries(secrets)) {
      expect(redacted[field as keyof typeof secrets]).toBe(REDACTED_SECRET_SENTINEL);
      expect(serialized).not.toContain(raw);
    }
    expect(serialized).not.toContain('gemini-key-123');
    expect(serialized).not.toContain('or-key-456');
  });

  it('lists every credential-looking settings field', () => {
    // 与 secretRedaction.ts 里的编译期护栏同一份语义：名字像凭据 + 值是字符串。
    expect([...APP_SETTINGS_CREDENTIAL_FIELDS].sort()).toEqual(
      [
        'apiKey',
        'embeddingApiKey',
        'liveApiKey',
        'lockedApiKey',
        'serverAccessPassword',
        'tokenCalculatorApiKey',
      ].sort(),
    );
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

  it('restores every credential field from the locally stored settings', () => {
    const imported = redactExportedAppSettings(
      createAppSettings({
        serverAccessPassword: 'deploy-password-xyz',
        liveApiKey: 'live-key-xyz',
        tokenCalculatorApiKey: 'token-key-xyz',
        embeddingApiKey: 'embedding-key-xyz',
        lockedApiKey: 'locked-key-xyz',
      }),
    );
    const restored = restoreRedactedSecrets(
      imported,
      createAppSettings({
        serverAccessPassword: 'local-password',
        liveApiKey: 'local-live',
        tokenCalculatorApiKey: 'local-token',
        embeddingApiKey: 'local-embedding',
        lockedApiKey: 'local-locked',
      }),
    );

    expect(restored.serverAccessPassword).toBe('local-password');
    expect(restored.liveApiKey).toBe('local-live');
    expect(restored.tokenCalculatorApiKey).toBe('local-token');
    expect(restored.embeddingApiKey).toBe('local-embedding');
    expect(restored.lockedApiKey).toBe('local-locked');
  });

  it('nulls a redacted credential when the local settings have none', () => {
    const imported = redactExportedAppSettings(createAppSettings({ liveApiKey: 'live-key-xyz' }));
    const restored = restoreRedactedSecrets(imported, createAppSettings({ liveApiKey: null }));

    expect(restored.liveApiKey).toBeNull();
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
