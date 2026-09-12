import { create } from 'zustand';

export type AssistantStatus = 'idle' | 'running' | 'awaiting-key' | 'error';

export type AssistantItem =
  | { kind: 'user'; id: string; text: string }
  | { kind: 'assistant'; id: string; text: string }
  | { kind: 'tool'; id: string; name: string; status: 'running' | 'done' | 'error'; detail: string | null }
  | { kind: 'change'; id: string; connectionId: string; changed: string[] }
  | { kind: 'key-request'; id: string; connectionId: string; connectionName: string }
  | { kind: 'error'; id: string; message: string };

export type AssistantToolItem = Extract<AssistantItem, { kind: 'tool' }>;

interface PendingKeyRequest {
  connectionId: string;
  connectionName: string;
  resolve: (apiKey: string | null) => void;
}

interface SettingsAssistantState {
  status: AssistantStatus;
  items: AssistantItem[];
  pendingKeyRequest: PendingKeyRequest | null;
  appendItem: (item: AssistantItem) => void;
  updateToolItem: (id: string, patch: Partial<Omit<AssistantToolItem, 'kind' | 'id'>>) => void;
  setStatus: (status: AssistantStatus) => void;
  reset: () => void;
  requestApiKey: (request: { connectionId: string; connectionName: string }) => Promise<string | null>;
  submitApiKey: (apiKey: string) => void;
  cancelApiKey: () => void;
}

let nextItemId = 1;

const createAssistantItemId = (): string => {
  nextItemId += 1;
  return `assistant-item-${nextItemId}`;
};

export const useSettingsAssistantStore = create<SettingsAssistantState>((set, get) => ({
  status: 'idle',
  items: [],
  pendingKeyRequest: null,

  appendItem: (item) => set((state) => ({ items: [...state.items, item] })),

  updateToolItem: (id, patch) =>
    set((state) => ({
      items: state.items.map((item) => (item.kind === 'tool' && item.id === id ? { ...item, ...patch } : item)),
    })),

  setStatus: (status) => set({ status }),

  // Resolving the pending request with null on reset matters: the tool handler
  // is awaiting this promise, and the panel can be closed mid-turn.
  reset: () => {
    get().pendingKeyRequest?.resolve(null);
    set({ status: 'idle', items: [], pendingKeyRequest: null });
  },

  requestApiKey: ({ connectionId, connectionName }) =>
    new Promise<string | null>((resolve) => {
      set((state) => ({
        status: 'awaiting-key',
        items: [...state.items, { kind: 'key-request', id: createAssistantItemId(), connectionId, connectionName }],
        pendingKeyRequest: { connectionId, connectionName, resolve },
      }));
    }),

  submitApiKey: (apiKey) => {
    const pending = get().pendingKeyRequest;
    if (!pending) return;
    set({ pendingKeyRequest: null, status: 'running' });
    pending.resolve(apiKey);
  },

  cancelApiKey: () => {
    const pending = get().pendingKeyRequest;
    if (!pending) return;
    set({ pendingKeyRequest: null, status: 'running' });
    pending.resolve(null);
  },
}));
