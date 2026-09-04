import type { Dispatch, SetStateAction } from 'react';

import { ACTIVE_CHAT_SESSION_ID_KEY } from '@/constants/storageKeys';
import { dbService } from '@/services/db/dbService';
import { logService } from '@/services/logService';
import { readLastActiveSessionSnapshot } from '@/utils/chat/lastActiveSession';
import type { SetActiveSessionOptions } from '@/stores/chatStore';
import type { AppSettings, ChatGroup, ChatMessage, ChatSettings, SavedChatSession } from '@/types';
import { rehydrateSessionFiles } from '@/utils/chat/session';
import {
  createSettingsForNewChat,
  resolveNewTabTemplate,
  sanitizeSessionModel,
  sortSessionsByPinnedAndTimestamp,
} from './sessionLoaderSettings';
import { TAB_ID } from '@/stores/tabIdentity';

type SessionLoaderHistoryOptions = Pick<SetActiveSessionOptions, 'history'>;

interface LoadInitialSessionDataOptions {
  appSettings: AppSettings;
  setSavedSessions: Dispatch<SetStateAction<SavedChatSession[]>>;
  setSavedGroups: Dispatch<SetStateAction<ChatGroup[]>>;
  setActiveSessionId: (value: SetStateAction<string | null>, options?: SetActiveSessionOptions) => void;
  setActiveMessages: Dispatch<SetStateAction<ChatMessage[]>>;
  restoreDraftFiles: (sessionId: string) => void;
  updateAndPersistSessions: (
    updater: (prev: SavedChatSession[]) => SavedChatSession[],
    options?: { persist?: boolean },
  ) => void | Promise<void>;
  startNewChat: (explicitTemplateSession?: SavedChatSession, options?: SessionLoaderHistoryOptions) => void;
}

const inheritAppSystemInstructionForEmptySession = (
  session: SavedChatSession,
  appSettings: AppSettings,
  savedSessions: SavedChatSession[],
): { session: SavedChatSession; settingsChanged: boolean } => {
  if (session.messages.length > 0 || session.settings.systemInstruction?.trim() || session.createdTabId !== TAB_ID) {
    return { session, settingsChanged: false };
  }

  const inheritedSettings: ChatSettings = createSettingsForNewChat({
    appSettings,
    savedSessions,
    excludeTemplateSessionId: session.id,
  });
  // Keep the empty session's already-chosen model/thinking controls; only fill missing SI + related app defaults.
  const nextSettings: ChatSettings = {
    ...session.settings,
    systemInstruction: inheritedSettings.systemInstruction,
  };

  if (nextSettings.systemInstruction === session.settings.systemInstruction) {
    return { session, settingsChanged: false };
  }

  return {
    session: { ...session, settings: nextSettings },
    settingsChanged: true,
  };
};

const resolveInitialActiveSessionId = (metadataList: SavedChatSession[]) => {
  const urlMatch = window.location.pathname.match(/^\/chat\/([^/]+)$/);
  const urlSessionId = urlMatch ? urlMatch[1] : null;

  if (urlSessionId && metadataList.some((session) => session.id === urlSessionId)) {
    return urlSessionId;
  }

  const storedActiveId = sessionStorage.getItem(ACTIVE_CHAT_SESSION_ID_KEY);
  if (storedActiveId && metadataList.some((session) => session.id === storedActiveId)) {
    return storedActiveId;
  }

  return null;
};

/**
 * 读取新标签页 URL 上的 ?from= 参数（来源标签页正在查看的会话 id）。
 * 由 Logo/新聊天入口的 `buildNewTabHref` 写入；读取失败时安全返回 null。
 */
const readFromSessionParam = (): string | null => {
  try {
    return new URLSearchParams(window.location.search).get('from');
  } catch {
    return null;
  }
};

const mergeLoadedSessionMetadata = (
  currentSessions: SavedChatSession[],
  sortedMetadata: SavedChatSession[],
): SavedChatSession[] => {
  if (currentSessions.length === 0) {
    return sortedMetadata;
  }

  const currentById = new Map(currentSessions.map((session) => [session.id, session]));
  const merged = sortedMetadata.map((session) => {
    const existing = currentById.get(session.id);

    if (!existing) {
      return session;
    }

    currentById.delete(session.id);
    return {
      ...session,
      ...existing,
      createdTabId: existing.createdTabId || session.createdTabId,
      settings: {
        ...session.settings,
        ...existing.settings,
      },
      messages: existing.messages ?? session.messages,
    };
  });

  return sortSessionsByPinnedAndTimestamp([...merged, ...currentById.values()]);
};

export const loadInitialSessionData = async ({
  appSettings,
  setSavedSessions,
  setSavedGroups,
  setActiveSessionId,
  setActiveMessages,
  restoreDraftFiles,
  updateAndPersistSessions,
  startNewChat,
}: LoadInitialSessionDataOptions) => {
  let initialActiveId: string | null = null;

  try {
    logService.info('Attempting to load chat history metadata from IndexedDB.');

    const [metadataList, groups] = await Promise.all([dbService.getAllSessionMetadata(), dbService.getAllGroups()]);

    initialActiveId = resolveInitialActiveSessionId(metadataList);

    if (initialActiveId) {
      const fullActiveSession = await dbService.getSession(initialActiveId);
      if (fullActiveSession) {
        logService.info(`Loaded full content for active session: ${initialActiveId}`);
        const rehydrated = rehydrateSessionFiles(sanitizeSessionModel(fullActiveSession));
        setActiveMessages(rehydrated.messages);
        setActiveSessionId(initialActiveId, { history: 'replace' });
        restoreDraftFiles(initialActiveId);
      } else {
        initialActiveId = null;
      }
    }

    const sortedList = sortSessionsByPinnedAndTimestamp(metadataList.map(sanitizeSessionModel));

    setSavedSessions((prev) => mergeLoadedSessionMetadata(prev, sortedList));
    // Backfill orderKey for legacy groups that lack it (old DB rows).
    const groupsWithOrder = groups.map((group, index) => ({
      ...group,
      isExpanded: group.isExpanded ?? true,
      orderKey: group.orderKey ?? String(index).padStart(6, '0'),
    }));
    // Normalize to ensure consistent ordering on first load after upgrade.
    groupsWithOrder.sort((leftGroup, rightGroup) => {
      if (leftGroup.orderKey && rightGroup.orderKey) return leftGroup.orderKey.localeCompare(rightGroup.orderKey);
      return rightGroup.timestamp - leftGroup.timestamp;
    });
    const normalizedGroups = groupsWithOrder.map((group, index) => ({
      ...group,
      orderKey: String(index).padStart(6, '0'),
    }));
    setSavedGroups(normalizedGroups);

    if (!initialActiveId) {
      const fromSessionId = readFromSessionParam();
      const mostRecent = sortedList[0];
      let reused = false;

      // 显式 ?from 时跳过空会话复用（用户意图明确：从来源会话开新会话）。
      if (mostRecent && !fromSessionId) {
        const fullSession = await dbService.getSession(mostRecent.id);
        if (
          fullSession &&
          fullSession.messages.length === 0 &&
          !fullSession.settings.systemInstruction &&
          (fullSession.createdTabId === TAB_ID || !fullSession.createdTabId)
        ) {
          logService.info(`Reusing empty recent session: ${mostRecent.id}`);
          const rehydratedBase = rehydrateSessionFiles(sanitizeSessionModel(fullSession));
          const { session: rehydrated, settingsChanged } = inheritAppSystemInstructionForEmptySession(
            rehydratedBase,
            appSettings,
            sortedList,
          );
          setActiveMessages(rehydrated.messages);
          setActiveSessionId(rehydrated.id, { history: 'replace' });
          restoreDraftFiles(rehydrated.id);
          if (settingsChanged) {
            void updateAndPersistSessions((prev) =>
              prev.map((session) =>
                session.id === rehydrated.id ? { ...session, settings: rehydrated.settings } : session,
              ),
            );
          }

          reused = true;
        }
      }

      if (!reused) {
        logService.info('No active session found or empty session to reuse, starting fresh chat.');

        // 以 ?from 会话优先，其次"最后活跃会话"快照，最后最近会话作为模板。
        startNewChat(
          resolveNewTabTemplate({
            fromSessionId,
            snapshot: readLastActiveSessionSnapshot(),
            sortedSessions: sortedList,
          }),
          { history: 'replace' },
        );
      }
    }
  } catch (error) {
    // A transient DB read failure (e.g. an IndexedDB transaction hiccup while
    // loading the active session) must not nuke the user's current conversation:
    // startNewChat clears activeMessages. Only fall back to a fresh chat when no
    // active session was being restored in the first place.
    logService.error('Error loading chat history:', error);

    if (!initialActiveId) {
      startNewChat(undefined, { history: 'replace' });
    }
  }
};
