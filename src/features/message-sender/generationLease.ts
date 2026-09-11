import { TAB_ID } from '@/stores/tabIdentity';
import {
  readPersistentStorageItem,
  writePersistentStorageItem,
  removePersistentStorageItem,
} from '@/stores/persistentStorage';
import { safeJsonParse } from '@/utils/safeJsonParse';

export const GENERATION_LEASE_TTL_MS = 120_000;
const GENERATION_LEASE_HEARTBEAT_MS = 30_000;

export interface GenerationLease {
  tabId: string;
  generationId: string;
  ts: number;
}

const LEASE_KEY_PREFIX = 'amc_generation_lease_v1:';

const heartbeatTimers = new Map<string, ReturnType<typeof setInterval>>();

const leaseStorageKey = (sessionId: string) => `${LEASE_KEY_PREFIX}${sessionId}`;

export const isGenerationLeaseFresh = (lease: GenerationLease, now = Date.now()): boolean =>
  now - lease.ts < GENERATION_LEASE_TTL_MS;

export const readGenerationLease = (sessionId: string): GenerationLease | null => {
  if (!sessionId) {
    return null;
  }
  const key = leaseStorageKey(sessionId);
  const raw = readPersistentStorageItem(key);
  if (!raw) {
    return null;
  }
  const parsed = safeJsonParse<Partial<GenerationLease> | null>(raw, null);
  if (
    !parsed ||
    typeof parsed.tabId !== 'string' ||
    typeof parsed.generationId !== 'string' ||
    typeof parsed.ts !== 'number'
  ) {
    removePersistentStorageItem(key);
    return null;
  }
  const lease: GenerationLease = {
    tabId: parsed.tabId,
    generationId: parsed.generationId,
    ts: parsed.ts,
  };
  if (!isGenerationLeaseFresh(lease)) {
    removePersistentStorageItem(key);
    return null;
  }
  return lease;
};

const writeGenerationLease = (sessionId: string, lease: GenerationLease) => {
  if (!sessionId) {
    return;
  }
  writePersistentStorageItem(leaseStorageKey(sessionId), JSON.stringify(lease));
};

export const isGenerationLeaseHeldByOther = (sessionId: string): boolean => {
  const lease = readGenerationLease(sessionId);
  return Boolean(lease && lease.tabId !== TAB_ID);
};

/**
 * Whether THIS tab currently holds the generation lease for the session,
 * without writing or refreshing anything. Used by stream resume to detect
 * that a live send is already in progress in this tab (the lease is held for
 * the duration of a turn by runMessageLifecycle) so it does not attach a
 * second handler to the same stream job and double the output.
 */
export const isGenerationLeaseHeldByTab = (sessionId: string): boolean => {
  const lease = readGenerationLease(sessionId);
  return Boolean(lease && lease.tabId === TAB_ID);
};

/**
 * Acquire or refresh a per-session generation lease for this tab.
 * Returns false when another tab holds a fresh lease.
 */
export const tryAcquireGenerationLease = (sessionId: string, generationId: string): boolean => {
  if (!sessionId || !generationId) {
    return false;
  }

  const existing = readGenerationLease(sessionId);
  if (existing && existing.tabId !== TAB_ID) {
    return false;
  }

  writeGenerationLease(sessionId, {
    tabId: TAB_ID,
    generationId,
    ts: Date.now(),
  });
  return true;
};

export const renewGenerationLease = (sessionId: string, generationId: string): boolean => {
  const existing = readGenerationLease(sessionId);
  if (!existing || existing.tabId !== TAB_ID) {
    return false;
  }
  if (existing.generationId !== generationId) {
    return false;
  }
  writeGenerationLease(sessionId, {
    ...existing,
    ts: Date.now(),
  });
  return true;
};

export const releaseGenerationLease = (sessionId: string, generationId?: string): void => {
  stopGenerationLeaseHeartbeat(sessionId);
  if (!sessionId) {
    return;
  }

  if (generationId) {
    const existing = readGenerationLease(sessionId);
    if (existing && (existing.tabId !== TAB_ID || existing.generationId !== generationId)) {
      return;
    }
  } else {
    const existing = readGenerationLease(sessionId);
    if (existing && existing.tabId !== TAB_ID) {
      return;
    }
  }
  removePersistentStorageItem(leaseStorageKey(sessionId));
};

export const startGenerationLeaseHeartbeat = (sessionId: string, generationId: string): void => {
  stopGenerationLeaseHeartbeat(sessionId);
  if (typeof setInterval === 'undefined') {
    return;
  }
  const timer = setInterval(() => {
    if (!renewGenerationLease(sessionId, generationId)) {
      stopGenerationLeaseHeartbeat(sessionId);
    }
  }, GENERATION_LEASE_HEARTBEAT_MS);
  heartbeatTimers.set(sessionId, timer);
};

export const stopGenerationLeaseHeartbeat = (sessionId: string): void => {
  const timer = heartbeatTimers.get(sessionId);
  if (timer) {
    clearInterval(timer);
    heartbeatTimers.delete(sessionId);
  }
};
