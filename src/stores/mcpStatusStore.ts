import { create } from 'zustand';

export type McpServerState = 'connected' | 'connecting' | 'error' | 'disabled';

export interface McpStatus {
  state: McpServerState;
  lastError?: string;
  lastCheckedAt: number;
  version?: string;
}

interface Store {
  states: Record<string, McpStatus>;
  setStatus: (id: string, patch: Partial<McpStatus> & { state: McpServerState }) => void;
  getStatus: (id: string) => McpStatus | undefined;
}

export const useMcpStatusStore = create<Store>((set, get) => ({
  states: {},
  setStatus: (id, patch) =>
    set((s) => ({
      states: {
        ...s.states,
        [id]: {
          ...(s.states[id] ?? ({ lastCheckedAt: 0 } as McpStatus)),
          ...patch,
          lastCheckedAt: patch.lastCheckedAt ?? Date.now(),
        },
      },
    })),
  getStatus: (id) => get().states[id],
}));
