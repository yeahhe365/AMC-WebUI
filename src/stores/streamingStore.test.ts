import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { StreamingStore, STREAM_NOTIFY_INTERVAL_MS } from './streamingStore';

describe('StreamingStore throttled notify', () => {
  let store: StreamingStore;

  beforeEach(() => {
    vi.useFakeTimers();
    store = new StreamingStore();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('flushes the first chunk immediately (leading edge) and batches the rest into one trailing flush', () => {
    const listener = vi.fn();
    const unsubscribe = store.subscribe('m1', listener);

    store.updateContent('m1', 'c0');
    store.updateContent('m1', 'c1');
    store.updateContent('m1', 'c2');
    store.updateContent('m1', 'c3');
    store.updateContent('m1', 'c4');

    // Leading flush already delivered the first chunk.
    expect(listener).toHaveBeenCalledTimes(1);

    // The remaining updates are coalesced into a single trailing flush.
    vi.advanceTimersByTime(STREAM_NOTIFY_INTERVAL_MS);
    expect(listener).toHaveBeenCalledTimes(2);

    expect(store.getContent('m1')).toBe('c0c1c2c3c4');
    unsubscribe();
  });

  it('delivers the trailing chunk after a quick burst even without further updates', () => {
    const listener = vi.fn();
    const unsubscribe = store.subscribe('m1', listener);

    store.updateContent('m1', 'a');
    expect(listener).toHaveBeenCalledTimes(1); // leading

    store.updateContent('m1', 'b');
    expect(listener).toHaveBeenCalledTimes(1); // pending trailing not yet flushed

    vi.advanceTimersByTime(STREAM_NOTIFY_INTERVAL_MS);
    expect(listener).toHaveBeenCalledTimes(2); // trailing delivers 'b'
    unsubscribe();
  });

  it('clears a pending timer when the entry is cleared', () => {
    const listener = vi.fn();
    const unsubscribe = store.subscribe('m1', listener);

    store.updateContent('m1', 'a'); // leading flush
    store.updateContent('m1', 'b'); // schedules trailing timer
    store.clear('m1');

    vi.advanceTimersByTime(STREAM_NOTIFY_INTERVAL_MS * 2);
    expect(listener).toHaveBeenCalledTimes(1); // only the leading flush
    expect(store.getContent('m1')).toBe('');
    unsubscribe();
  });

  it('coalesces multiple ids into one flush and notifies each listener', () => {
    const firstListener = vi.fn();
    const secondListener = vi.fn();
    const unsubscribeFirst = store.subscribe('m1', firstListener);
    const unsubscribeSecond = store.subscribe('m2', secondListener);

    // A single burst updates both ids; the first update fires a leading flush,
    // and the remaining ids ride along in the same trailing flush.
    store.updateContent('m1', 'a');
    store.updateContent('m2', 'b');

    expect(firstListener).toHaveBeenCalledTimes(1); // leading flush for m1
    expect(secondListener).toHaveBeenCalledTimes(0); // m2 is pending

    vi.advanceTimersByTime(STREAM_NOTIFY_INTERVAL_MS);

    // The trailing flush delivered the pending id to its own listener.
    expect(firstListener).toHaveBeenCalledTimes(1);
    expect(secondListener).toHaveBeenCalledTimes(1);
    expect(store.getContent('m1')).toBe('a');
    expect(store.getContent('m2')).toBe('b');
    unsubscribeFirst();
    unsubscribeSecond();
  });

  it('a new generation resets the throttle clock so its first chunk flushes immediately', () => {
    const listener = vi.fn();
    const unsubscribe = store.subscribe('m1', listener);

    // First generation streams and completes.
    store.updateContent('m1', 'gen1');
    vi.advanceTimersByTime(STREAM_NOTIFY_INTERVAL_MS);
    const afterFirstGeneration = listener.mock.calls.length;

    // A new generation (clear resets the throttle clock).
    store.clear('m1');
    store.updateContent('m1', 'gen2');

    // Leading flush fires immediately despite the prior flush being recent.
    expect(listener.mock.calls.length).toBe(afterFirstGeneration + 1);
    unsubscribe();
  });

  it('evicts abandoned entries after the ttl', () => {
    store.updateContent('stale', 'orphaned');
    store.updateThoughts('stale', 'left behind');

    vi.advanceTimersByTime(5 * 60_000 + 1);
    store.sweepExpiredEntries();

    expect(store.getContent('stale')).toBe('');
    expect(store.getThoughts('stale')).toBe('');
  });
});
