import type { StateStorage } from 'zustand/middleware';
import type { StoreApi } from 'zustand';
import type { z } from 'zod';
import type { SyncMessage } from '@/types/sync';
import {
  createPersistedStateStorage,
  PERSISTED_STATE_ORIGIN_ID,
  getDefaultStorageArea,
  getChatSyncChannel,
  broadcastSyncMessage,
  CHAT_SYNC_CHANNEL_NAME,
} from './persistentStorage';
import { _resetSyncChannelForTests } from './chatSyncChannel';

// Re-export single origin/channel for consumers; keep legacy name alias for compatibility
export { PERSISTED_STATE_ORIGIN_ID };
export const SYNCED_PERSIST_CHANNEL_NAME = CHAT_SYNC_CHANNEL_NAME;

// Singleton channel reuse - single channel via chatSyncChannel
export const getSingletonChannel = getChatSyncChannel;

void broadcastSyncMessage;

export const _resetSingletonChannelForTests = (): void => {
  try {
    _resetSyncChannelForTests();
  } catch {
    try {
      getChatSyncChannel().close();
    } catch {
      // ignore
    }
  }
};

type StorageArea = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export type PersistedStoreApi<T = unknown> = {
  persist: {
    rehydrate: () => Promise<void> | void;
  };
} & Partial<StoreApi<T>>;

export interface SyncedPersistOptions<T> {
  debounceMs?: number;
  schema?: z.ZodType<T>;
  version?: number;
  migrate?: (persisted: unknown, version: number) => T;
  // Exposed for test injection; production stores use default localStorage
  storageArea?: StorageArea;
  // Tab-private stores (drafts, UI chrome) set to false to avoid cross-tab rehydrate
  enableCrossTabSync?: boolean;
}

// --- isEqual (deep) -------------------------------------------------------
function isEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || b === null) return a === b;
  if (typeof a !== typeof b) return false;

  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (!isEqual(a[i], b[i])) return false;
    }
    return true;
  }

  if (Array.isArray(a) !== Array.isArray(b)) return false;

  if (typeof a === 'object' && typeof b === 'object') {
    const objA = a as Record<string, unknown>;
    const objB = b as Record<string, unknown>;
    const keysA = Object.keys(objA);
    const keysB = Object.keys(objB);
    if (keysA.length !== keysB.length) return false;
    for (const key of keysA) {
      if (!(key in objB)) return false;
      if (!isEqual(objA[key], objB[key])) return false;
    }
    return true;
  }

  return false;
}

function isPersistedValueEqual(existingRaw: string | null, nextRaw: string): boolean {
  if (existingRaw === nextRaw) return true;
  if (existingRaw == null) return false;
  try {
    const existingParsed = JSON.parse(existingRaw);
    const nextParsed = JSON.parse(nextRaw);
    return isEqual(existingParsed, nextParsed);
  } catch {
    return false;
  }
}

export const createSyncedPersist = <T>(
  storageKey: string,
  opts: SyncedPersistOptions<T> = {},
): { storage: StateStorage; sync: (store: PersistedStoreApi) => () => void } => {
  // Wrap createPersistedStateStorage to reuse debounce/flush/notify logic centrally (no duplication)
  const enableCrossTabSync = opts.enableCrossTabSync !== false;
  const baseStorage = createPersistedStateStorage({
    debounceMs: opts.debounceMs,
    storageArea: opts.storageArea,
    // Tab-private stores disable broadcast to avoid cross-tab rehydrate
    ...(enableCrossTabSync ? {} : { notifyUpdate: () => {} }),
  });

  const resolveStorageArea = (): StorageArea | null => opts.storageArea ?? getDefaultStorageArea();

  // Track pending parsed values for debounced dedup (isEqual against pending)
  const pendingParsedCache = new Map<string, unknown>();

  const storage: StateStorage = {
    getItem: (key) => {
      try {
        const rawResult = baseStorage.getItem(key) as unknown;
        const raw = rawResult instanceof Promise ? null : (rawResult as string | null);
        if (raw == null) return null;

        let parsed: unknown;
        try {
          parsed = JSON.parse(raw);
        } catch {
          return null;
        }

        if (opts.schema) {
          try {
            opts.schema.parse(parsed);
          } catch {
            if (opts.migrate && typeof opts.version === 'number') {
              try {
                const migrated = opts.migrate(parsed, opts.version);
                opts.schema.parse(migrated);
                const migratedRaw = JSON.stringify(migrated);
                // Optionally persist migrated value for future reads
                try {
                  // Use baseStorage to ensure debounce/notify handling; fallback to direct area
                  baseStorage.setItem(key, migratedRaw);
                } catch {
                  // silent
                }
                return migratedRaw;
              } catch {
                // migrate also failed
              }
            }
            return null;
          }
        }

        return raw;
      } catch {
        return null;
      }
    },

    setItem: (key, value) => {
      const resolvedStorageArea = resolveStorageArea();
      if (!resolvedStorageArea) return;

      // isEqual dedup against existing stored value
      try {
        const existing = (() => {
          try {
            return resolvedStorageArea.getItem(key);
          } catch {
            return null;
          }
        })();
        // Fallback to baseStorage when area is mocked not to reflect base's internal pending
        if (isPersistedValueEqual(existing, value)) return;

        // Dedup against pending parsed cache (covers debounced consecutive writes with same deep value)
        const pendingParsed = pendingParsedCache.get(key);
        if (pendingParsed !== undefined) {
          try {
            const nextParsed = JSON.parse(value);
            if (isEqual(pendingParsed, nextParsed)) return;
          } catch {
            // if not JSON, fallback to string compare already handled
          }
        }

        // Update pending cache
        try {
          pendingParsedCache.set(key, JSON.parse(value));
        } catch {
          pendingParsedCache.set(key, value as unknown);
        }
        // Schedule cache eviction after debounce window (or immediately if no debounce)
        if ((opts.debounceMs ?? 0) > 0) {
          setTimeout(
            () => {
              // Only clear if cache still equals this value's parsed form
              try {
                const cur = pendingParsedCache.get(key);
                const thisParsed = JSON.parse(value);
                if (cur !== undefined && isEqual(cur, thisParsed)) {
                  pendingParsedCache.delete(key);
                }
              } catch {
                pendingParsedCache.delete(key);
              }
            },
            (opts.debounceMs ?? 0) + 20,
          );
        } else {
          // Immediate write will clear via base flush; remove after tick
          pendingParsedCache.delete(key);
        }
      } catch {
        // silent, proceed to write
      }

      try {
        baseStorage.setItem(key, value);
      } catch {
        // silent
      }
      // For immediate mode, ensure cache cleared
      if ((opts.debounceMs ?? 0) <= 0) {
        pendingParsedCache.delete(key);
      }
    },

    removeItem: (key) => {
      pendingParsedCache.delete(key);
      try {
        baseStorage.removeItem(key);
      } catch {
        // silent
      }
    },
  };

  const sync = (store: PersistedStoreApi): (() => void) => {
    if (!enableCrossTabSync) return () => {};
    if (typeof BroadcastChannel === 'undefined') {
      return () => {};
    }

    let channel: BroadcastChannel | null = null;
    try {
      channel = getChatSyncChannel();
    } catch {
      return () => {};
    }
    if (!channel) return () => {};

    const handleMessage = (event: MessageEvent<SyncMessage>): void => {
      try {
        const message = event.data;
        if (
          message.type !== 'PERSISTED_STATE_UPDATED' ||
          message.storageKey !== storageKey ||
          message.originId === PERSISTED_STATE_ORIGIN_ID
        ) {
          return;
        }
        void store.persist.rehydrate();
      } catch {
        // Silent
      }
    };

    channel.addEventListener('message', handleMessage);
    return () => {
      try {
        channel.removeEventListener('message', handleMessage);
      } catch {
        // silent
      }
    };
  };

  return { storage, sync };
};
