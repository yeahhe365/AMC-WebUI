import { describe, expect, it } from 'vitest';
import type { SavedChatSession } from '@/types';
import { createChatSettings } from '@/test/data/factories';
import { compareSessionOrder, sortSessionsInPlace } from './sessionModels';

const session = (
  id: string,
  overrides: Partial<Pick<SavedChatSession, 'isPinned' | 'timestamp' | 'sortOrder'>> = {},
): SavedChatSession => ({
  id,
  title: id,
  timestamp: 1_000,
  messages: [],
  settings: createChatSettings(),
  ...overrides,
});

const ids = (sessions: SavedChatSession[]) => sessions.map((item) => item.id);

describe('compareSessionOrder', () => {
  it('无 sortOrder 时保持 pinned → timestamp 倒序（升级前行为不变）', () => {
    const sessions = [session('old', { timestamp: 1 }), session('new', { timestamp: 9 })];

    sortSessionsInPlace(sessions);

    expect(ids(sessions)).toEqual(['new', 'old']);
  });

  it('sortOrder 压过 timestamp', () => {
    const sessions = [
      session('newer-but-lower', { timestamp: 9, sortOrder: 2 }),
      session('older-but-higher', { timestamp: 1, sortOrder: 1 }),
    ];

    sortSessionsInPlace(sessions);

    expect(ids(sessions)).toEqual(['older-but-higher', 'newer-but-lower']);
  });

  it('pinned 仍是第一级，压过 sortOrder', () => {
    const sessions = [
      session('unpinned-first', { sortOrder: 1 }),
      session('pinned-last', { isPinned: true, sortOrder: 99 }),
    ];

    sortSessionsInPlace(sessions);

    expect(ids(sessions)).toEqual(['pinned-last', 'unpinned-first']);
  });

  it('sortOrder 相同时用 timestamp 倒序兜底', () => {
    const sessions = [session('a', { timestamp: 1, sortOrder: 5 }), session('b', { timestamp: 9, sortOrder: 5 })];

    sortSessionsInPlace(sessions);

    expect(ids(sessions)).toEqual(['b', 'a']);
  });

  it('缺 sortOrder 的排在有序的之后', () => {
    const sessions = [session('unordered', { timestamp: 99 }), session('ordered', { sortOrder: 1, timestamp: 1 })];

    expect(compareSessionOrder(sessions[0], sessions[1])).toBeGreaterThan(0);
  });
});
