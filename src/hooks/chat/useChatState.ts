import { useMemo } from 'react';
import { type AppSettings } from '@/types';
import { useChatStore } from '@/stores/chatStore';

export const useChatState = (appSettings: AppSettings) => {
  const activeSessionId = useChatStore((state) => state.activeSessionId);
  const savedSessions = useChatStore((state) => state.savedSessions);
  const activeMessages = useChatStore((state) => state.activeMessages);

  const pendingLockedApiKey = useChatStore((state) => state.pendingLockedApiKey);
  const pendingChatSettings = useChatStore((state) => state.pendingChatSettings);

  const activeChat = useMemo(() => {
    const metadata = savedSessions.find((session) => session.id === activeSessionId);
    if (metadata) {
      return { ...metadata, messages: activeMessages };
    }
    return undefined;
  }, [savedSessions, activeSessionId, activeMessages]);

  const currentChatSettings = useMemo(() => {
    if (activeChat) {
      return activeChat.settings;
    }
    const baseSettings = {
      ...appSettings,
      ...(pendingChatSettings ?? {}),
    };
    if (!pendingLockedApiKey) {
      return baseSettings;
    }
    return { ...baseSettings, lockedApiKey: pendingLockedApiKey };
  }, [activeChat, appSettings, pendingChatSettings, pendingLockedApiKey]);

  const loadingSessionIds = useChatStore((state) => state.loadingSessionIds);
  const isLoading = useMemo(() => loadingSessionIds.has(activeSessionId ?? ''), [loadingSessionIds, activeSessionId]);

  return {
    activeChat,
    currentChatSettings,
    isLoading,

    activeSessionId,
    savedSessions,
    activeMessages,
  };
};
