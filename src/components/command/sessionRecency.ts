import type { SavedChatSession } from '@/types';

/**
 * 「最近会话」必须按活动时间排，不能跟着侧边栏的手动顺序走 ——
 * savedSessions 的数组顺序现在由 sortOrder 决定。
 */
export const sortSessionsByRecency = (sessions: SavedChatSession[]): SavedChatSession[] =>
  [...sessions].sort((left, right) => right.timestamp - left.timestamp);
