import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import {
  type MediaResolution,
  type ModelOption,
  type ThinkingLevel,
  normalizeModelApiModeTag,
  THINKING_LEVELS,
} from '@/types';
import { readPersistentStorageItem } from './persistentStorage';
import { createSyncedPersist, type PersistedStoreApi } from './syncedPersist';
import { safeJsonParse } from '@/utils/safeJsonParse';

const MODEL_PREFERENCES_STORE_STORAGE_KEY = 'all_model_chat_model_preferences_v1';
const { storage: modelPreferencesSyncedStorage, sync: syncModelPreferences } = createSyncedPersist(
  MODEL_PREFERENCES_STORE_STORAGE_KEY,
);

const LEGACY_CUSTOM_MODELS_KEY = 'custom_model_list_v1';
const LEGACY_MODEL_SETTINGS_CACHE_KEY = 'model_settings_cache';

export interface CachedModelSettings {
  mediaResolution?: MediaResolution;
  thinkingBudget?: number;
  thinkingLevel?: ThinkingLevel;
}

interface ModelPreferencesState {
  customModels: ModelOption[] | null;
  modelSettingsCache: Record<string, CachedModelSettings>;
  legacyModelPreferencesHydrated: boolean;
}

interface ModelPreferencesActions {
  hydrateLegacyModelPreferences: () => void;
  setCustomModels: (models: ModelOption[]) => void;
  getCachedModelSettings: (modelId: string) => CachedModelSettings | undefined;
  cacheModelSettings: (modelId: string, settings: CachedModelSettings) => void;
}

const parseJson = (rawValue: string | null): unknown => safeJsonParse(rawValue, undefined);

const normalizeModelOptions = (value: unknown): ModelOption[] | null => {
  if (!Array.isArray(value)) {
    return null;
  }

  const seenIds = new Set<string>();
  const models: ModelOption[] = [];

  value.forEach((candidate) => {
    if (!candidate || typeof candidate !== 'object') {
      return;
    }

    const model = candidate as Partial<ModelOption>;
    if (typeof model.id !== 'string' || !model.id || seenIds.has(model.id)) {
      return;
    }

    const apiModeTag = normalizeModelApiModeTag(model.apiMode);

    seenIds.add(model.id);
    models.push({
      id: model.id,
      name: typeof model.name === 'string' && model.name ? model.name : model.id,
      ...(typeof model.isPinned === 'boolean' ? { isPinned: model.isPinned } : {}),
      ...(apiModeTag ? { apiMode: apiModeTag } : {}),
    });
  });

  return models;
};

const isThinkingLevel = (value: unknown): value is ThinkingLevel =>
  typeof value === 'string' && (THINKING_LEVELS as readonly string[]).includes(value);

const normalizeModelSettingsCache = (value: unknown): Record<string, CachedModelSettings> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).flatMap(([modelId, candidate]) => {
      if (!candidate || typeof candidate !== 'object' || !modelId) {
        return [];
      }

      const settings = candidate as CachedModelSettings;
      const normalizedSettings: CachedModelSettings = {
        ...(typeof settings.mediaResolution === 'string' ? { mediaResolution: settings.mediaResolution } : {}),
        ...(typeof settings.thinkingBudget === 'number' ? { thinkingBudget: settings.thinkingBudget } : {}),
        ...(isThinkingLevel(settings.thinkingLevel) ? { thinkingLevel: settings.thinkingLevel } : {}),
      };

      return Object.keys(normalizedSettings).length > 0 ? [[modelId, normalizedSettings]] : [];
    }),
  );
};

const readLegacyModelPreferences = (): ModelPreferencesState => ({
  customModels: normalizeModelOptions(parseJson(readPersistentStorageItem(LEGACY_CUSTOM_MODELS_KEY))),
  modelSettingsCache: normalizeModelSettingsCache(
    parseJson(readPersistentStorageItem(LEGACY_MODEL_SETTINGS_CACHE_KEY)),
  ),
  legacyModelPreferencesHydrated: false,
});

export const useModelPreferencesStore = create<ModelPreferencesState & ModelPreferencesActions>()(
  persist(
    (set, get) => ({
      ...readLegacyModelPreferences(),

      hydrateLegacyModelPreferences: () =>
        set((state) => {
          if (state.legacyModelPreferencesHydrated) {
            return state;
          }

          const legacyPreferences = readLegacyModelPreferences();
          return {
            customModels: state.customModels ?? legacyPreferences.customModels,
            modelSettingsCache:
              Object.keys(state.modelSettingsCache).length > 0
                ? state.modelSettingsCache
                : legacyPreferences.modelSettingsCache,
            legacyModelPreferencesHydrated: true,
          };
        }),

      setCustomModels: (models) => set({ customModels: models }),

      getCachedModelSettings: (modelId) => get().modelSettingsCache[modelId],

      cacheModelSettings: (modelId, settings) => {
        if (!modelId) {
          return;
        }

        set((state) => ({
          modelSettingsCache: {
            ...state.modelSettingsCache,
            [modelId]: {
              ...state.modelSettingsCache[modelId],
              ...settings,
            },
          },
        }));
      },
    }),
    {
      name: MODEL_PREFERENCES_STORE_STORAGE_KEY,
      storage: createJSONStorage(() => modelPreferencesSyncedStorage),
      partialize: (state) => ({
        customModels: state.customModels,
        modelSettingsCache: state.modelSettingsCache,
      }),
    },
  ),
);

syncModelPreferences(useModelPreferencesStore as PersistedStoreApi);
