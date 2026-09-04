import { act } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ChatMessage, SavedChatSession } from '@/types';
import { createChatSettings } from '@/test/data/factories';

import { useMessageActions } from './useMessageActions';
import { finishActiveGenerationJob, startActiveGenerationJob } from '@/features/message-sender/activeGenerationJobs';
import { useChatStore } from '@/stores/chatStore';
import { createDeferred, renderHook } from '@/test/render/renderer';

type MessageActionsOptions = Parameters<typeof useMessageActions>[0];

/**
 * Mirrors the production wiring in useChat.ts: every dependency the hook used
 * to receive as a closure now comes straight from the chat store, because
 * handleStopGenerating/handleCancelEdit delegate to the store actions.
 */
const createStoreWiredOptions = (overrides: Partial<MessageActionsOptions> = {}): MessageActionsOptions => {
  const store = useChatStore.getState();
  return {
    messages: store.activeMessages,
    isLoading: store.activeSessionId ? store.loadingSessionIds.has(store.activeSessionId) : false,
    activeSessionId: store.activeSessionId,
    editingMessageId: null,
    activeJobs: store._activeJobs,
    setCommandedInput: store.setCommandedInput,
    setSelectedFiles: store.setSelectedFiles,
    setEditingMessageId: store.setEditingMessageId,
    setEditMode: store.setEditMode,
    setAppFileError: store.setAppFileError,
    updateAndPersistSessions: store.updateAndPersistSessions,
    setActiveSessionId: store.setActiveSessionId,
    userScrolledUpRef: { current: false },
    handleSendMessage: vi.fn(),
    setSessionLoading: store.setSessionLoading,
    ...overrides,
  };
};

describe('useMessageActions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const storeState = useChatStore.getState();
    storeState._activeJobs.current.clear();
    useChatStore.setState({
      savedSessions: [],
      savedGroups: [],
      activeSessionId: null,
      activeMessages: [],
      editingMessageId: null,
      editMode: 'resend',
      commandedInput: null,
      loadingSessionIds: new Set(),
      generatingTitleSessionIds: new Set(),
      selectedFiles: [],
      appFileError: null,
      completedSessions: {},
    });
  });

  it('does not abort unrelated active jobs when the current session has no loading message', () => {
    const otherAbort = vi.fn();
    const activeJobs = useChatStore.getState()._activeJobs;
    startActiveGenerationJob(activeJobs, 'session-other', 'job-other', {
      abort: otherAbort,
    } as unknown as AbortController);
    useChatStore.setState({ activeSessionId: 'session-current', loadingSessionIds: new Set(['session-current']) });

    const { result, unmount } = renderHook(() => useMessageActions(createStoreWiredOptions()));

    let stopResult: 'stopped' | 'no_local_job' | 'not_loading' = 'not_loading';
    act(() => {
      stopResult = result.current.handleStopGenerating();
    });

    // The only local job belongs to another session: request a cross-tab abort
    // instead of touching anything local, and leave the unrelated job alone.
    expect(stopResult).toBe('no_local_job');
    expect(otherAbort).not.toHaveBeenCalled();
    expect(activeJobs.current.has('job-other')).toBe(true);
    // Loading stays flagged for the owner tab to clean up.
    expect(useChatStore.getState().loadingSessionIds.has('session-current')).toBe(true);
    unmount();
  });

  it('blocks retry when loading is owned by another tab (no local job)', async () => {
    const handleSendMessage = vi.fn();
    const setAppFileError = vi.fn();
    const messages: ChatMessage[] = [
      {
        id: 'user-1',
        role: 'user',
        content: 'retry this',
        timestamp: new Date('2026-05-01T00:00:00.000Z'),
      },
      {
        id: 'model-1',
        role: 'model',
        content: 'partial',
        isLoading: true,
        timestamp: new Date('2026-05-01T00:00:01.000Z'),
      },
    ];
    useChatStore.setState({
      activeSessionId: 'session-current',
      loadingSessionIds: new Set(['session-current']),
      activeMessages: messages,
    });

    const { result, unmount } = renderHook(() =>
      useMessageActions(createStoreWiredOptions({ handleSendMessage, setAppFileError })),
    );

    await act(async () => {
      await result.current.handleRetryMessage('model-1');
    });

    expect(handleSendMessage).not.toHaveBeenCalled();
    expect(setAppFileError).toHaveBeenCalledWith(expect.stringContaining('another tab'));
    unmount();
  });

  it('keeps the input in stop mode while retry hands off from the aborted generation to the replacement', async () => {
    const activeJobs = useChatStore.getState()._activeJobs;
    const setSessionLoading = useChatStore.getState().setSessionLoading;
    const oldAbortController = new AbortController();
    const sendDeferred = createDeferred<void>();
    const messages: ChatMessage[] = [
      {
        id: 'user-1',
        role: 'user',
        content: 'retry this',
        timestamp: new Date('2026-05-01T00:00:00.000Z'),
      },
      {
        id: 'model-1',
        role: 'model',
        content: 'partial',
        isLoading: true,
        timestamp: new Date('2026-05-01T00:00:01.000Z'),
      },
    ];
    useChatStore.setState({
      activeSessionId: 'session-current',
      loadingSessionIds: new Set(['session-current']),
      activeMessages: messages,
    });
    startActiveGenerationJob(activeJobs, 'session-current', 'model-1', oldAbortController);

    const handleSendMessage = vi.fn(() => {
      finishActiveGenerationJob({
        activeJobs,
        setSessionLoading,
        sessionId: 'session-current',
        generationId: 'model-1',
      });
      return sendDeferred.promise;
    });

    const { result, unmount } = renderHook(() => useMessageActions(createStoreWiredOptions({ handleSendMessage })));

    let retryPromise!: Promise<void>;
    await act(async () => {
      retryPromise = result.current.handleRetryMessage('model-1');
      await Promise.resolve();
    });

    expect(handleSendMessage).toHaveBeenCalledWith({
      text: 'retry this',
      files: undefined,
      editingId: 'user-1',
    });
    expect(oldAbortController.signal.aborted).toBe(true);
    // The handoff holds the session-level loading flag through the swap.
    expect(useChatStore.getState().loadingSessionIds.has('session-current')).toBe(true);

    const replacementController = new AbortController();
    startActiveGenerationJob(activeJobs, 'session-current', 'model-2', replacementController);

    await act(async () => {
      sendDeferred.resolve();
      await retryPromise;
    });

    // The replacement job keeps the loading flag up.
    expect(useChatStore.getState().loadingSessionIds.has('session-current')).toBe(true);

    act(() => {
      finishActiveGenerationJob({
        activeJobs,
        setSessionLoading,
        sessionId: 'session-current',
        generationId: 'model-2',
      });
    });

    expect(useChatStore.getState().loadingSessionIds.has('session-current')).toBe(false);
    unmount();
  });

  it('forks the active session through the selected message and switches to the new session', () => {
    const messages: ChatMessage[] = [
      {
        id: 'user-1',
        role: 'user',
        content: 'first prompt',
        timestamp: new Date('2026-04-29T00:00:00.000Z'),
      },
      {
        id: 'model-1',
        role: 'model',
        content: 'first answer',
        timestamp: new Date('2026-04-29T00:00:01.000Z'),
      },
      {
        id: 'user-2',
        role: 'user',
        content: 'second prompt',
        timestamp: new Date('2026-04-29T00:00:02.000Z'),
      },
      {
        id: 'model-2',
        role: 'model',
        content: 'second answer',
        timestamp: new Date('2026-04-29T00:00:03.000Z'),
      },
    ];
    let sessions: SavedChatSession[] = [
      {
        id: 'session-current',
        title: 'Original chat',
        timestamp: 1,
        messages,
        settings: createChatSettings(),
      },
    ];
    const updateAndPersistSessions = vi.fn((updater: (prev: SavedChatSession[]) => SavedChatSession[]) => {
      sessions = updater(sessions);
    });
    const setActiveSessionId = vi.fn();

    const { result, unmount } = renderHook(() =>
      useMessageActions({
        messages,
        isLoading: false,
        activeSessionId: 'session-current',
        editingMessageId: null,
        activeJobs: { current: new Map() },
        setCommandedInput: vi.fn(),
        setSelectedFiles: vi.fn(),
        setEditingMessageId: vi.fn(),
        setEditMode: vi.fn(),
        setAppFileError: vi.fn(),
        updateAndPersistSessions,
        setActiveSessionId,
        userScrolledUpRef: { current: false },
        handleSendMessage: vi.fn(),
        setSessionLoading: vi.fn(),
      }),
    );

    act(() => {
      result.current.handleForkMessage('model-1');
    });

    expect(sessions).toHaveLength(2);
    expect(sessions[0].id).not.toBe('session-current');
    expect(sessions[0].title).toBe('Original chat (Fork)');
    expect(sessions[0].messages.map((message) => message.content)).toEqual(['first prompt', 'first answer']);
    expect(sessions[0].messages.map((message) => message.id)).not.toEqual(['user-1', 'model-1']);
    expect(setActiveSessionId).toHaveBeenCalledWith(sessions[0].id, { history: 'push' });

    unmount();
  });

  it('preserves internal tool messages before the selected visible message when forking', () => {
    const messages: ChatMessage[] = [
      {
        id: 'user-1',
        role: 'user',
        content: 'plot sales',
        timestamp: new Date('2026-04-29T00:00:00.000Z'),
      },
      {
        id: 'tool-model-1',
        role: 'model',
        content: '',
        isInternalToolMessage: true,
        toolParentMessageId: 'model-1',
        apiParts: [{ functionCall: { id: 'call-1', name: 'run_local_python', args: { code: 'print(42)' } } }],
        timestamp: new Date('2026-04-29T00:00:01.000Z'),
      },
      {
        id: 'tool-user-1',
        role: 'user',
        content: '',
        isInternalToolMessage: true,
        toolParentMessageId: 'model-1',
        apiParts: [
          {
            functionResponse: {
              id: 'call-1',
              name: 'run_local_python',
              response: { result: { output: '42' } },
            },
          },
        ],
        timestamp: new Date('2026-04-29T00:00:02.000Z'),
      },
      {
        id: 'model-1',
        role: 'model',
        content: 'Here is the chart.',
        timestamp: new Date('2026-04-29T00:00:03.000Z'),
      },
      {
        id: 'user-2',
        role: 'user',
        content: 'next question',
        timestamp: new Date('2026-04-29T00:00:04.000Z'),
      },
    ];
    let sessions: SavedChatSession[] = [
      {
        id: 'session-current',
        title: 'Tool chat',
        timestamp: 1,
        messages,
        settings: createChatSettings(),
      },
    ];
    const updateAndPersistSessions = vi.fn((updater: (prev: SavedChatSession[]) => SavedChatSession[]) => {
      sessions = updater(sessions);
    });

    const { result, unmount } = renderHook(() =>
      useMessageActions({
        messages,
        isLoading: false,
        activeSessionId: 'session-current',
        editingMessageId: null,
        activeJobs: { current: new Map() },
        setCommandedInput: vi.fn(),
        setSelectedFiles: vi.fn(),
        setEditingMessageId: vi.fn(),
        setEditMode: vi.fn(),
        setAppFileError: vi.fn(),
        updateAndPersistSessions,
        setActiveSessionId: vi.fn(),
        userScrolledUpRef: { current: false },
        handleSendMessage: vi.fn(),
        setSessionLoading: vi.fn(),
      }),
    );

    act(() => {
      result.current.handleForkMessage('model-1');
    });

    const forkedMessages = sessions[0].messages;
    expect(forkedMessages).toHaveLength(4);
    expect(forkedMessages.map((message) => message.content)).toEqual(['plot sales', '', '', 'Here is the chart.']);
    expect(forkedMessages.map((message) => message.isInternalToolMessage ?? false)).toEqual([false, true, true, false]);
    expect(forkedMessages[1].toolParentMessageId).toBe(forkedMessages[3].id);
    expect(forkedMessages[2].toolParentMessageId).toBe(forkedMessages[3].id);

    unmount();
  });
});
