import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { createSyncedPersist } from './syncedPersist';
import { getVirtualMcpServers, type VirtualMcpServer } from '@/features/mcp/virtualMcpRegistry';
import type { McpRuntimeSelection } from './mcpRuntimeStore';

const VIRTUAL_MCP_STORAGE_KEY = 'all_model_chat_virtual_mcp_v1';
const { storage: virtualMcpSyncedStorage } = createSyncedPersist(VIRTUAL_MCP_STORAGE_KEY, {
  debounceMs: 150,
  enableCrossTabSync: false,
});

export interface VirtualMcpState {
  disabledServerIds: string[];
  isServerEnabled: (id: string) => boolean;
  setServerEnabled: (id: string, enabled: boolean) => void;
  toggleServerEnabled: (id: string) => void;
  getEnabledVirtualServers: () => VirtualMcpServer[];
}

export const useVirtualMcpStore = create<VirtualMcpState>()(
  persist(
    (set, get) => ({
      disabledServerIds: [],
      isServerEnabled: (id: string) => !get().disabledServerIds.includes(id),
      setServerEnabled: (id: string, enabled: boolean) =>
        set((state) => {
          const currentDisabled = state.disabledServerIds;
          if (enabled) {
            return { disabledServerIds: currentDisabled.filter((item) => item !== id) };
          }
          if (!currentDisabled.includes(id)) {
            return { disabledServerIds: [...currentDisabled, id] };
          }
          return state;
        }),
      toggleServerEnabled: (id: string) => {
        const currentlyEnabled = get().isServerEnabled(id);
        get().setServerEnabled(id, !currentlyEnabled);
      },
      getEnabledVirtualServers: () => {
        const disabled = new Set(get().disabledServerIds);
        return getVirtualMcpServers().filter((server) => !disabled.has(server.id));
      },
    }),
    {
      name: VIRTUAL_MCP_STORAGE_KEY,
      storage: createJSONStorage(() => virtualMcpSyncedStorage),
      partialize: (state) => ({
        disabledServerIds: state.disabledServerIds,
      }),
    },
  ),
);

/**
 * Checks whether a virtual server is active for the current chat turn
 * considering both global enable status and chat composer runtime selection.
 */
export const isVirtualServerActiveForTurn = (
  serverId: string,
  selection: Pick<McpRuntimeSelection, 'masterEnabled' | 'selectedServerIds'>,
  isGloballyEnabled = useVirtualMcpStore.getState().isServerEnabled(serverId),
): boolean => {
  if (!isGloballyEnabled) return false;
  if (!selection.masterEnabled) return false;
  if (selection.selectedServerIds === null) return true;
  return selection.selectedServerIds.includes(serverId);
};
