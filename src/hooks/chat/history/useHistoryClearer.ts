import { useCallback, type Dispatch, type SetStateAction, type MutableRefObject } from 'react';
import { type SavedChatSession, type ChatGroup } from '@/types';
import { dbService } from '@/services/db/dbService';
import { logService } from '@/services/logService';
import { cleanupFilePreviewUrls } from '@/utils/file/filePreviewUrls';
import { removeSessionScopedLocalStorageEntries } from '@/utils/sessionLocalStorage';
import { useChatDraftStore } from '@/stores/chatDraftStore';
import { useChatStore } from '@/stores/chatStore';
import { clearPyodideResultCache } from '@/features/local-python/usePyodide';

interface UseHistoryClearerProps {
  savedSessions: SavedChatSession[];
  setSavedSessions: Dispatch<SetStateAction<SavedChatSession[]>>;
  setSavedGroups: Dispatch<SetStateAction<ChatGroup[]>>;
  startNewChat: () => void;
  activeJobs: MutableRefObject<Map<string, AbortController>>;
}

const CACHE_CLEAR_RELOAD_DELAY_MS = 50;

export const useHistoryClearer = ({
  savedSessions,
  setSavedSessions,
  setSavedGroups,
  startNewChat,
  activeJobs,
}: UseHistoryClearerProps) => {
  const clearAllHistory = useCallback(async () => {
    logService.warn('User clearing all chat history.');
    activeJobs.current.forEach((controller) => controller.abort());
    activeJobs.current.clear();

    await Promise.all([dbService.setAllSessions([]), dbService.setAllGroups([]), dbService.setActiveSessionId(null)]);

    // Cleanup all blobs only after persistence succeeds so a failed clear
    // does not leave the still-visible UI with revoked previews.
    savedSessions.forEach((session) => {
      session.messages.forEach((message) => {
        cleanupFilePreviewUrls(message.files);
      });
    });

    try {
      const sessionIds = savedSessions.map((session) => session.id);
      removeSessionScopedLocalStorageEntries(sessionIds);
      useChatDraftStore.getState().clearSessionDrafts(sessionIds);
      logService.info(`Cleaned up session-scoped LocalStorage entries for ${savedSessions.length} sessions.`);
    } catch (cleanupError) {
      logService.error('Failed to clean up localStorage:', cleanupError);
    }

    setSavedSessions([]);
    setSavedGroups([]);
    useChatStore.getState().setCompletedSessions({});
    clearPyodideResultCache();
    startNewChat();
  }, [savedSessions, setSavedSessions, setSavedGroups, startNewChat, activeJobs]);

  const clearCacheAndReload = useCallback(async () => {
    logService.warn('User clearing all application cache and settings.');
    activeJobs.current.forEach((controller) => controller.abort());
    activeJobs.current.clear();
    try {
      localStorage.clear();
    } catch (error) {
      logService.error('Failed to clear localStorage:', error);
    }
    try {
      sessionStorage.clear();
    } catch (error) {
      logService.error('Failed to clear sessionStorage:', error);
    }

    try {
      const registrations = await navigator.serviceWorker?.getRegistrations?.();
      if (registrations?.length) {
        await Promise.all(registrations.map((registration) => registration.unregister()));
      }
    } catch (error) {
      logService.error('Failed to unregister service workers:', error);
    }

    try {
      const cacheKeys = await caches?.keys?.();
      if (cacheKeys?.length) {
        await Promise.all(cacheKeys.map((cacheKey) => caches.delete(cacheKey)));
      }
    } catch (error) {
      logService.error('Failed to clear CacheStorage:', error);
    }

    await dbService.clearAllData();
    setTimeout(() => window.location.reload(), CACHE_CLEAR_RELOAD_DELAY_MS);
  }, [activeJobs]);

  return {
    clearAllHistory,
    clearCacheAndReload,
  };
};
