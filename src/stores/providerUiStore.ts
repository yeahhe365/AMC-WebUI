import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { DEFAULT_LIVE_ARTIFACTS_MODEL_ID } from '@/constants/modelConfiguration';
import type { ConnectionHealthProbeResult, LatencyGrade } from '@/utils/thirdPartyDiagnostics';
import { createSyncedPersist } from './syncedPersist';

export type ProviderListFilterMode = 'all' | 'enabled' | 'disabled';

export interface GeminiTestResult {
  status: 'success' | 'error';
  latencyMs: number | null;
  grade: LatencyGrade | null;
  message: string | null;
}

const PROVIDER_UI_STORE_STORAGE_KEY = 'all_model_chat_provider_ui_v1';
const { storage: providerUiSyncedStorage } = createSyncedPersist(PROVIDER_UI_STORE_STORAGE_KEY, {
  debounceMs: 150,
  enableCrossTabSync: false,
});

export interface ProviderUiState {
  selectedConnectionId: string | null;
  listFilterMode: ProviderListFilterMode;
  listSearchQuery: string;
  groupsCollapsedByConnection: Record<string, Record<string, boolean>>;
  modelSearchByConnection: Record<string, string>;
  isModelSearchOpenByConnection: Record<string, boolean>;
  isBatchModeByConnection: Record<string, boolean>;
  modelProbeResultsByConnection: Record<string, Record<string, ConnectionHealthProbeResult>>;
  healthResultByConnection: Record<string, ConnectionHealthProbeResult>;
  geminiTestModelId: string;
  geminiTestResult: GeminiTestResult | null;
}

export interface ProviderUiActions {
  setSelectedConnectionId: (id: string | null) => void;
  setListFilterMode: (mode: ProviderListFilterMode) => void;
  setListSearchQuery: (query: string) => void;
  setGroupCollapsed: (connectionId: string, groupKey: string, collapsed: boolean) => void;
  toggleGroupCollapse: (connectionId: string, groupKey: string) => void;
  setAllGroupsCollapsed: (connectionId: string, collapsedRecord: Record<string, boolean>) => void;
  setModelSearch: (connectionId: string, search: string) => void;
  setIsModelSearchOpen: (connectionId: string, isOpen: boolean) => void;
  setIsBatchMode: (connectionId: string, isBatch: boolean) => void;
  setModelProbeResult: (connectionId: string, modelId: string, result: ConnectionHealthProbeResult) => void;
  setModelProbeResults: (connectionId: string, results: Record<string, ConnectionHealthProbeResult>) => void;
  clearModelProbeResults: (connectionId: string) => void;
  setConnectionHealthResult: (connectionId: string, result: ConnectionHealthProbeResult | null) => void;
  setGeminiTestModelId: (modelId: string) => void;
  setGeminiTestResult: (result: GeminiTestResult | null) => void;
  cleanupConnectionUi: (connectionId: string) => void;
  resetProviderUiState: () => void;
}

export const DEFAULT_PROVIDER_UI_STATE: ProviderUiState = {
  selectedConnectionId: null,
  listFilterMode: 'all',
  listSearchQuery: '',
  groupsCollapsedByConnection: {},
  modelSearchByConnection: {},
  isModelSearchOpenByConnection: {},
  isBatchModeByConnection: {},
  modelProbeResultsByConnection: {},
  healthResultByConnection: {},
  geminiTestModelId: DEFAULT_LIVE_ARTIFACTS_MODEL_ID,
  geminiTestResult: null,
};

export const useProviderUiStore = create<ProviderUiState & ProviderUiActions>()(
  persist(
    (set) => ({
      ...DEFAULT_PROVIDER_UI_STATE,

      setSelectedConnectionId: (id) => set({ selectedConnectionId: id }),

      setListFilterMode: (mode) => set({ listFilterMode: mode }),

      setListSearchQuery: (query) => set({ listSearchQuery: query }),

      setGroupCollapsed: (connectionId, groupKey, collapsed) =>
        set((state) => {
          const current = state.groupsCollapsedByConnection[connectionId] || {};
          return {
            groupsCollapsedByConnection: {
              ...state.groupsCollapsedByConnection,
              [connectionId]: {
                ...current,
                [groupKey]: collapsed,
              },
            },
          };
        }),

      toggleGroupCollapse: (connectionId, groupKey) =>
        set((state) => {
          const current = state.groupsCollapsedByConnection[connectionId] || {};
          return {
            groupsCollapsedByConnection: {
              ...state.groupsCollapsedByConnection,
              [connectionId]: {
                ...current,
                [groupKey]: !current[groupKey],
              },
            },
          };
        }),

      setAllGroupsCollapsed: (connectionId, collapsedRecord) =>
        set((state) => ({
          groupsCollapsedByConnection: {
            ...state.groupsCollapsedByConnection,
            [connectionId]: collapsedRecord,
          },
        })),

      setModelSearch: (connectionId, search) =>
        set((state) => ({
          modelSearchByConnection: {
            ...state.modelSearchByConnection,
            [connectionId]: search,
          },
        })),

      setIsModelSearchOpen: (connectionId, isOpen) =>
        set((state) => ({
          isModelSearchOpenByConnection: {
            ...state.isModelSearchOpenByConnection,
            [connectionId]: isOpen,
          },
        })),

      setIsBatchMode: (connectionId, isBatch) =>
        set((state) => ({
          isBatchModeByConnection: {
            ...state.isBatchModeByConnection,
            [connectionId]: isBatch,
          },
        })),

      setModelProbeResult: (connectionId, modelId, result) =>
        set((state) => {
          const current = state.modelProbeResultsByConnection[connectionId] || {};
          return {
            modelProbeResultsByConnection: {
              ...state.modelProbeResultsByConnection,
              [connectionId]: {
                ...current,
                [modelId]: result,
              },
            },
          };
        }),

      setModelProbeResults: (connectionId, results) =>
        set((state) => ({
          modelProbeResultsByConnection: {
            ...state.modelProbeResultsByConnection,
            [connectionId]: results,
          },
        })),

      clearModelProbeResults: (connectionId) =>
        set((state) => {
          const next = { ...state.modelProbeResultsByConnection };
          delete next[connectionId];
          return { modelProbeResultsByConnection: next };
        }),

      setConnectionHealthResult: (connectionId, result) =>
        set((state) => {
          const next = { ...state.healthResultByConnection };
          if (result) {
            next[connectionId] = result;
          } else {
            delete next[connectionId];
          }
          return { healthResultByConnection: next };
        }),

      setGeminiTestModelId: (modelId) => set({ geminiTestModelId: modelId }),

      setGeminiTestResult: (result) => set({ geminiTestResult: result }),

      cleanupConnectionUi: (connectionId) =>
        set((state) => {
          const nextGroups = { ...state.groupsCollapsedByConnection };
          delete nextGroups[connectionId];

          const nextModelSearch = { ...state.modelSearchByConnection };
          delete nextModelSearch[connectionId];

          const nextIsModelSearchOpen = { ...state.isModelSearchOpenByConnection };
          delete nextIsModelSearchOpen[connectionId];

          const nextBatchMode = { ...state.isBatchModeByConnection };
          delete nextBatchMode[connectionId];

          const nextProbeResults = { ...state.modelProbeResultsByConnection };
          delete nextProbeResults[connectionId];

          const nextHealthResult = { ...state.healthResultByConnection };
          delete nextHealthResult[connectionId];

          return {
            groupsCollapsedByConnection: nextGroups,
            modelSearchByConnection: nextModelSearch,
            isModelSearchOpenByConnection: nextIsModelSearchOpen,
            isBatchModeByConnection: nextBatchMode,
            modelProbeResultsByConnection: nextProbeResults,
            healthResultByConnection: nextHealthResult,
            selectedConnectionId:
              state.selectedConnectionId === connectionId ? null : state.selectedConnectionId,
          };
        }),

      resetProviderUiState: () => set(DEFAULT_PROVIDER_UI_STATE),
    }),
    {
      name: PROVIDER_UI_STORE_STORAGE_KEY,
      storage: createJSONStorage(() => providerUiSyncedStorage),
      partialize: (state) => ({
        selectedConnectionId: state.selectedConnectionId,
        listFilterMode: state.listFilterMode,
        listSearchQuery: state.listSearchQuery,
        groupsCollapsedByConnection: state.groupsCollapsedByConnection,
        modelSearchByConnection: state.modelSearchByConnection,
        isModelSearchOpenByConnection: state.isModelSearchOpenByConnection,
        isBatchModeByConnection: state.isBatchModeByConnection,
        modelProbeResultsByConnection: state.modelProbeResultsByConnection,
        healthResultByConnection: state.healthResultByConnection,
        geminiTestModelId: state.geminiTestModelId,
        geminiTestResult: state.geminiTestResult,
      }),
    },
  ),
);
