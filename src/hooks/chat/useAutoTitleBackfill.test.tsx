import { act } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SavedChatSession } from '@/types';
import { DEFAULT_APP_SETTINGS } from '@/constants/settingsDefaults';

const { mockDbGetSession, autoTitleSessionMock, isEligibleMock } = vi.hoisted(() => ({
  mockDbGetSession: vi.fn(),
  autoTitleSessionMock: vi.fn(),
  isEligibleMock: vi.fn(),
}));

vi.mock('@/services/db/dbService', async () => {
  const { createDbServiceMockModule } = await import('@/test/doubles/moduleMocks');

  return createDbServiceMockModule({ getSession: mockDbGetSession });
});

vi.mock('@/features/auto-titling/autoTitleSession', () => ({
  autoTitleSession: autoTitleSessionMock,
  isSessionAutoTitleEligible: isEligibleMock,
}));

const mockStore = vi.hoisted(() => {
  const state = {
    savedSessions: [] as SavedChatSession[],
    activeSessionId: null as string | null,
    loadingSessionIds: new Set<string>(),
    generatingTitleSessionIds: new Set<string>(),
    updateAndPersistSessions: vi.fn(),
    setGeneratingTitleSessionIds: vi.fn(),
  };
  const getState = () => state;
  const useChatStore = Object.assign((selector: (s: typeof state) => unknown) => selector(state), {
    getState,
  });
  return { state, useChatStore };
});

vi.mock('@/stores/chatStore', () => ({
  useChatStore: mockStore.useChatStore,
}));

import { useAutoTitleBackfill } from './useAutoTitleBackfill';
import { renderHook } from '@/test/render/renderer';

const makeSession = (id: string, overrides: Partial<SavedChatSession> = {}): SavedChatSession => ({
  id,
  title: 'New Chat',
  timestamp: 1,
  settings: { ...DEFAULT_APP_SETTINGS, modelId: 'gemini-3-flash-preview' },
  messages: [
    { id: 'u', role: 'user', content: 'hello', timestamp: new Date('2026-05-09T00:00:00.000Z') },
    { id: 'm', role: 'model', content: 'world', timestamp: new Date('2026-05-09T00:00:01.000Z') },
  ],
  ...overrides,
});

describe('useAutoTitleBackfill', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockStore.state.savedSessions = [];
    mockStore.state.activeSessionId = null;
    mockStore.state.loadingSessionIds = new Set();
    mockStore.state.generatingTitleSessionIds = new Set();
    isEligibleMock.mockReturnValue(true);
    autoTitleSessionMock.mockResolvedValue(true);
    mockDbGetSession.mockImplementation(async (sessionId: string) => {
      const session = mockStore.state.savedSessions.find((s) => s.id === sessionId);
      return session ?? null;
    });
  });

  it('processes eligible candidates and skips ineligible ones via memory pre-filter', async () => {
    const protectedSession = makeSession('protected', { title: 'My manual title', titleSource: 'manual' });
    const eligible = makeSession('eligible');
    mockStore.state.savedSessions = [protectedSession, eligible];

    const { unmount } = renderHook(() => useAutoTitleBackfill({ appSettings: DEFAULT_APP_SETTINGS, language: 'en' }));

    await vi.waitFor(() => {
      expect(autoTitleSessionMock).toHaveBeenCalledTimes(1);
    });

    // Only the eligible session got a DB read.
    expect(mockDbGetSession).toHaveBeenCalledWith('eligible');
    expect(mockDbGetSession).not.toHaveBeenCalledWith('protected');
    unmount();
  });

  it('re-runs the batch when a state change arrives mid-processing (rerun mechanism)', async () => {
    const first = makeSession('first');
    mockStore.state.savedSessions = [first];
    let releaseFirst: (() => void) | undefined;
    autoTitleSessionMock.mockImplementation(async () => {
      // While the first candidate is in flight, another session becomes eligible
      // in the store. The effect re-run must be suppressed (isProcessingRef) and
      // queued as a rerun.
      return new Promise<boolean>((resolve) => {
        releaseFirst = () => resolve(true);
      });
    });

    const { rerender, unmount } = renderHook(() =>
      useAutoTitleBackfill({ appSettings: DEFAULT_APP_SETTINGS, language: 'en' }),
    );

    await vi.waitFor(() => {
      expect(autoTitleSessionMock).toHaveBeenCalledTimes(1);
    });

    // Mid-batch store change: the effect re-runs while processing is in flight,
    // records a rerun request (isProcessingRef is still true), and must not
    // start a second concurrent batch.
    const second = makeSession('second');
    act(() => {
      mockStore.state.savedSessions = [first, second];
      rerender();
    });

    // No second concurrent call while the first batch is still in flight.
    expect(autoTitleSessionMock).toHaveBeenCalledTimes(1);

    // Release the first batch; its finally block then triggers the queued rerun,
    // which processes 'second'. Use async act to flush the setRerunToken update.
    await act(async () => {
      releaseFirst?.();
    });

    await vi.waitFor(() => {
      expect(autoTitleSessionMock.mock.calls.length).toBeGreaterThanOrEqual(2);
    });

    const processedIds = autoTitleSessionMock.mock.calls.map(
      (call) => (call[0] as { session: SavedChatSession }).session.id,
    );
    expect(processedIds).toContain('second');
    unmount();
  });
});
