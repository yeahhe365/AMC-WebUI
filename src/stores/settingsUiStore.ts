import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { readPersistentStorageItem } from './persistentStorage';
import { createSyncedPersist } from './syncedPersist';

export type SettingsTab = 'models' | 'interface' | 'api' | 'mcp' | 'data' | 'shortcuts' | 'about';
export type SettingsTabDescriptor = { id: SettingsTab; labelKey: string };

const SETTINGS_UI_STORE_STORAGE_KEY = 'all_model_chat_settings_ui_v1';
const { storage: settingsUiSyncedStorage } = createSyncedPersist(SETTINGS_UI_STORE_STORAGE_KEY, {
  debounceMs: 150,
  enableCrossTabSync: false,
});

const LEGACY_SETTINGS_TAB_STORAGE_KEY = 'chatSettingsLastTab';
export const SETTINGS_TABS: SettingsTab[] = ['models', 'interface', 'api', 'mcp', 'data', 'shortcuts', 'about'];

interface SettingsUiState {
  activeTab: SettingsTab;
  scrollPositions: Partial<Record<SettingsTab, number>>;
  legacySettingsUiHydrated: boolean;
  isAdvancedModeEnabled: boolean;
}

interface SettingsUiActions {
  hydrateLegacySettingsUiPreferences: () => void;
  setActiveTab: (tab: SettingsTab) => void;
  setScrollPosition: (tab: SettingsTab, scrollTop: number) => void;
  setIsAdvancedModeEnabled: (enabled: boolean) => void;
  toggleAdvancedMode: () => void;
}

const normalizeSettingsTab = (savedTab: string | null): SettingsTab | null => {
  switch (savedTab) {
    case 'model':
    case 'chat':
    case 'models':
    case 'generation':
    case 'languageVoice':
    case 'canvas':
    case 'safety':
      return 'models';
    case 'interface':
      return 'interface';
    case 'shortcuts':
      return 'shortcuts';
    case 'api':
    case 'account':
      return 'api';
    case 'mcp':
      return 'mcp';
    case 'data':
      return 'data';
    case 'about':
      return 'about';
    default:
      return null;
  }
};

const readLegacyActiveTab = () =>
  normalizeSettingsTab(readPersistentStorageItem(LEGACY_SETTINGS_TAB_STORAGE_KEY)) ?? 'models';

const readLegacyScrollPositions = (): Partial<Record<SettingsTab, number>> => {
  const scrollPositions: Partial<Record<SettingsTab, number>> = {};

  SETTINGS_TABS.forEach((tab) => {
    const rawPosition = readPersistentStorageItem(`chatSettingsScroll_${tab}`);
    if (!rawPosition) {
      return;
    }

    const position = Number.parseInt(rawPosition, 10);
    if (Number.isFinite(position) && position >= 0) {
      scrollPositions[tab] = position;
    }
  });

  return scrollPositions;
};

const buildInitialSettingsUiState = (): SettingsUiState => ({
  activeTab: readLegacyActiveTab(),
  scrollPositions: readLegacyScrollPositions(),
  legacySettingsUiHydrated: false,
  isAdvancedModeEnabled: false,
});

export const useSettingsUiStore = create<SettingsUiState & SettingsUiActions>()(
  persist(
    (set) => ({
      ...buildInitialSettingsUiState(),

      hydrateLegacySettingsUiPreferences: () =>
        set((state) => {
          if (state.legacySettingsUiHydrated) {
            return state;
          }

          return {
            activeTab: state.activeTab === 'models' ? readLegacyActiveTab() : state.activeTab,
            scrollPositions: {
              ...readLegacyScrollPositions(),
              ...state.scrollPositions,
            },
            legacySettingsUiHydrated: true,
          };
        }),

      setActiveTab: (tab) => set({ activeTab: tab }),

      setScrollPosition: (tab, scrollTop) =>
        set((state) => ({
          scrollPositions: {
            ...state.scrollPositions,
            [tab]: Math.max(0, Math.round(scrollTop)),
          },
        })),

      setIsAdvancedModeEnabled: (enabled) => set({ isAdvancedModeEnabled: enabled }),

      toggleAdvancedMode: () => set((state) => ({ isAdvancedModeEnabled: !state.isAdvancedModeEnabled })),
    }),
    {
      name: SETTINGS_UI_STORE_STORAGE_KEY,
      // Tab-private UI chrome (active tab, scroll, advanced toggle).
      storage: createJSONStorage(() => settingsUiSyncedStorage),
      partialize: (state) => ({
        activeTab: state.activeTab,
        scrollPositions: state.scrollPositions,
        isAdvancedModeEnabled: state.isAdvancedModeEnabled,
      }),
    },
  ),
);
