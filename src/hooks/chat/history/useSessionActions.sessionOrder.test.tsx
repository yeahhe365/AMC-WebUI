import { describe, expect, it, vi } from 'vitest';
import type { SavedChatSession } from '@/types';
import { createChatSettings } from '@/test/data/factories';
import { renderHook } from '@/test/render/renderer';
import { useSettingsStore } from '@/stores/settingsStore';
import { useSessionActions } from './useSessionActions';

const session = (id: string, sortOrder: number): SavedChatSession => ({
  id,
  title: id,
  timestamp: 1_000,
  messages: [],
  settings: createChatSettings(),
  sortOrder,
});

describe('handleDuplicateSession ordering', () => {
  it('places the duplicate right after its source session', async () => {
    useSettingsStore.setState({ language: 'en' });

    const sessions = [session('a', 1_048_576), session('b', 2_097_152)];
    let result: SavedChatSession[] = [];
    const updateAndPersistSessions = vi.fn((updater: (prev: SavedChatSession[]) => SavedChatSession[]) => {
      result = updater(sessions);
    });

    const hook = renderHook(() => useSessionActions({ updateAndPersistSessions, activeJobs: { current: new Map() } }));

    await hook.result.current.handleDuplicateSession('a');

    expect([...result].sort((left, right) => (left.sortOrder ?? 0) - (right.sortOrder ?? 0)).map((item) => item.title)).toEqual([
      'a',
      'a (Copy)',
      'b',
    ]);
    hook.unmount();
  });
});
