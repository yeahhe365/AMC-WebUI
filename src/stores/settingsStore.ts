import { create } from 'zustand';
import { type AppSettings, normalizeProviderId } from '@/types';
import type { SyncMessage } from '@/types/sync';
import { type Theme } from '@/types/theme';
import { DEFAULT_FILES_API_CONFIG, getDefaultAppSettings } from '@/constants/settingsDefaults';
import { AVAILABLE_THEMES, DEFAULT_THEME_ID } from '@/constants/themeRegistry';
import { logService } from '@/services/logService';
import { resolveAppLanguage, type SupportedLanguage } from '@/i18n/languageRegistry';
import { migrateRemovedModelId } from '@/constants/modelConfiguration';
import { resolveSupportedModelId } from '@/utils/model/modelSorting';
import { dbService } from '@/services/db/dbService';
import { normalizeLiveArtifactsSystemPrompts } from '@/utils/live-artifacts/liveArtifactsPromptSettings';
import { sanitizeThirdPartyApiSettings } from '@/utils/thirdPartyApiProviders';
import { migrateLegacyAutoOpenHtmlPreview, migrateLegacyOpenAICompatibleInput } from '@/schemas/appSettingsSchema';
import { type ConcreteThemeId } from '@/utils/themeMode';
import { resolveUpdaterOrValue, type UpdaterOrValue } from './stateUpdaters';
import { CHAT_SYNC_CHANNEL_NAME } from './chatSyncChannel';

const LEGACY_DEFAULT_TRANSCRIPTION_MODEL_ID = 'gemini-3-flash-preview';

interface SettingsState {
  appSettings: AppSettings;
  currentTheme: Theme;
  language: SupportedLanguage;
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

function resolveLanguage(language: string): SupportedLanguage {
  return resolveAppLanguage(language);
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

  return {
    ...settings,
    providerId: normalizeProviderId(settings.providerId),
    modelId: resolveSupportedModelId(settings.modelId, defaultSettings.modelId),
    transcriptionModelId: resolveSupportedModelId(settings.transcriptionModelId, defaultSettings.transcriptionModelId),
    inputTranslationModelId: resolveSupportedModelId(
      settings.inputTranslationModelId,
      defaultSettings.inputTranslationModelId ?? defaultSettings.modelId,
    ),
    thoughtTranslationModelId: resolveSupportedModelId(
      settings.thoughtTranslationModelId,
      defaultSettings.thoughtTranslationModelId ?? defaultSettings.modelId,
    ),
    selectionAskModelId: (() => {
      const raw = settings.selectionAskModelId;
      if (typeof raw !== 'string' || !raw.trim()) return defaultSettings.selectionAskModelId;
      return migrateRemovedModelId(raw) ?? raw;
    })(),
    selectionAskProviderId: (() => {
      const rawModel = settings.selectionAskModelId;
      const hasModel = typeof rawModel === 'string' && rawModel.trim().length > 0;
      if (!hasModel) return undefined;
      return normalizeProviderId(settings.selectionAskProviderId);
    })(),
    tabModelCycleIds: (() => {
      const cycleIds = settings.tabModelCycleIds ?? defaultSettings.tabModelCycleIds;
      if (!cycleIds?.length) {
        return cycleIds;
      }
      const seen = new Set<string>();
      return cycleIds
        .map((id) => migrateRemovedModelId(id) ?? id)
        .filter((id) => {
          if (seen.has(id)) {
            return false;
          }
          seen.add(id);
          return true;
        });
    })(),
    liveArtifactsSystemPrompts: normalizeLiveArtifactsSystemPrompts(settings),
    liveTranslateTargetLanguageCode:
      settings.liveTranslateTargetLanguageCode ?? defaultSettings.liveTranslateTargetLanguageCode,
    liveTranslateEchoTargetLanguage:
      settings.liveTranslateEchoTargetLanguage ?? defaultSettings.liveTranslateEchoTargetLanguage,
    // Sanitize the third-party provider map on every load and save path: it is
    // otherwise spread verbatim, so a persisted record missing a provider entry
    // (or carrying a non-boolean enabled / wrong protocol) would silently fall
    // back to defaults and then be permanently overwritten on the next panel
    // edit. sanitizeThirdPartyApiSettings backfills missing providers, coerces
    // enabled to a strict boolean, validates protocol, and dedupes models.
    thirdPartyApi: sanitizeThirdPartyApiSettings(settings.thirdPartyApi),
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
  // Fold legacy stored keys: autoFullscreenHtml → autoOpenHtmlPreview, then
  // legacy top-level openaiCompatible* fields into thirdPartyApi.providers.openai.
  const migratedStoredSettings = migrateLegacyOpenAICompatibleInput(
    migrateLegacyAutoOpenHtmlPreview(storedSettings ?? {}),
  );
  const appSettings = sanitizeAppSettings({
    ...defaultSettings,
    ...migratedStoredSettings,
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

      // Mirror the toggle into the log gate on every save path (loaded and
      // preload branches both land here).
      logService.setEnabled(sanitizedNext.isLoggingEnabled ?? false);

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
      // Open/close the logging gate to match the loaded setting. The gate
      // defaults to off in the service, so a fresh profile or a load that
      // omitted the field (schema backfills false) stays silent until the
      // user opts in.
      logService.setEnabled(newSettings.isLoggingEnabled ?? false);
      persistLoadedPreloadOverrides(newSettings, preloadOverrides);
    } catch (error) {
      logService.error('Failed to load settings from IndexedDB', { error });
      logService.setEnabled(false);
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
