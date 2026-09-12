import { describe, expect, it, vi } from 'vitest';
import type { SavedChatSession } from '@/types';
import { createChatSettings } from '@/test/data/factories';
import { compareSessionOrder } from '@/stores/sessionModels';
import { renderHook } from '@/test/render/renderer';
import { useGroupActions } from './useGroupActions';

const session = (id: string, sortOrder: number): SavedChatSession => ({
  id,
  title: id,
  timestamp: 1_000,
  messages: [],
  settings: createChatSettings(),
  sortOrder,
});

/**
 * action 层只负责改写 sortOrder，最终数组顺序由 chatStore 的 sortSessionsInPlace 决定
 * （见 chatStore.updateAndPersistSessions），所以这里必须按同一个比较器还原显示顺序。
 */
const displayOrder = (sessions: SavedChatSession[]) => [...sessions].sort(compareSessionOrder).map((item) => item.id);

const renderActions = (sessions: SavedChatSession[]) => {
  const updates: SavedChatSession[][] = [];
  const updateAndPersistSessions = vi.fn((updater: (prev: SavedChatSession[]) => SavedChatSession[]) => {
    updates.push(updater(sessions));
  });

  const hook = renderHook(() =>
    useGroupActions({
      updateAndPersistGroups: vi.fn(),
      updateAndPersistSessions,
      t: (key: string) => key,
    }),
  );

  return { hook, updates };
};

describe('useGroupActions session ordering', () => {
  it('reorders sessions inside a bucket', () => {
    const { hook, updates } = renderActions([session('a', 1), session('b', 2)]);

    hook.result.current.handleReorderSession('b', 'a', 'before');

    expect(displayOrder(updates[0])).toEqual(['b', 'a']);
    hook.unmount();
  });

  it('moves a session to the end of a bucket for container drops', () => {
    const { hook, updates } = renderActions([session('a', 1), session('b', 2)]);

    hook.result.current.handleMoveSessionToGroup('a', null, 'end');

    expect(displayOrder(updates[0])).toEqual(['b', 'a']);
    hook.unmount();
  });
});
