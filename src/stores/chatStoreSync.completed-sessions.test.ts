import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SavedChatSession } from '@/types';
import type { SyncMessage } from '@/types/sync';
import { setupChatStoreSync } from './chatStoreSync';

function createChannel() {
  let messageHandler: ((event: MessageEvent<SyncMessage>) => void) | undefined;
  return {
    name: 'all_model_chat_sync_v1',
    onmessage: null,
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

function createDocumentState() {
  return {
    hidden: false,
    visibilityState: 'visible' as const,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  } as unknown as Document;
}

describe('chatStoreSync completedSessions', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.stubGlobal('BroadcastChannel', vi.fn());
  });

  it('records a SESSION_COMPLETED for a session that is not active', () => {
    const channel = createChannel();
    const setCompletedSessions = vi.fn();

    setupChatStoreSync({
      store: {
        getState: () => ({
          activeSessionId: 'active',
          refreshSessions: vi.fn(),
          refreshGroups: vi.fn(),
          setActiveMessages: vi.fn(),
          setSavedSessions: vi.fn(),
          setLoadingSessionIds: vi.fn(),
          setCompletedSessions,
        }),
      },
      localLoadingSessionIds: new Set(),
      getChannel: () => channel,
      getSession: vi.fn(),
      rehydrateSession: vi.fn((session: SavedChatSession) => session),
      logger: { info: vi.fn(), warn: vi.fn() },
      documentRef: createDocumentState(),
    });

    (channel as BroadcastChannel & { emitMessage: (message: SyncMessage) => void }).emitMessage({
      type: 'SESSION_COMPLETED',
      sessionId: 's1',
      outcome: 'success',
    });

    expect(setCompletedSessions).toHaveBeenCalledTimes(1);
    const updater = setCompletedSessions.mock.calls[0][0] as (
      prev: Record<string, 'success' | 'error'>,
    ) => Record<string, 'success' | 'error'>;
    expect(updater({})).toEqual({ s1: 'success' });
  });

  it('does not record a SESSION_COMPLETED when the session is the active one in this tab', () => {
    const channel = createChannel();
    const setCompletedSessions = vi.fn();

    setupChatStoreSync({
      store: {
        getState: () => ({
          activeSessionId: 's1',
          refreshSessions: vi.fn(),
          refreshGroups: vi.fn(),
          setActiveMessages: vi.fn(),
          setSavedSessions: vi.fn(),
          setLoadingSessionIds: vi.fn(),
          setCompletedSessions,
        }),
      },
      localLoadingSessionIds: new Set(),
      getChannel: () => channel,
      getSession: vi.fn(),
      rehydrateSession: vi.fn((session: SavedChatSession) => session),
      logger: { info: vi.fn(), warn: vi.fn() },
      documentRef: createDocumentState(),
    });

    (channel as BroadcastChannel & { emitMessage: (message: SyncMessage) => void }).emitMessage({
      type: 'SESSION_COMPLETED',
      sessionId: 's1',
      outcome: 'error',
    });

    expect(setCompletedSessions).not.toHaveBeenCalled();
  });

  it('removes the local record on SESSION_VIEWED', () => {
    const channel = createChannel();
    const setCompletedSessions = vi.fn();

    setupChatStoreSync({
      store: {
        getState: () => ({
          activeSessionId: null,
          refreshSessions: vi.fn(),
          refreshGroups: vi.fn(),
          setActiveMessages: vi.fn(),
          setSavedSessions: vi.fn(),
          setLoadingSessionIds: vi.fn(),
          setCompletedSessions,
        }),
      },
      localLoadingSessionIds: new Set(),
      getChannel: () => channel,
      getSession: vi.fn(),
      rehydrateSession: vi.fn((session: SavedChatSession) => session),
      logger: { info: vi.fn(), warn: vi.fn() },
      documentRef: createDocumentState(),
    });

    (channel as BroadcastChannel & { emitMessage: (message: SyncMessage) => void }).emitMessage({
      type: 'SESSION_VIEWED',
      sessionId: 's1',
    });

    expect(setCompletedSessions).toHaveBeenCalledTimes(1);
    const updater = setCompletedSessions.mock.calls[0][0] as (
      prev: Record<string, 'success' | 'error'>,
    ) => Record<string, 'success' | 'error'>;
    expect(updater({ s1: 'success' })).toEqual({});
  });

  it('returns the same record object when SESSION_VIEWED has nothing to clear', () => {
    const channel = createChannel();
    const setCompletedSessions = vi.fn();

    setupChatStoreSync({
      store: {
        getState: () => ({
          activeSessionId: null,
          refreshSessions: vi.fn(),
          refreshGroups: vi.fn(),
          setActiveMessages: vi.fn(),
          setSavedSessions: vi.fn(),
          setLoadingSessionIds: vi.fn(),
          setCompletedSessions,
        }),
      },
      localLoadingSessionIds: new Set(),
      getChannel: () => channel,
      getSession: vi.fn(),
      rehydrateSession: vi.fn((session: SavedChatSession) => session),
      logger: { info: vi.fn(), warn: vi.fn() },
      documentRef: createDocumentState(),
    });

    (channel as BroadcastChannel & { emitMessage: (message: SyncMessage) => void }).emitMessage({
      type: 'SESSION_VIEWED',
      sessionId: 'missing',
    });

    const updater = setCompletedSessions.mock.calls[0][0] as (
      prev: Record<string, 'success' | 'error'>,
    ) => Record<string, 'success' | 'error'>;
    const prev: Record<string, 'success' | 'error'> = { s1: 'success' };
    expect(updater(prev)).toBe(prev);
  });

  it('does not re-broadcast when handling SESSION_COMPLETED (no broadcast loop)', () => {
    const channel = createChannel();
    const setCompletedSessions = vi.fn();

    setupChatStoreSync({
      store: {
        getState: () => ({
          activeSessionId: null,
          refreshSessions: vi.fn(),
          refreshGroups: vi.fn(),
          setActiveMessages: vi.fn(),
          setSavedSessions: vi.fn(),
          setLoadingSessionIds: vi.fn(),
          setCompletedSessions,
        }),
      },
      localLoadingSessionIds: new Set(),
      getChannel: () => channel,
      getSession: vi.fn(),
      rehydrateSession: vi.fn((session: SavedChatSession) => session),
      logger: { info: vi.fn(), warn: vi.fn() },
      documentRef: createDocumentState(),
    });

    (channel as BroadcastChannel & { emitMessage: (message: SyncMessage) => void }).emitMessage({
      type: 'SESSION_COMPLETED',
      sessionId: 's1',
      outcome: 'success',
    });

    expect(channel.postMessage).not.toHaveBeenCalled();
    expect(setCompletedSessions).toHaveBeenCalledTimes(1);
  });
});
