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

vi.mock('@/utils/theme/themeDom', () => ({
  applyThemeToDocument: vi.fn(),
}));

vi.mock('@/utils/model/modelSorting', () => ({
  resolveSupportedModelId: vi.fn((modelId: string | null | undefined, fallback: string) => modelId || fallback),
}));

import { useChatStore } from './chatStore';
import { setupChatStoreSync } from './sync/chatStoreSync';
import type { SyncMessage } from '@/types/sync';
import { useChatDraftStore } from './chatDraftStore';
import { dbService } from '@/services/db/dbService';
import { type SavedChatSession, type ChatGroup } from '@/types';
import { createChatSettings, createSavedChatSessionMetadata, createUploadedFile } from '@/test/data/factories';
import { updateMessageInSession as updateMessageInSessionUtil } from '@/utils/chat/sessionMutations';
import { startActiveGenerationJob } from '@/features/message-sender/activeGenerationJobs';

const makeSession = (overrides: Partial<SavedChatSession> = {}): SavedChatSession =>
  createSavedChatSessionMetadata({
    id: `sess-${Math.random().toString(36).slice(2, 8)}`,
    title: 'Test Session',
    timestamp: Date.now(),
    ...overrides,
  });

const makeGroup = (overrides: Partial<ChatGroup> = {}): ChatGroup => ({
  id: `grp-${Math.random().toString(36).slice(2, 8)}`,
  title: 'Test Group',
  timestamp: Date.now(),
  ...overrides,
});

describe('chatStore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset to clean state
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
      pendingLockedApiKey: null,
    });
  });

  // ── setActiveSessionId ──

  describe('setActiveSessionId', () => {
    it('sets the active session ID', () => {
      useChatStore.getState().setActiveSessionId('sess-1');
      expect(useChatStore.getState().activeSessionId).toBe('sess-1');
    });

    it('pushes a new browser history entry when explicitly navigating between chat sessions', () => {
      window.location.pathname = '/chat/sess-1';

      useChatStore.getState().setActiveSessionId('sess-2', { history: 'push' });

      expect(window.history.pushState).toHaveBeenCalledWith({ sessionId: 'sess-2' }, '', '/chat/sess-2');
      expect(window.history.replaceState).not.toHaveBeenCalled();
    });

    it('skips browser history writes when history sync is disabled', () => {
      window.location.pathname = '/chat/sess-1';

      useChatStore.getState().setActiveSessionId('sess-2', { history: 'none' });

      expect(window.history.pushState).not.toHaveBeenCalled();
      expect(window.history.replaceState).not.toHaveBeenCalled();
    });

    it('clears active session when set to null', () => {
      useChatStore.getState().setActiveSessionId('sess-1');
      useChatStore.getState().setActiveSessionId(null);
      expect(useChatStore.getState().activeSessionId).toBeNull();
    });

    it('navigates back to root when clearing an active /chat route', () => {
      window.location.pathname = '/chat/sess-1';

      useChatStore.getState().setActiveSessionId('sess-1');
      useChatStore.getState().setActiveSessionId(null);

      expect(window.history.pushState).toHaveBeenCalledWith({}, '', '/');
    });
  });

  // ── setSavedSessions ──

  describe('setSavedSessions', () => {
    it('sets sessions from array', () => {
      const sessions = [makeSession({ id: 's1' }), makeSession({ id: 's2' })];
      useChatStore.getState().setSavedSessions(sessions);
      expect(useChatStore.getState().savedSessions).toEqual(sessions);
    });

    it('updates sessions with updater function', () => {
      useChatStore.getState().setSavedSessions([makeSession({ id: 's1' })]);
      useChatStore.getState().setSavedSessions((prev) => [...prev, makeSession({ id: 's2' })]);
      expect(useChatStore.getState().savedSessions).toHaveLength(2);
    });
  });

  // ── setActiveMessages ──

  describe('setActiveMessages', () => {
    it('sets messages array', () => {
      const msgs = [{ id: 'm1', role: 'user' as const, content: 'Hi', timestamp: new Date() }];
      useChatStore.getState().setActiveMessages(msgs);
      expect(useChatStore.getState().activeMessages).toEqual(msgs);
    });
  });

  // ── Idempotent streaming patches preserve references (regression guard) ──
  // The streaming hot path re-applies the same message patch on every SSE chunk
  // (thinkingSource / thinking resume). When the patch changes nothing, the
  // whole update must be a no-op: savedSessions keeps its identity so no
  // subscriber re-renders. This is what makes the per-chunk store rewrite a
  // short-circuit instead of a cascade.

  describe('idempotent updates preserve store references', () => {
    const sessionWithMessage = (): SavedChatSession =>
      makeSession({
        id: 'active',
        messages: [{ id: 'gen-1', role: 'model' as const, content: 'hi', timestamp: new Date() }],
      });

    it('keeps savedSessions identity when a function updater changes nothing', () => {
      const session = sessionWithMessage();
      useChatStore.getState().setSavedSessions([session]);
      useChatStore.getState().setActiveSessionId('active');

      const before = useChatStore.getState().savedSessions;
      useChatStore.getState().updateAndPersistSessions(
        (prev) =>
          updateMessageInSessionUtil(prev, 'active', 'gen-1', (message) => {
            void message;
            return message;
          }),
        { persist: false },
      );

      expect(useChatStore.getState().savedSessions).toBe(before);
      expect(useChatStore.getState().savedSessions[0]).toBe(session);
      expect(useChatStore.getState().activeMessages).toBe(useChatStore.getState().activeMessages);
    });

    it('keeps savedSessions identity when a patch already matches the message', () => {
      const session = sessionWithMessage();
      useChatStore.getState().setSavedSessions([session]);
      useChatStore.getState().setActiveSessionId('active');

      const before = useChatStore.getState().savedSessions;
      useChatStore
        .getState()
        .updateAndPersistSessions((prev) => updateMessageInSessionUtil(prev, 'active', 'gen-1', { content: 'hi' }));

      expect(useChatStore.getState().savedSessions).toBe(before);
    });

    it('still updates savedSessions and activeMessages when the patch changes a field', () => {
      const session = sessionWithMessage();
      useChatStore.getState().setSavedSessions([session]);
      useChatStore.getState().setActiveSessionId('active');
      // In the real streaming path activeMessages mirrors the session's runtime
      // messages; keep them in sync so the patch actually finds its target.
      useChatStore.getState().setActiveMessages([...session.messages]);

      useChatStore
        .getState()
        .updateAndPersistSessions((prev) =>
          updateMessageInSessionUtil(prev, 'active', 'gen-1', { thinkingSource: 'gemini' }),
        );

      const saved = useChatStore.getState().savedSessions[0];
      expect(saved).not.toBe(session);
      expect(saved.messages[0].thinkingSource).toBe('gemini');
      expect(useChatStore.getState().activeMessages[0].thinkingSource).toBe('gemini');
    });
  });

  // ── Auxiliary setters ──

  describe('auxiliary setters', () => {
    it('setEditingMessageId', () => {
      useChatStore.getState().setEditingMessageId('msg-1');
      expect(useChatStore.getState().editingMessageId).toBe('msg-1');
    });

    it('setEditMode', () => {
      useChatStore.getState().setEditMode('update');
      expect(useChatStore.getState().editMode).toBe('update');
    });

    it('setSelectedFiles', () => {
      useChatStore.getState().setSelectedFiles([createUploadedFile({ id: 'f1' })]);
      expect(useChatStore.getState().selectedFiles).toHaveLength(1);
    });

    it('setAppFileError', () => {
      useChatStore.getState().setAppFileError('Upload failed');
      expect(useChatStore.getState().appFileError).toBe('Upload failed');
    });

    it('setAspectRatio', () => {
      useChatStore.getState().setAspectRatio('16:9');
      expect(useChatStore.getState().aspectRatio).toBe('16:9');
    });

    it('setImageSize', () => {
      useChatStore.getState().setImageSize('2K');
      expect(useChatStore.getState().imageSize).toBe('2K');
    });

    it('setImageOutputMode', () => {
      useChatStore.getState().setImageOutputMode('IMAGE_ONLY');
      expect(useChatStore.getState().imageOutputMode).toBe('IMAGE_ONLY');
    });

    it('setIsSwitchingModel', () => {
      useChatStore.getState().setIsSwitchingModel(true);
      expect(useChatStore.getState().isSwitchingModel).toBe(true);
    });

    it('setLoadingSessionIds', () => {
      useChatStore.getState().setLoadingSessionIds(new Set(['s1']));
      expect(useChatStore.getState().loadingSessionIds.has('s1')).toBe(true);
    });
  });

  // ── refreshSessions ──

  describe('refreshSessions', () => {
    it('loads session metadata from DB', async () => {
      const sessions = [makeSession({ id: 's1', title: 'Loaded' })];
      vi.mocked(dbService.getAllSessionMetadata).mockResolvedValue(sessions);
      await useChatStore.getState().refreshSessions();
      expect(useChatStore.getState().savedSessions).toHaveLength(1);
      expect(useChatStore.getState().savedSessions[0].title).toBe('Loaded');
    });

    it('loads active session messages when activeSessionId is set', async () => {
      const fullSession = makeSession({
        id: 's1',
        messages: [{ id: 'm1', role: 'user', content: 'Hello', timestamp: new Date() }],
      });
      vi.mocked(dbService.getAllSessionMetadata).mockResolvedValue([fullSession]);
      vi.mocked(dbService.getSession).mockResolvedValue(fullSession);

      useChatStore.getState().setActiveSessionId('s1');
      await useChatStore.getState().refreshSessions();
      expect(useChatStore.getState().activeMessages).toHaveLength(1);
    });

    it('synchronizes active session messages between activeMessages and savedSessions upon refresh', async () => {
      const freshMessage = { id: 'm1', role: 'user' as const, content: 'Fresh from DB', timestamp: new Date() };
      const staleMessage = { id: 'm0', role: 'user' as const, content: 'Stale in memory', timestamp: new Date() };
      const fullSession = makeSession({
        id: 's1',
        messages: [freshMessage],
      });
      vi.mocked(dbService.getAllSessionMetadata).mockResolvedValue([{ ...fullSession, messages: [] }]);
      vi.mocked(dbService.getSession).mockResolvedValue(fullSession);

      useChatStore.getState().setActiveSessionId('s1');
      useChatStore.getState().setActiveMessages([staleMessage]);
      useChatStore.getState().setSavedSessions([makeSession({ id: 's1', messages: [staleMessage] })]);

      await useChatStore.getState().refreshSessions();

      expect(useChatStore.getState().activeMessages).toEqual([freshMessage]);
      expect(useChatStore.getState().savedSessions[0].messages).toEqual([freshMessage]);
    });

    it('does not overwrite active session runtime messages while that session is still loading', async () => {
      const persistedSession = makeSession({
        id: 's1',
        title: 'Persisted',
        messages: [{ id: 'm-db', role: 'model', content: 'stale', timestamp: new Date() }],
      });
      const localStreamingMessage = {
        id: 'm-local',
        role: 'model' as const,
        content: 'local partial',
        isLoading: true,
        timestamp: new Date(),
      };

      vi.mocked(dbService.getAllSessionMetadata).mockResolvedValue([{ ...persistedSession, messages: [] }]);
      vi.mocked(dbService.getSession).mockResolvedValue(persistedSession);

      useChatStore.getState().setActiveSessionId('s1');
      useChatStore.getState().setActiveMessages([localStreamingMessage]);
      useChatStore.getState().setSavedSessions([{ ...persistedSession, messages: [localStreamingMessage] }]);
      useChatStore.getState().setSessionLoading('s1', true);

      await useChatStore.getState().refreshSessions();

      expect(useChatStore.getState().activeMessages).toEqual([localStreamingMessage]);
      expect(useChatStore.getState().savedSessions[0].messages).toEqual([localStreamingMessage]);
    });

    it.each(['switch', 'generation', 'newer-refresh'])('discards an active session read after %s', async (change) => {
      const stale = makeSession({
        id: 'a',
        messages: [{ id: 'stale', role: 'model', content: 'old', timestamp: new Date() }],
      });
      const newer = makeSession({
        id: 'a',
        messages: [{ id: 'newer', role: 'model', content: 'new', timestamp: new Date() }],
      });
      let resolve!: (value: SavedChatSession) => void;
      const pending = new Promise<SavedChatSession>((done) => {
        resolve = done;
      });
      vi.mocked(dbService.getAllSessionMetadata).mockResolvedValue([{ ...stale, messages: [] }]);
      vi.mocked(dbService.getSession).mockReturnValueOnce(pending).mockResolvedValue(newer);
      useChatStore.getState().setActiveSessionId('a');
      const refresh = useChatStore.getState().refreshSessions();
      await Promise.resolve();
      if (change === 'switch') {
        useChatStore.getState().setActiveSessionId('b');
        useChatStore.getState().setActiveMessages([{ ...newer.messages[0], id: 'b' }]);
      } else if (change === 'generation') {
        useChatStore.getState().setSessionLoading('a', true);
        useChatStore.getState().setActiveMessages([{ ...newer.messages[0], id: 'generating', isLoading: true }]);
      } else {
        await useChatStore.getState().refreshSessions();
      }
      const expected = useChatStore.getState().activeMessages;
      resolve(stale);
      await refresh;
      expect(useChatStore.getState().activeMessages).toBe(expected);
    });

    it('does not replace a new generation completed while metadata was loading', async () => {
      const stale = makeSession({
        id: 'a',
        messages: [{ id: 'stale', role: 'model', content: 'old', timestamp: new Date() }],
      });
      let resolve!: (sessions: SavedChatSession[]) => void;
      const pending = new Promise<SavedChatSession[]>((done) => {
        resolve = done;
      });
      vi.mocked(dbService.getAllSessionMetadata).mockReturnValueOnce(pending);
      vi.mocked(dbService.getSession).mockResolvedValue(stale);
      useChatStore.getState().setActiveSessionId('a');
      const refresh = useChatStore.getState().refreshSessions();
      useChatStore.getState().setSessionLoading('a', true);
      const newMessages = [{ ...stale.messages[0], id: 'new-generation', content: 'new result' }];
      useChatStore.getState().setActiveMessages(newMessages);
      useChatStore.getState().setSessionLoading('a', false);
      resolve([{ ...stale, messages: [] }]);
      await refresh;
      expect(useChatStore.getState().activeMessages).toBe(newMessages);
    });

    it.each([
      ['refresh', 'old-first'],
      ['refresh', 'new-first'],
      ['broadcast', 'old-first'],
      ['broadcast', 'new-first'],
    ])('keeps newer content when the older source is %s and resolves %s', async (olderSource, resolution) => {
      const initial = makeSession({
        id: 'overlap',
        messages: [{ id: 'initial', role: 'model', content: 'initial', timestamp: new Date() }],
      });
      const older = { ...initial, messages: [{ ...initial.messages[0], id: 'older' }] };
      const newer = { ...initial, messages: [{ ...initial.messages[0], id: 'newer' }] };
      let resolveOlder!: (session: SavedChatSession) => void;
      let resolveNewer!: (session: SavedChatSession) => void;
      const olderRead = new Promise<SavedChatSession>((resolve) => {
        resolveOlder = resolve;
      });
      const newerRead = new Promise<SavedChatSession>((resolve) => {
        resolveNewer = resolve;
      });
      vi.mocked(dbService.getAllSessionMetadata).mockResolvedValue([{ ...initial, messages: [] }]);
      vi.mocked(dbService.getSession).mockReturnValueOnce(olderRead).mockReturnValueOnce(newerRead);
      useChatStore.getState().setSessionLoading('overlap', false);
      useChatStore.getState().setActiveSessionId('overlap');
      useChatStore.getState().setActiveMessages(initial.messages);
      useChatStore.getState().setSavedSessions([initial]);
      const channel = new EventTarget() as BroadcastChannel;
      const dispose = setupChatStoreSync({
        store: useChatStore,
        localLoadingSessionIds: new Set(),
        getChannel: () => channel,
        rehydrateSession: (session) => session,
        documentRef: document,
      });
      let refresh!: Promise<void>;
      const trigger = (source: string) => {
        if (source === 'refresh') refresh = useChatStore.getState().refreshSessions();
        else
          channel.dispatchEvent(
            new MessageEvent<SyncMessage>('message', {
              data: {
                type: 'SESSION_CONTENT_UPDATED',
                sessionId: 'overlap',
              },
            }),
          );
      };
      try {
        trigger(olderSource);
        await Promise.resolve();
        trigger(olderSource === 'refresh' ? 'broadcast' : 'refresh');
        await Promise.resolve();
        expect(dbService.getSession).toHaveBeenCalledTimes(2);
        if (resolution === 'old-first') {
          resolveOlder(older);
          await olderRead;
          await Promise.resolve();
          expect(useChatStore.getState().activeMessages).toBe(initial.messages);
          resolveNewer(newer);
        } else {
          resolveNewer(newer);
          await newerRead;
          await Promise.resolve();
          resolveOlder(older);
        }
        await refresh;
        await Promise.all([olderRead, newerRead]);
        await Promise.resolve();
        expect(useChatStore.getState().activeMessages).toBe(newer.messages);
      } finally {
        dispose();
      }
    });

    it('handles DB errors gracefully', async () => {
      vi.mocked(dbService.getAllSessionMetadata).mockRejectedValue(new Error('DB fail'));
      await useChatStore.getState().refreshSessions();
      // Should not throw, sessions remain empty
      expect(useChatStore.getState().savedSessions).toEqual([]);
    });
  });

  // ── refreshGroups ──

  describe('refreshGroups', () => {
    it('loads groups from DB', async () => {
      const groups = [makeGroup({ id: 'g1', title: 'Work' })];
      vi.mocked(dbService.getAllGroups).mockResolvedValue(groups);
      await useChatStore.getState().refreshGroups();
      expect(useChatStore.getState().savedGroups).toHaveLength(1);
    });

    it('handles DB errors gracefully', async () => {
      vi.mocked(dbService.getAllGroups).mockRejectedValue(new Error('DB fail'));
      await useChatStore.getState().refreshGroups();
      expect(useChatStore.getState().savedGroups).toEqual([]);
    });
  });

  // ── setSessionLoading ──

  describe('setSessionLoading', () => {
    it('adds session to loading set', () => {
      useChatStore.getState().setSessionLoading('s1', true);
      expect(useChatStore.getState().loadingSessionIds.has('s1')).toBe(true);
    });

    it('removes session from loading set', () => {
      useChatStore.getState().setSessionLoading('s1', true);
      useChatStore.getState().setSessionLoading('s1', false);
      expect(useChatStore.getState().loadingSessionIds.has('s1')).toBe(false);
    });

    it('strips completed background session messages when loading ends', () => {
      useChatStore.getState().setSavedSessions([
        makeSession({
          id: 's1',
          messages: [{ id: 'm1', role: 'model', content: 'Done', timestamp: new Date() }],
        }),
      ]);

      useChatStore.getState().setSessionLoading('s1', true);
      useChatStore.getState().setSessionLoading('s1', false);

      expect(useChatStore.getState().savedSessions[0].messages).toEqual([]);
    });
  });

  // ── updateAndPersistSessions ──

  describe('updateAndPersistSessions', () => {
    it('updates activeMessages when active session is modified', () => {
      useChatStore.getState().setActiveSessionId('s1');
      useChatStore.getState().setSavedSessions([makeSession({ id: 's1', messages: [] })]);

      useChatStore
        .getState()
        .updateAndPersistSessions(
          (prev) =>
            prev.map((s) =>
              s.id === 's1'
                ? { ...s, messages: [{ id: 'm1', role: 'user', content: 'Hi', timestamp: new Date() }] }
                : s,
            ),
          { persist: false },
        );

      expect(useChatStore.getState().activeMessages).toHaveLength(1);
    });

    it('retains background loading session messages in memory while it is still generating', () => {
      const backgroundMessage = {
        id: 'm-background',
        role: 'model' as const,
        content: '',
        isLoading: true,
        timestamp: new Date(),
      };
      const activeMessage = {
        id: 'm-active',
        role: 'user' as const,
        content: 'Current',
        timestamp: new Date(),
      };

      useChatStore
        .getState()
        .setSavedSessions([
          makeSession({ id: 's1', messages: [backgroundMessage], title: 'Background' }),
          makeSession({ id: 's2', messages: [], title: 'Active' }),
        ]);
      useChatStore.getState().setActiveSessionId('s2');
      useChatStore.getState().setActiveMessages([activeMessage]);
      useChatStore.getState().setSessionLoading('s1', true);

      useChatStore.getState().updateAndPersistSessions(
        (prev) =>
          prev.map((session) =>
            session.id === 's1'
              ? {
                  ...session,
                  messages: session.messages.map((message) =>
                    message.id === 'm-background' ? { ...message, content: 'partial response' } : message,
                  ),
                }
              : session,
          ),
        { persist: false },
      );

      const backgroundSession = useChatStore.getState().savedSessions.find((session) => session.id === 's1');

      expect(backgroundSession?.messages).toHaveLength(1);
      expect(backgroundSession?.messages[0].content).toBe('partial response');
    });

    it('persists modified sessions to DB', async () => {
      const session = makeSession({ id: 's1' });
      useChatStore.getState().setSavedSessions([session]);

      useChatStore
        .getState()
        .updateAndPersistSessions((prev) => prev.map((s) => (s.id === 's1' ? { ...s, title: 'Updated' } : s)));

      await vi.waitFor(() => {
        expect(dbService.saveManySessionMetadata).toHaveBeenCalled();
      });
      const savedArg = vi.mocked(dbService.saveManySessionMetadata).mock.calls[0][0][0];
      expect(savedArg.title).toBe('Updated');
    });

    it('preserves non-active session messages when updating metadata-only entries', async () => {
      const activeSession = makeSession({
        id: 's1',
        messages: [{ id: 'm-active', role: 'user', content: 'Active', timestamp: new Date() }],
      });
      const inactiveFullSession = makeSession({
        id: 's2',
        title: 'Archive',
        messages: [{ id: 'm-archive', role: 'user', content: 'Keep me', timestamp: new Date() }],
      });

      useChatStore.getState().setActiveSessionId('s1');
      useChatStore.getState().setActiveMessages(activeSession.messages);
      useChatStore.getState().setSavedSessions([
        { ...activeSession, messages: [] },
        { ...inactiveFullSession, messages: [] },
      ]);

      useChatStore
        .getState()
        .updateAndPersistSessions((prev) =>
          prev.map((session) => (session.id === 's2' ? { ...session, title: 'Archive Updated' } : session)),
        );

      await vi.waitFor(() => {
        const archivedSave = vi
          .mocked(dbService.saveManySessionMetadata)
          .mock.calls.find(([sessions]) => sessions.some((s) => s.id === 's2'));
        expect(archivedSave).toBeDefined();
      });

      const archivedSave = vi
        .mocked(dbService.saveManySessionMetadata)
        .mock.calls.find(([sessions]) => sessions.some((s) => s.id === 's2'));
      const savedArg = archivedSave?.[0].find((s) => s.id === 's2');

      expect(savedArg?.title).toBe('Archive Updated');
    });

    it('deletes removed sessions from DB', async () => {
      useChatStore.getState().setSavedSessions([makeSession({ id: 's1' })]);

      useChatStore.getState().updateAndPersistSessions(() => []);

      await vi.waitFor(() => {
        expect(dbService.deleteSession).toHaveBeenCalledWith('s1');
      });
    });

    it('skips persist when persist option is false', () => {
      useChatStore.getState().setSavedSessions([makeSession({ id: 's1' })]);

      useChatStore
        .getState()
        .updateAndPersistSessions((prev) => prev.map((s) => (s.id === 's1' ? { ...s, title: 'No Persist' } : s)), {
          persist: false,
        });

      expect(dbService.saveSession).not.toHaveBeenCalled();
      expect(useChatStore.getState().savedSessions[0].title).toBe('No Persist');
    });
  });

  describe('updateUploadedFile', () => {
    it('updates file in selectedFiles', () => {
      const file = createUploadedFile({ id: 'f1', uploadState: 'uploading', progress: 10 });
      useChatStore.setState({ selectedFiles: [file] });

      useChatStore.getState().updateUploadedFile('f1', { progress: 80, uploadState: 'active' });

      expect(useChatStore.getState().selectedFiles[0].progress).toBe(80);
      expect(useChatStore.getState().selectedFiles[0].uploadState).toBe('active');
    });

    it('updates file in activeMessages directly without requiring savedSessions to contain messages', () => {
      const file = createUploadedFile({ id: 'f2', uploadState: 'uploading' });
      const msg = {
        id: 'm1',
        role: 'user' as const,
        content: 'hello',
        timestamp: new Date(),
        files: [file],
      };
      useChatStore.setState({
        activeSessionId: 's1',
        activeMessages: [msg],
        savedSessions: [makeSession({ id: 's1', messages: [] })], // stripped in savedSessions
      });

      useChatStore.getState().updateUploadedFile('f2', { uploadState: 'active', isProcessing: false });

      expect(useChatStore.getState().activeMessages[0].files?.[0].uploadState).toBe('active');
      expect(useChatStore.getState().activeMessages[0].files?.[0].isProcessing).toBe(false);
    });

    it('does not wipe out activeMessages when updating file in another session', () => {
      const file = createUploadedFile({ id: 'f3', uploadState: 'uploading' });
      const session1Msg = {
        id: 's1-m1',
        role: 'user' as const,
        content: 'session 1',
        timestamp: new Date(),
        files: [file],
      };
      const activeMsg = {
        id: 's2-m1',
        role: 'model' as const,
        content: 'session 2 streaming answer',
        timestamp: new Date(),
      };

      useChatStore.setState({
        activeSessionId: 's2',
        activeMessages: [activeMsg],
        savedSessions: [makeSession({ id: 's1', messages: [session1Msg] }), makeSession({ id: 's2', messages: [] })],
      });

      useChatStore.getState().updateUploadedFile('f3', { uploadState: 'active' });

      // Active messages in session 2 must remain completely intact
      expect(useChatStore.getState().activeMessages).toEqual([activeMsg]);
      // Session 1 messages updated
      expect(useChatStore.getState().savedSessions[0].messages[0].files?.[0].uploadState).toBe('active');
    });

    it('persists active session to DB when updating a file in activeMessages', async () => {
      const file = createUploadedFile({ id: 'f-active', uploadState: 'uploading' });
      const msg = {
        id: 'm1',
        role: 'user' as const,
        content: 'active with file',
        timestamp: new Date(),
        files: [file],
      };
      const session = makeSession({ id: 's1', messages: [] });
      useChatStore.setState({
        activeSessionId: 's1',
        activeMessages: [msg],
        savedSessions: [session],
      });

      useChatStore.getState().updateUploadedFile('f-active', { uploadState: 'active' });

      await vi.waitFor(() => {
        expect(dbService.saveSession).toHaveBeenCalled();
      });

      const savedArg = vi.mocked(dbService.saveSession).mock.calls.find(([s]) => s.id === 's1')?.[0];
      expect(savedArg).toBeDefined();
      expect(savedArg?.messages[0].files?.[0].uploadState).toBe('active');
    });

    it('persists inactive sessions to dbService when their messages contain the updated file', async () => {
      const file = createUploadedFile({ id: 'f-inactive', uploadState: 'uploading' });
      const msg = { id: 'm-in', role: 'user' as const, content: 'see file', timestamp: new Date(), files: [file] };
      const inactiveSession = makeSession({ id: 's-inactive', messages: [msg] });

      useChatStore.setState({
        activeSessionId: 's-active',
        activeMessages: [],
        savedSessions: [inactiveSession],
      });

      useChatStore.getState().updateUploadedFile('f-inactive', { uploadState: 'active' });

      await vi.waitFor(() => {
        expect(dbService.saveSession).toHaveBeenCalled();
      });

      const savedArg = vi.mocked(dbService.saveSession).mock.calls.find(([s]) => s.id === 's-inactive')?.[0];
      expect(savedArg).toBeDefined();
      expect(savedArg?.messages[0].files?.[0].uploadState).toBe('active');
    });

    it('short-circuits and preserves session references for inactive sessions with stripped empty messages', () => {
      const file = createUploadedFile({ id: 'f-other', uploadState: 'uploading' });
      const inactiveSession1 = makeSession({ id: 's1', messages: [] });
      const inactiveSession2 = makeSession({ id: 's2', messages: [] });

      useChatStore.setState({
        activeSessionId: null,
        activeMessages: [],
        selectedFiles: [file],
        savedSessions: [inactiveSession1, inactiveSession2],
      });

      useChatStore.getState().updateUploadedFile('f-other', { progress: 50 });

      const state = useChatStore.getState();
      expect(state.selectedFiles[0].progress).toBe(50);
      expect(state.savedSessions[0]).toBe(inactiveSession1);
      expect(state.savedSessions[1]).toBe(inactiveSession2);
    });
  });

  describe('atomic session and message actions', () => {
    it('updates a message in the active session without repeating session/message traversal at call sites', () => {
      const message = { id: 'm1', role: 'model' as const, content: 'draft', timestamp: new Date(), isLoading: true };
      useChatStore.getState().setActiveSessionId('s1');
      useChatStore.getState().setActiveMessages([message]);
      useChatStore.getState().setSavedSessions([makeSession({ id: 's1', messages: [] })]);

      useChatStore
        .getState()
        .updateMessageInActiveSession('m1', { content: 'final', isLoading: false }, { persist: false });

      expect(useChatStore.getState().activeMessages[0]).toEqual(
        expect.objectContaining({ content: 'final', isLoading: false }),
      );
    });

    it('appends messages and bumps the target session timestamp through a store action', () => {
      const initialTimestamp = 10;
      useChatStore.getState().setActiveSessionId('s1');
      useChatStore.getState().setSavedSessions([makeSession({ id: 's1', timestamp: initialTimestamp })]);

      useChatStore
        .getState()
        .appendMessageToSession(
          's1',
          { id: 'm1', role: 'user', content: 'hello', timestamp: new Date() },
          { persist: false },
        );

      const session = useChatStore.getState().savedSessions.find((candidate) => candidate.id === 's1');
      expect(session?.messages).toHaveLength(1);
      expect(session?.timestamp).toBeGreaterThan(initialTimestamp);
    });
  });

  // ── updateAndPersistGroups ──

  describe('updateAndPersistGroups', () => {
    it('updates groups and persists to DB', async () => {
      useChatStore.getState().setSavedGroups([makeGroup({ id: 'g1' })]);

      useChatStore
        .getState()
        .updateAndPersistGroups((prev) => prev.map((g) => (g.id === 'g1' ? { ...g, title: 'Renamed' } : g)));

      expect(useChatStore.getState().savedGroups[0].title).toBe('Renamed');
      await vi.waitFor(() => {
        expect(dbService.setAllGroups).toHaveBeenCalled();
      });
    });
  });

  // ── setCurrentChatSettings ──

  describe('setCurrentChatSettings', () => {
    it('updates settings for active session', () => {
      useChatStore.getState().setActiveSessionId('s1');
      useChatStore.getState().setSavedSessions([
        makeSession({
          id: 's1',
          settings: createChatSettings({ modelId: 'old-model' }),
        }),
      ]);

      useChatStore.getState().setCurrentChatSettings((prev) => ({
        ...prev,
        modelId: 'new-model',
      }));

      // Should update the session's settings
      const sessions = useChatStore.getState().savedSessions;
      // Note: sessions strip messages, so check the metadata
      expect(sessions[0].settings.modelId).toBe('new-model');
    });

    it('clears a pending locked API key when a session becomes active', () => {
      useChatStore.setState({ pendingLockedApiKey: 'pending-key' });
      useChatStore.getState().setActiveSessionId('s1');
      expect(useChatStore.getState().pendingLockedApiKey).toBeNull();
    });

    it('stashes a pending locked API key when there is no active session', () => {
      useChatStore.getState().setSavedSessions([makeSession({ id: 's1' })]);
      useChatStore.getState().setCurrentChatSettings((prev) => ({
        ...prev,
        lockedApiKey: 'pending-key',
      }));
      expect(dbService.saveSession).not.toHaveBeenCalled();
      expect(useChatStore.getState().pendingLockedApiKey).toBe('pending-key');
    });

    it('does not persist settings when no active session', () => {
      useChatStore.getState().setSavedSessions([makeSession({ id: 's1' })]);
      useChatStore.getState().setCurrentChatSettings((prev) => ({
        ...prev,
        modelId: 'new-model',
      }));
      expect(dbService.saveSession).not.toHaveBeenCalled();
    });

    it('stashes pendingChatSettings when there is no active session and clears them on session change', () => {
      useChatStore.getState().setCurrentChatSettings((prev) => ({
        ...prev,
        systemInstruction: 'test-instruction',
        modelId: 'custom-model',
      }));
      expect(useChatStore.getState().pendingChatSettings?.systemInstruction).toBe('test-instruction');
      expect(useChatStore.getState().pendingChatSettings?.modelId).toBe('custom-model');

      useChatStore.getState().setActiveSessionId('s1');
      expect(useChatStore.getState().pendingChatSettings).toBeNull();
    });
  });

  // ── stopGenerating ──

  describe('stopGenerating', () => {
    const seedLoadingSession = (messages: SavedChatSession['messages']) => {
      useChatStore.getState().setSavedSessions([makeSession({ id: 's1', messages })]);
      useChatStore.getState().setActiveSessionId('s1');
      useChatStore.getState().setActiveMessages(messages);
      useChatStore.getState().setSessionLoading('s1', true);
    };

    const loadingModelMessage = () => ({
      id: 'gen-1',
      role: 'model' as const,
      content: '',
      isLoading: true,
      timestamp: new Date(),
    });

    beforeEach(() => {
      useChatStore.getState()._activeJobs.current.clear();
    });

    it('returns not_loading when the session is not marked as loading', () => {
      useChatStore.getState().setActiveSessionId('s1');

      expect(useChatStore.getState().stopGenerating()).toBe('not_loading');
    });

    it('aborts the local job, flags the message as stopped by the user, and clears loading', () => {
      const controller = new AbortController();
      seedLoadingSession([loadingModelMessage()]);
      startActiveGenerationJob(useChatStore.getState()._activeJobs, 's1', 'gen-1', controller);

      const result = useChatStore.getState().stopGenerating();

      expect(result).toBe('stopped');
      expect(controller.signal.aborted).toBe(true);
      expect(useChatStore.getState().activeMessages[0]).toEqual(
        expect.objectContaining({ isLoading: false, stoppedByUser: true }),
      );
      expect(useChatStore.getState().loadingSessionIds.has('s1')).toBe(false);
      expect(useChatStore.getState()._activeJobs.current.has('gen-1')).toBe(false);
    });

    it('requests a cross-tab abort without local cleanup when the loading message has no local job', () => {
      seedLoadingSession([loadingModelMessage()]);

      const result = useChatStore.getState().stopGenerating();

      expect(result).toBe('no_local_job');
      // Loading stays flagged so the owner tab performs its own cleanup.
      expect(useChatStore.getState().loadingSessionIds.has('s1')).toBe(true);
    });

    it('reports stopped without aborting or clearing loading when only a session-scoped job remains', () => {
      const controller = new AbortController();
      seedLoadingSession([]);
      // Job belongs to THIS session but no message is streaming anymore
      // (e.g. remote-owned stream): report stopped and leave everything as-is.
      startActiveGenerationJob(useChatStore.getState()._activeJobs, 's1', 'orphan-gen', controller);

      const result = useChatStore.getState().stopGenerating();

      expect(result).toBe('stopped');
      expect(controller.signal.aborted).toBe(false);
      expect(useChatStore.getState().loadingSessionIds.has('s1')).toBe(true);
      expect(useChatStore.getState()._activeJobs.current.has('orphan-gen')).toBe(true);
    });
  });

  // ── cancelEdit ──

  describe('cancelEdit', () => {
    it('clears the editing state, selected files, and errors back to defaults', () => {
      useChatStore.getState().setEditingMessageId('m1');
      useChatStore.getState().setEditMode('update');
      useChatStore.getState().setSelectedFiles([createUploadedFile({ id: 'f1' })]);
      useChatStore.getState().setAppFileError('boom');

      useChatStore.getState().cancelEdit();

      const state = useChatStore.getState();
      expect(state.editingMessageId).toBeNull();
      expect(state.editMode).toBe('resend');
      expect(state.selectedFiles).toEqual([]);
      expect(state.appFileError).toBeNull();
      expect(state.commandedInput).toEqual({ text: '', id: expect.any(Number) });
    });

    it('restores draft from chatDraftStore for activeSessionId when cancelled', () => {
      useChatStore.setState({ activeSessionId: 'sess-draft-test' });
      useChatDraftStore.setState({
        drafts: {
          'sess-draft-test': {
            inputText: 'Preserved user draft',
            quotes: [],
            ttsContext: '',
          },
        },
      });

      useChatStore.getState().setEditingMessageId('m2');
      useChatStore.getState().setEditMode('update');

      useChatStore.getState().cancelEdit();

      const state = useChatStore.getState();
      expect(state.editingMessageId).toBeNull();
      expect(state.commandedInput).toEqual({ text: 'Preserved user draft', id: expect.any(Number) });

      useChatDraftStore.setState({ drafts: {} });
    });
  });
});
