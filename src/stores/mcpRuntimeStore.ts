import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { McpServerConfig } from '../../shared/mcpServerConfig';
import { createSyncedPersist } from './syncedPersist';

const MCP_RUNTIME_STORAGE_KEY = 'all_model_chat_mcp_runtime_v1';
const { storage: mcpRuntimeSyncedStorage } = createSyncedPersist(MCP_RUNTIME_STORAGE_KEY, {
  debounceMs: 150,
  enableCrossTabSync: false,
});

export interface McpRuntimeSelection {
  masterEnabled: boolean;
  /** null = every enabled server; otherwise exactly these ids. */
  selectedServerIds: string[] | null;
}

export interface McpRuntimeActions {
  toggleMaster: () => void;
  toggleServer: (id: string, allIds: string[]) => void;
  /** Re-enables MCP from the off state, activating exactly the clicked server. */
  wakeWithServer: (id: string) => void;
  /** Restores "every enabled server" semantics; wakes MCP if it was off. */
  selectAllServers: () => void;
}

export const useMcpRuntimeStore = create<McpRuntimeSelection & McpRuntimeActions>()(
  persist(
    (set) => ({
      masterEnabled: true,
      selectedServerIds: null,
      toggleMaster: () => set((state) => ({ masterEnabled: !state.masterEnabled })),
      wakeWithServer: (id) => set({ masterEnabled: true, selectedServerIds: [id] }),
      selectAllServers: () => set({ masterEnabled: true, selectedServerIds: null }),
      toggleServer: (id, allIds) =>
        set((state) => {
          const base = state.selectedServerIds ?? [...allIds];
          const next = base.includes(id) ? base.filter((entry) => entry !== id) : [...base, id];
          // Back to "everything" semantics when nothing is excluded.
          return {
            selectedServerIds:
              next.length === 0 || next.length === allIds.length ? (next.length === 0 ? [] : null) : next,
          };
        }),
    }),
    {
      name: MCP_RUNTIME_STORAGE_KEY,
      storage: createJSONStorage(() => mcpRuntimeSyncedStorage),
      partialize: (state) => ({
        masterEnabled: state.masterEnabled,
        selectedServerIds: state.selectedServerIds,
      }),
    },
  ),
);

export const selectServersForTurn = (
  servers: McpServerConfig[],
  selection: Pick<McpRuntimeSelection, 'masterEnabled' | 'selectedServerIds'>,
): McpServerConfig[] => {
  if (!selection.masterEnabled) return [];
  const enabled = servers.filter((server) => server.enabled);
  if (selection.selectedServerIds === null) return enabled;
  const picked = new Set(selection.selectedServerIds);
  return enabled.filter((server) => picked.has(server.id));
};
