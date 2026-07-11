import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockGetRuntimeConfigAppSettingsOverrides, mockIsRuntimeApiConfigEnforced } = vi.hoisted(() => ({
  mockGetRuntimeConfigAppSettingsOverrides: vi.fn(() => ({})),
  mockIsRuntimeApiConfigEnforced: vi.fn(() => false),
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

import { DEFAULT_APP_SETTINGS } from '@/constants/settingsDefaults';
import { useSettingsStore } from './settingsStore';
import { dbService } from '@/services/db/dbService';
import { createTheme } from '@/test/data/factories';
import type { AppSettings } from '@/types';

const createStoredSettingsSnapshot = (overrides: Partial<AppSettings>): AppSettings => overrides as AppSettings;

describe('settingsStore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetRuntimeConfigAppSettingsOverrides.mockReturnValue({});
    mockIsRuntimeApiConfigEnforced.mockReturnValue(false);
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
  });

  describe('loadSettings', () => {
    it('defaults to Gemini Native API mode with isolated OpenAI-compatible settings', async () => {
      vi.mocked(dbService.getAppSettings).mockResolvedValue(undefined);

      await useSettingsStore.getState().loadSettings();

      const { appSettings } = useSettingsStore.getState();
      expect(appSettings.apiMode).toBe('gemini-native');
      expect(appSettings.isOpenAICompatibleApiEnabled).toBe(false);
      expect(appSettings.apiKey).toBeNull();
      expect(appSettings.openaiCompatibleApiKey).toBeNull();
      expect(appSettings.openaiCompatibleBaseUrl).toBe('https://api.openai.com/v1');
      expect(appSettings.modelId).toBe('gemini-3-flash-preview');
      expect(appSettings.openaiCompatibleModelId).toBe('gpt-5.5');
      expect(appSettings.openaiCompatibleModels).toEqual([{ id: 'gpt-5.5', name: 'GPT-5.5', isPinned: true }]);
    });

    it('provides English as the default input translation target language', async () => {
      vi.mocked(dbService.getAppSettings).mockResolvedValue(undefined);

      await useSettingsStore.getState().loadSettings();

      expect(useSettingsStore.getState().appSettings.translationTargetLanguage).toBe('English');
    });

    it('migrates the previous speech-to-text default to Gemini 3.5 Flash', async () => {
      vi.mocked(dbService.getAppSettings).mockResolvedValue(
        createStoredSettingsSnapshot({
          transcriptionModelId: 'gemini-3-flash-preview',
        }),
      );

      await useSettingsStore.getState().loadSettings();

      expect(useSettingsStore.getState().appSettings.transcriptionModelId).toBe('gemini-3.5-flash');
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
      expect(appSettings.openaiCompatibleModelId).toBe('openai/custom-gpt');
      expect(appSettings.openaiCompatibleModels).toEqual([
        { id: 'openai/custom-gpt', name: 'Custom GPT', isPinned: true },
      ]);
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
      expect(appSettings.isOpenAICompatibleApiEnabled).toBe(false);
      expect(appSettings.apiMode).toBe('gemini-native');
      expect(appSettings.openaiCompatibleModelId).toBe('openai/custom-gpt');
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

    it('overrides stale stored proxy settings when the runtime profile is enforced', async () => {
      mockIsRuntimeApiConfigEnforced.mockReturnValue(true);
      mockGetRuntimeConfigAppSettingsOverrides.mockReturnValue({
        serverManagedApi: true,
        useCustomApiConfig: true,
        useApiProxy: true,
        apiProxyUrl: '/api/gemini',
      });
      vi.mocked(dbService.getAppSettings).mockResolvedValue(
        createStoredSettingsSnapshot({
          serverManagedApi: false,
          useCustomApiConfig: false,
          useApiProxy: false,
          apiProxyUrl: 'https://old-ai-studio-proxy.example.com/v1beta',
        }),
      );

      await useSettingsStore.getState().loadSettings();

      expect(useSettingsStore.getState().appSettings).toMatchObject({
        serverManagedApi: true,
        useCustomApiConfig: true,
        useApiProxy: true,
        apiProxyUrl: '/api/gemini',
      });
    });

    it('clears stale server-managed mode for an enforced BYOK profile', async () => {
      mockIsRuntimeApiConfigEnforced.mockReturnValue(true);
      mockGetRuntimeConfigAppSettingsOverrides.mockReturnValue({
        serverManagedApi: false,
        useCustomApiConfig: true,
        useApiProxy: true,
        apiProxyUrl: '/api/gemini',
      });
      vi.mocked(dbService.getAppSettings).mockResolvedValue(
        createStoredSettingsSnapshot({
          serverManagedApi: true,
          useCustomApiConfig: false,
          useApiProxy: false,
          apiProxyUrl: null,
        }),
      );

      await useSettingsStore.getState().loadSettings();

      expect(useSettingsStore.getState().appSettings).toMatchObject({
        serverManagedApi: false,
        useCustomApiConfig: true,
        useApiProxy: true,
        apiProxyUrl: '/api/gemini',
      });
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
  });

  describe('broadcastSettingsUpdate', () => {
    it('calls broadcastSettingsUpdate', () => {
      expect(() => useSettingsStore.getState().broadcastSettingsUpdate()).not.toThrow();
    });
  });
});
