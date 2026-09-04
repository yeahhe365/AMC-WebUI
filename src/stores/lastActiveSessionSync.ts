import type { ChatSettings } from '@/types';
import { writeLastActiveSessionSnapshot } from '@/utils/chat/lastActiveSession';

interface LastActiveSessionSyncStore {
  subscribe: (
    listener: (state: {
      activeSessionId: string | null;
      savedSessions: Array<{ id: string; settings: ChatSettings }>;
    }) => void,
  ) => () => void;
}

/**
 * 值比较（而非对象引用比较）：settings 对象可能被广播刷新重建（新引用、同值），
 * 引用比较会产生大量冗余写入。值未变就不写，保持快照稳定。
 */
const settingsValuesEqual = (a: unknown, b: unknown): boolean => {
  if (a === b) return true;
  try {
    return JSON.stringify(a) === JSON.stringify(b);
  } catch {
    return false;
  }
};

/**
 * 监听 chatStore：活跃会话或其设置变化时，把快照同步写入 localStorage，
 * 供新打开的标签页继承当前页的模型与工具设置。
 */
export function setupLastActiveSessionSync(store: LastActiveSessionSyncStore): () => void {
  let lastWritten: { sessionId: string; settings: unknown } | null = null;

  return store.subscribe((state) => {
    const { activeSessionId, savedSessions } = state;

    if (!activeSessionId) {
      if (lastWritten) {
        lastWritten = null;
        writeLastActiveSessionSnapshot(null);
      }
      return;
    }

    const activeSession = savedSessions.find((session) => session.id === activeSessionId);
    if (!activeSession) return;

    if (
      lastWritten?.sessionId === activeSessionId &&
      settingsValuesEqual(lastWritten.settings, activeSession.settings)
    ) {
      return;
    }

    lastWritten = { sessionId: activeSessionId, settings: activeSession.settings };
    writeLastActiveSessionSnapshot({
      sessionId: activeSessionId,
      settings: activeSession.settings,
    });
  });
}
