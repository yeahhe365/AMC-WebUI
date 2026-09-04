import { useCallback, type Dispatch, type SetStateAction, useEffect, useRef, type MutableRefObject } from 'react';
import {
  type AppSettings,
  type SavedChatSession,
  type ChatGroup,
  type UploadedFile,
  type ChatMessage,
  type InputCommand,
} from '@/types';
import { logService } from '@/services/logService';
import { createNewSession, rehydrateSessionFiles } from '@/utils/chat/session';
import { dbService } from '@/services/db/dbService';
import { useChatStore, type SetActiveSessionOptions } from '@/stores/chatStore';
import {
  cleanupSessionFilePreviews,
  clearSessionDraftFiles,
  getSessionDraftFiles,
  retainRuntimeSession,
  storeSessionDraftFiles,
  toSessionMetadata,
} from './sessionLoaderDrafts';
import { loadInitialSessionData } from './sessionInitialLoad';
import { createSettingsForNewChat, sanitizeSessionModel } from './sessionLoaderSettings';
import { focusChatInput } from '@/utils/chat-input/focus';

type SessionLoaderHistoryOptions = Pick<SetActiveSessionOptions, 'history'>;

interface StartNewChatOptions extends SessionLoaderHistoryOptions {
  /** 新会话要归属的分组 id；不传保持原行为（未分组）。 */
  groupId?: string | null;
}

interface UseSessionLoaderProps {
  appSettings: AppSettings;
  setSavedSessions: Dispatch<SetStateAction<SavedChatSession[]>>;
  setSavedGroups: Dispatch<SetStateAction<ChatGroup[]>>;
  setActiveSessionId: (value: SetStateAction<string | null>, options?: SetActiveSessionOptions) => void;
  setActiveMessages: Dispatch<SetStateAction<ChatMessage[]>>;
  setSelectedFiles: Dispatch<SetStateAction<UploadedFile[]>>;
  setEditingMessageId: Dispatch<SetStateAction<string | null>>;
  setCommandedInput: Dispatch<SetStateAction<InputCommand | null>>;
  setAppFileError?: Dispatch<SetStateAction<string | null>>;
  updateAndPersistSessions: (
    updater: (prev: SavedChatSession[]) => SavedChatSession[],
    options?: { persist?: boolean },
  ) => void | Promise<void>;
  activeChat: SavedChatSession | undefined;
  userScrolledUpRef: MutableRefObject<boolean>;
  selectedFiles: UploadedFile[];
  fileDraftsRef: MutableRefObject<Record<string, UploadedFile[]>>;
  activeSessionId: string | null;
  savedSessions: SavedChatSession[];
}

export const useSessionLoader = ({
  appSettings,
  setSavedSessions,
  setSavedGroups,
  setActiveSessionId,
  setActiveMessages,
  setSelectedFiles,
  setEditingMessageId,
  setCommandedInput,
  setAppFileError = () => undefined,
  updateAndPersistSessions,
  activeChat,
  userScrolledUpRef,
  selectedFiles,
  fileDraftsRef,
  activeSessionId,
  savedSessions,
}: UseSessionLoaderProps) => {
  const sessionViewRequestIdRef = useRef(0);

  const buildSettingsForNewChat = useCallback(
    (explicitTemplateSession?: SavedChatSession, options?: { excludeTemplateSessionId?: string | null }) =>
      createSettingsForNewChat({
        appSettings,
        savedSessions,
        explicitTemplateSession,
        excludeTemplateSessionId: options?.excludeTemplateSessionId,
      }),
    [appSettings, savedSessions],
  );

  const normalizeSessionModel = useCallback((session: SavedChatSession) => sanitizeSessionModel(session), []);

  const mergeSessionMetadata = useCallback(
    (session: SavedChatSession) => {
      setSavedSessions((prev) => {
        const metadata = toSessionMetadata(session);
        const exists = prev.some((savedSession) => savedSession.id === session.id);

        if (exists) {
          return prev.map((savedSession) =>
            savedSession.id === session.id ? { ...savedSession, ...metadata } : savedSession,
          );
        }

        return [metadata, ...prev];
      });
    },
    [setSavedSessions],
  );

  const retainOutgoingSessionRuntime = useCallback(() => {
    if (!activeSessionId || !activeChat || activeChat.messages.length === 0) {
      return;
    }

    const runtimeSession = normalizeSessionModel(activeChat);
    setSavedSessions((prev) => retainRuntimeSession(prev, activeSessionId, runtimeSession));
  }, [activeChat, activeSessionId, normalizeSessionModel, setSavedSessions]);

  const retainOutgoingSessionDraft = useCallback(
    (options?: { skipSessionId?: string }) => {
      if (!activeSessionId || activeSessionId === options?.skipSessionId) {
        return;
      }

      retainOutgoingSessionRuntime();
      storeSessionDraftFiles(fileDraftsRef.current, activeSessionId, selectedFiles);

      cleanupSessionFilePreviews(activeChat);
    },
    [activeChat, activeSessionId, fileDraftsRef, retainOutgoingSessionRuntime, selectedFiles],
  );

  const restoreDraftFiles = useCallback(
    (sessionId: string) => {
      setSelectedFiles(getSessionDraftFiles(fileDraftsRef.current, sessionId));
    },
    [fileDraftsRef, setSelectedFiles],
  );

  const applyLoadedSession = useCallback(
    (session: SavedChatSession, history: SetActiveSessionOptions['history']) => {
      const rehydrated = rehydrateSessionFiles(normalizeSessionModel(session));

      setActiveMessages(rehydrated.messages);
      setActiveSessionId(rehydrated.id, { history });
      mergeSessionMetadata(rehydrated);
      restoreDraftFiles(rehydrated.id);
      setEditingMessageId(null);
      focusChatInput(0);

      // 用户打开该会话 = 已查看,清除侧边栏完成标记(并广播让其他标签页同步清除)。
      useChatStore.getState().markSessionViewed(rehydrated.id);

      return rehydrated;
    },
    [
      mergeSessionMetadata,
      restoreDraftFiles,
      normalizeSessionModel,
      setActiveMessages,
      setActiveSessionId,
      setEditingMessageId,
    ],
  );

  const startNewChat = useCallback(
    (explicitTemplateSession?: SavedChatSession, options?: StartNewChatOptions) => {
      sessionViewRequestIdRef.current += 1;
      const history = options?.history ?? 'push';
      const targetGroupId = options?.groupId ?? null;
      setAppFileError(null);
      useChatStore.getState().invalidateFileOperations();

      if (activeChat && activeChat.messages.length === 0 && !activeChat.settings.systemInstruction) {
        logService.info('Already on an empty chat, reusing session.');
        userScrolledUpRef.current = false;
        const settingsForReusedChat = buildSettingsForNewChat(explicitTemplateSession ?? activeChat, {
          excludeTemplateSessionId: activeSessionId,
        });

        setCommandedInput({ text: '', id: Date.now(), mode: 'replace' });
        setSelectedFiles([]);
        setEditingMessageId(null);
        setActiveMessages([]);
        if (activeSessionId) {
          clearSessionDraftFiles(fileDraftsRef.current, activeSessionId);
          updateAndPersistSessions((prev) =>
            prev.map((session) =>
              session.id === activeSessionId
                ? {
                    ...session,
                    title: 'New Chat',
                    timestamp: Date.now(),
                    messages: [],
                    settings: settingsForReusedChat,
                    // 空会话已在目标分组时为无操作；在其它/未分组时移入目标分组，避免产生幽灵空会话。
                    groupId: targetGroupId,
                  }
                : session,
            ),
          );
        }

        focusChatInput(0);
        return;
      }

      logService.info('Starting new chat session.');
      userScrolledUpRef.current = false;

      retainOutgoingSessionDraft();

      // 默认以当前页会话为模板，保证模型与工具设置和当前页一致。
      const settingsForNewChat = buildSettingsForNewChat(explicitTemplateSession ?? activeChat);

      const newSession = createNewSession(settingsForNewChat, [], 'New Chat', targetGroupId, 'default');

      setActiveMessages([]);
      setActiveSessionId(newSession.id, { history });

      updateAndPersistSessions((prev) => [newSession, ...prev]);

      setSelectedFiles([]);

      setEditingMessageId(null);

      focusChatInput(0);
    },
    [
      activeChat,
      updateAndPersistSessions,
      setActiveSessionId,
      setActiveMessages,
      setSelectedFiles,
      setEditingMessageId,
      userScrolledUpRef,
      activeSessionId,
      fileDraftsRef,
      setCommandedInput,
      setAppFileError,
      buildSettingsForNewChat,
      retainOutgoingSessionDraft,
    ],
  );

  const loadChatSession = useCallback(
    async (sessionId: string, options?: SessionLoaderHistoryOptions) => {
      const requestId = sessionViewRequestIdRef.current + 1;
      sessionViewRequestIdRef.current = requestId;
      const history = options?.history ?? 'push';

      logService.info(`Loading chat session: ${sessionId}`);
      userScrolledUpRef.current = false;

      retainOutgoingSessionDraft({ skipSessionId: sessionId });

      try {
        const sessionToLoad = await dbService.getSession(sessionId);

        if (requestId !== sessionViewRequestIdRef.current) {
          return;
        }

        if (sessionToLoad) {
          applyLoadedSession(sessionToLoad, history);
        } else {
          logService.warn(`Session ${sessionId} not found. Starting new chat.`);
          startNewChat(undefined, { history });
        }
      } catch (error) {
        if (requestId !== sessionViewRequestIdRef.current) {
          return;
        }
        logService.error('Error loading chat session:', error);
        startNewChat(undefined, { history });
      }
    },
    [startNewChat, userScrolledUpRef, applyLoadedSession, retainOutgoingSessionDraft],
  );

  const loadInitialData = useCallback(async () => {
    await loadInitialSessionData({
      appSettings,
      setSavedSessions,
      setSavedGroups,
      setActiveSessionId,
      setActiveMessages,
      restoreDraftFiles,
      updateAndPersistSessions,
      startNewChat,
    });
  }, [
    appSettings,
    setSavedSessions,
    setSavedGroups,
    startNewChat,
    setActiveSessionId,
    setActiveMessages,
    restoreDraftFiles,
    updateAndPersistSessions,
  ]);

  useEffect(() => {
    const handlePopState = () => {
      const match = window.location.pathname.match(/^\/chat\/([^/]+)$/);
      const sessionId = match ? match[1] : null;

      if (sessionId) {
        loadChatSession(sessionId, { history: 'none' });
      } else if (window.location.pathname === '/') {
        startNewChat(undefined, { history: 'none' });
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [loadChatSession, startNewChat]);

  return {
    startNewChat,
    loadChatSession,
    loadInitialData,
  };
};
