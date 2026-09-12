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
 * 桶内全部会话按显示顺序重新编号。只有真正变化的会话才生成新对象——持久化层的比较是按引用
 * 做的（src/stores/sessionPersistence.ts），保持引用才能避免全量落盘。
 */
function assignBucketOrder(sessions: SavedChatSession[], bucketKey: string | null): SavedChatSession[] {
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

/**
 * 把一个会话放到它所属桶内「与自身 isPinned 相同」区段的指定位置。
 * 会话可以已在列表中（重新定位）或不在（新建 / 复制）。
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
  const indexOfPlacement = (section: SavedChatSession[]): number | null => {
    const overIndex = section.findIndex((session) => session.id === overId);
    if (overIndex === -1) return null;
    return position === 'before' ? overIndex : overIndex + 1;
  };

  let index = indexOfPlacement(othersOf(base));
  if (index === null) return sessions;
  let working = base;
  let sortOrder = orderKeyForIndex(othersOf(base), index);

  if (sortOrder === null) {
    working = assignBucketOrder(base, targetGroupId);
    index = indexOfPlacement(othersOf(working));
    if (index === null) return sessions;
    sortOrder = orderKeyForIndex(othersOf(working), index);
  }
  if (sortOrder === null) return sessions;

  const current = working.find((session) => session.id === active.id);
  if (!current) return sessions;
  if (current === active && current.sortOrder === sortOrder) return sessions;

  return working.map((session) => (session.id === active.id ? { ...current, sortOrder } : session));
}
