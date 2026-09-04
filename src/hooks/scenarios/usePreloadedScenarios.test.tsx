import { act } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_APP_SETTINGS } from '@/constants/settingsDefaults';
import { SYSTEM_SCENARIO_IDS } from '@/features/scenarios/scenarioLibrary';
import type { SavedChatSession } from '@/types';
import { createNewSession } from '@/utils/chat/session';
import { usePreloadedScenarios } from './usePreloadedScenarios';
import { renderHook } from '@/test/render/renderer';

const { localStorageMock } = vi.hoisted(() => {
  const store = new Map<string, string>();
  const mock = {
    getItem: vi.fn((key: string) => store.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => {
      store.set(key, value);
    }),
    removeItem: vi.fn((key: string) => {
      store.delete(key);
    }),
    clear: vi.fn(() => {
      store.clear();
    }),
  };

  Object.defineProperty(globalThis, 'localStorage', {
    value: mock,
    configurable: true,
  });

  return { localStorageMock: mock };
});

vi.mock('@/utils/chat/ids', () => ({
  generateUniqueId: () => 'generated-id',
}));

vi.mock('@/utils/chat/session', () => ({
  generateSessionTitle: () => 'Generated title',
  createNewSession: vi.fn((settings, messages, title) => ({
    id: 'new-session',
    title,
    messages,
    settings,
    timestamp: Date.now(),
  })),
}));

describe('usePreloadedScenarios', () => {
  beforeEach(() => {
    localStorageMock.clear();
    vi.clearAllMocks();
  });

  it('returns voxel as a user scenario rather than a system preset', async () => {
    const { result, unmount } = renderHook(() =>
      usePreloadedScenarios({
        appSettings: DEFAULT_APP_SETTINGS,
        setAppSettings: vi.fn(),
        updateAndPersistSessions: vi.fn(),
        setActiveSessionId: vi.fn(),
      }),
    );

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    const scenarioIds = result.current.savedScenarios.map((scenario) => scenario.id);

    expect(scenarioIds).toContain('voxel-designer-scenario-default');
    expect(SYSTEM_SCENARIO_IDS).not.toContain('voxel-designer-scenario-default');
    unmount();
  });

  it('keeps existing metadata-only sessions when loading a preloaded scenario', async () => {
    const existingSession: SavedChatSession = {
      id: 'existing-session',
      title: 'Existing',
      timestamp: 1,
      messages: [],
      settings: DEFAULT_APP_SETTINGS,
    };
    const newSession: SavedChatSession = {
      id: 'scenario-session',
      title: 'Scenario',
      timestamp: 2,
      messages: [
        {
          id: 'message-1',
          role: 'user',
          content: 'Scenario prompt',
          timestamp: new Date('2026-04-20T10:00:00.000Z'),
        },
      ],
      settings: DEFAULT_APP_SETTINGS,
    };
    vi.mocked(createNewSession).mockReturnValue(newSession);

    let sessions = [existingSession];
    const updateAndPersistSessions = vi.fn((updater: (prev: SavedChatSession[]) => SavedChatSession[]) => {
      sessions = updater(sessions);
    });

    const { result, unmount } = renderHook(() =>
      usePreloadedScenarios({
        appSettings: DEFAULT_APP_SETTINGS,
        setAppSettings: vi.fn(),
        updateAndPersistSessions,
        setActiveSessionId: vi.fn(),
      }),
    );

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    act(() => {
      result.current.handleLoadPreloadedScenario({
        id: 'scenario-1',
        title: 'Scenario',
        messages: [{ id: 'seed-1', role: 'user', content: 'Scenario prompt' }],
      });
    });

    expect(sessions.map((session) => session.id)).toEqual(['scenario-session', 'existing-session']);

    unmount();
  });
});
