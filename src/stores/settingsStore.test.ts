import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockGetRuntimeConfigAppSettingsOverrides } = vi.hoisted(() => ({
  mockGetRuntimeConfigAppSettingsOverrides: vi.fn(() => ({})),
}));

vi.mock('@/runtime/runtimeConfig', () => ({
  getRuntimeConfigAppSettingsOverrides: mockGetRuntimeConfigAppSettingsOverrides,
}));

import { DEFAULT_APP_SETTINGS } from '@/constants/settingsDefaults';
import { useSettingsStore } from './settingsStore';
import { dbService } from '@/services/db/dbService';
import { logService } from '@/services/logService';
import { createTheme } from '@/test/data/factories';
import type { AppSettings } from '@/types';

const createStoredSettingsSnapshot = (overrides: Record<string, unknown>): AppSettings =>
  overrides as unknown as AppSettings;

describe('settingsStore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetRuntimeConfigAppSettingsOverrides.mockReturnValue({});
    useSettingsStore.setState({
      appSettings: DEFAULT_APP_SETTINGS,
      currentTheme: createTheme(),
      language: 'en',
      isSettingsLoaded: false,
      pendingPreloadSettingsOverrides: null,
    });
  });

  describe('setAppSettings', () => {
    it('updates appSettings with new object', () => {
      useSettingsStore.getState().setAppSettings({
        ...useSettingsStore.getState().appSettings,
        temperature: 0.5,
      });
      expect(useSettingsStore.getState().appSettings.temperature).toBe(0.5);
    });

    it('updates appSettings with updater function', () => {
      useSettingsStore.getState().setAppSettings((prev) => ({
        ...prev,
        topP: 0.8,
      }));
      expect(useSettingsStore.getState().appSettings.topP).toBe(0.8);
    });

    it('resolves theme when themeId changes to onyx', () => {
      useSettingsStore.getState().setAppSettings((prev) => ({
        ...prev,
        themeId: 'onyx',
      }));
      expect(useSettingsStore.getState().currentTheme.id).toBe('onyx');
    });

    it('resolves theme when themeId changes to graphite', () => {
      useSettingsStore.getState().setAppSettings((prev) => ({
        ...prev,
        themeId: 'graphite',
      }));
      expect(useSettingsStore.getState().currentTheme.id).toBe('graphite');
    });

    it('resolves language when language changes to zh', () => {
      useSettingsStore.getState().setAppSettings((prev) => ({
        ...prev,
        language: 'zh',
      }));
      expect(useSettingsStore.getState().language).toBe('zh');
    });

    it('resolves language when language changes to ja', () => {
      useSettingsStore.getState().setAppSettings((prev) => ({ ...prev, language: 'ja' }));
      expect(useSettingsStore.getState().language).toBe('ja');
    });

    it('persists to IndexedDB when settings are loaded', async () => {
      useSettingsStore.setState({ isSettingsLoaded: true });
      useSettingsStore.getState().setAppSettings((prev) => ({
        ...prev,
        temperature: 0.3,
      }));
      await vi.waitFor(() => {
        expect(dbService.setAppSettings).toHaveBeenCalled();
      });
    });

    it('broadcasts settings update after persist', async () => {
      useSettingsStore.setState({ isSettingsLoaded: true });
      useSettingsStore.getState().setAppSettings((prev) => ({
        ...prev,
        temperature: 0.3,
      }));
      await vi.waitFor(() => {
        expect(dbService.setAppSettings).toHaveBeenCalled();
      });
      expect(useSettingsStore.getState().appSettings.temperature).toBe(0.3);
    });

    it('does not persist when settings are not loaded yet', () => {
      useSettingsStore.setState({ isSettingsLoaded: false });
      useSettingsStore.getState().setAppSettings((prev) => ({
        ...prev,
        temperature: 0.3,
      }));
      expect(dbService.setAppSettings).not.toHaveBeenCalled();
    });

    it('mirrors the toggled isLoggingEnabled into the log gate on save', () => {
      useSettingsStore.setState({ isSettingsLoaded: true });
      useSettingsStore.getState().setAppSettings((prev) => ({
        ...prev,
        isLoggingEnabled: true,
      }));

      expect(logService.setEnabled).toHaveBeenCalledWith(true);
    });
  });

  describe('loadSettings', () => {
    it('mirrors the loaded isLoggingEnabled value into the log gate', async () => {
      vi.mocked(dbService.getAppSettings).mockResolvedValue(createStoredSettingsSnapshot({ isLoggingEnabled: true }));

      await useSettingsStore.getState().loadSettings();

      expect(logService.setEnabled).toHaveBeenCalledWith(true);
    });

    it('closes the log gate when settings fail to load', async () => {
      vi.mocked(dbService.getAppSettings).mockRejectedValue(new Error('DB fail'));

      await useSettingsStore.getState().loadSettings();

      expect(logService.setEnabled).toHaveBeenCalledWith(false);
    });

    it('defaults to Gemini native provider with an isolated third-party provider config', async () => {
      vi.mocked(dbService.getAppSettings).mockResolvedValue(undefined);

      await useSettingsStore.getState().loadSettings();

      const { appSettings } = useSettingsStore.getState();
      expect(appSettings.providerId).toBe('gemini-native');
      expect(appSettings.apiKey).toBeNull();
      expect(appSettings.modelId).toBe('gemini-3.8-flash');
      expect(appSettings.thirdPartyApi.connections).toEqual([]);
    });

    it('provides English as the default input translation target language', async () => {
      vi.mocked(dbService.getAppSettings).mockResolvedValue(undefined);

      await useSettingsStore.getState().loadSettings();

      expect(useSettingsStore.getState().appSettings.translationTargetLanguage).toBe('English');
    });

    it('migrates the previous speech-to-text default to the current default', async () => {
      vi.mocked(dbService.getAppSettings).mockResolvedValue(
        createStoredSettingsSnapshot({
          transcriptionModelId: 'gemini-3-flash-preview',
        }),
      );

      await useSettingsStore.getState().loadSettings();

      expect(useSettingsStore.getState().appSettings.transcriptionModelId).toBe('gemini-3.5-transcribe');
    });

    it('preserves user edits made before settings finish loading', async () => {
      const liveArtifactsPrompt = '[Live Artifacts Protocol - zh]\nLive Artifacts prompt';
      vi.mocked(dbService.getAppSettings).mockResolvedValue(
        createStoredSettingsSnapshot({
          temperature: 0.5,
          language: 'zh',
        }),
      );

      useSettingsStore.getState().setAppSettings((prev) => ({
        ...prev,
        systemInstruction: liveArtifactsPrompt,
      }));

      await useSettingsStore.getState().loadSettings();

      const state = useSettingsStore.getState();
      expect(state.appSettings.temperature).toBe(0.5);
      expect(state.appSettings.language).toBe('zh');
      expect(state.appSettings.systemInstruction).toBe(liveArtifactsPrompt);
      await vi.waitFor(() => {
        expect(dbService.setAppSettings).toHaveBeenCalledWith(
          expect.objectContaining({
            temperature: 0.5,
            language: 'zh',
            systemInstruction: liveArtifactsPrompt,
          }),
        );
      });
    });

    it('loads settings from DB and merges with defaults', async () => {
      vi.mocked(dbService.getAppSettings).mockResolvedValue(
        createStoredSettingsSnapshot({
          temperature: 0.5,
          language: 'zh',
        }),
      );
      await useSettingsStore.getState().loadSettings();
      const state = useSettingsStore.getState();
      expect(state.appSettings.temperature).toBe(0.5);
      expect(state.appSettings.language).toBe('zh');
      expect(state.appSettings.topP).toBe(0.95);
      expect(state.isSettingsLoaded).toBe(true);
    });

    it('loads OpenAI-compatible model settings without changing the Gemini model setting', async () => {
      vi.mocked(dbService.getAppSettings).mockResolvedValue(
        createStoredSettingsSnapshot({
          modelId: 'gemini-3.1-pro-preview',
          openaiCompatibleModelId: 'openai/custom-gpt',
          openaiCompatibleModels: [{ id: 'openai/custom-gpt', name: 'Custom GPT', isPinned: true }],
        }),
      );

      await useSettingsStore.getState().loadSettings();

      const { appSettings } = useSettingsStore.getState();
      expect(appSettings.modelId).toBe('gemini-3.1-pro-preview');
      const openai = appSettings.thirdPartyApi.connections.find((connection) => connection.id === 'openai');
      expect(openai?.modelId).toBe('openai/custom-gpt');
      expect(openai?.models).toEqual([{ id: 'openai/custom-gpt', name: 'Custom GPT', isPinned: true }]);
    });

    it('forces Gemini Native mode when stored settings have OpenAI-compatible API disabled', async () => {
      vi.mocked(dbService.getAppSettings).mockResolvedValue(
        createStoredSettingsSnapshot({
          apiMode: 'openai-compatible',
          isOpenAICompatibleApiEnabled: false,
          modelId: 'gemini-3.1-pro-preview',
          openaiCompatibleModelId: 'openai/custom-gpt',
          openaiCompatibleModels: [{ id: 'openai/custom-gpt', name: 'Custom GPT', isPinned: true }],
        }),
      );

      await useSettingsStore.getState().loadSettings();

      const { appSettings } = useSettingsStore.getState();
      expect(appSettings.providerId).toBe('gemini-native');
      expect(appSettings.thirdPartyApi.connections.find((connection) => connection.id === 'openai')?.modelId).toBe(
        'openai/custom-gpt',
      );
    });

    it('sets isSettingsLoaded when no stored settings', async () => {
      vi.mocked(dbService.getAppSettings).mockResolvedValue(undefined);
      await useSettingsStore.getState().loadSettings();
      expect(useSettingsStore.getState().isSettingsLoaded).toBe(true);
    });

    it('uses runtime-backed defaults when no stored settings exist', async () => {
      mockGetRuntimeConfigAppSettingsOverrides.mockReturnValue({
        serverManagedApi: true,
        useCustomApiConfig: true,
        useApiProxy: true,
        apiProxyUrl: 'https://runtime-proxy.example.com/v1beta',
      });
      useSettingsStore.setState((state) => ({
        ...state,
        appSettings: {
          ...state.appSettings,
          serverManagedApi: false,
          useCustomApiConfig: false,
          useApiProxy: false,
          apiProxyUrl: null,
        },
      }));
      vi.mocked(dbService.getAppSettings).mockResolvedValue(undefined);
      await useSettingsStore.getState().loadSettings();
      const { appSettings } = useSettingsStore.getState();
      expect(appSettings.useCustomApiConfig).toBe(true);
      expect(appSettings.useApiProxy).toBe(true);
      expect(appSettings.apiProxyUrl).toBe('https://runtime-proxy.example.com/v1beta');
      expect(appSettings.serverManagedApi).toBe(true);
    });

    it('handles DB errors gracefully', async () => {
      vi.mocked(dbService.getAppSettings).mockRejectedValue(new Error('DB fail'));
      await useSettingsStore.getState().loadSettings();
      expect(useSettingsStore.getState().isSettingsLoaded).toBe(true);
    });

    it('resolves system language to zh when browser is Chinese', async () => {
      const originalLang = navigator.language;
      Object.defineProperty(navigator, 'language', { value: 'zh-CN', configurable: true });
      vi.mocked(dbService.getAppSettings).mockResolvedValue(createStoredSettingsSnapshot({ language: 'system' }));
      await useSettingsStore.getState().loadSettings();
      expect(useSettingsStore.getState().language).toBe('zh');
      Object.defineProperty(navigator, 'language', { value: originalLang, configurable: true });
    });

    it('resolves system language to ja when browser is ja-JP', async () => {
      const originalLang = navigator.language;
      Object.defineProperty(navigator, 'language', { value: 'ja-JP', configurable: true });
      vi.mocked(dbService.getAppSettings).mockResolvedValue(createStoredSettingsSnapshot({ language: 'system' }));
      await useSettingsStore.getState().loadSettings();
      expect(useSettingsStore.getState().language).toBe('ja');
      Object.defineProperty(navigator, 'language', { value: originalLang, configurable: true });
    });

    it('resolves system language to fr for fr-FR browsers', async () => {
      const originalLang = navigator.language;
      Object.defineProperty(navigator, 'language', { value: 'fr-FR', configurable: true });
      vi.mocked(dbService.getAppSettings).mockResolvedValue(createStoredSettingsSnapshot({ language: 'system' }));
      await useSettingsStore.getState().loadSettings();
      expect(useSettingsStore.getState().language).toBe('fr');
      Object.defineProperty(navigator, 'language', { value: originalLang, configurable: true });
    });

    it('resolves system language to en for unsupported locales like it-IT', async () => {
      const originalLang = navigator.language;
      Object.defineProperty(navigator, 'language', { value: 'it-IT', configurable: true });
      vi.mocked(dbService.getAppSettings).mockResolvedValue(createStoredSettingsSnapshot({ language: 'system' }));
      await useSettingsStore.getState().loadSettings();
      expect(useSettingsStore.getState().language).toBe('en');
      Object.defineProperty(navigator, 'language', { value: originalLang, configurable: true });
    });

    it('preserves stored settings that reference legacy Gemini 2.5 preview models', async () => {
      vi.mocked(dbService.getAppSettings).mockResolvedValue(
        createStoredSettingsSnapshot({
          modelId: 'gemini-2.5-flash-preview-09-2025',
          transcriptionModelId: 'gemini-2.5-flash-lite-preview-09-2025',
        }),
      );

      await useSettingsStore.getState().loadSettings();

      const state = useSettingsStore.getState();
      expect(state.appSettings.modelId).toBe('gemini-2.5-flash-preview-09-2025');
      expect(state.appSettings.transcriptionModelId).toBe('gemini-2.5-flash-lite-preview-09-2025');
    });

    it('sanitizes thirdPartyApi: migrates configured providers and skips missing default slots', async () => {
      vi.mocked(dbService.getAppSettings).mockResolvedValue(
        createStoredSettingsSnapshot({
          thirdPartyApi: {
            providers: {
              openai: {
                apiKey: 'sk-openai',
                baseUrl: 'https://api.openai.com/v1',
                modelId: 'gpt-5.6-sol',
                models: [{ id: 'gpt-5.6-sol', name: 'GPT-5.6 Sol' }],
                protocol: 'openai-compatible',
                enabled: true,
              },
            } as unknown as Record<string, unknown>,
          } as unknown as AppSettings['thirdPartyApi'],
        }),
      );

      await useSettingsStore.getState().loadSettings();

      const { thirdPartyApi } = useSettingsStore.getState().appSettings;
      expect(thirdPartyApi.connections.map((connection) => connection.id)).toEqual(['openai']);
      expect(thirdPartyApi.connections.find((connection) => connection.id === 'deepseek')).toBeUndefined();
    });

    it('sanitizes thirdPartyApi: folds legacy openaiCompatible* fields into providers.openai', async () => {
      vi.mocked(dbService.getAppSettings).mockResolvedValue(
        createStoredSettingsSnapshot({
          openaiCompatibleApiKey: 'sk-legacy',
          openaiCompatibleBaseUrl: 'https://legacy.example.com/v1',
          openaiCompatibleModelId: 'legacy-gpt',
          openaiCompatibleModels: [{ id: 'legacy-gpt', name: 'Legacy GPT' }],
          thirdPartyApi: undefined as unknown as AppSettings['thirdPartyApi'],
        }),
      );

      await useSettingsStore.getState().loadSettings();

      const openai = useSettingsStore
        .getState()
        .appSettings.thirdPartyApi.connections.find((connection) => connection.id === 'openai');
      expect(openai?.apiKey).toBe('sk-legacy');
      expect(openai?.baseUrl).toBe('https://legacy.example.com/v1');
      expect(openai?.modelId).toBe('legacy-gpt');
      expect(openai?.models.some((model) => model.id === 'legacy-gpt')).toBe(true);
    });

    it('sanitizes thirdPartyApi: coerces protocol/enabled and dedupes models', async () => {
      vi.mocked(dbService.getAppSettings).mockResolvedValue(
        createStoredSettingsSnapshot({
          thirdPartyApi: {
            providers: {
              anthropic: {
                apiKey: 'sk-anthropic',
                baseUrl: 'https://api.anthropic.com',
                modelId: 'claude-fable-5',
                models: [
                  { id: 'claude-fable-5', name: 'Claude Fable 5' },
                  { id: 'claude-fable-5', name: 'Claude Fable 5' }, // duplicate
                ],
                protocol: 'invalid-protocol' as unknown as 'anthropic',
                enabled: 'yes' as unknown as boolean,
              },
            } as unknown as Record<string, unknown>,
          } as unknown as AppSettings['thirdPartyApi'],
        }),
      );

      await useSettingsStore.getState().loadSettings();

      const anthropic = useSettingsStore
        .getState()
        .appSettings.thirdPartyApi.connections.find((connection) => connection.id === 'anthropic');
      expect(anthropic?.protocol).toBe('anthropic');
      expect(anthropic?.enabled).toBe(false);
      expect(anthropic?.models.filter((model) => model.id === 'claude-fable-5')).toHaveLength(1);
    });
  });

  describe('broadcastSettingsUpdate', () => {
    it('calls broadcastSettingsUpdate', () => {
      expect(() => useSettingsStore.getState().broadcastSettingsUpdate()).not.toThrow();
    });
  });
});
