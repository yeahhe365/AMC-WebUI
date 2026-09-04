import { useCallback, type MutableRefObject } from 'react';
import { type SavedChatSession } from '@/types';
import { logService } from '@/services/logService';
import { cloneMessagesWithFreshIds, createNewSession } from '@/utils/chat/session';
import { cleanupFilePreviewUrls } from '@/utils/file/filePreviewUrls';
import { dbService } from '@/services/db/dbService';
import { removeSessionScopedLocalStorageEntries } from '@/utils/sessionLocalStorage';
import { useI18n } from '@/contexts/I18nContext';
import { interpolate } from '@/i18n/interpolate';

interface UseSessionActionsProps {
  updateAndPersistSessions: (
    updater: (prev: SavedChatSession[]) => SavedChatSession[],
    options?: { persist?: boolean },
  ) => void | Promise<void>;
  activeJobs: MutableRefObject<Map<string, AbortController>>;
}

export const useSessionActions = ({ updateAndPersistSessions, activeJobs }: UseSessionActionsProps) => {
  const { t } = useI18n();
  const handleDeleteChatHistorySession = useCallback(
    (sessionId: string) => {
      logService.info(`Deleting session: ${sessionId}`);

      try {
        removeSessionScopedLocalStorageEntries([sessionId]);
      } catch (cleanupError) {
        logService.error('Failed to clean up session localStorage:', cleanupError);
      }

      updateAndPersistSessions((prev) => {
        const sessionToDelete = prev.find((session) => session.id === sessionId);
        if (sessionToDelete) {
          sessionToDelete.messages.forEach((message) => {
            if (message.isLoading && activeJobs.current.has(message.id)) {
              activeJobs.current.get(message.id)?.abort();
              activeJobs.current.delete(message.id);
            }
            cleanupFilePreviewUrls(message.files);
          });
        }
        return prev.filter((session) => session.id !== sessionId);
      });
    },
    [updateAndPersistSessions, activeJobs],
  );

  const handleRenameSession = useCallback(
    (sessionId: string, newTitle: string) => {
      if (!newTitle.trim()) return;
      logService.info(`Renaming session ${sessionId} to "${newTitle}"`);
      updateAndPersistSessions((prev) =>
        prev.map((session) =>
          session.id === sessionId ? { ...session, title: newTitle.trim(), titleSource: 'manual' } : session,
        ),
      );
    },
    [updateAndPersistSessions],
  );

  const handleTogglePinSession = useCallback(
    (sessionId: string) => {
      logService.info(`Toggling pin for session ${sessionId}`);
      updateAndPersistSessions((prev) =>
        prev.map((session) => (session.id === sessionId ? { ...session, isPinned: !session.isPinned } : session)),
      );
    },
    [updateAndPersistSessions],
  );

  const handleDuplicateSession = useCallback(
    async (sessionId: string) => {
      logService.info(`Duplicating session: ${sessionId}`);
      const persistedSession = await dbService.getSession(sessionId);

      updateAndPersistSessions((prev) => {
        const sessionToDuplicate = prev.find((session) => session.id === sessionId);
        if (!sessionToDuplicate) return prev;
        const fullSessionToDuplicate =
          sessionToDuplicate.messages.length > 0 ? sessionToDuplicate : (persistedSession ?? sessionToDuplicate);

        const duplicatedMessages = cloneMessagesWithFreshIds(fullSessionToDuplicate.messages);

        const duplicateTitle =
          fullSessionToDuplicate.title === 'New Chat' ? t('newChat') : fullSessionToDuplicate.title;
        const newSession = createNewSession(
          fullSessionToDuplicate.settings,
          duplicatedMessages,
          interpolate(t('historyCopyTitle'), { title: duplicateTitle }),
          null,
          'manual',
        );
        return [newSession, ...prev];
      });
    },
    [updateAndPersistSessions, t],
  );

  return {
    handleDeleteChatHistorySession,
    handleRenameSession,
    handleTogglePinSession,
    handleDuplicateSession,
  };
};
