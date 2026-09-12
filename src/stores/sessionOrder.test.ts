import { describe, expect, it } from 'vitest';
import type { SavedChatSession } from '@/types';
import { createChatSettings } from '@/test/data/factories';
import { compareSessionOrder } from './sessionModels';
import {
  SESSION_ORDER_SPACING,
  assignAllBucketsOrder,
  moveSessionToBucket,
  placeNewSessionsAtBucketTop,
  placeSessionAfter,
  placeSessionAtBucketTop,
  reorderSession,
} from './sessionOrder';

const session = (
  id: string,
  overrides: Partial<Pick<SavedChatSession, 'isPinned' | 'timestamp' | 'sortOrder' | 'groupId'>> = {},
): SavedChatSession => ({
  id,
  title: id,
  timestamp: 1_000,
  messages: [],
  settings: createChatSettings(),
  ...overrides,
});

const ids = (sessions: SavedChatSession[]) => sessions.map((item) => item.id);

const ordered = (sessions: SavedChatSession[], groupId: string | null = null) =>
  sessions.filter((item) => (item.groupId ?? null) === groupId).sort(compareSessionOrder);

describe('assignAllBucketsOrder', () => {
  it('给缺键的桶按 pinned → timestamp 编号，视觉零突变', () => {
    const sessions = [
      session('a', { timestamp: 1 }),
      session('b', { timestamp: 9 }),
      session('c', { isPinned: true, timestamp: 5 }),
    ];

    const result = assignAllBucketsOrder(sessions);

    expect(ids(ordered(result))).toEqual(['c', 'b', 'a']);
    expect(ordered(result).map((item) => item.sortOrder)).toEqual([
      SESSION_ORDER_SPACING,
      2 * SESSION_ORDER_SPACING,
      3 * SESSION_ORDER_SPACING,
    ]);
  });

  it('不同桶各自编号', () => {
    const sessions = [session('g1a', { groupId: 'g1' }), session('g1b', { groupId: 'g1' }), session('none', {})];

    const result = assignAllBucketsOrder(sessions);

    expect(ordered(result, 'g1').map((item) => item.sortOrder)).toEqual([
      SESSION_ORDER_SPACING,
      2 * SESSION_ORDER_SPACING,
    ]);
    expect(ordered(result).map((item) => item.sortOrder)).toEqual([SESSION_ORDER_SPACING]);
  });

  it('已有完整数字键的桶原样返回（同一数组引用）', () => {
    const sessions = [session('a', { sortOrder: 5 }), session('b', { sortOrder: 7 })];

    expect(assignAllBucketsOrder(sessions)).toBe(sessions);
  });
});

describe('placeSessionAtBucketTop', () => {
  it('新建的普通会话落在未置顶区最前', () => {
    const sessions = [
      session('pinned', { isPinned: true, sortOrder: 1 }),
      session('top', { sortOrder: 2 }),
      session('older', { sortOrder: 3 }),
    ];

    const result = placeSessionAtBucketTop(sessions, session('fresh'));

    expect(ids(ordered(result))).toEqual(['pinned', 'fresh', 'top', 'older']);
  });

  it('新建的置顶会话落在置顶区最前', () => {
    const sessions = [session('pinned', { isPinned: true, sortOrder: 1 }), session('top', { sortOrder: 2 })];

    const result = placeSessionAtBucketTop(sessions, session('fresh', { isPinned: true }));

    expect(ids(ordered(result))).toEqual(['fresh', 'pinned', 'top']);
  });

  it('未编号的桶先整体编号再放置', () => {
    const sessions = [session('older', { timestamp: 1 }), session('newer', { timestamp: 9 })];

    const result = placeSessionAtBucketTop(sessions, session('fresh'));

    expect(ids(ordered(result))).toEqual(['fresh', 'newer', 'older']);
  });
});

describe('placeSessionAfter', () => {
  it('落在锚点正后方', () => {
    const sessions = [session('a', { sortOrder: 1 }), session('b', { sortOrder: 2 }), session('c', { sortOrder: 3 })];

    const result = placeSessionAfter(sessions, session('copy'), 'a');

    expect(ids(ordered(result))).toEqual(['a', 'copy', 'b', 'c']);
  });

  it('anchor 为 null 时落在同区段末尾', () => {
    const sessions = [session('a', { sortOrder: 1 }), session('pinned', { isPinned: true, sortOrder: 2 })];

    const result = placeSessionAfter(sessions, session('copy'), null);

    expect(ids(ordered(result))).toEqual(['pinned', 'a', 'copy']);
  });
});

describe('placeNewSessionsAtBucketTop', () => {
  it('只处理新增且缺键的会话，保持传入顺序', () => {
    const previous = [session('existing', { sortOrder: SESSION_ORDER_SPACING })];
    const next = [session('fresh-1'), session('existing', { sortOrder: SESSION_ORDER_SPACING })];

    const result = placeNewSessionsAtBucketTop(previous, next);

    expect(ids(ordered(result))).toEqual(['fresh-1', 'existing']);
  });

  it('没有新增会话时返回同一数组引用（保住热路径）', () => {
    const previous = [session('a', { sortOrder: 1 })];
    const next = previous.map((item) => ({ ...item, title: 'renamed' }));

    expect(placeNewSessionsAtBucketTop(previous, next)).toBe(next);
  });
});

describe('moveSessionToBucket', () => {
  it('placement=top 落在目标桶同区段最前', () => {
    const sessions = [
      session('moved', { groupId: 'g1', sortOrder: 1 }),
      session('target', { groupId: 'g2', sortOrder: 1 }),
    ];

    const result = moveSessionToBucket(sessions, 'moved', 'g2', 'top');

    expect(ordered(result, 'g2').map((item) => item.id)).toEqual(['moved', 'target']);
  });

  it('placement=end 落在目标桶同区段末尾', () => {
    const sessions = [
      session('moved', { groupId: 'g1', sortOrder: 1 }),
      session('target', { sortOrder: 1 }),
    ];

    const result = moveSessionToBucket(sessions, 'moved', null, 'end');

    expect(ordered(result).map((item) => item.id)).toEqual(['target', 'moved']);
  });
});

describe('reorderSession', () => {
  const base = () => [session('a', { sortOrder: 1 }), session('b', { sortOrder: 2 }), session('c', { sortOrder: 3 })];

  it('把 b 拖到 a 之前', () => {
    const result = reorderSession(base(), 'b', 'a', 'before');

    expect(ids(ordered(result))).toEqual(['b', 'a', 'c']);
  });

  it('把 a 拖到 c 之后', () => {
    const result = reorderSession(base(), 'a', 'c', 'after');

    expect(ids(ordered(result))).toEqual(['b', 'c', 'a']);
  });

  it('落点等于原位时返回同一数组引用（零写入）', () => {
    const sessions = base();

    expect(reorderSession(sessions, 'b', 'a', 'after')).toBe(sessions);
    expect(reorderSession(sessions, 'b', 'b', 'before')).toBe(sessions);
  });

  it('只重建被移动的那一条，其余保持对象引用', () => {
    const sessions = base();
    const untouched = sessions[0];

    const result = reorderSession(sessions, 'c', 'a', 'before');

    expect(result.find((item) => item.id === 'a')).toBe(untouched);
  });

  it('缝隙耗尽时整桶重编号后仍落在正确位置', () => {
    const sessions = [session('a', { sortOrder: 1 }), session('b', { sortOrder: 1.5 }), session('c', { sortOrder: 9 })];

    const result = reorderSession(sessions, 'c', 'b', 'before');

    expect(ids(ordered(result))).toEqual(['a', 'c', 'b']);
  });

  it('跨桶拖动会改写 groupId 并落在目标位置', () => {
    const sessions = [
      session('moved', { sortOrder: 1 }),
      session('g1a', { groupId: 'g1', sortOrder: 1 }),
      session('g1b', { groupId: 'g1', sortOrder: 2 }),
    ];

    const result = reorderSession(sessions, 'moved', 'g1a', 'after');

    expect(ordered(result, 'g1').map((item) => item.id)).toEqual(['g1a', 'moved', 'g1b']);
    expect(ordered(result)).toEqual([]);
  });

  it('拖到置顶项上会自动置顶，拖回普通项会取消置顶', () => {
    // isPinned 跟随【目标项】，所以要取消置顶必须落到普通项上 —— 落到另一个置顶项后面只会保持置顶。
    const sessions = [
      session('pinned', { isPinned: true, sortOrder: 1 }),
      session('plain-a', { sortOrder: 2 }),
      session('plain-b', { sortOrder: 3 }),
    ];

    const pinnedResult = reorderSession(sessions, 'plain-a', 'pinned', 'before');
    expect(pinnedResult.find((item) => item.id === 'plain-a')?.isPinned).toBe(true);

    const unpinnedResult = reorderSession(pinnedResult, 'plain-a', 'plain-b', 'after');
    expect(unpinnedResult.find((item) => item.id === 'plain-a')?.isPinned).toBe(false);
  });

  it('落点只认 over 本身，与中间隔着多少条无关（搜索过滤态下的落点映射）', () => {
    // 侧边栏搜索时显示的是过滤子集，但传入的 prev 始终是完整桶序列。
    // 这里的语义保证：拖到 over 上就是紧贴 over，不会跑到过滤后列表的"视觉下标"位置。
    const sessions = [
      session('a', { sortOrder: 1 }),
      session('hidden-1', { sortOrder: 2 }),
      session('b', { sortOrder: 3 }),
      session('hidden-2', { sortOrder: 4 }),
      session('d', { sortOrder: 5 }),
    ];

    const result = reorderSession(sessions, 'd', 'b', 'before');

    expect(ids(ordered(result))).toEqual(['a', 'hidden-1', 'd', 'b', 'hidden-2']);
  });

  it('会话在拖动途中被删除时原样返回', () => {
    const sessions = base();

    expect(reorderSession(sessions, 'missing', 'a', 'before')).toBe(sessions);
    expect(reorderSession(sessions, 'a', 'missing', 'before')).toBe(sessions);
  });

  it('空桶里拖动不做任何事', () => {
    expect(reorderSession([], 'a', 'b', 'before')).toEqual([]);
  });
});
