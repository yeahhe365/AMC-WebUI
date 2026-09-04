import type { StateStorage } from 'zustand/middleware';
import { broadcastSyncMessage, getChatSyncChannel, CHAT_SYNC_CHANNEL_NAME } from './chatSyncChannel';

type StorageArea = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

interface CreatePersistedStateStorageOptions {
  debounceMs?: number;
  notifyUpdate?: (storageKey: string) => void;
  storageArea?: StorageArea;
}

export const PERSISTED_STATE_ORIGIN_ID =
  typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2);

export const getDefaultStorageArea = (): StorageArea | null => {
  if (typeof localStorage === 'undefined') {
    return null;
  }

  return localStorage;
};

export const readPersistentStorageItem = (key: string, storageArea = getDefaultStorageArea()) => {
  try {
    return storageArea?.getItem(key) ?? null;
  } catch {
    return null;
  }
};

export const removePersistentStorageItem = (key: string, storageArea = getDefaultStorageArea()) => {
  try {
    storageArea?.removeItem(key);
  } catch {
    // Ignore storage failures in restricted browser contexts.
  }
};

const notifyPersistedStateUpdate = (storageKey: string) => {
  broadcastSyncMessage({
    type: 'PERSISTED_STATE_UPDATED',
    storageKey,
    originId: PERSISTED_STATE_ORIGIN_ID,
  });
};

// Re-export for syncedPersist reuse (single origin + single channel)
export { broadcastSyncMessage, getChatSyncChannel, CHAT_SYNC_CHANNEL_NAME };

// --- Centralized flush registry (fixes leak per factory) -----------------
const globalFlushRegistry = new Set<() => void>();
let globalFlushListenersAttached = false;

function ensureGlobalFlushListeners(): void {
  if (globalFlushListenersAttached || typeof window === 'undefined') return;
  globalFlushListenersAttached = true;
  const flushAll = () => {
    for (const fn of Array.from(globalFlushRegistry)) {
      try {
        fn();
      } catch {
        // Ignore flush failures
      }
    }
  };
  window.addEventListener('pagehide', flushAll);
  window.addEventListener('beforeunload', flushAll);
}

// Test-only helper to reset global registry
export const _resetFlushRegistryForTests = (): void => {
  globalFlushRegistry.clear();
  globalFlushListenersAttached = false;
};

export const createPersistedStateStorage = ({
  debounceMs = 0,
  notifyUpdate = notifyPersistedStateUpdate,
  storageArea,
}: CreatePersistedStateStorageOptions = {}): StateStorage => {
  const pendingWrites = new Map<string, string>();
  const pendingTimers = new Map<string, ReturnType<typeof setTimeout>>();
  const resolveStorageArea = () => storageArea ?? getDefaultStorageArea();

  const clearPendingWrite = (key: string) => {
    const timer = pendingTimers.get(key);
    if (timer) {
      clearTimeout(timer);
      pendingTimers.delete(key);
    }
    pendingWrites.delete(key);
  };

  const flushWrite = (key: string) => {
    const value = pendingWrites.get(key);
    const resolvedStorageArea = resolveStorageArea();
    if (value === undefined || !resolvedStorageArea) {
      clearPendingWrite(key);
      return;
    }

    pendingTimers.delete(key);
    pendingWrites.delete(key);

    try {
      if (resolvedStorageArea.getItem(key) === value) {
        return;
      }
      resolvedStorageArea.setItem(key, value);
      notifyUpdate(key);
    } catch {
      // Ignore storage failures in restricted browser contexts.
    }
  };

  const flushAllPendingWrites = () => {
    for (const key of Array.from(pendingWrites.keys())) {
      flushWrite(key);
    }
  };

  // Register flush for centralized pagehide/beforeunload handling (single listeners)
  globalFlushRegistry.add(flushAllPendingWrites);
  ensureGlobalFlushListeners();

  return {
    getItem: (key) => {
      try {
        return resolveStorageArea()?.getItem(key) ?? null;
      } catch {
        return null;
      }
    },
    setItem: (key, value) => {
      const resolvedStorageArea = resolveStorageArea();
      if (!resolvedStorageArea) {
        return;
      }

      if (debounceMs <= 0) {
        clearPendingWrite(key);
        try {
          if (resolvedStorageArea.getItem(key) === value) {
            return;
          }
          resolvedStorageArea.setItem(key, value);
          notifyUpdate(key);
        } catch {
          // Ignore storage failures in restricted browser contexts.
        }
        return;
      }

      clearPendingWrite(key);
      pendingWrites.set(key, value);
      pendingTimers.set(
        key,
        setTimeout(() => {
          flushWrite(key);
        }, debounceMs),
      );
    },
    removeItem: (key) => {
      clearPendingWrite(key);
      try {
        resolveStorageArea()?.removeItem(key);
        notifyUpdate(key);
      } catch {
        // Ignore storage failures in restricted browser contexts.
      }
    },
  };
};
