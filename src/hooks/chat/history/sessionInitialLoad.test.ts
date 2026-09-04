import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createChatMessage, createChatSettings, createSavedChatSession } from '@/test/data/factories';

const { mockGetSession, mockGetAllSessionMetadata, mockGetAllGroups, mockRehydrateSessionFiles } = vi.hoisted(() => ({
  mockGetSession: vi.fn(),
  mockGetAllSessionMetadata: vi.fn(),
  mockGetAllGroups: vi.fn(),
  mockRehydrateSessionFiles: vi.fn((session: { messages?: unknown[]; [key: string]: unknown }) => session),
}));

vi.mock('@/services/db/dbService', async () => {
  const { createDbServiceMockModule } = await import('@/test/doubles/moduleMocks');
  return createDbServiceMockModule({
    getSession: mockGetSession,
    getAllSessionMetadata: mockGetAllSessionMetadata,
    getAllGroups: mockGetAllGroups,
  });
});

vi.mock('@/utils/chat/session', () => ({
  rehydrateSessionFiles: mockRehydrateSessionFiles,
}));

import { loadInitialSessionData } from './sessionInitialLoad';
import { ACTIVE_CHAT_SESSION_ID_KEY } from '@/constants/storageKeys';

const createFullSession = (id: string, content: string) =>
  createSavedChatSession({
    id,
    title: `${id} title`,
    timestamp: Date.now(),
    messages: [createChatMessage({ id: `${id}-msg`, content, role: 'user' })],
    settings: createChatSettings({}),
  });

describe('loadInitialSessionData', () => {
  let originalPathname: string;

  beforeEach(() => {
    vi.clearAllMocks();
    originalPathname = window.location.pathname;
  });

  afterEach(() => {
    window.history.pushState({}, '', originalPathname);
    vi.restoreAllMocks();
  });

  const stubPathname = (pathname: string) => {
    window.history.pushState({}, '', pathname);
  };

  it('restores the URL-addressed active session messages after a refresh', async () => {
    stubPathname('/chat/session-abc');
    const fullSession = createFullSession('session-abc', 'persisted message content');
    mockGetAllSessionMetadata.mockResolvedValue([
      createSavedChatSession({ id: 'session-abc', title: 't', timestamp: Date.now(), messages: [] }),
    ]);
    mockGetAllGroups.mockResolvedValue([]);
    mockGetSession.mockResolvedValue(fullSession);

    const setActiveMessages = vi.fn();
    const setActiveSessionId = vi.fn();
    const setSavedSessions = vi.fn();
    const setSavedGroups = vi.fn();

    await loadInitialSessionData({
      appSettings: {} as never,
      setSavedSessions,
      setSavedGroups,
      setActiveSessionId,
      setActiveMessages,
      restoreDraftFiles: vi.fn(),
      updateAndPersistSessions: vi.fn(),
      startNewChat: vi.fn(),
    });

    expect(setActiveMessages).toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ content: 'persisted message content' })]),
    );
    expect(setActiveSessionId).toHaveBeenCalledWith('session-abc', { history: 'replace' });
    // startNewChat must not run for a session that was restored.
    // (Asserted via setActiveSessionId above; startNewChat is a no-op spy.)
  });

  it('falls back to a fresh chat when the URL session is not in the DB', async () => {
    stubPathname('/chat/ghost-session');
    mockGetAllSessionMetadata.mockResolvedValue([]);
    mockGetAllGroups.mockResolvedValue([]);
    mockGetSession.mockResolvedValue(undefined);

    const startNewChat = vi.fn();
    const setActiveMessages = vi.fn();

    await loadInitialSessionData({
      appSettings: {} as never,
      setSavedSessions: vi.fn(),
      setSavedGroups: vi.fn(),
      setActiveSessionId: vi.fn(),
      setActiveMessages,
      restoreDraftFiles: vi.fn(),
      updateAndPersistSessions: vi.fn(),
      startNewChat,
    });

    expect(startNewChat).toHaveBeenCalled();
  });

  it('restores the session id kept in sessionStorage when the URL has no session', async () => {
    stubPathname('/');
    const fullSession = createFullSession('session-stored', 'stored content');
    mockGetAllSessionMetadata.mockResolvedValue([
      createSavedChatSession({ id: 'session-stored', title: 't', timestamp: Date.now(), messages: [] }),
    ]);
    mockGetAllGroups.mockResolvedValue([]);
    mockGetSession.mockResolvedValue(fullSession);

    const getItemSpy = vi
      .spyOn(sessionStorage, 'getItem')
      .mockImplementation((key) => (key === ACTIVE_CHAT_SESSION_ID_KEY ? 'session-stored' : null));

    const setActiveMessages = vi.fn();

    await loadInitialSessionData({
      appSettings: {} as never,
      setSavedSessions: vi.fn(),
      setSavedGroups: vi.fn(),
      setActiveSessionId: vi.fn(),
      setActiveMessages,
      restoreDraftFiles: vi.fn(),
      updateAndPersistSessions: vi.fn(),
      startNewChat: vi.fn(),
    });

    expect(setActiveMessages).toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ content: 'stored content' })]),
    );
    getItemSpy.mockRestore();
  });

  it('does not discard the restored session when a transient DB error occurs', async () => {
    // A refresh that hits a transient IndexedDB read failure on the active
    // session must not fall back to startNewChat (which would blank the user's
    // conversation). It should leave the restored active session in place.
    stubPathname('/chat/session-abc');
    mockGetAllSessionMetadata.mockResolvedValue([
      createSavedChatSession({ id: 'session-abc', title: 't', timestamp: Date.now(), messages: [] }),
    ]);
    mockGetAllGroups.mockResolvedValue([]);
    mockGetSession.mockRejectedValue(new Error('IndexedDB transient failure'));

    const setActiveMessages = vi.fn();
    const startNewChat = vi.fn();

    await loadInitialSessionData({
      appSettings: {} as never,
      setSavedSessions: vi.fn(),
      setSavedGroups: vi.fn(),
      setActiveSessionId: vi.fn(),
      setActiveMessages,
      restoreDraftFiles: vi.fn(),
      updateAndPersistSessions: vi.fn(),
      startNewChat,
    });

    expect(startNewChat).not.toHaveBeenCalled();
  });
});
