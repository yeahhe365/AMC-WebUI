# 侧边栏会话手动拖拽排序 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让侧边栏里每个桶（分组 / 未分组）内的会话可以手动拖拽排序并持久化，且拖到置顶区即自动置顶。

**Architecture:** 给 `SavedChatSession` 增加数字间隔键 `sortOrder`（桶内有效，间隔 `2^20`），排序与放置全部收敛到新的纯函数模块 `src/stores/sessionOrder.ts`；插入一律"取中点"，因此任何拖动/新建/复制只写 1~2 条会话记录。权威比较器只有一份，放在 `src/stores/sessionModels.ts`，`chatStore.updateAndPersistSessions` 这个必经收口点复用同一份比较器。

**Tech Stack:** React 18、TypeScript、Zustand、IndexedDB、原生 HTML5 drag & drop、Vitest、Playwright。

**Spec:** `docs/superpowers/specs/2026-09-12-sidebar-session-manual-reorder-design.md`

## Global Constraints

- **禁止 `git add -A` / `git commit -a`。** 当前工作区有 44 个与本任务无关的未提交改动（含 `server/`、`src/components/settings/sections/api-config/` 下的删除）。每个提交只 `git add` 该任务明确列出的文件。
- 测试命令统一用 `node scripts/run-vitest.mjs run <路径>`（不要直接用 `npx vitest`）。
- 类型检查：`npm run typecheck`。Lint：`npm run lint`（`--max-warnings=0`，不许留 warning）。
- `sortOrder` 只能由 `src/stores/sessionOrder.ts` 计算，任何其它地方都不得手写数值。
- 桶（bucket）定义：`session.groupId ?? null`。`sortOrder` 只在桶内有意义。
- 不要复用 `ChatGroup.orderKey` 这个字段名：它是补零索引字符串，与 `sortOrder: number` 类型和语义都不同。
- 会话记录比较是按**对象引用**做的（`src/stores/sessionPersistence.ts:28`）。任何"整桶重编号"都必须保持未变化的会话对象引用不变，否则会触发全量落盘（每条非活跃会话约 3 次串行 IndexedDB 事务）。
- i18n 文案必须覆盖现有 7 种语言：en / zh / ja / ko / es / fr / de。

---

### Task 1: `sortOrder` 字段与权威比较器

**Files:**

- Modify: `src/types/chat.ts:120-137`
- Modify: `src/stores/sessionModels.ts:5-12`
- Test: `src/stores/sessionModels.order.test.ts` (create)

**Interfaces:**

- Consumes: 无（本任务是地基）
- Produces:
  - `SavedChatSession.sortOrder?: number`
  - `compareSessionOrder(left, right): number` （`src/stores/sessionModels.ts`）
  - `sortSessionsInPlace<T extends Pick<SavedChatSession, 'isPinned' | 'timestamp' | 'sortOrder'>>(sessions: T[]): T[]` （签名扩展，仍是原地排序并返回同一数组）

- [ ] **Step 1: 写失败测试**

创建 `src/stores/sessionModels.order.test.ts`：

```ts
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
```

- [ ] **Step 2: 跑测试确认失败**

Run: `node scripts/run-vitest.mjs run src/stores/sessionModels.order.test.ts`
Expected: FAIL —— `compareSessionOrder is not a function`（或类型报错），且 "sortOrder 压过 timestamp" 用例失败。

- [ ] **Step 3: 加字段**

`src/types/chat.ts`，在 `SavedChatSession` 的 `createdTabId` 之后插入：

```ts
  /**
   * 桶内手动顺序（数字间隔键）。桶 = groupId ?? null。
   * 只由 src/stores/sessionOrder.ts 维护，不要在其它地方手写数值。
   */
  sortOrder?: number;
```

- [ ] **Step 4: 改比较器**

`src/stores/sessionModels.ts`，把现有 `sortSessionsInPlace`（第 5-12 行）整体替换为：

```ts
/**
 * 会话显示顺序的唯一权威比较器：pinned 优先 → 桶内手动顺序 → timestamp 倒序。
 * 只应在同一个桶（groupId ?? null）内比较 —— sortOrder 是桶内坐标。
 */
export function compareSessionOrder(
  leftSession: Pick<SavedChatSession, 'isPinned' | 'timestamp' | 'sortOrder'>,
  rightSession: Pick<SavedChatSession, 'isPinned' | 'timestamp' | 'sortOrder'>,
): number {
  if (!!leftSession.isPinned !== !!rightSession.isPinned) {
    return leftSession.isPinned ? -1 : 1;
  }

  const leftOrder = leftSession.sortOrder ?? Number.POSITIVE_INFINITY;
  const rightOrder = rightSession.sortOrder ?? Number.POSITIVE_INFINITY;
  if (leftOrder !== rightOrder) {
    return leftOrder - rightOrder;
  }

  return rightSession.timestamp - leftSession.timestamp;
}

export function sortSessionsInPlace<T extends Pick<SavedChatSession, 'isPinned' | 'timestamp' | 'sortOrder'>>(
  sessions: T[],
): T[] {
  sessions.sort(compareSessionOrder);
  return sessions;
}
```

- [ ] **Step 5: 跑测试确认通过**

Run: `node scripts/run-vitest.mjs run src/stores/sessionModels.order.test.ts`
Expected: PASS（5 个用例）

- [ ] **Step 6: 跑受影响的既有测试**

Run: `node scripts/run-vitest.mjs run src/components/sidebar src/hooks/chat/history src/stores`
Expected: PASS —— `sortOrder` 目前处处为 `undefined`，行为应与改动前完全一致。若有失败，说明比较器写错了，不要改测试。

- [ ] **Step 7: 提交**

```bash
git add src/types/chat.ts src/stores/sessionModels.ts src/stores/sessionModels.order.test.ts
git commit -m "feat(sidebar): add session sortOrder field and authoritative order comparator"
```

---

### Task 2: `sessionOrder` 纯函数模块

**Files:**

- Create: `src/stores/sessionOrder.ts`
- Test: `src/stores/sessionOrder.test.ts` (create)

**Interfaces:**

- Consumes: `compareSessionOrder`（Task 1）
- Produces（后续所有任务只准用这些函数改顺序）：
  - `SESSION_ORDER_SPACING = 2 ** 20`
  - `assignBucketOrder(sessions: SavedChatSession[], bucketKey: string | null): SavedChatSession[]`
  - `assignAllBucketsOrder(sessions: SavedChatSession[]): SavedChatSession[]`
  - `placeSessionAtBucketTop(sessions: SavedChatSession[], session: SavedChatSession): SavedChatSession[]`
  - `placeSessionAfter(sessions: SavedChatSession[], session: SavedChatSession, anchorId: string | null): SavedChatSession[]`
  - `placeNewSessionsAtBucketTop(previous: SavedChatSession[], next: SavedChatSession[]): SavedChatSession[]`
  - `moveSessionToBucket(sessions: SavedChatSession[], sessionId: string, groupId: string | null, placement: 'top' | 'end'): SavedChatSession[]`
  - `reorderSession(sessions: SavedChatSession[], activeId: string, overId: string, position: 'before' | 'after'): SavedChatSession[]`

- [ ] **Step 1: 写失败测试**

创建 `src/stores/sessionOrder.test.ts`：

```ts
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
      session('target', { groupId: 'g2', sortOrder: 1 }),
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
    const sessions = [session('pinned', { isPinned: true, sortOrder: 1 }), session('plain', { sortOrder: 2 })];

    const pinnedResult = reorderSession(sessions, 'plain', 'pinned', 'before');
    expect(pinnedResult.find((item) => item.id === 'plain')?.isPinned).toBe(true);

    const unpinnedResult = reorderSession(pinnedResult, 'plain', 'pinned', 'after');
    expect(unpinnedResult.find((item) => item.id === 'plain')?.isPinned).toBe(false);
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
```

- [ ] **Step 2: 跑测试确认失败**

Run: `node scripts/run-vitest.mjs run src/stores/sessionOrder.test.ts`
Expected: FAIL —— `Failed to resolve import "./sessionOrder"`。

- [ ] **Step 3: 写实现**

创建 `src/stores/sessionOrder.ts`：

```ts
import type { SavedChatSession } from '@/types';
import { compareSessionOrder } from './sessionModels';

/**
 * 同一桶内相邻两条会话之间的键间隔。留出 2^20 的缝隙，让"取中点插入"可以连续约 20 次
 * 而不必整桶重编号；两端插入用加减 SPACING，不会耗尽。
 */
export const SESSION_ORDER_SPACING = 2 ** 20;

type OrderableSession = Pick<SavedChatSession, 'id' | 'groupId' | 'isPinned' | 'timestamp' | 'sortOrder'>;

const bucketKeyOf = (session: Pick<SavedChatSession, 'groupId'>): string | null => session.groupId ?? null;

const isSameSection = (left: OrderableSession, right: OrderableSession): boolean =>
  !!left.isPinned === !!right.isPinned;

const makeOrderKey = (position: number): number => position * SESSION_ORDER_SPACING;

const orderedBucket = (sessions: SavedChatSession[], bucketKey: string | null): SavedChatSession[] =>
  sessions.filter((session) => bucketKeyOf(session) === bucketKey).sort(compareSessionOrder);

/**
 * 桶内全部会话按显示顺序重新编号。只有真正变化的会话才生成新对象——比较是按引用做的
 * （src/stores/sessionPersistence.ts），保持引用才能避免全量落盘。
 */
export function assignBucketOrder(sessions: SavedChatSession[], bucketKey: string | null): SavedChatSession[] {
  const patched = new Map<string, SavedChatSession>();

  orderedBucket(sessions, bucketKey).forEach((session, index) => {
    const sortOrder = makeOrderKey(index + 1);
    if (session.sortOrder !== sortOrder) {
      patched.set(session.id, { ...session, sortOrder });
    }
  });

  if (patched.size === 0) return sessions;
  return sessions.map((session) => patched.get(session.id) ?? session);
}

/** 旧数据一次性回填：只处理存在缺键会话的桶，已完整编号的桶原样返回。 */
export function assignAllBucketsOrder(sessions: SavedChatSession[]): SavedChatSession[] {
  const bucketsNeedingBackfill = new Set<string | null>();
  sessions.forEach((session) => {
    if (typeof session.sortOrder !== 'number') {
      bucketsNeedingBackfill.add(bucketKeyOf(session));
    }
  });

  let working = sessions;
  bucketsNeedingBackfill.forEach((bucketKey) => {
    working = assignBucketOrder(working, bucketKey);
  });
  return working;
}

const ensureBucketOrder = (sessions: SavedChatSession[], bucketKey: string | null): SavedChatSession[] =>
  sessions.some((session) => bucketKeyOf(session) === bucketKey && typeof session.sortOrder !== 'number')
    ? assignBucketOrder(sessions, bucketKey)
    : sessions;

const midpoint = (previous: number, next: number): number | null =>
  next - previous > 1 ? (previous + next) / 2 : null;

/** 求"插到 ordered 的第 index 位"应使用的键；返回 null 表示该缝隙的中点空间已耗尽。 */
const orderKeyForIndex = (ordered: SavedChatSession[], index: number): number | null => {
  const previous = ordered[index - 1];
  const next = ordered[index];

  if (!previous && !next) return SESSION_ORDER_SPACING;
  if (!previous) return (next.sortOrder as number) - SESSION_ORDER_SPACING;
  if (!next) return (previous.sortOrder as number) + SESSION_ORDER_SPACING;
  return midpoint(previous.sortOrder as number, next.sortOrder as number);
};

const indexOfPlacement = (section: SavedChatSession[], overId: string, position: 'before' | 'after'): number | null => {
  const overIndex = section.findIndex((session) => session.id === overId);
  if (overIndex === -1) return null;
  return position === 'before' ? overIndex : overIndex + 1;
};

/**
 * 把一个会话放到它所属桶内「与自身 isPinned 相同」区段的指定位置。
 * 会话可以已在列表中（重新定位）或不在（新建/复制）。
 */
const placeSession = (
  sessions: SavedChatSession[],
  session: SavedChatSession,
  anchorId: string | null,
  fallbackPlacement: 'top' | 'end',
): SavedChatSession[] => {
  const bucketKey = bucketKeyOf(session);
  const sectionOf = (list: SavedChatSession[]) =>
    orderedBucket(list, bucketKey).filter((item) => item.id !== session.id && isSameSection(item, session));
  const indexFor = (section: SavedChatSession[]) => {
    if (!anchorId) return fallbackPlacement === 'top' ? 0 : section.length;
    const anchorIndex = section.findIndex((item) => item.id === anchorId);
    return anchorIndex === -1 ? 0 : anchorIndex + 1;
  };

  let working = ensureBucketOrder(sessions, bucketKey);
  let index = indexFor(sectionOf(working));
  let sortOrder = orderKeyForIndex(sectionOf(working), index);

  if (sortOrder === null) {
    working = assignBucketOrder(working, bucketKey);
    index = indexFor(sectionOf(working));
    sortOrder = orderKeyForIndex(sectionOf(working), index);
  }
  if (sortOrder === null) return sessions;

  const placed: SavedChatSession = { ...session, sortOrder };
  if (!working.some((item) => item.id === session.id)) {
    return [...working, placed];
  }
  return working.map((item) => (item.id === session.id ? placed : item));
};

/** 放到桶内同区段最前（新建会话、拖到分组标题）。 */
export const placeSessionAtBucketTop = (sessions: SavedChatSession[], session: SavedChatSession): SavedChatSession[] =>
  placeSession(sessions, session, null, 'top');

/** 放到锚点正后方（复制 / fork）；anchorId 为 null 表示同区段末尾（拖到列表空白）。 */
export const placeSessionAfter = (
  sessions: SavedChatSession[],
  session: SavedChatSession,
  anchorId: string | null,
): SavedChatSession[] => placeSession(sessions, session, anchorId, 'end');

/** store 收口点用：把本次新增且还没有手动顺序的会话放到各自桶顶。 */
export function placeNewSessionsAtBucketTop(
  previous: SavedChatSession[],
  next: SavedChatSession[],
): SavedChatSession[] {
  const previousIds = new Set(previous.map((session) => session.id));
  const pending = next.filter((session) => !previousIds.has(session.id) && typeof session.sortOrder !== 'number');
  if (pending.length === 0) return next;

  // 倒序放置，保证同一批新会话的相对先后与传入顺序一致。
  let working = next;
  [...pending].reverse().forEach((session) => {
    working = placeSessionAtBucketTop(working, session);
  });
  return working;
}

/** 把已有会话移到目标桶的同 isPinned 区段端点（菜单"移入分组"、拖到分组标题 / 列表空白）。 */
export function moveSessionToBucket(
  sessions: SavedChatSession[],
  sessionId: string,
  groupId: string | null,
  placement: 'top' | 'end',
): SavedChatSession[] {
  const session = sessions.find((item) => item.id === sessionId);
  if (!session) return sessions;
  return placeSession(sessions, { ...session, groupId }, null, placement);
}

/**
 * 拖动重排：把 activeId 放到 overId 的前/后，并让 active 的 isPinned 跟随目标项
 * （跨置顶边界即置顶 / 取消置顶）。位置未变时返回原数组引用，不产生任何写入。
 */
export function reorderSession(
  sessions: SavedChatSession[],
  activeId: string,
  overId: string,
  position: 'before' | 'after',
): SavedChatSession[] {
  const active = sessions.find((session) => session.id === activeId);
  const over = sessions.find((session) => session.id === overId);
  if (!active || !over || active.id === over.id) return sessions;

  const targetGroupId = bucketKeyOf(over);
  const targetPinned = !!over.isPinned;
  const needsRelocation = bucketKeyOf(active) !== targetGroupId || !!active.isPinned !== targetPinned;
  const moved: SavedChatSession = needsRelocation
    ? { ...active, groupId: targetGroupId, isPinned: targetPinned }
    : active;

  const base = ensureBucketOrder(
    sessions.map((session) => (session.id === active.id ? moved : session)),
    targetGroupId,
  );
  const othersOf = (list: SavedChatSession[]) =>
    orderedBucket(list, targetGroupId).filter((session) => session.id !== active.id);

  let index = indexOfPlacement(othersOf(base), overId, position);
  if (index === null) return sessions;
  let working = base;
  let sortOrder = orderKeyForIndex(othersOf(base), index);

  if (sortOrder === null) {
    working = assignBucketOrder(base, targetGroupId);
    index = indexOfPlacement(othersOf(working), overId, position);
    if (index === null) return sessions;
    sortOrder = orderKeyForIndex(othersOf(working), index);
  }
  if (sortOrder === null) return sessions;

  const current = working.find((session) => session.id === active.id);
  if (!current) return sessions;
  if (current === active && current.sortOrder === sortOrder) return sessions;

  return working.map((session) => (session.id === active.id ? { ...current, sortOrder } : session));
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `node scripts/run-vitest.mjs run src/stores/sessionOrder.test.ts`
Expected: PASS（全部用例）

- [ ] **Step 5: 类型检查**

Run: `npm run typecheck`
Expected: 通过（无输出即通过）

- [ ] **Step 6: 提交**

```bash
git add src/stores/sessionOrder.ts src/stores/sessionOrder.test.ts
git commit -m "feat(sidebar): add session order pure module with midpoint insertion"
```

---

### Task 3: store 收口点 + 加载期回填

**Files:**

- Modify: `src/stores/chatStore.ts:370-378`
- Modify: `src/hooks/chat/history/sessionInitialLoad.ts:171-173`
- Test: `src/hooks/chat/history/sessionInitialLoad.test.ts` (modify, append a case)

**Interfaces:**

- Consumes: `placeNewSessionsAtBucketTop`、`assignAllBucketsOrder`（Task 2）
- Produces: 新建会话自动落到所属桶顶部；旧数据在加载后被一次性回填 `sortOrder`

- [ ] **Step 1: 写失败测试**

在 `src/hooks/chat/history/sessionInitialLoad.test.ts` 的 `describe('loadInitialSessionData', ...)` 内追加：

```ts
it('backfills legacy sessions with bucket-scoped manual order', async () => {
  stubPathname('/');
  mockGetAllSessionMetadata.mockResolvedValue([
    createSavedChatSession({ id: 'legacy-newer', title: 'newer', timestamp: 2_000, messages: [] }),
    createSavedChatSession({ id: 'legacy-older', title: 'older', timestamp: 1_000, messages: [] }),
  ]);
  mockGetAllGroups.mockResolvedValue([]);

  const updateAndPersistSessions = vi.fn();
  await loadInitialSessionData({
    appSettings: {} as never,
    setSavedSessions: vi.fn(),
    setSavedGroups: vi.fn(),
    setActiveSessionId: vi.fn(),
    setActiveMessages: vi.fn(),
    restoreDraftFiles: vi.fn(),
    updateAndPersistSessions,
    startNewChat: vi.fn(),
  });

  expect(updateAndPersistSessions).toHaveBeenCalledTimes(1);
  const updater = updateAndPersistSessions.mock.calls[0][0] as (prev: SavedChatSession[]) => SavedChatSession[];
  const result = updater([
    createSavedChatSession({ id: 'legacy-newer', title: 'newer', timestamp: 2_000, messages: [] }),
    createSavedChatSession({ id: 'legacy-older', title: 'older', timestamp: 1_000, messages: [] }),
  ]);

  expect(result.map((session) => session.id)).toEqual(['legacy-newer', 'legacy-older']);
  expect(result.map((session) => session.sortOrder)).toEqual([1_048_576, 2_097_152]);
});
```

在该文件顶部 import 中补上 `SavedChatSession` 类型：

```ts
import type { SavedChatSession } from '@/types';
```

- [ ] **Step 2: 跑测试确认失败**

Run: `node scripts/run-vitest.mjs run src/hooks/chat/history/sessionInitialLoad.test.ts`
Expected: FAIL —— `expected [] to deeply equal [ 1048576, 2097152 ]`（`updateAndPersistSessions` 未被调用）。

- [ ] **Step 3: 加加载期回填**

`src/hooks/chat/history/sessionInitialLoad.ts`，在 `setSavedSessions((prev) => mergeLoadedSessionMetadata(prev, sortedList));` 之后插入：

```ts
// 旧数据一次性回填手动顺序：桶内按 (pinned, timestamp) 编号，升级后视觉零突变。
// 已经完整编号的数据会原样返回（同一个数组引用），不会产生任何写入。
updateAndPersistSessions((prev) => assignAllBucketsOrder(prev));
```

并在文件顶部 import 中补上：

```ts
import { assignAllBucketsOrder } from '@/stores/sessionOrder';
```

- [ ] **Step 4: 跑测试确认通过**

Run: `node scripts/run-vitest.mjs run src/hooks/chat/history/sessionInitialLoad.test.ts`
Expected: PASS

- [ ] **Step 5: 写 store 收口点的失败测试**

创建 `src/stores/chatStore.sessionOrder.test.ts`：

```ts
import { describe, expect, it } from 'vitest';
import { createChatSettings, createSavedChatSession } from '@/test/data/factories';
import { useChatStore } from './chatStore';

describe('chatStore session order integration', () => {
  it('places a brand new session at the top of its bucket and after existing manual order', () => {
    const existing = createSavedChatSession({
      id: 'existing',
      title: 'existing',
      timestamp: 1_000,
      messages: [],
      settings: createChatSettings(),
      sortOrder: 1_048_576,
    });
    useChatStore.setState({ savedSessions: [existing], activeSessionId: null, activeMessages: [] });

    useChatStore.getState().updateAndPersistSessions((prev) => [
      createSavedChatSession({
        id: 'fresh',
        title: 'fresh',
        timestamp: 2_000,
        messages: [],
        settings: createChatSettings(),
      }),
      ...prev,
    ]);

    const sessions = useChatStore.getState().savedSessions;
    expect(sessions.map((session) => session.id)).toEqual(['fresh', 'existing']);
    // 新会话必须拿到显式的 sortOrder，否则刷新后会被排序规则踢到未编号区段的末尾。
    expect(typeof sessions[0].sortOrder).toBe('number');
  });
});
```

- [ ] **Step 6: 跑测试确认失败**

Run: `node scripts/run-vitest.mjs run src/stores/chatStore.sessionOrder.test.ts`
Expected: FAIL —— `typeof sessions[0].sortOrder` 是 `"undefined"`。

- [ ] **Step 7: 改 store 收口点**

`src/stores/chatStore.ts`，把第 370-378 行的开头：

```ts
  updateAndPersistSessions: (updater, options = {}) => {
    const { persist = true } = options;
    const { savedSessions, activeSessionId, activeMessages, loadingSessionIds } = get();

    const virtualFullSessions = createVirtualFullSessions(savedSessions, activeSessionId, activeMessages);

    const newFullSessions = updater(virtualFullSessions);

    sortSessionsInPlace(newFullSessions);
```

替换为：

```ts
  updateAndPersistSessions: (updater, options = {}) => {
    const { persist = true } = options;
    const { savedSessions, activeSessionId, activeMessages, loadingSessionIds } = get();

    const virtualFullSessions = createVirtualFullSessions(savedSessions, activeSessionId, activeMessages);

    // 新建会话没有手动顺序，必须在排序前落到所属桶顶；没有新会话时返回原引用，
    // 下面的 identity 检查才能继续守住流式热路径。
    const newFullSessions = placeNewSessionsAtBucketTop(virtualFullSessions, updater(virtualFullSessions));

    sortSessionsInPlace(newFullSessions);
```

并在 `src/stores/chatStore.ts` 顶部 import 中补上：

```ts
import { placeNewSessionsAtBucketTop } from './sessionOrder';
```

注意：第 385 行的 `if (newFullSessions === virtualFullSessions) { return; }` 判断**不要动** —— `placeNewSessionsAtBucketTop` 在没有新会话时返回的就是 `updater` 的返回值，热路径语义不变。

- [ ] **Step 8: 跑测试确认通过**

Run: `node scripts/run-vitest.mjs run src/stores/chatStore.sessionOrder.test.ts src/stores/chatStore.test.ts`
Expected: PASS

- [ ] **Step 9: 提交**

```bash
git add src/stores/chatStore.ts src/stores/chatStore.sessionOrder.test.ts src/hooks/chat/history/sessionInitialLoad.ts src/hooks/chat/history/sessionInitialLoad.test.ts
git commit -m "feat(sidebar): backfill and maintain session sortOrder at load and store choke points"
```

---

### Task 4: action 层与接线

**Files:**

- Modify: `src/hooks/chat/history/useGroupActions.ts`（`handleMoveSessionToGroup` 加 placement，新增 `handleReorderSession`）
- Modify: `src/hooks/chat/useChatHistory.ts`
- Modify: `src/hooks/chat/useChat.ts:295`
- Modify: `src/components/layout/useMainContentViewModel.ts:115,137`
- Modify: `src/test/layout/fixtures.tsx:384`
- Test: `src/hooks/chat/history/useGroupActions.sessionOrder.test.tsx` (create)

**Interfaces:**

- Consumes: `reorderSession`、`moveSessionToBucket`（Task 2）
- Produces:
  - `handleMoveSessionToGroup(sessionId: string, groupId: string | null, placement?: 'top' | 'end'): void`（默认 `'top'`）
  - `handleReorderSession(activeId: string, overId: string, position: 'before' | 'after'): void`
  - 两者最终都通过 `chatState.handleReorderSession` / `chatState.handleMoveSessionToGroup` 传给侧边栏

- [ ] **Step 1: 写失败测试**

创建 `src/hooks/chat/history/useGroupActions.sessionOrder.test.tsx`：

```tsx
import { describe, expect, it, vi } from 'vitest';
import type { SavedChatSession } from '@/types';
import { createChatSettings } from '@/test/data/factories';
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

    expect(updates[0].map((item) => item.id)).toEqual(['b', 'a']);
    hook.unmount();
  });

  it('moves a session to the end of a bucket for container drops', () => {
    const { hook, updates } = renderActions([session('a', 1), session('b', 2)]);

    hook.result.current.handleMoveSessionToGroup('a', null, 'end');

    expect(updates[0].map((item) => item.id)).toEqual(['b', 'a']);
    hook.unmount();
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `node scripts/run-vitest.mjs run src/hooks/chat/history/useGroupActions.sessionOrder.test.tsx`
Expected: FAIL —— `handleReorderSession is not a function`。

- [ ] **Step 3: 改 action 层**

`src/hooks/chat/history/useGroupActions.ts`，把现有 `handleMoveSessionToGroup`（第 58-68 行）替换为下面两个函数：

```ts
const handleMoveSessionToGroup = useCallback(
  (sessionId: string, groupId: string | null, placement: 'top' | 'end' = 'top') => {
    logService.info(`Moving session ${sessionId} to group ${groupId}`);
    updateAndPersistSessions((prev) => moveSessionToBucket(prev, sessionId, groupId, placement));
  },
  [updateAndPersistSessions],
);

const handleReorderSession = useCallback(
  (activeId: string, overId: string, position: 'before' | 'after') => {
    if (activeId === overId) return;
    logService.info(`Reordering session ${activeId} ${position} ${overId}`);
    updateAndPersistSessions((prev) => reorderSession(prev, activeId, overId, position));
  },
  [updateAndPersistSessions],
);
```

在文件顶部补 import：

```ts
import { moveSessionToBucket, reorderSession } from '@/stores/sessionOrder';
```

并在文件末尾的 return 对象里加 `handleReorderSession,`。

- [ ] **Step 4: 接线**

`src/hooks/chat/useChatHistory.ts`：在解构 `useGroupActions({...})` 的结果里加 `handleReorderSession`，并在 `return { ... }` 里加 `handleReorderSession,`。

`src/hooks/chat/useChat.ts`：在 `handleMoveSessionToGroup: historyHandler.handleMoveSessionToGroup,`（第 295 行）后面加一行：

```ts
    handleReorderSession: historyHandler.handleReorderSession,
```

`src/components/layout/useMainContentViewModel.ts`：在 `onMoveSessionToGroup: chatState.handleMoveSessionToGroup,`（第 115 行）后面加：

```ts
      onReorderSession: chatState.handleReorderSession,
```

并在这个 `useMemo` 的依赖数组里（第 137 行 `chatState.handleMoveSessionToGroup,` 之后）加：

```ts
      chatState.handleReorderSession,
```

`src/test/layout/fixtures.tsx`：在 `handleMoveSessionToGroup: vi.fn(),`（第 384 行）后加：

```ts
      handleReorderSession: vi.fn(),
```

- [ ] **Step 5: 跑测试确认通过**

Run: `node scripts/run-vitest.mjs run src/hooks/chat/history/useGroupActions.sessionOrder.test.tsx src/components/layout`
Expected: PASS

- [ ] **Step 6: 类型检查**

Run: `npm run typecheck`
Expected: 通过

- [ ] **Step 7: 提交**

```bash
git add src/hooks/chat/history/useGroupActions.ts src/hooks/chat/history/useGroupActions.sessionOrder.test.tsx src/hooks/chat/useChatHistory.ts src/hooks/chat/useChat.ts src/components/layout/useMainContentViewModel.ts src/test/layout/fixtures.tsx
git commit -m "feat(sidebar): expose session reorder action through the chat state chain"
```

---

### Task 5: 侧边栏逻辑层

**Files:**

- Modify: `src/components/sidebar/sidebarDragTypes.ts`（新增 `resolveDropPosition`）
- Modify: `src/components/sidebar/useHistorySidebarLogic.ts`
- Test: `src/components/sidebar/useHistorySidebarLogic.test.ts`（改两个既有用例 + 追加新用例）

**Interfaces:**

- Consumes: Task 4 的 `onReorderSession`；`compareSessionOrder`（Task 1）
- Produces:
  - `resolveDropPosition(event): 'before' | 'after'`（`sidebarDragTypes.ts`）
  - hook 新 prop：`onReorderSession?: (activeId: string, overId: string, position: 'before' | 'after') => void`
  - hook 新返回值：`unpinnedUngroupedSessions: SavedChatSession[]`（分组模式下未分组区的平铺列表）
  - `sessionDropIndicator` 增加 `willPin: boolean`
  - `handleDrop(event, groupId)` 改为按落点调用 `onMoveSessionToGroup(id, groupId, 'top' | 'end')`

- [ ] **Step 1: 写失败测试**

`src/components/sidebar/useHistorySidebarLogic.test.ts`：文件顶部 import 区加一行 `import type { DragEvent } from 'react';`（测试文件是 `.ts`，没有全局 `React` 命名空间，下面的 `as unknown as DragEvent` 需要这个类型导入）。然后把 `renderHistoryLogic` 改成可传 `displayMode`，替换 `categorizeSessionsByDate` 那两个用例（分组模式不再分类），再追加新用例。

把第 22-39 行替换为：

```ts
const renderHistoryLogic = (
  sessions: SavedChatSession[],
  overrides: Partial<Parameters<typeof useHistorySidebarLogic>[0]> = {},
) => {
  useSettingsStore.setState({ language: 'en' });

  return renderHook(() =>
    useHistorySidebarLogic({
      isOpen: true,
      onToggle: () => {},
      onAutoClose: () => {},
      sessions,
      groups: [],
      generatingTitleSessionIds: new Set(),
      onRenameSession: () => {},
      onRenameGroup: () => {},
      onMoveSessionToGroup: () => {},
      onSelectSession: () => {},
      ...overrides,
    }),
  );
};
```

把 `describe('categorizeSessionsByDate', ...)` 整个块替换为：

```ts
describe('sidebar date grouping', () => {
  it('only categorizes by date in time mode', () => {
    const sessions = [createSession('today', 0), createSession('yesterday', 1), createSession('previous', 2)];

    const grouped = renderHistoryLogic(sessions);
    expect(grouped.result.current.categorizedUngroupedSessions.categoryOrder).toEqual([]);
    grouped.unmount();

    const timed = renderHistoryLogic(sessions, { displayMode: 'time' });
    const { categoryOrder, categories } = timed.result.current.categorizedUngroupedSessions;
    expect(categoryOrder).toEqual(['Today', 'Yesterday', 'Previous 7 Days']);
    expect(categories.Yesterday.map((session) => session.id)).toEqual(['yesterday']);
    timed.unmount();
  });

  it('exposes a flat unpinned ungrouped list in group mode', () => {
    const sessions = [
      { ...createSession('plain-newer', 0), sortOrder: 2_097_152 },
      { ...createSession('pinned', 1), isPinned: true, sortOrder: 1_048_576 },
      { ...createSession('plain-older', 2), sortOrder: 1_048_576 },
    ];

    const { result, unmount } = renderHistoryLogic(sessions);

    expect(result.current.unpinnedUngroupedSessions.map((session) => session.id)).toEqual([
      'plain-older',
      'plain-newer',
    ]);
    unmount();
  });
});

describe('handleReorderSession', () => {
  it('reports the drop position resolved from the pointer', () => {
    const onReorderSession = vi.fn();
    const sessions = [createSession('a', 0), createSession('b', 1)];
    const { result, unmount } = renderHistoryLogic(sessions, { onReorderSession });

    result.current.handleSessionDragStart('a');
    result.current.handleSessionDragOver(
      {
        preventDefault: () => {},
        stopPropagation: () => {},
        clientY: 5,
        currentTarget: { getBoundingClientRect: () => ({ top: 0, height: 40 }) },
        dataTransfer: { types: ['sessionid'], dropEffect: 'none' },
      } as unknown as DragEvent,
      'b',
    );

    expect(result.current.sessionDropIndicator).toEqual({ id: 'b', position: 'before', willPin: false });
    unmount();
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `node scripts/run-vitest.mjs run src/components/sidebar/useHistorySidebarLogic.test.ts`
Expected: FAIL —— `unpinnedUngroupedSessions` 为 `undefined`，且 `sessionDropIndicator` 没有 `willPin`。

- [ ] **Step 3: 加落点解析助手**

`src/components/sidebar/sidebarDragTypes.ts` 末尾追加：

```ts
/**
 * before/after 的唯一判定实现：指示线渲染与落点处理必须共用它，
 * 否则"看到的线"和"落下的位置"会各说各话。
 */
export const resolveDropPosition = (event: {
  clientY: number;
  currentTarget: EventTarget & { getBoundingClientRect: () => { top: number; height: number } };
}): 'before' | 'after' => {
  const rect = event.currentTarget.getBoundingClientRect();
  return event.clientY < rect.top + rect.height / 2 ? 'before' : 'after';
};
```

- [ ] **Step 4: 改 hook**

`src/components/sidebar/useHistorySidebarLogic.ts`：

(a) import 区补：

```ts
import { SESSION_DRAG_TYPE, isGroupDrag, isSessionDrag, resolveDropPosition } from './sidebarDragTypes';
import { compareSessionOrder } from '@/stores/sessionModels';
```

(b) `UseHistorySidebarLogicProps` 里 `onMoveSessionToGroup` 那一行改为：

```ts
  onMoveSessionToGroup: (sessionId: string, groupId: string | null, placement?: 'top' | 'end') => void;
  onReorderSession?: (activeId: string, overId: string, position: 'before' | 'after') => void;
```

(c) 参数解构里加 `onReorderSession,`。

(d) `sessionDropIndicator` 的 state 类型改为：

```ts
const [sessionDropIndicator, setSessionDropIndicator] = useState<{
  id: string;
  position: 'before' | 'after';
  willPin: boolean;
} | null>(null);
```

(e) `sessionsByGroupId` 的排序回调（第 281-287 行）替换为：

```ts
map.forEach((sessionList) => sessionList.sort(compareSessionOrder));
```

(f) `categorizedUngroupedSessions`（第 304-312 行）替换为下面两段：

```ts
const categorizedUngroupedSessions = useMemo(() => {
  // 分组模式的未分组区改成平铺手动列表（见 unpinnedUngroupedSessions），
  // 日期分类从此只服务时间视图。
  if (displayMode !== 'time') return { categories: {}, categoryOrder: [] as string[] };
  const allUnpinned = filteredSessions.filter((session) => !session.isPinned);
  return categorizeSessionsByDate(allUnpinned, language, t);
}, [filteredSessions, displayMode, t, language]);

const unpinnedUngroupedSessions = useMemo(() => {
  if (displayMode === 'time') return [];
  return (sessionsByGroupId.get(null) || []).filter((session) => !session.isPinned);
}, [sessionsByGroupId, displayMode]);
```

(g) `handleDrop`（第 358-366 行）替换为：

```ts
const handleDrop = (event: React.DragEvent, groupId: string | null) => {
  if (!isSessionDrag(event)) return;
  event.preventDefault();
  event.stopPropagation();
  const sessionId = event.dataTransfer.getData(SESSION_DRAG_TYPE);
  const isContainerDrop = groupId === 'all-conversations';
  const targetGroupId = isContainerDrop ? null : groupId;
  if (sessionId) onMoveSessionToGroup(sessionId, targetGroupId, isContainerDrop ? 'end' : 'top');
  setDragOverId(null);
};
```

(h) `handleSessionDragOver`（第 390-399 行）替换为：

```ts
const handleSessionDragOver = (event: React.DragEvent, sessionId: string) => {
  if (!isSessionDrag(event)) return;
  event.preventDefault();
  event.stopPropagation();
  event.dataTransfer.dropEffect = 'move';
  const target = sessions.find((session) => session.id === sessionId);
  const dragging = draggingSessionId ? sessions.find((session) => session.id === draggingSessionId) : undefined;
  setSessionDropIndicator({
    id: sessionId,
    position: resolveDropPosition(event),
    willPin: !!target?.isPinned && !dragging?.isPinned,
  });
  setDragOverId(null);
};
```

(i) return 对象里在 `categorizedUngroupedSessions,` 之后加：

```ts
    unpinnedUngroupedSessions,
```

- [ ] **Step 5: 跑测试确认通过**

Run: `node scripts/run-vitest.mjs run src/components/sidebar/useHistorySidebarLogic.test.ts`
Expected: PASS

- [ ] **Step 6: 提交**

```bash
git add src/components/sidebar/sidebarDragTypes.ts src/components/sidebar/useHistorySidebarLogic.ts src/components/sidebar/useHistorySidebarLogic.test.ts
git commit -m "feat(sidebar): resolve drop position, flat ungrouped list, pin-zone hint state"
```

---

### Task 6: 组件层（拖拽落点、置顶提示、平铺渲染、时间视图禁用）

**Files:**

- Modify: `src/components/sidebar/SessionItem.tsx`
- Modify: `src/components/sidebar/HistorySidebar.tsx`
- Modify: `src/components/sidebar/GroupItem.tsx:22`（`sessionDropIndicator` 类型补 `willPin`）
- Modify: `src/i18n/translations/history.ts`（两条新文案 × 7 语言）
- Test: `src/components/sidebar/SessionItem.drop.test.tsx` (create)

**Interfaces:**

- Consumes: Task 5 的 `resolveDropPosition`、`unpinnedUngroupedSessions`
- Produces:
  - `SessionItemProps.onReorderSession?: (activeId: string, overId: string, position: 'before' | 'after') => void`
  - `SessionItemProps.dropIndicator?: { id: string; position: 'before' | 'after'; willPin?: boolean } | null`
  - `HistorySidebarProps.onReorderSession?: (activeId: string, overId: string, position: 'before' | 'after') => void`
  - 时间视图下会话不可拖动

- [ ] **Step 1: 写失败测试**

创建 `src/components/sidebar/SessionItem.drop.test.tsx`（沿用仓库里 `SessionItem.completed-badge.test.tsx` 的 `setupProviderTestRenderer` 渲染模式）：

```tsx
import { act } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { setupProviderTestRenderer } from '@/test/render/providerRenderer';
import type { SavedChatSession } from '@/types';
import { createChatSettings } from '@/test/data/factories';
import { SessionItem } from './SessionItem';

const makeSession = (id: string, isPinned = false): SavedChatSession => ({
  id,
  title: `Chat ${id}`,
  timestamp: 1_000,
  messages: [],
  settings: createChatSettings(),
  isPinned,
});

const baseProps = {
  activeSessionId: null,
  editingItem: null,
  activeMenu: null,
  loadingSessionIds: new Set<string>(),
  generatingTitleSessionIds: new Set<string>(),
  newlyTitledSessionIds: new Set<string>(),
  groups: [],
  editInputRef: { current: null },
  menuRef: { current: null },
  onSelectSession: vi.fn(),
  onTogglePinSession: vi.fn(),
  onDeleteSession: vi.fn(),
  onDuplicateSession: vi.fn(),
  onOpenExportModal: vi.fn(),
  onMoveSessionToGroup: vi.fn(),
  handleStartEdit: vi.fn(),
  handleRenameConfirm: vi.fn(),
  handleRenameKeyDown: vi.fn(),
  setEditingItem: vi.fn(),
  toggleMenu: vi.fn(),
  setActiveMenu: vi.fn(),
  setDragOverId: vi.fn(),
  onSessionDragStart: vi.fn(),
  onSessionDragEnd: vi.fn(),
};

/** DragEvent 在 jsdom 里不完整，用 MouseEvent（DragEvent 的父类）承载 clientY，再挂上 dataTransfer。 */
const createDropEvent = (draggedId: string, clientY: number) => {
  const event = new MouseEvent('drop', { bubbles: true, cancelable: true, clientY });
  Object.defineProperty(event, 'dataTransfer', {
    configurable: true,
    value: {
      types: ['sessionid'],
      getData: (type: string) => (type === 'sessionid' || type === 'text/plain' ? draggedId : ''),
    },
  });
  return event;
};

describe('SessionItem reorder drop', () => {
  const renderer = setupProviderTestRenderer({ providers: { language: 'en' } });

  it('reports before/after resolved from the pointer position', () => {
    const onReorderSession = vi.fn();
    act(() => {
      renderer.render(
        <SessionItem
          {...baseProps}
          session={makeSession('session-b')}
          draggingSessionId="session-a"
          onReorderSession={onReorderSession}
        />,
      );
    });

    const item = renderer.container.querySelector('li') as HTMLLIElement;
    item.getBoundingClientRect = () => ({ top: 0, height: 40 }) as DOMRect;

    act(() => {
      item.dispatchEvent(createDropEvent('session-a', 30));
    });
    expect(onReorderSession).toHaveBeenLastCalledWith('session-a', 'session-b', 'after');

    act(() => {
      item.dispatchEvent(createDropEvent('session-a', 5));
    });
    expect(onReorderSession).toHaveBeenLastCalledWith('session-a', 'session-b', 'before');
  });

  it('ignores a drop of the row onto itself', () => {
    const onReorderSession = vi.fn();
    act(() => {
      renderer.render(
        <SessionItem
          {...baseProps}
          session={makeSession('session-a')}
          draggingSessionId="session-a"
          onReorderSession={onReorderSession}
        />,
      );
    });

    const item = renderer.container.querySelector('li') as HTMLLIElement;
    act(() => {
      item.dispatchEvent(createDropEvent('session-a', 30));
    });

    expect(onReorderSession).not.toHaveBeenCalled();
  });

  it('shows the pin hint only when the drop lands in the pinned zone', () => {
    act(() => {
      renderer.render(
        <SessionItem
          {...baseProps}
          session={makeSession('session-b', true)}
          draggingSessionId="session-a"
          dropIndicator={{ id: 'session-b', position: 'before', willPin: true }}
        />,
      );
    });
    expect(renderer.container.textContent).toContain('Drop to pin');

    act(() => {
      renderer.render(
        <SessionItem
          {...baseProps}
          session={makeSession('session-b', true)}
          draggingSessionId="session-a"
          dropIndicator={{ id: 'session-b', position: 'before', willPin: false }}
        />,
      );
    });
    expect(renderer.container.textContent).not.toContain('Drop to pin');
  });

  it('disables dragging and dropping in the time view', () => {
    const onReorderSession = vi.fn();
    act(() => {
      renderer.render(
        <SessionItem
          {...baseProps}
          session={makeSession('session-b')}
          draggingSessionId="session-a"
          disableNativeDrag
          onReorderSession={onReorderSession}
        />,
      );
    });

    const item = renderer.container.querySelector('li') as HTMLLIElement;
    expect(renderer.container.querySelector('a')?.getAttribute('draggable')).toBe('false');

    act(() => {
      item.dispatchEvent(createDropEvent('session-a', 30));
    });
    expect(onReorderSession).not.toHaveBeenCalled();
  });
});
```

如果 jsdom 下 React 没能把 `dataTransfer`/`clientY` 透到合成事件上（表现为 `onReorderSession` 未被调用），不要改断言去迁就实现：先确认 Task 5 里 `resolveDropPosition` 与 `handleSessionDragOver` 的用例是绿的（那是同一份逻辑的直接覆盖），再在本用例里改为对 `li` 直接调用其 `onDrop` 处理函数，并在提交信息里注明原因。

- [ ] **Step 2: 跑测试确认失败**

Run: `node scripts/run-vitest.mjs run src/components/sidebar/SessionItem.drop.test.tsx`
Expected: FAIL —— `onReorderSession` 从未被调用（当前 drop 只调 `onMoveSessionToGroup`），且找不到 "Drop to pin" 文案。

- [ ] **Step 3: 加 i18n 文案并改 SessionItem**

(0) `src/i18n/translations/history.ts` 末尾（最后一个 key 之后、闭合大括号之前）追加这两条 —— 必须在组件引用它们之前加好，否则测试拿不到文案：

```ts
  historyDropToPin: {
    en: 'Drop to pin',
    zh: '松手即置顶',
    ja: 'ドロップでピン留め',
    ko: '놓으면 고정',
    es: 'Suelta para fijar',
    fr: 'Déposer pour épingler',
    de: 'Zum Anheften ablegen',
  },
  historyReorderDisabledInTimeView: {
    en: 'Manual reordering is available in group view',
    zh: '手动排序仅在分组视图可用',
    ja: '手動並べ替えはグループ表示でのみ利用できます',
    ko: '수동 정렬은 그룹 보기에서만 사용할 수 있습니다',
    es: 'La reordenación manual solo está disponible en la vista de grupos',
    fr: 'Le réordonnancement manuel est disponible dans la vue par groupes',
    de: 'Manuelles Sortieren ist nur in der Gruppenansicht verfügbar',
  },
```

`src/components/sidebar/SessionItem.tsx`：

(a) import 区把 `sidebarDragTypes` 那行改为：

```ts
import { SESSION_DRAG_TYPE, isSessionDrag, resolveDropPosition } from './sidebarDragTypes';
```

(b) `SessionItemProps` 里把 `dropIndicator` 那行改为，并在 `onSessionDropIndicatorClear?` 后加 `onReorderSession` 与 `disableNativeDrag`：

```ts
  dropIndicator?: { id: string; position: 'before' | 'after'; willPin?: boolean } | null;
  onSessionDragStart: (sessionId: string) => void;
  onSessionDragEnd: () => void;
  onSessionDragOver?: (event: React.DragEvent, sessionId: string) => void;
  onSessionDropIndicatorClear?: () => void;
  onReorderSession?: (activeId: string, overId: string, position: 'before' | 'after') => void;
  /** 时间视图下关闭原生拖拽（含落点处理），避免"拖了但排不了"的错觉。 */
  disableNativeDrag?: boolean;
```

同时把组件签名末尾那个临时交叉类型去掉 —— 原来第 84-86 行是：

```ts
  } = props as typeof props & {
    disableNativeDrag?: boolean;
  };
```

改为：

```ts
  } = props;
```

（`disableNativeDrag` 现在是 `SessionItemProps` 的正式字段，`SidebarTypes.SessionItemPassedProps` 会自动带上它，`HistorySidebar` 才传得进来。）

(c) 解构里加 `onReorderSession,`。

(d) 把 `handleItemDrop`（第 162-171 行）替换为：

```ts
const handleItemDrop = (e: React.DragEvent) => {
  onSessionDropIndicatorClear?.();
  if (!isSessionDrag(e)) return;
  e.preventDefault();
  e.stopPropagation();
  const draggedId = e.dataTransfer.getData(SESSION_DRAG_TYPE) || e.dataTransfer.getData('text/plain');
  if (!draggedId || draggedId === session.id) return;
  onReorderSession?.(draggedId, session.id, resolveDropPosition(e));
};
```

(e) `li` 上的拖拽监听改为（时间视图整体禁用）：

```tsx
          onDragOver={
            disableNativeDrag
              ? undefined
              : onSessionDragOver
                ? (event) => onSessionDragOver(event, session.id)
                : undefined
          }
          onDragLeave={disableNativeDrag ? undefined : onSessionDropIndicatorClear}
          onDrop={disableNativeDrag ? undefined : handleItemDrop}
```

(f) 在 `showAfter` 之后加"将置顶"提示：

```tsx
const showPinHint = !!dropIndicator?.willPin && dropIndicator.id === session.id;
```

并在 `{showAfter && (...)}` 那个块之后插入：

```tsx
{
  showPinHint && (showBefore || showAfter) && (
    <div className="pointer-events-none absolute right-1 top-0 z-10 flex items-center gap-1 rounded-md bg-[var(--theme-bg-accent)] px-1.5 py-0.5 text-[10px] font-semibold text-[var(--theme-bg-primary)] shadow-sm">
      <Pin size={10} strokeWidth={2.4} />
      <span>{t('historyDropToPin')}</span>
    </div>
  );
}
```

- [ ] **Step 4: 改 GroupItem 的 dropIndicator 类型**

`src/components/sidebar/GroupItem.tsx`，把 `sessionDropIndicator?: { id: string; position: 'before' | 'after' } | null;`（第 22 行）改为：

```ts
  sessionDropIndicator?: { id: string; position: 'before' | 'after'; willPin?: boolean } | null;
```

- [ ] **Step 5: 改 HistorySidebar**

`src/components/sidebar/HistorySidebar.tsx`：

(a) `HistorySidebarProps` 里在 `onMoveSessionToGroup` 后加：

```ts
  onReorderSession?: (activeId: string, overId: string, position: 'before' | 'after') => void;
```

(b) 解构里加 `onReorderSession,`，并把它传进 `useHistorySidebarLogic({...})`：

```ts
    onMoveSessionToGroup,
    onReorderSession,
```

(c) 解构 `useHistorySidebarLogic` 返回值时加 `unpinnedUngroupedSessions,`。

(d) `SessionListGroup` 的 `title` 改成可选（第 135-152 行）：

```tsx
const SessionListGroup = ({
  title,
  sessions,
  sessionItemProps,
  isDragging,
}: {
  title?: string;
  sessions: SavedChatSession[];
  sessionItemProps: SessionItemPassedProps;
  isDragging?: boolean;
}) => {
  return (
    <div>
      {title && (
        <div className="px-3 pt-4 pb-1 text-xs font-semibold tracking-wide text-[var(--theme-text-primary)]">
          {title}
        </div>
      )}
      <LimitedSessionList sessions={sessions} sessionItemProps={sessionItemProps} isDragging={isDragging} />
    </div>
  );
};
```

(e) 分组模式下的未分组渲染（第 629-637 行 `categoryOrder.map(...)` 那段）替换为平铺列表：

```tsx
{
  pinnedUngrouped.length > 0 && (
    <SessionListGroup
      title={t('historyPinned')}
      sessions={pinnedUngrouped}
      sessionItemProps={sessionItemSharedProps}
      isDragging={isDragging}
    />
  );
}

<SessionListGroup
  sessions={unpinnedUngroupedSessions}
  sessionItemProps={sessionItemSharedProps}
  isDragging={isDragging}
/>;
```

注意：上面第 (e) 步要替换的是 `displayMode !== 'time'` 那个分支里的 `pinnedUngrouped` + `categoryOrder.map` 两块，时间视图分支（第 537-556 行）保持原样不动。

(f) `sessionItemSharedProps` 里加两个字段：

```ts
    onReorderSession,
    disableNativeDrag: displayMode === 'time',
```

(g) 时间视图那个切换按钮（第 525-530 行）加上禁用提示，让 `historyReorderDisabledInTimeView` 真正被使用：

```tsx
              <button
                onClick={() => onDisplayModeChange('time')}
                title={t('historyReorderDisabledInTimeView')}
                className={`flex-1 rounded-md px-2 py-1 text-xs font-medium transition-colors ${displayMode === 'time' ? 'bg-[var(--theme-bg-primary)] text-[var(--theme-text-primary)] shadow-sm' : 'text-[var(--theme-text-tertiary)] hover:text-[var(--theme-text-primary)]'}`}
              >
```

- [ ] **Step 6: 跑测试确认通过**

Run: `node scripts/run-vitest.mjs run src/components/sidebar`
Expected: PASS

- [ ] **Step 7: 类型检查 + Lint + i18n 覆盖率**

Run: `npm run typecheck && npm run lint && npm run i18n:check`
Expected: 都通过（i18n:check 确认新增的两条文案 7 种语言都有值）

- [ ] **Step 8: 提交**

```bash
git add src/components/sidebar/SessionItem.tsx src/components/sidebar/SessionItem.drop.test.tsx src/components/sidebar/GroupItem.tsx src/components/sidebar/HistorySidebar.tsx src/i18n/translations/history.ts
git commit -m "feat(sidebar): position-aware session drop, pin-zone hint, flat ungrouped list"
```

---

### Task 7: 复制 / fork 锚点插入

**Files:**

- Modify: `src/hooks/chat/history/useSessionActions.ts:76-94`
- Modify: `src/hooks/chat/message/useMessageActions.ts:343-358`
- Test: `src/hooks/chat/history/useSessionActions.sessionOrder.test.tsx` (create)

**Interfaces:**

- Consumes: `placeSessionAfter`（Task 2）
- Produces: 复制与 fork 出来的会话紧跟源会话；其余新建路径继续由 Task 3 的 store 收口点自动置顶

- [ ] **Step 1: 确认 fork 的现有语句**

Run: `sed -n '343,358p' src/hooks/chat/message/useMessageActions.ts`
Expected: 看到 `updateAndPersistSessions((prev) => { ... return [forkedSession, ...prev]; })`，其中 `sourceSession` 由 `prev.find((session) => session.id === activeSessionId)` 得到。Step 5 会把这条返回语句换掉，锚点用 `sourceSession.id`。

- [ ] **Step 2: 写失败测试**

创建 `src/hooks/chat/history/useSessionActions.sessionOrder.test.tsx`：

```tsx
import { describe, expect, it, vi } from 'vitest';
import type { SavedChatSession } from '@/types';
import { createChatSettings } from '@/test/data/factories';
import { renderHook } from '@/test/render/renderer';
import { useSessionActions } from './useSessionActions';

vi.mock('@/services/db/dbService', async () => {
  const { createDbServiceMockModule } = await import('@/test/doubles/moduleMocks');
  return createDbServiceMockModule({ getSession: vi.fn(async () => undefined) });
});

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
    const sessions = [session('a', 1_048_576), session('b', 2_097_152)];
    let result: SavedChatSession[] = [];
    const updateAndPersistSessions = vi.fn((updater: (prev: SavedChatSession[]) => SavedChatSession[]) => {
      result = updater(sessions);
    });

    const hook = renderHook(() => useSessionActions({ updateAndPersistSessions, activeJobs: { current: new Map() } }));

    await hook.result.current.handleDuplicateSession('a');

    expect(result.map((item) => item.title)).toEqual(['a', 'a (Copy)', 'b']);
    hook.unmount();
  });
});
```

- [ ] **Step 3: 跑测试确认失败**

Run: `node scripts/run-vitest.mjs run src/hooks/chat/history/useSessionActions.sessionOrder.test.tsx`
Expected: FAIL —— 副本落在数组最前（`['a (Copy)', 'a', 'b']`）。

- [ ] **Step 4: 改 useSessionActions**

`src/hooks/chat/history/useSessionActions.ts`：import 区加

```ts
import { placeSessionAfter } from '@/stores/sessionOrder';
```

把 `handleDuplicateSession` 里最后一行 `return [newSession, ...prev];` 改为：

```ts
return placeSessionAfter(prev, newSession, sessionId);
```

- [ ] **Step 5: 改 fork**

`src/hooks/chat/message/useMessageActions.ts`（注意目录是 `message/`，不是 `actions/`）：import 区加

```ts
import { placeSessionAfter } from '@/stores/sessionOrder';
```

把 `handleForkFromMessage`（第 343-358 行）里那条 updater 的返回语句：

```ts
        forkedSessionId = forkedSession.id;
        return [forkedSession, ...prev];
      });
```

改为（锚点就是同一个闭包里已经取到的 `sourceSession`）：

```ts
        forkedSessionId = forkedSession.id;
        return placeSessionAfter(prev, forkedSession, sourceSession.id);
      });
```

- [ ] **Step 6: 跑测试确认通过**
      Run: `node scripts/run-vitest.mjs run src/hooks/chat/history/useSessionActions.sessionOrder.test.tsx src/hooks/chat`
      Expected: PASS

- [ ] **Step 7: 提交**

```bash
git add src/hooks/chat/history/useSessionActions.ts src/hooks/chat/history/useSessionActions.sessionOrder.test.tsx src/hooks/chat/actions/useMessageActions.ts
git commit -m "feat(sidebar): insert duplicated and forked sessions after their source"
```

---

### Task 8: 「最近」语义与全量校验

**Files:**

- Modify: `src/components/command/GlobalCommandPalette.tsx:114`
- Create: `src/components/command/sessionRecency.ts`
- Test: `src/components/command/GlobalCommandPalette.order.test.tsx` (create)

**Interfaces:**

- Consumes: 前 7 个任务的全部产物
- Produces: `sortSessionsByRecency(sessions: SavedChatSession[]): SavedChatSession[]`；命令面板的"最近 8 条"不再被手动顺序污染

- [ ] **Step 1: 写失败测试**

创建 `src/components/command/GlobalCommandPalette.order.test.tsx`：

```tsx
import { describe, expect, it } from 'vitest';
import { sortSessionsByRecency } from './sessionRecency';
import { createChatSettings } from '@/test/data/factories';

const session = (id: string, timestamp: number, sortOrder: number) => ({
  id,
  title: id,
  timestamp,
  messages: [],
  settings: createChatSettings(),
  sortOrder,
});

describe('sortSessionsByRecency', () => {
  it('ignores manual order and keeps the most recently active sessions first', () => {
    const result = sortSessionsByRecency([session('old-but-top', 1_000, 1), session('new-but-bottom', 9_000, 2)]);

    expect(result.map((item) => item.id)).toEqual(['new-but-bottom', 'old-but-top']);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `node scripts/run-vitest.mjs run src/components/command/GlobalCommandPalette.order.test.tsx`
Expected: FAIL —— 无法解析 `./sessionRecency`。

- [ ] **Step 3: 加排序助手并接进命令面板**

创建 `src/components/command/sessionRecency.ts`：

```ts
import type { SavedChatSession } from '@/types';

/**
 * 「最近会话」必须按活动时间排，不能跟着侧边栏的手动顺序走 ——
 * savedSessions 的数组顺序现在由 sortOrder 决定。
 */
export const sortSessionsByRecency = (sessions: SavedChatSession[]): SavedChatSession[] =>
  [...sessions].sort((left, right) => right.timestamp - left.timestamp);
```

`src/components/command/GlobalCommandPalette.tsx`：import 区加

```ts
import { sortSessionsByRecency } from './sessionRecency';
```

把第 114 行 `const recentSessions = savedSessions.slice(0, 8);` 改为：

```ts
const recentSessions = sortSessionsByRecency(savedSessions).slice(0, 8);
```

- [ ] **Step 4: 跑测试确认通过**

Run: `node scripts/run-vitest.mjs run src/components/command/GlobalCommandPalette.order.test.tsx`
Expected: PASS

- [ ] **Step 5: 全量校验**

Run: `npm run verify`
Expected: format:check / typecheck / lint / test / knip / build / build:api 全部通过。

- [ ] **Step 6: 手动验收（对照 spec §11）**

Run: `npm run dev`，在浏览器里逐条确认：

1. 分组模式下拉动任意会话，刷新页面后顺序保持
2. 把普通会话拖到「已置顶」区块上方 → 出现「松手即置顶」提示，松手后真的置顶；再拖回普通区 → 取消置顶
3. 拖动一格后，DevTools → Application → IndexedDB → `AllModelChatDB` → `sessions`，确认只有 1~2 条记录的 `sortOrder` 变了
4. 发一条消息，确认会话位置不再变化（`timestamp` 仍会更新）
5. 切到时间视图：拖动无效（时间按钮 tooltip 提示「手动排序仅在分组视图可用」），日期分组照旧
6. 分组模式的未分组区不再有「今天 / 昨天」小标题，且能拖到整个列表最前
7. 把会话拖到另一个分组 → 移入该分组并落在落点位置
8. 新建会话出现在未分组桶顶部；复制会话紧随源会话

另外两项已核对过、确认**无需改动**，验收时只需确认行为没退化：

- `CollapsedRecentChatsButton`（折叠态「最近会话」）本来就显式 `.sort((a, b) => b.timestamp - a.timestamp)`（`src/components/sidebar/CollapsedRecentChatsButton.tsx:43-46`），不受手动顺序影响。
- 虚拟列表（>50 条走 `Virtuoso`）与边缘自动滚动只依赖可见 DOM 事件，与排序键无关。

- [ ] **Step 7: 提交**

```bash
git add src/components/command/sessionRecency.ts src/components/command/GlobalCommandPalette.tsx src/components/command/GlobalCommandPalette.order.test.tsx
git commit -m "feat(sidebar): keep command palette recency semantics"
```

---

## 完成标准

- 上述 8 个任务全部提交，`npm run verify` 全绿。
- spec §11 的 8 条验收标准全部满足，其中第 3 条（写入条数）用 DevTools 或测试 spy 实测确认。
- 已知范围外（来自 spec §12）：触摸端拖拽、字符串分数序、重置排序入口、时间视图手动排序。
