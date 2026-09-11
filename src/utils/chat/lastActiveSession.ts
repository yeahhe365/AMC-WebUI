import { LAST_ACTIVE_CHAT_SESSION_ID_KEY } from '@/constants/storageKeys';
import {
  readPersistentStorageItem,
  writePersistentStorageItem,
  removePersistentStorageItem,
} from '@/stores/persistentStorage';
import type { ChatSettings } from '@/types';

/**
 * 最后活跃会话快照。存于 localStorage（跨标签共享），
 * 让新开的标签页能以"源标签页正在查看的会话"为模板创建新聊天。
 */
export interface LastActiveSessionSnapshot {
  sessionId: string;
  settings: ChatSettings;
  ts: number;
}

/**
 * 新标签页链接：把来源会话编码进 URL（`?from=<sessionId>`），
 * 避免新标签页只能依赖跨标签共享快照的竞态。无活跃会话时退回纯 `/`。
 */
export const buildNewTabHref = (activeSessionId: string | null): string =>
  activeSessionId ? `/?from=${encodeURIComponent(activeSessionId)}` : '/';

export const writeLastActiveSessionSnapshot = (snapshot: Omit<LastActiveSessionSnapshot, 'ts'> | null): void => {
  if (!snapshot) {
    removePersistentStorageItem(LAST_ACTIVE_CHAT_SESSION_ID_KEY);
    return;
  }
  // localStorage 属于可被任意脚本/扩展读取的位置，锁定会话的原始 API key
  // 绝不能落盘；消费端（sessionLoaderSettings）本就不使用该值。
  const settings: ChatSettings = { ...snapshot.settings, lockedApiKey: null };
  writePersistentStorageItem(
    LAST_ACTIVE_CHAT_SESSION_ID_KEY,
    JSON.stringify({ ...snapshot, settings, ts: Date.now() }),
  );
};

export const readLastActiveSessionSnapshot = (): LastActiveSessionSnapshot | null => {
  try {
    const raw = readPersistentStorageItem(LAST_ACTIVE_CHAT_SESSION_ID_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<LastActiveSessionSnapshot>;
    if (
      typeof parsed.sessionId !== 'string' ||
      typeof parsed.ts !== 'number' ||
      !parsed.settings ||
      typeof parsed.settings !== 'object'
    ) {
      removePersistentStorageItem(LAST_ACTIVE_CHAT_SESSION_ID_KEY);
      return null;
    }
    return {
      sessionId: parsed.sessionId,
      settings: parsed.settings as ChatSettings,
      ts: parsed.ts,
    };
  } catch {
    return null;
  }
};
