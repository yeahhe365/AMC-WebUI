import { describe, it, expect, vi, beforeEach } from 'vitest';

globalThis.BroadcastChannel = vi.fn(() => ({
  postMessage: vi.fn(),
  onmessage: null as BroadcastChannel['onmessage'],
  close: vi.fn(),
})) as unknown as typeof BroadcastChannel;

const sessionStore: Record<string, string> = {};
const mockSessionStorage = {
  getItem: vi.fn((key: string) => sessionStore[key] ?? null),
  setItem: vi.fn((key: string, val: string) => {
    sessionStore[key] = val;
  }),
  removeItem: vi.fn((key: string) => {
    delete sessionStore[key];
  }),
};
Object.defineProperty(window, 'sessionStorage', { value: mockSessionStorage });

window.history.replaceState = vi.fn();
window.history.pushState = vi.fn();
Object.defineProperty(window, 'location', {
  configurable: true,
  writable: true,
  value: { pathname: '/' } as Location,
});

vi.mock('@/utils/chat/session', () => ({
  rehydrateSessionFiles: vi.fn((session: any) => session),
}));

vi.mock('@/i18n/translations', () => ({
  getTranslator: vi.fn(),
}));

vi.mock('@/utils/themeDom', () => ({
  applyThemeToDocument: vi.fn(),
}));

vi.mock('@/utils/model/modelSorting', () => ({
  resolveSupportedModelId: vi.fn((modelId: string | null | undefined, fallback: string) => modelId || fallback),
}));

const { chatChannelPostMessage } = vi.hoisted(() => ({ chatChannelPostMessage: vi.fn() }));
vi.mock('./chatSyncChannel', () => ({
  getChatSyncChannel: () => ({
    postMessage: chatChannelPostMessage,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }),
  broadcastSyncMessage: (message: unknown) => chatChannelPostMessage(message),
}));

import { useChatStore } from './chatStore';
import { type SavedChatSession } from '@/types';
import { createSavedChatSessionMetadata } from '@/test/data/factories';

const makeSession = (overrides: Partial<SavedChatSession> = {}): SavedChatSession =>
  createSavedChatSessionMetadata({
    id: `sess-${Math.random().toString(36).slice(2, 8)}`,
    title: 'Test Session',
    timestamp: Date.now(),
    ...overrides,
  });

describe('chatStore completedSessions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
      isAppProcessingFile: false,
      aspectRatio: '1:1',
      imageSize: '1K',
      imageOutputMode: 'IMAGE_TEXT',
      isSwitchingModel: false,
      completedSessions: {},
    });
  });

  describe('markSessionCompleted', () => {
    it('records the outcome for a non-active session', () => {
      useChatStore.getState().setActiveSessionId('active');
      useChatStore.getState().markSessionCompleted('s1', 'success');

      expect(useChatStore.getState().completedSessions).toEqual({ s1: 'success' });
    });

    it('skips the local write when the session is the active one (user is watching live)', () => {
      useChatStore.getState().setActiveSessionId('s1');
      useChatStore.getState().markSessionCompleted('s1', 'success');

      expect(useChatStore.getState().completedSessions).toEqual({});
    });

    it('broadcasts SESSION_COMPLETED regardless of whether the local write is skipped', () => {
      useChatStore.getState().setActiveSessionId('s1');
      useChatStore.getState().markSessionCompleted('s1', 'error');

      expect(chatChannelPostMessage).toHaveBeenCalledWith({
        type: 'SESSION_COMPLETED',
        sessionId: 's1',
        outcome: 'error',
      });
    });

    it('overwrites an earlier outcome with the latest one', () => {
      useChatStore.getState().markSessionCompleted('s1', 'success');
      useChatStore.getState().markSessionCompleted('s1', 'error');

      expect(useChatStore.getState().completedSessions).toEqual({ s1: 'error' });
    });
  });

  describe('markSessionViewed', () => {
    it('removes the record and broadcasts SESSION_VIEWED', () => {
      useChatStore.getState().markSessionCompleted('s1', 'success');
      expect(useChatStore.getState().completedSessions).toEqual({ s1: 'success' });

      useChatStore.getState().markSessionViewed('s1');

      expect(useChatStore.getState().completedSessions).toEqual({});
      expect(chatChannelPostMessage).toHaveBeenCalledWith({ type: 'SESSION_VIEWED', sessionId: 's1' });
    });

    it('does not error when there is no record for the session', () => {
      expect(() => useChatStore.getState().markSessionViewed('s1')).not.toThrow();
      expect(useChatStore.getState().completedSessions).toEqual({});
    });
  });

  describe('setSessionLoading', () => {
    it('clears the completion record when a new generation starts', () => {
      useChatStore.getState().markSessionCompleted('s1', 'success');
      useChatStore.getState().setSessionLoading('s1', true);

      expect(useChatStore.getState().completedSessions).toEqual({});
    });

    it('does not clear records for other sessions', () => {
      useChatStore.getState().markSessionCompleted('s1', 'success');
      useChatStore.getState().markSessionCompleted('s2', 'error');
      useChatStore.getState().setSessionLoading('s1', true);

      expect(useChatStore.getState().completedSessions).toEqual({ s2: 'error' });
    });

    it('keeps the record untouched when turning loading off', () => {
      useChatStore.getState().markSessionCompleted('s1', 'success');
      useChatStore.getState().setSessionLoading('s1', false);

      expect(useChatStore.getState().completedSessions).toEqual({ s1: 'success' });
    });
  });

  describe('updateAndPersistSessions', () => {
    it('removes completion records for sessions deleted via the updater', () => {
      useChatStore.getState().setSavedSessions([makeSession({ id: 's1' }), makeSession({ id: 's2' })]);
      useChatStore.getState().markSessionCompleted('s1', 'success');
      useChatStore.getState().markSessionCompleted('s2', 'error');

      useChatStore.getState().updateAndPersistSessions((prev) => prev.filter((s) => s.id === 's1'), {
        persist: false,
      });

      expect(useChatStore.getState().completedSessions).toEqual({ s1: 'success' });
    });

    it('keeps records for sessions that are only updated, not deleted', () => {
      useChatStore.getState().setSavedSessions([makeSession({ id: 's1' })]);
      useChatStore.getState().markSessionCompleted('s1', 'success');

      useChatStore
        .getState()
        .updateAndPersistSessions((prev) => prev.map((s) => (s.id === 's1' ? { ...s, title: 'Updated' } : s)), {
          persist: false,
        });

      expect(useChatStore.getState().completedSessions).toEqual({ s1: 'success' });
    });
  });
});
