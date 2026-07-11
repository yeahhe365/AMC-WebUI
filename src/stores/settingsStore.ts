import { create } from 'zustand';
import { type AppSettings } from '@/types';
import type { SyncMessage } from '@/types/sync';
import { type Theme } from '@/types/theme';
import { DEFAULT_FILES_API_CONFIG, getDefaultAppSettings } from '@/constants/settingsDefaults';
import { AVAILABLE_THEMES, DEFAULT_THEME_ID } from '@/constants/themeRegistry';
import { logService } from '@/services/logService';
import { resolveSupportedModelId, sanitizeModelOptions } from '@/utils/modelSorting';
import { dbService } from '@/services/db/dbService';
import { normalizeLiveArtifactsSystemPrompts } from '@/utils/liveArtifactsPromptSettings';
import { getRuntimeConfigAppSettingsOverrides, isRuntimeApiConfigEnforced } from '@/runtime/runtimeConfig';
import { type ConcreteThemeId } from '@/utils/themeMode';
import { resolveUpdaterOrValue, type UpdaterOrValue } from './stateUpdaters';
import { CHAT_SYNC_CHANNEL_NAME } from './chatSyncChannel';

const LEGACY_DEFAULT_TRANSCRIPTION_MODEL_ID = 'gemini-3-flash-preview';

interface SettingsState {
  appSettings: AppSettings;
  currentTheme: Theme;
  language: 'en' | 'zh';
  isSettingsLoaded: boolean;
  pendingPreloadSettingsOverrides: Partial<AppSettings> | null;
}

interface SettingsActions {
  setAppSettings: (value: UpdaterOrValue<AppSettings>) => void;
  loadSettings: () => Promise<void>;
  broadcastSettingsUpdate: () => void;
}

function resolveThemeId(themeId: string): ConcreteThemeId {
  if (themeId === 'system') {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'onyx' : 'pearl';
  }
  return themeId as ConcreteThemeId;
}

function resolveLanguage(language: string): 'en' | 'zh' {
  const settingLang = language || 'system';
  if (settingLang === 'system') {
    const browserLang = navigator.language.toLowerCase();
    return browserLang.startsWith('zh') ? 'zh' : 'en';
  }
  return settingLang as 'en' | 'zh';
}

function computeTheme(themeId: string): Theme {
  const resolvedId = resolveThemeId(themeId);
  return (
    AVAILABLE_THEMES.find((theme) => theme.id === resolvedId) ||
    AVAILABLE_THEMES.find((theme) => theme.id === DEFAULT_THEME_ID)!
  );
}

function sanitizeAppSettings(settings: AppSettings): AppSettings {
  const defaultSettings = getDefaultAppSettings();
  const isOpenAICompatibleApiEnabled =
    settings.isOpenAICompatibleApiEnabled ?? defaultSettings.isOpenAICompatibleApiEnabled;
  const isThirdPartyApiEnabled = settings.isThirdPartyApiEnabled === true;
  const sanitizedOpenAICompatibleModels = sanitizeModelOptions(
    settings.openaiCompatibleModels ?? defaultSettings.openaiCompatibleModels,
  );
  const openaiCompatibleModels =
    sanitizedOpenAICompatibleModels.length > 0
      ? sanitizedOpenAICompatibleModels
      : defaultSettings.openaiCompatibleModels;
  const enforcedRuntimeOverrides = isRuntimeApiConfigEnforced() ? getRuntimeConfigAppSettingsOverrides() : {};

  return {
    ...settings,
    apiMode: (() => {
      // Trust the explicitly-written apiMode; only normalize the legacy
      // 'openai-compatible' value. The per-mode enabling toggles
      // (isThirdPartyApiEnabled / isOpenAICompatibleApiEnabled) are validated at
      // read-time by isThirdPartyApiActive, so coupling them here breaks the
      // two-step writes that handleApiProviderChange performs.
      return settings.apiMode === 'openai-compatible' ? 'gemini-native' : settings.apiMode;
    })(),
    isOpenAICompatibleApiEnabled,
    isThirdPartyApiEnabled,
    modelId: resolveSupportedModelId(settings.modelId, defaultSettings.modelId),
    openaiCompatibleModelId: resolveSupportedModelId(
      settings.openaiCompatibleModelId,
      defaultSettings.openaiCompatibleModelId,
    ),
    openaiCompatibleModels,
    transcriptionModelId: resolveSupportedModelId(settings.transcriptionModelId, defaultSettings.transcriptionModelId),
    inputTranslationModelId: resolveSupportedModelId(
      settings.inputTranslationModelId,
      defaultSettings.inputTranslationModelId ?? defaultSettings.modelId,
    ),
    thoughtTranslationModelId: resolveSupportedModelId(
      settings.thoughtTranslationModelId,
      defaultSettings.thoughtTranslationModelId ?? defaultSettings.modelId,
    ),
    liveArtifactsSystemPrompts: normalizeLiveArtifactsSystemPrompts(settings),
    liveTranslateTargetLanguageCode: settings.liveTranslateTargetLanguageCode ?? defaultSettings.liveTranslateTargetLanguageCode,
    liveTranslateEchoTargetLanguage: settings.liveTranslateEchoTargetLanguage ?? defaultSettings.liveTranslateEchoTargetLanguage,
    ...enforcedRuntimeOverrides,
  };
}

let settingsChannel: BroadcastChannel | null = null;

function collectChangedSettings(previous: AppSettings, next: AppSettings): Partial<AppSettings> {
  const changedEntries = Object.keys(next)
    .filter((key) => !Object.is(previous[key as keyof AppSettings], next[key as keyof AppSettings]))
    .map((key) => [key, next[key as keyof AppSettings]]);

  return Object.fromEntries(changedEntries) as Partial<AppSettings>;
}

function getSettingsChannel(): BroadcastChannel | null {
  if (typeof BroadcastChannel === 'undefined') {
    return null;
  }

  if (!settingsChannel) {
    settingsChannel = new BroadcastChannel(CHAT_SYNC_CHANNEL_NAME);
  }

  return settingsChannel;
}

function buildDefaultSettingsState() {
  const appSettings = getDefaultAppSettings();
  return {
    appSettings,
    currentTheme: computeTheme(appSettings.themeId),
    language: resolveLanguage(appSettings.language),
  };
}

function buildLoadedAppSettings(
  storedSettings: AppSettings | null | undefined,
  preloadOverrides: Partial<AppSettings> | null,
) {
  const defaultSettings = getDefaultAppSettings();
  const shouldMigrateLegacyTranscriptionDefault =
    storedSettings?.transcriptionModelId === LEGACY_DEFAULT_TRANSCRIPTION_MODEL_ID &&
    preloadOverrides?.transcriptionModelId === undefined;
  const appSettings = sanitizeAppSettings({
    ...defaultSettings,
    ...(storedSettings ?? {}),
    ...(shouldMigrateLegacyTranscriptionDefault ? { transcriptionModelId: defaultSettings.transcriptionModelId } : {}),
    ...(preloadOverrides ?? {}),
  });

  if (storedSettings?.filesApiConfig) {
    appSettings.filesApiConfig = { ...DEFAULT_FILES_API_CONFIG, ...storedSettings.filesApiConfig };
  }

  if (preloadOverrides?.filesApiConfig) {
    appSettings.filesApiConfig = {
      ...(appSettings.filesApiConfig ?? DEFAULT_FILES_API_CONFIG),
      ...preloadOverrides.filesApiConfig,
    };
  }

  return appSettings;
}

function persistLoadedPreloadOverrides(newSettings: AppSettings, preloadOverrides: Partial<AppSettings> | null) {
  if (!preloadOverrides) {
    return;
  }

  dbService
    .setAppSettings(newSettings)
    .then(() => getSettingsChannel()?.postMessage({ type: 'SETTINGS_UPDATED' }))
    .catch((settingsSaveError) => logService.error('Failed to save settings', { error: settingsSaveError }));
}

export const useSettingsStore = create<SettingsState & SettingsActions>((set) => ({
  ...buildDefaultSettingsState(),
  isSettingsLoaded: false,
  pendingPreloadSettingsOverrides: null,

  setAppSettings: (value) => {
    set((state) => {
      const next = resolveUpdaterOrValue(value, state.appSettings);
      const sanitizedNext = sanitizeAppSettings(next);
      const currentTheme = computeTheme(sanitizedNext.themeId);
      const language = resolveLanguage(sanitizedNext.language);

      if (state.isSettingsLoaded) {
        dbService
          .setAppSettings(sanitizedNext)
          .then(() => getSettingsChannel()?.postMessage({ type: 'SETTINGS_UPDATED' }))
          .catch((settingsSaveError) => logService.error('Failed to save settings', { error: settingsSaveError }));
        return {
          appSettings: sanitizedNext,
          currentTheme,
          language,
          pendingPreloadSettingsOverrides: null,
        };
      } else {
        const changedSettings = collectChangedSettings(state.appSettings, sanitizedNext);
        return {
          appSettings: sanitizedNext,
          currentTheme,
          language,
          pendingPreloadSettingsOverrides: {
            ...(state.pendingPreloadSettingsOverrides ?? {}),
            ...changedSettings,
          },
        };
      }
    });
  },

  loadSettings: async () => {
    try {
      const storedSettings = await dbService.getAppSettings();
      const preloadOverrides = useSettingsStore.getState().pendingPreloadSettingsOverrides;
      const newSettings = buildLoadedAppSettings(storedSettings, preloadOverrides);

      set({
        appSettings: newSettings,
        currentTheme: computeTheme(newSettings.themeId),
        language: resolveLanguage(newSettings.language),
        isSettingsLoaded: true,
        pendingPreloadSettingsOverrides: null,
      });
      persistLoadedPreloadOverrides(newSettings, preloadOverrides);
    } catch (error) {
      logService.error('Failed to load settings from IndexedDB', { error });
      set({ isSettingsLoaded: true });
    }
  },

  broadcastSettingsUpdate: () => {
    getSettingsChannel()?.postMessage({ type: 'SETTINGS_UPDATED' });
  },
}));

if (typeof BroadcastChannel !== 'undefined') {
  const channel = getSettingsChannel();
  if (channel) {
    channel.onmessage = (event: MessageEvent<SyncMessage>) => {
      const syncMessage = event.data;
      if (syncMessage.type === 'SETTINGS_UPDATED') {
        logService.info('[Sync] Reloading settings from DB');
        useSettingsStore.getState().loadSettings();
      }
    };
  }
}

if (typeof window !== 'undefined') {
  const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
  mediaQuery.addEventListener('change', () => {
    const { appSettings } = useSettingsStore.getState();
    if (appSettings.themeId === 'system') {
      const currentTheme = computeTheme(appSettings.themeId);
      useSettingsStore.setState({ currentTheme });
    }
  });
}
