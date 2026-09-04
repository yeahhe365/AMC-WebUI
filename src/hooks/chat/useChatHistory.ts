import { type Dispatch, type MutableRefObject, type SetStateAction, useCallback } from 'react';
import type { SupportedLanguage } from '@/i18n/languageRegistry';
import {
  type AppSettings,
  type SavedChatSession,
  type UploadedFile,
  type ChatGroup,
  type InputCommand,
  type ChatMessage,
} from '@/types';
import { logService } from '@/services/logService';
import { getTranslator } from '@/i18n/translations';
import { useChatStore } from '@/stores/chatStore';
import { useSessionLoader } from './history/useSessionLoader';
import { useSessionActions } from './history/useSessionActions';
import { useGroupActions } from './history/useGroupActions';
import { useHistoryClearer } from './history/useHistoryClearer';

type CommandedInputSetter = Dispatch<SetStateAction<InputCommand | null>>;
type SessionsUpdater = (
  updater: (prev: SavedChatSession[]) => SavedChatSession[],
  options?: { persist?: boolean },
) => void | Promise<void>;
type GroupsUpdater = (updater: (prev: ChatGroup[]) => ChatGroup[]) => void | Promise<void>;

interface ChatHistoryProps {
  appSettings: AppSettings;
  setSavedSessions: Dispatch<SetStateAction<SavedChatSession[]>>;
  setSavedGroups: Dispatch<SetStateAction<ChatGroup[]>>;
  setActiveSessionId: Dispatch<SetStateAction<string | null>>;
  setActiveMessages: Dispatch<SetStateAction<ChatMessage[]>>;
  setEditingMessageId: Dispatch<SetStateAction<string | null>>;
  setCommandedInput: CommandedInputSetter;
  setAppFileError: Dispatch<SetStateAction<string | null>>;
  setSelectedFiles: Dispatch<SetStateAction<UploadedFile[]>>;
  activeJobs: MutableRefObject<Map<string, AbortController>>;
  updateAndPersistSessions: SessionsUpdater;
  updateAndPersistGroups: GroupsUpdater;
  activeChat: SavedChatSession | undefined;
  language: SupportedLanguage;
  userScrolledUpRef: MutableRefObject<boolean>;
  selectedFiles: UploadedFile[];
  fileDraftsRef: MutableRefObject<Record<string, UploadedFile[]>>;
  activeSessionId: string | null;
  savedSessions: SavedChatSession[];
}

export const useChatHistory = ({
  appSettings,
  setSavedSessions,
  setSavedGroups,
  setActiveSessionId,
  setActiveMessages,
  setEditingMessageId,
  setCommandedInput,
  setAppFileError,
  setSelectedFiles,
  activeJobs,
  updateAndPersistSessions,
  updateAndPersistGroups,
  activeChat,
  language,
  userScrolledUpRef,
  selectedFiles,
  fileDraftsRef,
  activeSessionId,
  savedSessions,
}: ChatHistoryProps) => {
  const t = getTranslator(language);

  const { startNewChat, loadChatSession, loadInitialData } = useSessionLoader({
    appSettings,
    setSavedSessions,
    setSavedGroups,
    setActiveSessionId,
    setActiveMessages,
    setSelectedFiles,
    setEditingMessageId,
    setCommandedInput,
    setAppFileError,
    updateAndPersistSessions,
    activeChat,
    userScrolledUpRef,
    selectedFiles,
    fileDraftsRef,
    activeSessionId,
    savedSessions,
  });

  const { handleDeleteChatHistorySession, handleRenameSession, handleTogglePinSession, handleDuplicateSession } =
    useSessionActions({
      updateAndPersistSessions,
      activeJobs,
    });

  const {
    handleAddNewGroup,
    handleDeleteGroup,
    handleClearGroup,
    handleRenameGroup,
    handleMoveSessionToGroup,
    handleToggleGroupExpansion,
    handleReorderGroups,
  } = useGroupActions({
    updateAndPersistGroups,
    updateAndPersistSessions,
    t,
  });

  const { clearAllHistory, clearCacheAndReload } = useHistoryClearer({
    savedSessions,
    setSavedSessions,
    setSavedGroups,
    startNewChat,
    activeJobs,
  });

  const handleNewChatInGroup = useCallback(
    (groupId: string) => {
      logService.info(`Creating new chat in group: ${groupId}`);
      // 分组折叠时自动展开，确保用户能看到新条目。
      const group = useChatStore.getState().savedGroups.find((candidate) => candidate.id === groupId);
      if (group && group.isExpanded === false) {
        handleToggleGroupExpansion(groupId);
      }
      startNewChat(undefined, { groupId });
    },
    [handleToggleGroupExpansion, startNewChat],
  );

  return {
    loadInitialData,
    loadChatSession,
    startNewChat,
    handleNewChatInGroup,
    handleDeleteChatHistorySession,
    handleRenameSession,
    handleTogglePinSession,
    handleDuplicateSession,
    handleAddNewGroup,
    handleDeleteGroup,
    handleClearGroup,
    handleRenameGroup,
    handleMoveSessionToGroup,
    handleToggleGroupExpansion,
    handleReorderGroups,
    clearAllHistory,
    clearCacheAndReload,
  };
};
