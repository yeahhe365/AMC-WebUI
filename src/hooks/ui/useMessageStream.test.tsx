import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useMessageStream } from './useMessageStream';
import { streamingStore, STREAM_NOTIFY_INTERVAL_MS } from '@/stores/streamingStore';
import { renderHook } from '@/test/render/renderer';

describe('useMessageStream', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    streamingStore.clear('message-stream');
    streamingStore.clear('stale-stream');
    streamingStore.clear('active-stream');
    streamingStore.clear('batched-stream');
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    streamingStore.clear('message-stream');
    streamingStore.clear('stale-stream');
    streamingStore.clear('active-stream');
    streamingStore.clear('batched-stream');
  });

  it('returns live store snapshots while streaming and resets when streaming stops', () => {
    let isStreaming = true;

    const { result, rerender, unmount } = renderHook(() => useMessageStream('message-stream', isStreaming));

    expect(result.current.streamContent).toBe('');
    expect(result.current.streamThoughts).toBe('');

    act(() => {
      streamingStore.updateContent('message-stream', 'Hello');
      streamingStore.updateThoughts('message-stream', 'Thinking');
    });

    expect(result.current.streamContent).toBe('Hello');
    expect(result.current.streamThoughts).toBe('Thinking');

    isStreaming = false;
    rerender();

    expect(result.current.streamContent).toBe('');
    expect(result.current.streamThoughts).toBe('');

    unmount();
  });

  it('batches high-frequency stream notifications into a single throttled flush', () => {
    const listener = vi.fn();
    const unsubscribe = streamingStore.subscribe('batched-stream', listener);

    streamingStore.updateContent('batched-stream', 'Hel');
    streamingStore.updateContent('batched-stream', 'lo');
    streamingStore.updateThoughts('batched-stream', 'Thinking');

    expect(streamingStore.getContent('batched-stream')).toBe('Hello');
    expect(streamingStore.getThoughts('batched-stream')).toBe('Thinking');
    // Leading flush delivered the first update synchronously.
    expect(listener).toHaveBeenCalledTimes(1);

    // The remaining updates coalesce into a single trailing flush.
    vi.advanceTimersByTime(STREAM_NOTIFY_INTERVAL_MS);
    expect(listener).toHaveBeenCalledTimes(2);

    unsubscribe();
  });

  it('evicts abandoned stream entries after the gc ttl elapses', () => {
    vi.useFakeTimers();

    streamingStore.updateContent('stale-stream', 'orphaned');
    streamingStore.updateThoughts('stale-stream', 'left behind');

    vi.advanceTimersByTime(5 * 60_000 + 1);

    streamingStore.sweepExpiredEntries();

    expect(streamingStore.getContent('stale-stream')).toBe('');
    expect(streamingStore.getThoughts('stale-stream')).toBe('');
  });

  it('does not evict stream entries that still have active listeners', () => {
    vi.useFakeTimers();

    const unsubscribe = streamingStore.subscribe('active-stream', () => undefined);

    streamingStore.updateContent('active-stream', 'still active');
    vi.advanceTimersByTime(5 * 60_000 + 1);

    streamingStore.sweepExpiredEntries();

    expect(streamingStore.getContent('active-stream')).toBe('still active');

    unsubscribe();
    vi.advanceTimersByTime(5 * 60_000 + 1);

    streamingStore.sweepExpiredEntries();

    expect(streamingStore.getContent('active-stream')).toBe('');
  });
});
