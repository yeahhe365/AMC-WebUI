import { beforeEach, describe, expect, it, vi } from 'vitest';

// localStorage must exist for amcStreamJobs. The jsdom vitest environment
// provides it, but TAB_ID derives from a crypto-backed store; stub it so the
// owned-variant guard compares against a known tab id.
vi.mock('@/stores/tabIdentity', () => ({
  TAB_ID: 'test-tab',
}));

import {
  recordPendingStreamJob,
  readPendingStreamJob,
  clearOwnedPendingStreamJob,
  advancePendingStreamJobSeq,
} from './amcStreamJobs';

const SESSION_ID = 'session-1';

describe('amcStreamJobs pending record', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('records and reads back a pending stream job', () => {
    recordPendingStreamJob({
      sessionId: SESSION_ID,
      generationId: 'gen-1',
      jobId: 'gen-1',
      startedAt: Date.now(),
    });
    const pending = readPendingStreamJob(SESSION_ID);
    expect(pending).not.toBeNull();
    expect(pending?.generationId).toBe('gen-1');
    expect(pending?.jobId).toBe('gen-1');
    expect(pending?.lastSeq).toBe(0);
    expect(pending?.tabId).toBe('test-tab');
  });

  it('clearOwnedPendingStreamJob removes this tab record (streamOnError path)', () => {
    recordPendingStreamJob({
      sessionId: SESSION_ID,
      generationId: 'gen-1',
      jobId: 'gen-1',
      startedAt: Date.now(),
    });
    expect(readPendingStreamJob(SESSION_ID)).not.toBeNull();

    // streamOnError calls this to reclaim the record so a later reload does
    // not mistake the failed generation for an in-flight one.
    const removed = clearOwnedPendingStreamJob(SESSION_ID);
    expect(removed).toBe(true);
    expect(readPendingStreamJob(SESSION_ID)).toBeNull();
  });

  it('does not delete a record owned by another tab (multi-tab safety)', () => {
    // Simulate a record written by a different tab.
    const key = `amc_stream_job:${SESSION_ID}`;
    localStorage.setItem(
      key,
      JSON.stringify({
        sessionId: SESSION_ID,
        generationId: 'gen-other',
        jobId: 'gen-other',
        startedAt: Date.now(),
        lastSeq: 5,
        tabId: 'other-tab',
      }),
    );

    const removed = clearOwnedPendingStreamJob(SESSION_ID);
    expect(removed).toBe(false);
    // Record survives for the owning tab.
    const pending = readPendingStreamJob(SESSION_ID);
    expect(pending).not.toBeNull();
    expect(pending?.tabId).toBe('other-tab');
  });

  it('advancePendingStreamJobSeq moves the cursor forward for the owning tab only', () => {
    recordPendingStreamJob({
      sessionId: SESSION_ID,
      generationId: 'gen-1',
      jobId: 'gen-1',
      startedAt: Date.now(),
    });

    advancePendingStreamJobSeq(SESSION_ID, 1);
    advancePendingStreamJobSeq(SESSION_ID, 3);
    // Out-of-order / stale seqs do not rewind the cursor.
    advancePendingStreamJobSeq(SESSION_ID, 2);

    const pending = readPendingStreamJob(SESSION_ID);
    expect(pending?.lastSeq).toBe(3);
  });

  it('returns null for a record that has aged past the TTL', () => {
    const key = `amc_stream_job:${SESSION_ID}`;
    const staleStartedAt = Date.now() - (11 * 60_000 + 5_000); // 11 min ago, TTL is 10 min
    localStorage.setItem(
      key,
      JSON.stringify({
        sessionId: SESSION_ID,
        generationId: 'gen-stale',
        jobId: 'gen-stale',
        startedAt: staleStartedAt,
        lastSeq: 0,
        tabId: 'test-tab',
      }),
    );

    expect(readPendingStreamJob(SESSION_ID)).toBeNull();
  });

  it('generates and persists a random job secret when none is provided', () => {
    recordPendingStreamJob({
      sessionId: SESSION_ID,
      generationId: 'gen-1',
      jobId: 'gen-1',
      startedAt: Date.now(),
    });
    const pending = readPendingStreamJob(SESSION_ID);
    expect(pending?.secret).toBeTruthy();
    expect(pending?.secret).not.toBe('gen-1');
  });

  it('keeps a caller-provided job secret (creation and resume share it)', () => {
    recordPendingStreamJob({
      sessionId: SESSION_ID,
      generationId: 'gen-1',
      jobId: 'gen-1',
      secret: 'fixed-secret',
      startedAt: Date.now(),
    });
    expect(readPendingStreamJob(SESSION_ID)?.secret).toBe('fixed-secret');
  });

  it('still reads legacy records without a secret (secret stays undefined)', () => {
    const key = `amc_stream_job:${SESSION_ID}`;
    localStorage.setItem(
      key,
      JSON.stringify({
        sessionId: SESSION_ID,
        generationId: 'gen-legacy',
        jobId: 'gen-legacy',
        startedAt: Date.now(),
        lastSeq: 2,
        tabId: 'test-tab',
      }),
    );
    const pending = readPendingStreamJob(SESSION_ID);
    expect(pending).not.toBeNull();
    expect(pending?.secret).toBeUndefined();
  });
});
