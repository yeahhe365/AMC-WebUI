import { DEFAULT_CHAT_SETTINGS } from '@/constants/settingsDefaults';
import { sanitizeSessionModel as sanitizeSessionModelWithFallback, sortSessionsInPlace } from '@/stores/sessionModels';
import type { LastActiveSessionSnapshot } from '@/utils/chat/lastActiveSession';
import type { AppSettings, ChatSettings, SavedChatSession } from '@/types';

export const sortSessionsByPinnedAndTimestamp = (sessions: SavedChatSession[]) => sortSessionsInPlace([...sessions]);

export const sanitizeSessionModel = (session: SavedChatSession): SavedChatSession =>
  sanitizeSessionModelWithFallback(session, DEFAULT_CHAT_SETTINGS.modelId);

const getMostRecentTemplateSession = (sessions: SavedChatSession[], excludeSessionId?: string | null) =>
  [...sessions]
    .filter((session) => session.id !== excludeSessionId)
    .sort((leftSession, rightSession) => rightSession.timestamp - leftSession.timestamp)[0];

interface CreateSettingsForNewChatOptions {
  appSettings: AppSettings;
  savedSessions: SavedChatSession[];
  explicitTemplateSession?: SavedChatSession;
  excludeTemplateSessionId?: string | null;
}

export const createSettingsForNewChat = ({
  appSettings,
  savedSessions,
  explicitTemplateSession,
  excludeTemplateSessionId,
}: CreateSettingsForNewChatOptions): ChatSettings => {
  const baseSettings: ChatSettings = {
    ...DEFAULT_CHAT_SETTINGS,
    ...appSettings,
    lockedApiKey: null,
  };

  const templateSession =
    explicitTemplateSession || getMostRecentTemplateSession(savedSessions, excludeTemplateSessionId);

  if (!templateSession) {
    return baseSettings;
  }

  const sanitizedTemplateSettings = sanitizeSessionModel(templateSession).settings;

  return {
    ...baseSettings,
    // 全量继承模板会话的设置：modelId、providerId、temperature/topP/topK、
    // thinkingBudget/thinkingLevel、ttsVoice、mediaResolution，以及所有工具开关
    // （Google Search / Maps / Code Execution / Pyodide / URL Context / Deep Search / Keep Thinking）。
    ...sanitizedTemplateSettings,
    // systemInstruction 属于会话内容（如场景提示词），沿用全局默认，保持现有语义。
    systemInstruction: baseSettings.systemInstruction,
    // 锁定 API Key 始终重置，新聊天重新轮换。
    lockedApiKey: null,
  };
};

interface ResolveNewTabTemplateInput {
  /** URL ?from= 参数(来源标签页的会话 id),无则 null */
  fromSessionId: string | null;
  /** localStorage 快照(点击时同步写入,可能比 DB 新) */
  snapshot: LastActiveSessionSnapshot | null;
  /** 已按 pinned/timestamp 排序并 sanitize 过的会话元数据列表 */
  sortedSessions: SavedChatSession[];
}

/**
 * 新标签页的模板会话解析,优先级:
 * 1. ?from 指向的会话;若快照与 from 同会话,用快照 settings(更新,覆盖 DB 未落盘竞态)
 * 2. 快照指向的会话(不在列表中则合成临时模板)
 * 3. 最近会话
 */
export const resolveNewTabTemplate = ({
  fromSessionId,
  snapshot,
  sortedSessions,
}: ResolveNewTabTemplateInput): SavedChatSession | undefined => {
  if (fromSessionId) {
    const fromSession = sortedSessions.find((session) => session.id === fromSessionId);
    if (fromSession) {
      return snapshot?.sessionId === fromSessionId ? { ...fromSession, settings: snapshot.settings } : fromSession;
    }
  }

  if (snapshot) {
    const existing = sortedSessions.find((session) => session.id === snapshot.sessionId);
    if (existing) {
      return { ...existing, settings: snapshot.settings };
    }
    // 快照会话已被删除(例如点击后另一标签页删除):合成模板保住 settings
    return {
      id: snapshot.sessionId,
      title: 'New Chat',
      timestamp: Date.now(),
      messages: [],
      settings: snapshot.settings,
    };
  }

  return sortedSessions[0];
};
