import { TAB_ID } from '@/stores/tabIdentity';
import {
  readPersistentStorageItem,
  writePersistentStorageItem,
  removePersistentStorageItem,
} from '@/stores/persistentStorage';
import { safeJsonParse } from '@/utils/safeJsonParse';

/**
 * Persistent record of an in-flight streamed generation that the api container
 * is journaling under an `x-amc-job-id`. After a page refresh the frontend
 * reads this to resume the stream from `lastSeq` (the last event seq the
 * browser saw), instead of losing the partial output.
 *
 * Shape mirrors `generationLease` storage: one record per session, keyed by
 * session id, in localStorage so it survives a reload. Cleared on completion,
 * abort, or error.
 */
interface PendingStreamJob {
  sessionId: string;
  generationId: string;
  /** Job id sent to the api container; today this equals generationId. */
  jobId: string;
  /**
   * Client-generated secret bound to the job server-side. Sent as
   * `x-amc-job-secret` on the creating request, on resumes, and on the abort
   * call so only the browser that started the stream can attach to the buffer
   * or kill it. Undefined for records written before this field existed.
   */
  secret?: string;
  /** Epoch ms when the generation started (for firstToken latency). */
  startedAt: number;
  /** Highest SSE event seq the browser has consumed so far. */
  lastSeq: number;
  /** Tab that owns the job; only it resumes (multi-tab guard). */
  tabId: string;
}

/**
 * Random per-job secret. Callers that stamp the creating request's headers must
 * call this BEFORE recordPendingStreamJob and pass the value as `secret`, so
 * the request, the stored record, and later resumes all share one secret.
 */
export const generateJobSecret = (): string => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  // Extremely restricted contexts without crypto.randomUUID: a timestamped
  // fallback keeps the flow working (weaker, but better than no secret).
  return `secret-${Date.now()}-${Math.random().toString(36).slice(2)}`;
};

const PENDING_JOB_KEY_PREFIX = 'amc_stream_job:';
const PENDING_JOB_TTL_MS = 10 * 60_000; // match server-side job TTL

const pendingJobStorageKey = (sessionId: string) => `${PENDING_JOB_KEY_PREFIX}${sessionId}`;

const isFresh = (job: PendingStreamJob, now = Date.now()): boolean => now - job.startedAt < PENDING_JOB_TTL_MS;

/**
 * Reads the pending stream job for a session. Returns null when none, when the
 * record is malformed, or when it has aged past the TTL (so a stale record
 * left by a crashed tab does not trigger a doomed resume).
 */
export const readPendingStreamJob = (sessionId: string): PendingStreamJob | null => {
  if (!sessionId) {
    return null;
  }
  const key = pendingJobStorageKey(sessionId);
  const raw = readPersistentStorageItem(key);
  if (!raw) {
    return null;
  }
  const parsed = safeJsonParse<Partial<PendingStreamJob> | null>(raw, null);
  if (
    !parsed ||
    typeof parsed.sessionId !== 'string' ||
    typeof parsed.generationId !== 'string' ||
    typeof parsed.jobId !== 'string' ||
    typeof parsed.startedAt !== 'number' ||
    typeof parsed.lastSeq !== 'number' ||
    typeof parsed.tabId !== 'string'
  ) {
    removePersistentStorageItem(key);
    return null;
  }
  const job: PendingStreamJob = {
    sessionId: parsed.sessionId,
    generationId: parsed.generationId,
    jobId: parsed.jobId,
    ...(typeof parsed.secret === 'string' ? { secret: parsed.secret } : {}),
    startedAt: parsed.startedAt,
    lastSeq: parsed.lastSeq,
    tabId: parsed.tabId,
  };
  if (!isFresh(job)) {
    removePersistentStorageItem(key);
    return null;
  }
  return job;
};

/**
 * Records (or refreshes) a pending stream job when a streamed turn starts.
 * Overwrites any stale record for the same session.
 */
export const recordPendingStreamJob = (
  job: Omit<PendingStreamJob, 'lastSeq' | 'tabId'> & {
    lastSeq?: number;
  },
): void => {
  if (!job.sessionId) {
    return;
  }
  writePersistentStorageItem(
    pendingJobStorageKey(job.sessionId),
    JSON.stringify({
      sessionId: job.sessionId,
      generationId: job.generationId,
      jobId: job.jobId,
      // Caller-supplied secrets win (creation and resume must share one);
      // otherwise generate one so the server binds the job to this browser.
      secret: job.secret ?? generateJobSecret(),
      startedAt: job.startedAt,
      lastSeq: job.lastSeq ?? 0,
      tabId: TAB_ID,
    } satisfies PendingStreamJob),
  );
};

/**
 * Advances the cursor after each consumed SSE event so a resume picks up at the
 * exact next boundary. Best-effort; a missed write only means a resume replays
 * one already-seen event (idempotent for Gemini SSE).
 */
export const advancePendingStreamJobSeq = (sessionId: string, seq: number): void => {
  if (!sessionId) {
    return;
  }
  const existing = readPendingStreamJob(sessionId);
  if (!existing || existing.tabId !== TAB_ID) {
    return;
  }
  if (seq <= existing.lastSeq) {
    return;
  }
  writePersistentStorageItem(
    pendingJobStorageKey(sessionId),
    JSON.stringify({ ...existing, lastSeq: seq } satisfies PendingStreamJob),
  );
};

/** Removes the pending record (called on completion, abort, or error). */
export const clearPendingStreamJob = (sessionId: string): void => {
  if (!sessionId) {
    return;
  }
  removePersistentStorageItem(pendingJobStorageKey(sessionId));
};

/**
 * Remove the pending record only if this tab owns it. Returns true when a
 * record was removed. Used so a non-owning tab does not clobber another tab's
 * in-flight job.
 */
export const clearOwnedPendingStreamJob = (sessionId: string): boolean => {
  const existing = readPendingStreamJob(sessionId);
  if (!existing || existing.tabId !== TAB_ID) {
    return false;
  }
  clearPendingStreamJob(sessionId);
  return true;
};
