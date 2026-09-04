import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SavedChatSession } from '@/types';
import type { SyncMessage } from '@/types/sync';
import { createSavedChatSessionMetadata } from '@/test/data/factories';
import { setupChatStoreSync } from './chatStoreSync';

function createChannel(originalOnMessage?: (event: MessageEvent<SyncMessage>) => void) {
  let messageHandler: ((event: MessageEvent<SyncMessage>) => void) | undefined;
  return {
    name: 'all_model_chat_sync_v1',
    onmessage: originalOnMessage ?? null,
    onmessageerror: null,
    postMessage: vi.fn(),
    close: vi.fn(),
    addEventListener: vi.fn((eventName: string, handler: (event: MessageEvent<SyncMessage>) => void) => {
      if (eventName === 'message') {
        messageHandler = handler;
      }
    }),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
    emitMessage(message: SyncMessage) {
      messageHandler?.({ data: message } as MessageEvent<SyncMessage>);
    },
  } as BroadcastChannel;
}

function createDocumentState(hidden = false) {
  let visibilityHandler: (() => void) | undefined;
  const documentRef = {
    hidden,
    visibilityState: hidden ? 'hidden' : 'visible',
    addEventListener: vi.fn((eventName: string, handler: () => void) => {
      if (eventName === 'visibilitychange') {
        visibilityHandler = handler;
      }
    }),
    removeEventListener: vi.fn(),
  } as unknown as Document;

  return {
    documentRef,
    setVisible() {
      Object.assign(documentRef, {
        hidden: false,
        visibilityState: 'visible',
      });
      visibilityHandler?.();
    },
  };
}

describe('chatStoreSync', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.stubGlobal('BroadcastChannel', vi.fn());
  });

  it('chains the existing channel handler and refreshes sessions while visible', () => {
    const originalOnMessage = vi.fn();
    const channel = createChannel(originalOnMessage);
    const refreshSessions = vi.fn();
    const documentState = createDocumentState(false);

    setupChatStoreSync({
      store: {
        getState: () => ({
          activeSessionId: null,
          refreshSessions,
          refreshGroups: vi.fn(),
          setActiveMessages: vi.fn(),
          setSavedSessions: vi.fn(),
          setLoadingSessionIds: vi.fn(),
          setCompletedSessions: vi.fn(),
        }),
      },
      localLoadingSessionIds: new Set(),
      getChannel: () => channel,
      getSession: vi.fn(),
      rehydrateSession: vi.fn((session: SavedChatSession) => session),
      logger: { info: vi.fn(), warn: vi.fn() },
      documentRef: documentState.documentRef,
    });

    (channel as BroadcastChannel & { emitMessage: (message: SyncMessage) => void }).emitMessage({
      type: 'SESSIONS_UPDATED',
    });

    expect(channel.onmessage).toBe(originalOnMessage);
    expect(originalOnMessage).not.toHaveBeenCalled();
    expect(channel.addEventListener).toHaveBeenCalledWith('message', expect.any(Function));
    expect(refreshSessions).toHaveBeenCalledTimes(1);
  });

  it('defers session and group refreshes while hidden until the tab becomes visible', () => {
    const channel = createChannel();
    const refreshSessions = vi.fn();
    const refreshGroups = vi.fn();
    const documentState = createDocumentState(true);

    setupChatStoreSync({
      store: {
        getState: () => ({
          activeSessionId: null,
          refreshSessions,
          refreshGroups,
          setActiveMessages: vi.fn(),
          setSavedSessions: vi.fn(),
          setLoadingSessionIds: vi.fn(),
          setCompletedSessions: vi.fn(),
        }),
      },
      localLoadingSessionIds: new Set(),
      getChannel: () => channel,
      getSession: vi.fn(),
      rehydrateSession: vi.fn((session: SavedChatSession) => session),
      logger: { info: vi.fn(), warn: vi.fn() },
      documentRef: documentState.documentRef,
    });

    (channel as BroadcastChannel & { emitMessage: (message: SyncMessage) => void }).emitMessage({
      type: 'GROUPS_UPDATED',
    });

    expect(refreshGroups).not.toHaveBeenCalled();
    documentState.setVisible();

    expect(refreshSessions).toHaveBeenCalledTimes(1);
    expect(refreshGroups).toHaveBeenCalledTimes(1);
  });

  it('hydrates active session content updates from the database', async () => {
    const channel = createChannel();
    const message = { id: 'message', role: 'model' as const, content: 'fresh', timestamp: new Date() };
    const persistedSession = createSavedChatSessionMetadata({ id: 'active', messages: [message] });
    const rehydratedSession = createSavedChatSessionMetadata({ id: 'active', messages: [message] });
    const setActiveMessages = vi.fn();
    const setSavedSessions = vi.fn();

    setupChatStoreSync({
      store: {
        getState: () => ({
          activeSessionId: 'active',
          refreshSessions: vi.fn(),
          refreshGroups: vi.fn(),
          setActiveMessages,
          setSavedSessions,
          setLoadingSessionIds: vi.fn(),
          setCompletedSessions: vi.fn(),
        }),
      },
      localLoadingSessionIds: new Set(),
      getChannel: () => channel,
      getSession: vi.fn(async () => persistedSession),
      rehydrateSession: vi.fn(() => rehydratedSession),
      logger: { info: vi.fn(), warn: vi.fn() },
      documentRef: createDocumentState(false).documentRef,
    });

    (channel as BroadcastChannel & { emitMessage: (message: SyncMessage) => void }).emitMessage({
      type: 'SESSION_CONTENT_UPDATED',
      sessionId: 'active',
    });
    await vi.waitFor(() => {
      expect(setActiveMessages).toHaveBeenCalledWith([message]);
    });

    const updateSavedSessions = setSavedSessions.mock.calls[0][0] as (prev: SavedChatSession[]) => SavedChatSession[];
    expect(updateSavedSessions([createSavedChatSessionMetadata({ id: 'active', messages: [message] })])).toEqual([
      { ...rehydratedSession, messages: [] },
    ]);
  });

  it('ignores content updates for locally loading sessions', () => {
    const channel = createChannel();
    const getSession = vi.fn();

    setupChatStoreSync({
      store: {
        getState: () => ({
          activeSessionId: 'active',
          refreshSessions: vi.fn(),
          refreshGroups: vi.fn(),
          setActiveMessages: vi.fn(),
          setSavedSessions: vi.fn(),
          setLoadingSessionIds: vi.fn(),
          setCompletedSessions: vi.fn(),
        }),
      },
      localLoadingSessionIds: new Set(['active']),
      getChannel: () => channel,
      getSession,
      rehydrateSession: vi.fn((session: SavedChatSession) => session),
      logger: { info: vi.fn(), warn: vi.fn() },
      documentRef: createDocumentState(false).documentRef,
    });

    (channel as BroadcastChannel & { emitMessage: (message: SyncMessage) => void }).emitMessage({
      type: 'SESSION_CONTENT_UPDATED',
      sessionId: 'active',
    });

    expect(getSession).not.toHaveBeenCalled();
  });

  it('ignores SESSION_LOADING messages that originated from this tab', async () => {
    const channel = createChannel();
    const setLoadingSessionIds = vi.fn();
    const { TAB_ID } = await import('./tabIdentity');

    setupChatStoreSync({
      store: {
        getState: () => ({
          activeSessionId: null,
          refreshSessions: vi.fn(),
          refreshGroups: vi.fn(),
          setActiveMessages: vi.fn(),
          setSavedSessions: vi.fn(),
          setLoadingSessionIds,
          setCompletedSessions: vi.fn(),
        }),
      },
      localLoadingSessionIds: new Set(),
      getChannel: () => channel,
      getSession: vi.fn(),
      rehydrateSession: vi.fn((session: SavedChatSession) => session),
      logger: { info: vi.fn(), warn: vi.fn() },
      documentRef: createDocumentState(false).documentRef,
    });

    (channel as BroadcastChannel & { emitMessage: (message: SyncMessage) => void }).emitMessage({
      type: 'SESSION_LOADING',
      sessionId: 's1',
      isLoading: true,
      originId: TAB_ID,
      ts: Date.now(),
    });

    expect(setLoadingSessionIds).not.toHaveBeenCalled();
  });

  it('aborts local generation jobs when ABORT_GENERATION is received from another tab', async () => {
    const channel = createChannel();
    const abort = vi.fn();
    const activeJobs = {
      current: new Map<string, AbortController>([['gen-1', { abort } as unknown as AbortController]]),
    };
    const { startActiveGenerationJob } = await import('@/features/message-sender/activeGenerationJobs');
    startActiveGenerationJob(activeJobs, 'session-a', 'gen-1', activeJobs.current.get('gen-1')!);

    setupChatStoreSync({
      store: {
        getState: () => ({
          activeSessionId: 'session-a',
          refreshSessions: vi.fn(),
          refreshGroups: vi.fn(),
          setActiveMessages: vi.fn(),
          setSavedSessions: vi.fn(),
          setLoadingSessionIds: vi.fn(),
          setCompletedSessions: vi.fn(),
        }),
      },
      localLoadingSessionIds: new Set(['session-a']),
      activeJobs,
      getChannel: () => channel,
      getSession: vi.fn(),
      rehydrateSession: vi.fn((session: SavedChatSession) => session),
      logger: { info: vi.fn(), warn: vi.fn() },
      documentRef: createDocumentState(false).documentRef,
    });

    (channel as BroadcastChannel & { emitMessage: (message: SyncMessage) => void }).emitMessage({
      type: 'ABORT_GENERATION',
      sessionId: 'session-a',
      originId: 'other-tab',
    });

    expect(abort).toHaveBeenCalled();
  });

  it('clears remote loading when the generation lease is stale', () => {
    vi.useFakeTimers();
    const channel = createChannel();
    const setLoadingSessionIds = vi.fn();

    setupChatStoreSync({
      store: {
        getState: () => ({
          activeSessionId: null,
          refreshSessions: vi.fn(),
          refreshGroups: vi.fn(),
          setActiveMessages: vi.fn(),
          setSavedSessions: vi.fn(),
          setLoadingSessionIds,
          setCompletedSessions: vi.fn(),
        }),
      },
      localLoadingSessionIds: new Set(),
      getChannel: () => channel,
      getSession: vi.fn(),
      rehydrateSession: vi.fn((session: SavedChatSession) => session),
      logger: { info: vi.fn(), warn: vi.fn() },
      documentRef: createDocumentState(false).documentRef,
      now: () => Date.now(),
    });

    // No lease in localStorage → stale.
    vi.advanceTimersByTime(30_000);

    expect(setLoadingSessionIds).toHaveBeenCalled();
    const updater = setLoadingSessionIds.mock.calls.at(-1)?.[0] as (prev: Set<string>) => Set<string>;
    expect(updater(new Set(['remote-session']))).toEqual(new Set());

    vi.useRealTimers();
  });

  it('cleans up message and visibility listeners', () => {
    const channel = createChannel();
    const documentState = createDocumentState(false);

    const cleanup = setupChatStoreSync({
      store: {
        getState: () => ({
          activeSessionId: null,
          refreshSessions: vi.fn(),
          refreshGroups: vi.fn(),
          setActiveMessages: vi.fn(),
          setSavedSessions: vi.fn(),
          setLoadingSessionIds: vi.fn(),
          setCompletedSessions: vi.fn(),
        }),
      },
      localLoadingSessionIds: new Set(),
      getChannel: () => channel,
      getSession: vi.fn(),
      rehydrateSession: vi.fn((session: SavedChatSession) => session),
      logger: { info: vi.fn(), warn: vi.fn() },
      documentRef: documentState.documentRef,
    });

    cleanup();

    expect(channel.removeEventListener).toHaveBeenCalledWith('message', expect.any(Function));
    expect(documentState.documentRef.removeEventListener).toHaveBeenCalledWith(
      'visibilitychange',
      expect.any(Function),
    );
  });
});
