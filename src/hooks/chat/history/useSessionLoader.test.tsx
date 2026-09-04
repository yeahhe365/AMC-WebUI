import { act } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { MediaResolution, type ChatGroup, type ChatMessage, type SavedChatSession } from '@/types';

const {
  mockCreateNewSession,
  mockCleanupFilePreviewUrls,
  mockGetSession,
  mockRehydrateSessionFiles,
  mockResolveSupportedModelId,
} = vi.hoisted(() => ({
  mockCreateNewSession: vi.fn((..._args: unknown[]) => ({
    id: 'new-session',
    title: 'New Session',
    timestamp: Date.now(),
    messages: [],
    settings: { modelId: 'gemini-2.5-flash' },
    groupId: null as string | null,
  })),
  mockCleanupFilePreviewUrls: vi.fn(),
  mockGetSession: vi.fn(),
  mockRehydrateSessionFiles: vi.fn((session: SavedChatSession) => session),
  mockResolveSupportedModelId: vi.fn((modelId: string | undefined, fallback: string) => modelId ?? fallback),
}));

vi.mock('@/services/db/dbService', async () => {
  const { createDbServiceMockModule } = await import('@/test/doubles/moduleMocks');

  return createDbServiceMockModule({ getSession: mockGetSession });
});

vi.mock('@/utils/chat/session', () => ({
  createNewSession: mockCreateNewSession,
  rehydrateSessionFiles: mockRehydrateSessionFiles,
}));

vi.mock('@/utils/file/filePreviewUrls', () => ({
  cleanupFilePreviewUrls: mockCleanupFilePreviewUrls,
}));

vi.mock('@/utils/model/modelSorting', () => ({
  resolveSupportedModelId: mockResolveSupportedModelId,
}));

import { useSessionLoader } from './useSessionLoader';
import { dbService } from '@/services/db/dbService';
import { createChatMessage, createChatSettings, createSavedChatSession } from '@/test/data/factories';
import { createSessionLoaderProps, type SessionLoaderPropsOverrides } from '@/test/hooks/factories';
import { createDeferred, flushPromises, renderHook } from '@/test/render/renderer';

const createSession = (id: string, title: string): SavedChatSession =>
  createSavedChatSession({
    id,
    title,
    timestamp: Date.now(),
    messages: [
      createChatMessage({
        id: `${id}-message`,
        content: `${title} content`,
      }),
    ],
    settings: createChatSettings({
      modelId: 'gemini-2.5-flash',
      topP: 0.95,
      topK: 64,
      showThoughts: true,
      thinkingLevel: 'HIGH',
      mediaResolution: MediaResolution.MEDIA_RESOLUTION_UNSPECIFIED,
    }),
  });

describe('useSessionLoader', () => {
  const renderSessionLoader = (overrides: SessionLoaderPropsOverrides = {}) =>
    renderHook(() =>
      useSessionLoader(
        createSessionLoaderProps({
          appSettings: { modelId: 'gemini-2.5-flash', ...overrides.appSettings },
          ...overrides,
        }),
      ),
    );

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('keeps the newest session selection when earlier loads resolve later', async () => {
    const olderRequest = createDeferred<SavedChatSession | null>();
    const newerRequest = createDeferred<SavedChatSession | null>();

    mockGetSession
      .mockImplementationOnce(() => olderRequest.promise)
      .mockImplementationOnce(() => newerRequest.promise);

    const setSavedSessions = vi.fn();
    const setSavedGroups = vi.fn();
    const setActiveSessionId = vi.fn();
    const setActiveMessages = vi.fn();
    const setSelectedFiles = vi.fn();
    const setEditingMessageId = vi.fn();
    const setCommandedInput = vi.fn();
    const updateAndPersistSessions = vi.fn();

    const { result, unmount } = renderSessionLoader({
      setSavedSessions,
      setSavedGroups,
      setActiveSessionId,
      setActiveMessages,
      setSelectedFiles,
      setEditingMessageId,
      setCommandedInput,
      updateAndPersistSessions,
      activeSessionId: 'sidebar-active',
    });

    act(() => {
      void result.current.loadChatSession('older-session');
      void result.current.loadChatSession('newer-session');
    });

    const newerSession = createSession('newer-session', 'Newer Session');
    await act(async () => {
      newerRequest.resolve(newerSession);
      await flushPromises();
    });

    expect(setActiveSessionId).toHaveBeenLastCalledWith('newer-session', { history: 'push' });
    expect((setActiveMessages.mock.calls.at(-1)?.[0] as ChatMessage[])[0]?.content).toBe('Newer Session content');

    const olderSession = createSession('older-session', 'Older Session');
    await act(async () => {
      olderRequest.resolve(olderSession);
      await flushPromises();
    });

    expect(setActiveSessionId).toHaveBeenLastCalledWith('newer-session', { history: 'push' });
    expect((setActiveMessages.mock.calls.at(-1)?.[0] as ChatMessage[])[0]?.content).toBe('Newer Session content');

    expect(setSavedGroups).not.toHaveBeenCalled();
    unmount();
  });

  it('pushes browser history when loading a different session from the UI', async () => {
    mockGetSession.mockResolvedValueOnce(createSession('session-next', 'Next Session'));

    const setActiveSessionId = vi.fn();

    const { result, unmount } = renderSessionLoader({
      setActiveSessionId,
      activeSessionId: 'session-current',
    });

    await act(async () => {
      await result.current.loadChatSession('session-next');
      await flushPromises();
    });

    expect(setActiveSessionId).toHaveBeenLastCalledWith('session-next', { history: 'push' });

    unmount();
  });

  it('can restore a session in history replay mode without pushing another history entry', async () => {
    mockGetSession.mockResolvedValueOnce(createSession('session-back', 'Back Session'));

    const setActiveSessionId = vi.fn();

    const { result, unmount } = renderSessionLoader({
      setActiveSessionId,
      activeSessionId: 'session-current',
    });

    await act(async () => {
      await result.current.loadChatSession('session-back', { history: 'none' });
      await flushPromises();
    });

    expect(setActiveSessionId).toHaveBeenLastCalledWith('session-back', { history: 'none' });

    unmount();
  });

  it('retains outgoing active session messages in memory before switching sessions', async () => {
    const nextRequest = createDeferred<SavedChatSession | null>();
    mockGetSession.mockImplementationOnce(() => nextRequest.promise);

    const setSavedSessions = vi.fn();
    const activeChat = createSession('session-active', 'Active Session');

    const { result, unmount } = renderSessionLoader({
      setSavedSessions,
      activeChat,
      activeSessionId: 'session-active',
      savedSessions: [{ ...activeChat, messages: [] }],
    });

    act(() => {
      void result.current.loadChatSession('session-next');
    });

    const retainUpdater = setSavedSessions.mock.calls[0]?.[0];
    expect(typeof retainUpdater).toBe('function');

    const retainedSessions = retainUpdater([{ ...activeChat, messages: [] }]);
    expect(retainedSessions[0].messages).toEqual(activeChat.messages);

    await act(async () => {
      nextRequest.resolve(createSession('session-next', 'Next Session'));
      await flushPromises();
    });

    unmount();
  });

  it('does not overwrite newer in-memory session settings when initial metadata resolves late', async () => {
    const metadataDeferred = createDeferred<SavedChatSession[]>();
    const groupsDeferred = createDeferred<ChatGroup[]>();

    vi.mocked(dbService.getAllSessionMetadata).mockReturnValueOnce(metadataDeferred.promise);
    vi.mocked(dbService.getAllGroups).mockReturnValueOnce(groupsDeferred.promise);
    mockGetSession.mockResolvedValue(null);

    const setSavedSessions = vi.fn();
    const setSavedGroups = vi.fn();

    const staleSession = createSession('session-1', 'Stale Session');
    staleSession.messages = [];
    staleSession.settings.systemInstruction = '[Live Artifacts Protocol - zh]\nstale';

    const freshSession = createSession('session-1', 'Fresh Session');
    freshSession.messages = [];
    freshSession.settings.systemInstruction = '';

    const { result, unmount } = renderSessionLoader({
      setSavedSessions,
      setSavedGroups,
      activeSessionId: 'session-1',
      savedSessions: [freshSession],
    });

    await act(async () => {
      void result.current.loadInitialData();
      metadataDeferred.resolve([staleSession]);
      groupsDeferred.resolve([]);
      await flushPromises();
    });

    const updater = setSavedSessions.mock.calls[0]?.[0];
    expect(typeof updater).toBe('function');

    const mergedSessions = updater([freshSession]);
    expect(mergedSessions).toHaveLength(1);
    expect(mergedSessions[0].settings.systemInstruction).toBe('');

    unmount();
  });

  it('clears stale file errors when starting a fresh chat', () => {
    const setAppFileError = vi.fn();

    const { result, unmount } = renderSessionLoader({
      userScrolledUpRef: { current: true },
      activeSessionId: 'session-current',
      setAppFileError,
    });

    act(() => {
      result.current.startNewChat();
    });

    expect(setAppFileError).toHaveBeenCalledWith(null);
    unmount();
  });

  it('preserves the current empty chat settings when reusing it, resetting only the locked API key', () => {
    const updateAndPersistSessions = vi.fn();
    const emptyActiveSession = {
      ...createSession('session-empty', 'Empty Session'),
      messages: [],
      timestamp: 2,
      settings: {
        ...createSession('session-empty', 'Empty Session').settings,
        modelId: 'stale-model',
        lockedApiKey: 'old-key',
        isGoogleSearchEnabled: true,
      },
    };

    const { result, unmount } = renderSessionLoader({
      appSettings: {
        modelId: 'global-model',
        isGoogleSearchEnabled: false,
        lockedApiKey: null,
      },
      updateAndPersistSessions,
      activeChat: emptyActiveSession,
      userScrolledUpRef: { current: true },
      activeSessionId: 'session-empty',
      savedSessions: [emptyActiveSession],
    });

    act(() => {
      result.current.startNewChat();
    });

    expect(updateAndPersistSessions).toHaveBeenCalledTimes(1);
    const updater = updateAndPersistSessions.mock.calls[0][0];
    const updatedSessions = updater([emptyActiveSession]);
    // 全量继承当前空会话的设置，仅锁定 API Key 重置。
    expect(updatedSessions[0].settings.modelId).toBe('stale-model');
    expect(updatedSessions[0].settings.lockedApiKey).toBeNull();
    expect(updatedSessions[0].settings.isGoogleSearchEnabled).toBe(true);

    unmount();
  });

  it('keeps the manually selected model when reusing the current empty chat', () => {
    const updateAndPersistSessions = vi.fn();
    const emptyActiveSession = {
      ...createSession('session-empty', 'Empty Session'),
      messages: [],
      timestamp: 2,
      settings: {
        ...createSession('session-empty', 'Empty Session').settings,
        modelId: 'gemini-3.1-flash-live-preview',
        lockedApiKey: null,
        isGoogleSearchEnabled: false,
      },
    };

    const { result, unmount } = renderSessionLoader({
      appSettings: {
        modelId: 'gemini-3-flash-preview',
        isGoogleSearchEnabled: false,
        lockedApiKey: null,
      },
      updateAndPersistSessions,
      activeChat: emptyActiveSession,
      userScrolledUpRef: { current: true },
      activeSessionId: 'session-empty',
      savedSessions: [emptyActiveSession],
    });

    act(() => {
      result.current.startNewChat();
    });

    const updater = updateAndPersistSessions.mock.calls[0][0];
    const updatedSessions = updater([emptyActiveSession]);
    expect(updatedSessions[0].settings.modelId).toBe('gemini-3.1-flash-live-preview');

    unmount();
  });

  it('inherits new chat settings from the current active session by default instead of the most recent session', () => {
    const pinnedSession = createSession('session-pinned', 'Pinned Session');
    pinnedSession.timestamp = 1;
    pinnedSession.isPinned = true;
    pinnedSession.settings.modelId = 'pinned-model';

    const recentSession = createSession('session-recent', 'Recent Session');
    recentSession.timestamp = 3;
    recentSession.isPinned = false;
    recentSession.settings.modelId = 'recent-model';

    const currentSession = createSession('session-current', 'Current Session');
    currentSession.timestamp = 2;
    currentSession.settings.modelId = 'current-model';

    const { result, unmount } = renderSessionLoader({
      appSettings: { modelId: 'global-model' },
      activeChat: currentSession,
      userScrolledUpRef: { current: true },
      activeSessionId: 'session-current',
      savedSessions: [pinnedSession, recentSession, currentSession],
    });

    act(() => {
      result.current.startNewChat();
    });

    // 默认以当前页会话为模板，而非最近会话。
    expect(mockCreateNewSession.mock.calls[0][0]).toEqual(expect.objectContaining({ modelId: 'current-model' }));

    unmount();
  });

  it('inherits third-party routing from the current active session', () => {
    const currentSession = createSession('session-current', 'Current Session');
    currentSession.settings = {
      ...currentSession.settings,
      modelId: 'kimi-k3-turbo',
      providerId: 'kimi',
    };

    const { result, unmount } = renderSessionLoader({
      appSettings: { providerId: 'kimi' },
      activeChat: currentSession,
      activeSessionId: 'session-current',
      savedSessions: [currentSession],
    });

    act(() => {
      result.current.startNewChat();
    });

    expect(mockCreateNewSession.mock.calls[0][0]).toEqual(
      expect.objectContaining({
        modelId: 'kimi-k3-turbo',
        providerId: 'kimi',
      }),
    );

    unmount();
  });

  it('creates a new session in the target group and activates it', () => {
    const setActiveSessionId = vi.fn();
    const updateAndPersistSessions = vi.fn();
    const currentSession = createSession('session-current', 'Current Session');
    currentSession.settings.modelId = 'current-model';
    mockCreateNewSession.mockReturnValueOnce({
      id: 'new-group-session',
      title: 'New Session',
      timestamp: Date.now(),
      messages: [],
      settings: { modelId: 'gemini-2.5-flash' },
      groupId: 'group-1',
    });

    const { result, unmount } = renderSessionLoader({
      appSettings: { modelId: 'global-model' },
      updateAndPersistSessions,
      setActiveSessionId,
      activeChat: currentSession,
      activeSessionId: 'session-current',
      savedSessions: [currentSession],
    });

    act(() => {
      result.current.startNewChat(undefined, { groupId: 'group-1' });
    });

    expect(mockCreateNewSession).toHaveBeenCalledWith(
      expect.objectContaining({ modelId: 'current-model' }),
      [],
      'New Chat',
      'group-1',
      'default',
    );
    expect(updateAndPersistSessions).toHaveBeenCalledTimes(1);
    const updater = updateAndPersistSessions.mock.calls[0][0];
    const updatedSessions = updater([currentSession]);
    expect(updatedSessions).toHaveLength(2);
    expect(updatedSessions[0].groupId).toBe('group-1');
    expect(setActiveSessionId).toHaveBeenLastCalledWith('new-group-session', { history: 'push' });

    unmount();
  });

  it('reuses the current empty chat when it is already in the target group', () => {
    const updateAndPersistSessions = vi.fn();
    const emptyActiveSession = {
      ...createSession('session-empty', 'Empty Session'),
      messages: [],
      groupId: 'group-1',
    };

    const { result, unmount } = renderSessionLoader({
      appSettings: { modelId: 'global-model' },
      updateAndPersistSessions,
      activeChat: emptyActiveSession,
      userScrolledUpRef: { current: true },
      activeSessionId: 'session-empty',
      savedSessions: [emptyActiveSession],
    });

    act(() => {
      result.current.startNewChat(undefined, { groupId: 'group-1' });
    });

    expect(mockCreateNewSession).not.toHaveBeenCalled();
    expect(updateAndPersistSessions).toHaveBeenCalledTimes(1);
    const updater = updateAndPersistSessions.mock.calls[0][0];
    const updatedSessions = updater([emptyActiveSession]);
    expect(updatedSessions).toHaveLength(1);
    expect(updatedSessions[0].id).toBe('session-empty');
    expect(updatedSessions[0].groupId).toBe('group-1');

    unmount();
  });

  it('moves the current empty chat into the target group instead of creating a duplicate', () => {
    const updateAndPersistSessions = vi.fn();
    const emptyActiveSession = {
      ...createSession('session-empty', 'Empty Session'),
      messages: [],
      groupId: null,
    };

    const { result, unmount } = renderSessionLoader({
      appSettings: { modelId: 'global-model' },
      updateAndPersistSessions,
      activeChat: emptyActiveSession,
      userScrolledUpRef: { current: true },
      activeSessionId: 'session-empty',
      savedSessions: [emptyActiveSession],
    });

    act(() => {
      result.current.startNewChat(undefined, { groupId: 'group-9' });
    });

    expect(mockCreateNewSession).not.toHaveBeenCalled();
    expect(updateAndPersistSessions).toHaveBeenCalledTimes(1);
    const updater = updateAndPersistSessions.mock.calls[0][0];
    const updatedSessions = updater([emptyActiveSession]);
    expect(updatedSessions).toHaveLength(1);
    expect(updatedSessions[0].id).toBe('session-empty');
    expect(updatedSessions[0].groupId).toBe('group-9');

    unmount();
  });
});
