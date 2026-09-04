import { useCallback } from 'react';
import { type SavedChatSession, type UploadedFile } from '@/types';
import { cleanupFilePreviewUrls } from '@/utils/file/filePreviewUrls';
import { updateSessionById } from '@/utils/chat/sessionMutations';

interface UseChatSessionActionsProps {
  activeSessionId: string | null;
  isLoading: boolean;
  updateAndPersistSessions: (
    updater: (prev: SavedChatSession[]) => SavedChatSession[],
    options?: { persist?: boolean },
  ) => void;
  setSelectedFiles: (files: UploadedFile[]) => void;
  handleStopGenerating: () => void;
  startNewChat: () => void;
  handleTogglePinSession: (sessionId: string) => void;
}

export const useChatSessionActions = ({
  activeSessionId,
  isLoading,
  updateAndPersistSessions,
  setSelectedFiles,
  handleStopGenerating,
  startNewChat,
  handleTogglePinSession,
}: UseChatSessionActionsProps) => {
  const handleClearCurrentChat = useCallback(() => {
    if (isLoading) handleStopGenerating();
    if (activeSessionId) {
      updateAndPersistSessions((prev) =>
        updateSessionById(prev, activeSessionId, (session) => {
          session.messages.forEach((message) => cleanupFilePreviewUrls(message.files));

          return {
            ...session,
            messages: [],
            title: 'New Chat',
            titleSource: 'default',
            timestamp: Date.now(),
            // Resetting lockedApiKey is crucial to allow using new global settings
            settings: { ...session.settings, lockedApiKey: null },
          };
        }),
      );
      setSelectedFiles([]);
    } else {
      startNewChat();
    }
  }, [isLoading, activeSessionId, handleStopGenerating, updateAndPersistSessions, setSelectedFiles, startNewChat]);

  const handleTogglePinCurrentSession = useCallback(() => {
    if (activeSessionId) {
      handleTogglePinSession(activeSessionId);
    }
  }, [activeSessionId, handleTogglePinSession]);

  return {
    handleClearCurrentChat,
    handleTogglePinCurrentSession,
  };
};
