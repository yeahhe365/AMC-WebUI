import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_CHAT_SETTINGS } from '@/constants/settingsDefaults';
import type { SavedChatSession } from '@/types';
import { useHistoryClearer } from './useHistoryClearer';
import { renderHook } from '@/test/render/renderer';

const { dbServiceMock, cleanupFilePreviewUrlsMock } = vi.hoisted(() => ({
  dbServiceMock: {
    setAllSessions: vi.fn().mockResolvedValue(undefined),
    setAllGroups: vi.fn().mockResolvedValue(undefined),
    setActiveSessionId: vi.fn().mockResolvedValue(undefined),
    clearAllData: vi.fn(),
  },
  cleanupFilePreviewUrlsMock: vi.fn(),
}));

vi.mock('@/services/db/dbService', async () => {
  const { createDbServiceMockModule } = await import('@/test/doubles/moduleMocks');

  return createDbServiceMockModule(dbServiceMock);
});

vi.mock('@/utils/file/filePreviewUrls', () => ({
  cleanupFilePreviewUrls: cleanupFilePreviewUrlsMock,
}));

const createSession = (id: string): SavedChatSession => ({
  id,
  title: `Session ${id}`,
  timestamp: Date.now(),
  messages: [],
  settings: DEFAULT_CHAT_SETTINGS,
});

describe('useHistoryClearer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('clears known session-scoped localStorage keys without scanning unrelated entries', async () => {
    const values = new Map<string, string>([
      ['chatDraft_session-a', 'draft-a'],
      ['chatQuotes_session-a', '["quote-a"]'],
      ['chatTtsContext_session-a', 'tts-a'],
      ['chat_scroll_pos_session-a', '10'],
      ['chatDraft_session-b', 'draft-b'],
      ['unrelated', 'keep-me'],
    ]);

    const localStorageMock = {
      getItem: vi.fn((key: string) => values.get(key) ?? null),
      setItem: vi.fn((key: string, value: string) => {
        values.set(key, value);
      }),
      removeItem: vi.fn((key: string) => {
        values.delete(key);
      }),
      key: vi.fn(() => {
        throw new Error('clearAllHistory should not scan localStorage keys');
      }),
      clear: vi.fn(() => {
        values.clear();
      }),
    };

    Object.defineProperty(localStorageMock, 'length', {
      configurable: true,
      get() {
        throw new Error('clearAllHistory should not read localStorage length');
      },
    });

    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      value: localStorageMock,
    });

    let savedSessions = [createSession('session-a'), createSession('session-b')];
    let savedGroups = [{ id: 'group-1', title: 'Group 1', timestamp: 1 }];
    const setSavedSessions = vi.fn((updater) => {
      savedSessions = typeof updater === 'function' ? updater(savedSessions) : updater;
    });
    const setSavedGroups = vi.fn((updater) => {
      savedGroups = typeof updater === 'function' ? updater(savedGroups) : updater;
    });
    const startNewChat = vi.fn();
    const activeJobs = { current: new Map<string, AbortController>() };

    const { result, unmount } = renderHook(() =>
      useHistoryClearer({
        savedSessions,
        setSavedSessions,
        setSavedGroups,
        startNewChat,
        activeJobs,
      }),
    );

    await act(async () => {
      await result.current.clearAllHistory();
    });

    expect(localStorageMock.removeItem).toHaveBeenCalledWith('chatDraft_session-a');
    expect(localStorageMock.removeItem).toHaveBeenCalledWith('chatQuotes_session-a');
    expect(localStorageMock.removeItem).toHaveBeenCalledWith('chatTtsContext_session-a');
    expect(localStorageMock.removeItem).toHaveBeenCalledWith('chat_scroll_pos_session-a');
    expect(localStorageMock.removeItem).toHaveBeenCalledWith('chatDraft_session-b');
    expect(localStorageMock.key).not.toHaveBeenCalled();
    expect(values.get('unrelated')).toBe('keep-me');
    expect(dbServiceMock.setAllSessions).toHaveBeenCalledWith([]);
    expect(dbServiceMock.setAllGroups).toHaveBeenCalledWith([]);
    expect(dbServiceMock.setActiveSessionId).toHaveBeenCalledWith(null);
    expect(savedSessions).toEqual([]);
    expect(savedGroups).toEqual([]);
    expect(startNewChat).toHaveBeenCalledTimes(1);

    unmount();
  });

  it('waits for history persistence before clearing UI state', async () => {
    const localStorageMock = {
      removeItem: vi.fn(),
    };

    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      value: localStorageMock,
    });

    let resolveSessions!: () => void;
    let resolveGroups!: () => void;
    let resolveActiveId!: () => void;
    dbServiceMock.setAllSessions.mockReturnValueOnce(
      new Promise<void>((resolve) => {
        resolveSessions = resolve;
      }),
    );
    dbServiceMock.setAllGroups.mockReturnValueOnce(
      new Promise<void>((resolve) => {
        resolveGroups = resolve;
      }),
    );
    dbServiceMock.setActiveSessionId.mockReturnValueOnce(
      new Promise<void>((resolve) => {
        resolveActiveId = resolve;
      }),
    );

    let savedSessions = [createSession('session-a')];
    let savedGroups = [{ id: 'group-1', title: 'Group 1', timestamp: 1 }];
    const setSavedSessions = vi.fn((updater) => {
      savedSessions = typeof updater === 'function' ? updater(savedSessions) : updater;
    });
    const setSavedGroups = vi.fn((updater) => {
      savedGroups = typeof updater === 'function' ? updater(savedGroups) : updater;
    });
    const startNewChat = vi.fn();

    const { result, unmount } = renderHook(() =>
      useHistoryClearer({
        savedSessions,
        setSavedSessions,
        setSavedGroups,
        startNewChat,
        activeJobs: { current: new Map() },
      }),
    );

    await act(async () => {
      const promise = result.current.clearAllHistory();
      expect(savedSessions).toHaveLength(1);
      expect(savedGroups).toHaveLength(1);
      expect(startNewChat).not.toHaveBeenCalled();

      resolveSessions();
      resolveGroups();
      resolveActiveId();
      await promise;
    });

    expect(savedSessions).toEqual([]);
    expect(savedGroups).toEqual([]);
    expect(startNewChat).toHaveBeenCalledTimes(1);

    unmount();
  });

  it('keeps history visible when persistence clearing fails', async () => {
    const localStorageMock = {
      removeItem: vi.fn(),
    };

    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      value: localStorageMock,
    });

    dbServiceMock.setAllSessions.mockRejectedValueOnce(new Error('db fail'));

    let savedSessions = [createSession('session-a')];
    let savedGroups = [{ id: 'group-1', title: 'Group 1', timestamp: 1 }];
    const setSavedSessions = vi.fn((updater) => {
      savedSessions = typeof updater === 'function' ? updater(savedSessions) : updater;
    });
    const setSavedGroups = vi.fn((updater) => {
      savedGroups = typeof updater === 'function' ? updater(savedGroups) : updater;
    });
    const startNewChat = vi.fn();

    const { result, unmount } = renderHook(() =>
      useHistoryClearer({
        savedSessions,
        setSavedSessions,
        setSavedGroups,
        startNewChat,
        activeJobs: { current: new Map() },
      }),
    );

    await act(async () => {
      await expect(result.current.clearAllHistory()).rejects.toThrow('db fail');
    });

    expect(savedSessions).toHaveLength(1);
    expect(savedGroups).toHaveLength(1);
    expect(startNewChat).not.toHaveBeenCalled();

    unmount();
  });

  it('clears browser storage and waits for IndexedDB cleanup before reloading', async () => {
    vi.useFakeTimers();

    const localStorageMock = {
      clear: vi.fn(),
    };
    const sessionStorageMock = {
      clear: vi.fn(),
    };
    const unregisterMock = vi.fn().mockResolvedValue(true);
    const getRegistrationsMock = vi.fn().mockResolvedValue([{ unregister: unregisterMock }]);
    const deleteCacheMock = vi.fn().mockResolvedValue(true);
    const cacheKeysMock = vi.fn().mockResolvedValue(['static-assets', 'workbox-precache-v1']);
    const reloadMock = vi.fn();

    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      value: localStorageMock,
    });
    Object.defineProperty(window, 'sessionStorage', {
      configurable: true,
      value: sessionStorageMock,
    });
    Object.defineProperty(window, 'caches', {
      configurable: true,
      value: {
        keys: cacheKeysMock,
        delete: deleteCacheMock,
      },
    });
    Object.defineProperty(window.navigator, 'serviceWorker', {
      configurable: true,
      value: {
        getRegistrations: getRegistrationsMock,
      },
    });
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { reload: reloadMock },
    });

    let resolveClear!: () => void;
    dbServiceMock.clearAllData.mockReturnValueOnce(
      new Promise<void>((resolve) => {
        resolveClear = resolve;
      }),
    );

    const { result, unmount } = renderHook(() =>
      useHistoryClearer({
        savedSessions: [],
        setSavedSessions: vi.fn(),
        setSavedGroups: vi.fn(),
        startNewChat: vi.fn(),
        activeJobs: { current: new Map() },
      }),
    );

    await act(async () => {
      void result.current.clearCacheAndReload();
      await Promise.resolve();
    });

    expect(localStorageMock.clear).toHaveBeenCalledTimes(1);
    expect(sessionStorageMock.clear).toHaveBeenCalledTimes(1);
    expect(getRegistrationsMock).toHaveBeenCalledTimes(1);
    expect(unregisterMock).toHaveBeenCalledTimes(1);
    expect(cacheKeysMock).toHaveBeenCalledTimes(1);
    expect(deleteCacheMock).toHaveBeenCalledWith('static-assets');
    expect(deleteCacheMock).toHaveBeenCalledWith('workbox-precache-v1');

    await act(async () => {
      vi.advanceTimersByTime(60);
    });

    expect(reloadMock).not.toHaveBeenCalled();

    await act(async () => {
      resolveClear();
      await Promise.resolve();
    });

    await act(async () => {
      vi.advanceTimersByTime(60);
    });

    expect(reloadMock).toHaveBeenCalledTimes(1);

    unmount();
  });
});
