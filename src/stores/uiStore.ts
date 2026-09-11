import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { DESKTOP_BREAKPOINT_PX } from '@/constants/layout';
import { readPersistentStorageItem } from './persistentStorage';
import { createSyncedPersist } from './syncedPersist';
import { resolveUpdaterOrValue, type UpdaterOrValue } from './stateUpdaters';
import { safeJsonParse } from '@/utils/safeJsonParse';
import { ACTIVE_CHAT_SESSION_ID_KEY } from '@/constants/storageKeys';
import {
  registerActiveViewGetter,
  syncActiveSessionRoute,
  syncLibraryRoute,
  type SessionHistoryMode,
} from './sessionRouteSync';

const UI_PREFERENCES_STORAGE_KEY = 'all_model_chat_ui_preferences_v1';
const { storage: uiSyncedStorage } = createSyncedPersist(UI_PREFERENCES_STORAGE_KEY, {
  enableCrossTabSync: false,
});
const LEGACY_HISTORY_SIDEBAR_STORAGE_KEY = 'all_model_chat_history_sidebar_v1';

type HistorySidebarPreferences = {
  desktopOpen: boolean;
  mobileOpen: boolean;
};

const DEFAULT_HISTORY_SIDEBAR_PREFERENCES: HistorySidebarPreferences = {
  desktopOpen: true,
  mobileOpen: false,
};

const isDesktopViewport = () => (typeof window !== 'undefined' ? window.innerWidth >= DESKTOP_BREAKPOINT_PX : true);

const readHistorySidebarPreferences = (): HistorySidebarPreferences => {
  const raw = readPersistentStorageItem(LEGACY_HISTORY_SIDEBAR_STORAGE_KEY);
  const parsed = safeJsonParse<Partial<HistorySidebarPreferences>>(raw, {});
  return {
    desktopOpen:
      typeof parsed.desktopOpen === 'boolean' ? parsed.desktopOpen : DEFAULT_HISTORY_SIDEBAR_PREFERENCES.desktopOpen,
    mobileOpen:
      typeof parsed.mobileOpen === 'boolean' ? parsed.mobileOpen : DEFAULT_HISTORY_SIDEBAR_PREFERENCES.mobileOpen,
  };
};

const buildInitialHistorySidebarState = () => {
  const preferences = readHistorySidebarPreferences();
  return {
    desktopHistorySidebarOpen: preferences.desktopOpen,
    mobileHistorySidebarOpen: preferences.mobileOpen,
    isHistorySidebarOpen: isDesktopViewport() ? preferences.desktopOpen : preferences.mobileOpen,
  };
};

export type HistoryDisplayMode = 'group' | 'time';

interface UIState {
  isSettingsModalOpen: boolean;
  isPreloadedMessagesModalOpen: boolean;
  isHistorySidebarOpen: boolean;
  desktopHistorySidebarOpen: boolean;
  mobileHistorySidebarOpen: boolean;
  isLogViewerOpen: boolean;
  chatInputHeight: number;
  historyDisplayMode: HistoryDisplayMode;
  activeView: 'chat' | 'library';
  isCommandPaletteOpen: boolean;
}

export type SetActiveViewOptions = {
  history?: SessionHistoryMode;
};

interface UIActions {
  setIsSettingsModalOpen: (value: UpdaterOrValue<boolean>) => void;
  setIsPreloadedMessagesModalOpen: (value: UpdaterOrValue<boolean>) => void;
  setIsHistorySidebarOpen: (value: UpdaterOrValue<boolean>) => void;
  setIsHistorySidebarOpenTransient: (value: UpdaterOrValue<boolean>) => void;
  syncHistorySidebarForViewport: () => void;
  setIsLogViewerOpen: (value: UpdaterOrValue<boolean>) => void;
  toggleHistorySidebar: () => void;
  setChatInputHeight: (height: number) => void;
  setHistoryDisplayMode: (mode: HistoryDisplayMode) => void;
  setActiveView: (view: 'chat' | 'library', options?: SetActiveViewOptions) => void;
  setIsCommandPaletteOpen: (value: UpdaterOrValue<boolean>) => void;
  toggleCommandPalette: () => void;
}

type PersistedUiPreferences = Pick<
  UIState,
  'desktopHistorySidebarOpen' | 'mobileHistorySidebarOpen' | 'historyDisplayMode'
>;

const mergePersistedUiPreferences = (
  persistedState: unknown,
  currentState: UIState & UIActions,
): UIState & UIActions => {
  const persistedPreferences = (persistedState ?? {}) as Partial<PersistedUiPreferences>;
  const desktopHistorySidebarOpen =
    typeof persistedPreferences.desktopHistorySidebarOpen === 'boolean'
      ? persistedPreferences.desktopHistorySidebarOpen
      : currentState.desktopHistorySidebarOpen;
  const mobileHistorySidebarOpen =
    typeof persistedPreferences.mobileHistorySidebarOpen === 'boolean'
      ? persistedPreferences.mobileHistorySidebarOpen
      : currentState.mobileHistorySidebarOpen;
  const historyDisplayMode =
    persistedPreferences.historyDisplayMode === 'time' || persistedPreferences.historyDisplayMode === 'group'
      ? persistedPreferences.historyDisplayMode
      : currentState.historyDisplayMode;

  return {
    ...currentState,
    desktopHistorySidebarOpen,
    mobileHistorySidebarOpen,
    historyDisplayMode,
    isHistorySidebarOpen: isDesktopViewport() ? desktopHistorySidebarOpen : mobileHistorySidebarOpen,
  };
};

const resolveInitialActiveView = (): 'chat' | 'library' => {
  if (typeof window !== 'undefined' && window.location.pathname === '/library') {
    return 'library';
  }
  return 'chat';
};

export const useUIStore = create<UIState & UIActions>()(
  persist(
    (set, get) => ({
      isSettingsModalOpen: false,
      isPreloadedMessagesModalOpen: false,
      ...buildInitialHistorySidebarState(),
      historyDisplayMode: 'group' as HistoryDisplayMode,
      isLogViewerOpen: false,
      chatInputHeight: 160,
      activeView: resolveInitialActiveView(),
      isCommandPaletteOpen: false,

      setIsSettingsModalOpen: (value) =>
        set((state) => ({
          isSettingsModalOpen: resolveUpdaterOrValue(value, state.isSettingsModalOpen),
        })),
      setIsPreloadedMessagesModalOpen: (value) =>
        set((state) => ({
          isPreloadedMessagesModalOpen: resolveUpdaterOrValue(value, state.isPreloadedMessagesModalOpen),
        })),
      setIsHistorySidebarOpen: (value) =>
        set((state) => {
          const nextIsOpen = resolveUpdaterOrValue(value, state.isHistorySidebarOpen);
          const isDesktop = isDesktopViewport();

          return isDesktop
            ? {
                isHistorySidebarOpen: nextIsOpen,
                desktopHistorySidebarOpen: nextIsOpen,
              }
            : {
                isHistorySidebarOpen: nextIsOpen,
                mobileHistorySidebarOpen: nextIsOpen,
              };
        }),
      setIsHistorySidebarOpenTransient: (value) =>
        set((state) => ({
          isHistorySidebarOpen: resolveUpdaterOrValue(value, state.isHistorySidebarOpen),
        })),
      syncHistorySidebarForViewport: () =>
        set((state) => ({
          isHistorySidebarOpen: isDesktopViewport() ? state.desktopHistorySidebarOpen : state.mobileHistorySidebarOpen,
        })),
      setIsLogViewerOpen: (value) =>
        set((state) => ({
          isLogViewerOpen: resolveUpdaterOrValue(value, state.isLogViewerOpen),
        })),
      toggleHistorySidebar: () => get().setIsHistorySidebarOpen((isOpen) => !isOpen),
      setChatInputHeight: (height) => set({ chatInputHeight: height }),
      setHistoryDisplayMode: (mode) => set({ historyDisplayMode: mode }),
      setActiveView: (view, options) => {
        set({ activeView: view });
        const historyMode = options?.history ?? 'auto';
        if (historyMode === 'none') {
          return;
        }
        if (view === 'library') {
          syncLibraryRoute(historyMode);
        } else {
          const storedSessionId =
            typeof window !== 'undefined' ? sessionStorage.getItem(ACTIVE_CHAT_SESSION_ID_KEY) : null;
          syncActiveSessionRoute(storedSessionId, historyMode, { force: true });
        }
      },
      setIsCommandPaletteOpen: (value) =>
        set((state) => ({
          isCommandPaletteOpen: resolveUpdaterOrValue(value, state.isCommandPaletteOpen),
        })),
      toggleCommandPalette: () => get().setIsCommandPaletteOpen((isOpen) => !isOpen),
    }),
    {
      name: UI_PREFERENCES_STORAGE_KEY,
      // Sidebar open/closed is tab chrome — keep per-tab, no cross-tab rehydrate.
      storage: createJSONStorage(() => uiSyncedStorage),
      partialize: (state) => ({
        desktopHistorySidebarOpen: state.desktopHistorySidebarOpen,
        mobileHistorySidebarOpen: state.mobileHistorySidebarOpen,
        historyDisplayMode: state.historyDisplayMode,
      }),
      merge: mergePersistedUiPreferences,
    },
  ),
);

registerActiveViewGetter(() => useUIStore.getState().activeView);
