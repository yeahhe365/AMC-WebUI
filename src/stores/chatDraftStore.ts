import { z } from 'zod';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { readPersistentStorageItem, removePersistentStorageItem } from './persistentStorage';
import { createSyncedPersist } from './syncedPersist';
import { safeJsonParse } from '@/utils/safeJsonParse';
import { resolveUpdaterOrValue, type UpdaterOrValue } from './stateUpdaters';

const CHAT_DRAFT_STORE_STORAGE_KEY = 'all_model_chat_drafts_v1';

// C2: zod schema + version/migrate demo — validates zustand persist wrapper {state:{drafts},version}
export const chatDraftPersistedSchema = z
  .object({
    state: z.object({
      drafts: z.record(
        z.string(),
        z.object({
          inputText: z.string(),
          quotes: z.array(z.string()),
          ttsContext: z.string(),
        }),
      ),
    }),
    version: z.number().optional(),
  })
  .passthrough();

type ChatDraftPersistedState = z.infer<typeof chatDraftPersistedSchema>;

const normalizePersistedDrafts = (drafts: unknown): Record<string, ChatDraft> => {
  if (!drafts || typeof drafts !== 'object' || Array.isArray(drafts)) return {};
  const out: Record<string, ChatDraft> = {};
  for (const [key, value] of Object.entries(drafts as Record<string, unknown>)) {
    if (!key || !value || typeof value !== 'object' || Array.isArray(value)) continue;
    const candidate = value as Partial<ChatDraft>;
    const normalized: ChatDraft = {
      inputText: typeof candidate.inputText === 'string' ? candidate.inputText : '',
      quotes: Array.isArray(candidate.quotes) ? candidate.quotes.filter((q): q is string => typeof q === 'string') : [],
      ttsContext: typeof candidate.ttsContext === 'string' ? candidate.ttsContext : '',
    };
    if (normalized.inputText.trim() || normalized.quotes.length > 0 || normalized.ttsContext.trim()) {
      out[key] = normalized;
    }
  }
  return out;
};

export const migrateChatDraftPersistedState = (persisted: unknown, _version: number): ChatDraftPersistedState => {
  const raw = (persisted ?? {}) as { state?: unknown; version?: unknown };
  const drafts = (raw.state as { drafts?: unknown } | undefined)?.drafts;
  return {
    state: { drafts: normalizePersistedDrafts(drafts) },
    version: 1,
  };
};

const { storage: chatDraftSyncedStorage } = createSyncedPersist<ChatDraftPersistedState>(CHAT_DRAFT_STORE_STORAGE_KEY, {
  debounceMs: 300,
  enableCrossTabSync: false,
  schema: chatDraftPersistedSchema,
  version: 1,
  migrate: migrateChatDraftPersistedState,
});

export interface ChatDraft {
  inputText: string;
  quotes: string[];
  ttsContext: string;
}

interface ChatDraftState {
  drafts: Record<string, ChatDraft>;
}

interface ChatDraftActions {
  hydrateLegacySessionDraft: (sessionId: string) => void;
  setDraftText: (sessionId: string, value: UpdaterOrValue<string>) => void;
  setDraftQuotes: (sessionId: string, value: UpdaterOrValue<string[]>) => void;
  setDraftTtsContext: (sessionId: string, value: UpdaterOrValue<string>) => void;
  clearCurrentDraft: (sessionId: string) => void;
  clearSessionDrafts: (sessionIds: Iterable<string>) => void;
}

const EMPTY_DRAFT: ChatDraft = {
  inputText: '',
  quotes: [],
  ttsContext: '',
};

const getLegacyDraftKeys = (sessionId: string) => ({
  draftKey: `chatDraft_${sessionId}`,
  quoteKey: `chatQuotes_${sessionId}`,
  ttsKey: `chatTtsContext_${sessionId}`,
});

const hasDraftContent = (draft: ChatDraft) =>
  draft.inputText.trim().length > 0 || draft.quotes.length > 0 || draft.ttsContext.trim().length > 0;

const readLegacyQuotes = (key: string): string[] => {
  const rawQuotes = readPersistentStorageItem(key);
  if (!rawQuotes) {
    return [];
  }

  const parsed = safeJsonParse<unknown>(rawQuotes, []);
  return Array.isArray(parsed) ? parsed.filter((quote): quote is string => typeof quote === 'string') : [];
};

const normalizeDraft = (draft: Partial<ChatDraft> | undefined): ChatDraft => ({
  inputText: typeof draft?.inputText === 'string' ? draft.inputText : '',
  quotes: Array.isArray(draft?.quotes)
    ? draft.quotes.filter((quote): quote is string => typeof quote === 'string')
    : [],
  ttsContext: typeof draft?.ttsContext === 'string' ? draft.ttsContext : '',
});

const setSessionDraft = (
  drafts: Record<string, ChatDraft>,
  sessionId: string,
  updater: (draft: ChatDraft) => ChatDraft,
) => {
  if (!sessionId) {
    return drafts;
  }

  const nextDraft = updater(normalizeDraft(drafts[sessionId]));
  if (!hasDraftContent(nextDraft)) {
    const remainingDrafts = { ...drafts };
    delete remainingDrafts[sessionId];
    return remainingDrafts;
  }

  return {
    ...drafts,
    [sessionId]: nextDraft,
  };
};

const pruneEmptyDrafts = (drafts: Record<string, ChatDraft>) =>
  Object.fromEntries(Object.entries(drafts).filter(([, draft]) => hasDraftContent(normalizeDraft(draft))));

export const useChatDraftStore = create<ChatDraftState & ChatDraftActions>()(
  persist(
    (set, get) => ({
      drafts: {},

      hydrateLegacySessionDraft: (sessionId) => {
        if (!sessionId) {
          return;
        }

        const { draftKey, quoteKey, ttsKey } = getLegacyDraftKeys(sessionId);
        const existingDraft = get().drafts[sessionId];

        if (!existingDraft) {
          const legacyDraft = normalizeDraft({
            inputText: readPersistentStorageItem(draftKey) ?? '',
            quotes: readLegacyQuotes(quoteKey),
            ttsContext: readPersistentStorageItem(ttsKey) ?? '',
          });

          if (hasDraftContent(legacyDraft)) {
            set((state) => ({
              drafts: {
                ...state.drafts,
                [sessionId]: legacyDraft,
              },
            }));
          }
        }

        removePersistentStorageItem(draftKey);
        removePersistentStorageItem(quoteKey);
        removePersistentStorageItem(ttsKey);
      },

      setDraftText: (sessionId, value) =>
        set((state) => ({
          drafts: setSessionDraft(state.drafts, sessionId, (draft) => ({
            ...draft,
            inputText: resolveUpdaterOrValue(value, draft.inputText),
          })),
        })),

      setDraftQuotes: (sessionId, value) =>
        set((state) => ({
          drafts: setSessionDraft(state.drafts, sessionId, (draft) => ({
            ...draft,
            quotes: resolveUpdaterOrValue(value, draft.quotes).filter(
              (quote): quote is string => typeof quote === 'string',
            ),
          })),
        })),

      setDraftTtsContext: (sessionId, value) =>
        set((state) => ({
          drafts: setSessionDraft(state.drafts, sessionId, (draft) => ({
            ...draft,
            ttsContext: resolveUpdaterOrValue(value, draft.ttsContext),
          })),
        })),

      clearCurrentDraft: (sessionId) =>
        set((state) => ({
          drafts: setSessionDraft(state.drafts, sessionId, (draft) => ({
            ...EMPTY_DRAFT,
            ttsContext: draft.ttsContext,
          })),
        })),

      clearSessionDrafts: (sessionIds) =>
        set((state) => {
          const idsToClear = new Set(sessionIds);
          return {
            drafts: Object.fromEntries(
              Object.entries(state.drafts).filter(([sessionId]) => !idsToClear.has(sessionId)),
            ),
          };
        }),
    }),
    {
      name: CHAT_DRAFT_STORE_STORAGE_KEY,
      version: 1,
      // Tab-private: persist for refresh recovery, but do not cross-tab rehydrate
      // (would clobber in-progress input in other tabs).
      storage: createJSONStorage(() => chatDraftSyncedStorage),
      partialize: (state) => ({
        drafts: pruneEmptyDrafts(state.drafts),
      }),
      migrate: (persistedState, version) => {
        if (version === 1) return persistedState as ChatDraftState;
        const maybe = persistedState as { drafts?: unknown };
        return { drafts: normalizePersistedDrafts(maybe?.drafts) } as ChatDraftState;
      },
    },
  ),
);
