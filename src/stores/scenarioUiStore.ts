import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { ScenarioCategory } from '@/types';
import { createSyncedPersist } from './syncedPersist';

export type ScenarioOwnerScope = 'mine' | 'builtin';

const SCENARIO_UI_STORE_STORAGE_KEY = 'all_model_chat_scenario_ui_v1';
const { storage: scenarioUiSyncedStorage } = createSyncedPersist(SCENARIO_UI_STORE_STORAGE_KEY, {
  debounceMs: 150,
  enableCrossTabSync: false,
});

export interface ScenarioUiState {
  ownerScope: ScenarioOwnerScope;
  activeCategory: ScenarioCategory | 'all';
  searchQuery: string;
  scrollPositions: Partial<Record<ScenarioOwnerScope, number>>;
}

export interface ScenarioUiActions {
  setOwnerScope: (scope: ScenarioOwnerScope) => void;
  setActiveCategory: (category: ScenarioCategory | 'all') => void;
  setSearchQuery: (query: string) => void;
  setScrollPosition: (scope: ScenarioOwnerScope, scrollTop: number) => void;
  resetScenarioUiState: () => void;
}

const DEFAULT_SCENARIO_UI_STATE: ScenarioUiState = {
  ownerScope: 'builtin',
  activeCategory: 'all',
  searchQuery: '',
  scrollPositions: {},
};

export const useScenarioUiStore = create<ScenarioUiState & ScenarioUiActions>()(
  persist(
    (set) => ({
      ...DEFAULT_SCENARIO_UI_STATE,

      setOwnerScope: (scope) => set({ ownerScope: scope }),

      setActiveCategory: (category) => set({ activeCategory: category }),

      setSearchQuery: (query) => set({ searchQuery: query }),

      setScrollPosition: (scope, scrollTop) =>
        set((state) => ({
          scrollPositions: {
            ...state.scrollPositions,
            [scope]: Math.max(0, Math.round(scrollTop)),
          },
        })),

      resetScenarioUiState: () => set(DEFAULT_SCENARIO_UI_STATE),
    }),
    {
      name: SCENARIO_UI_STORE_STORAGE_KEY,
      storage: createJSONStorage(() => scenarioUiSyncedStorage),
      partialize: (state) => ({
        ownerScope: state.ownerScope,
        activeCategory: state.activeCategory,
        searchQuery: state.searchQuery,
        scrollPositions: state.scrollPositions,
      }),
    },
  ),
);
