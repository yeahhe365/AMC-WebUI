import { act } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from '@/test/render/renderer';
import { type UploadedFile } from '@/types';
import { useMessageQueue } from './useMessageQueue';

const mockStoreState = vi.hoisted(() => ({
  savedSessions: [] as Array<{ id: string; title: string; timestamp: number }>,
  selectedFiles: [] as UploadedFile[],
  loadingSessionIds: new Set<string>(),
  setSessionLoading: vi.fn((sessionId: string, isLoading: boolean) => {
    const next = new Set(mockStoreState.loadingSessionIds);
    if (isLoading) next.add(sessionId);
    else next.delete(sessionId);
    mockStoreState.loadingSessionIds = next;
  }),
}));

vi.mock('@/stores/chatStore', () => {
  const useChatStore = Object.assign(
    (selector?: (state: typeof mockStoreState) => unknown) => (selector ? selector(mockStoreState) : mockStoreState),
    {
      getState: () => mockStoreState,
    },
  );
  return { useChatStore };
});

const makeFile = (overrides: Partial<UploadedFile> = {}): UploadedFile => ({
  id: 'file-1',
  name: 'note.txt',
  type: 'text/plain',
  size: 10,
  uploadState: 'active',
  ...overrides,
});

describe('useMessageQueue', () => {
  const baseProps = {
    activeSessionId: 'session-1',
    modelId: 'gemini-3.1-pro',
    inputText: 'hello',
    quotes: [] as string[],
    ttsContext: undefined,
    selectedFiles: [] as UploadedFile[],
    isLoading: true,
    canQueueMessageBase: true,
    clearCurrentDraft: vi.fn(),
    setInputText: vi.fn(),
    setQuotes: vi.fn(),
    setWaitingForUpload: vi.fn(),
    textareaRef: { current: null },
    setSelectedFiles: vi.fn(),
    setAppFileError: vi.fn(),
    uploadFailureMessage: 'upload failed',
    completeEditSubmission: vi.fn(),
    completeSendSubmission: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockStoreState.savedSessions = [];
    mockStoreState.selectedFiles = [];
    mockStoreState.loadingSessionIds = new Set();
  });

  it('queues consecutive messages up to the cap and then disallows further queueing', () => {
    const { result } = renderHook(() => useMessageQueue(baseProps));

    for (let i = 0; i < 20; i += 1) {
      act(() => {
        result.current.queueCurrentSubmission();
      });
    }

    expect(result.current.queuedCount).toBe(20);
    expect(result.current.canQueueMessage).toBe(false);
  });

  it('flushes the queue head in FIFO order once the session is idle', () => {
    const completeSendSubmission = vi.fn();
    let isLoading = true;
    const { result, rerender } = renderHook(() => useMessageQueue({ ...baseProps, isLoading, completeSendSubmission }));

    // Queue two messages while loading.
    act(() => {
      result.current.queueCurrentSubmission();
    });
    act(() => {
      result.current.queueCurrentSubmission();
    });
    expect(result.current.queuedCount).toBe(2);

    // Flip to idle and re-render to trigger the flush effect.
    act(() => {
      isLoading = false;
      rerender();
    });
    expect(completeSendSubmission).toHaveBeenCalledTimes(1);
    expect(completeSendSubmission).toHaveBeenCalledWith('hello', false, {
      files: undefined,
      preserveComposer: true,
    });
    expect(result.current.queuedCount).toBe(1);

    // The gate must block a second flush before isLoading flips.
    act(() => {
      rerender();
    });
    expect(completeSendSubmission).toHaveBeenCalledTimes(1);

    // Generation starts → isLoading true → gate released.
    act(() => {
      isLoading = true;
      rerender();
    });

    // Generation ends → idle again → flush head #2.
    act(() => {
      isLoading = false;
      rerender();
    });
    expect(completeSendSubmission).toHaveBeenCalledTimes(2);
    expect(result.current.queuedCount).toBe(0);
  });

  it('restores a queued submission into the composer', () => {
    const setInputText = vi.fn();
    const setQuotes = vi.fn();
    const setSelectedFiles = vi.fn();
    const { result } = renderHook(() =>
      useMessageQueue({
        ...baseProps,
        inputText: 'queued text',
        quotes: ['quote-1'],
        selectedFiles: [makeFile()],
        setInputText,
        setQuotes,
        setSelectedFiles,
      }),
    );

    act(() => {
      result.current.queueCurrentSubmission();
    });

    const firstId = result.current.activeQueuedSubmissions[0].id;

    act(() => {
      result.current.restoreQueuedSubmission(firstId);
    });

    expect(result.current.queuedCount).toBe(0);
    expect(setInputText).toHaveBeenCalledWith('queued text');
    expect(setQuotes).toHaveBeenCalledWith(['quote-1']);
    expect(setSelectedFiles).toHaveBeenCalledWith([expect.objectContaining({ id: 'file-1' })]);
  });

  it('removes a single queued submission and clears all for the session', () => {
    const { result } = renderHook(() => useMessageQueue(baseProps));

    act(() => {
      result.current.queueCurrentSubmission();
      result.current.queueCurrentSubmission();
    });

    const firstId = result.current.activeQueuedSubmissions[0].id;
    act(() => {
      result.current.removeQueuedSubmission(firstId);
    });
    expect(result.current.queuedCount).toBe(1);

    act(() => {
      result.current.removeAllQueuedSubmissions();
    });
    expect(result.current.queuedCount).toBe(0);
  });

  it('reorders queued submissions by moving an item to a target index', () => {
    const { result } = renderHook(() => useMessageQueue(baseProps));

    act(() => {
      result.current.queueCurrentSubmission();
      result.current.queueCurrentSubmission();
      result.current.queueCurrentSubmission();
    });

    const ids = result.current.activeQueuedSubmissions.map((s) => s.id);
    act(() => {
      result.current.reorderQueuedSubmissions(ids[0], 2);
    });

    expect(result.current.activeQueuedSubmissions.map((s) => s.id)).toEqual([ids[1], ids[2], ids[0]]);
  });

  it('filters the queue to the active session only', () => {
    const { result } = renderHook(() => useMessageQueue(baseProps));

    act(() => {
      result.current.queueCurrentSubmission();
    });

    // Switch to a different session.
    act(() => {
      // Simulate switching active session via a re-render with a different session id.
    });

    const { result: otherResult } = renderHook(() => useMessageQueue({ ...baseProps, activeSessionId: 'session-2' }));

    expect(otherResult.current.queuedCount).toBe(0);
    expect(otherResult.current.activeQueuedSubmissions).toEqual([]);
    expect(result.current.queuedCount).toBe(1);
  });
});
