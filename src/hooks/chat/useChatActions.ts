import type { MutableRefObject } from 'react';
import {
  type AppSettings,
  type ChatMessage,
  type ChatSettings as IndividualChatSettings,
  type SavedChatSession,
  type UploadedFile,
} from '@/types';
import { useModelSelection } from './actions/useModelSelection';
import { useChatSessionActions } from './actions/useChatSessionActions';
import { useMessageUpdates } from './actions/useMessageUpdates';
import { useAudioActions } from './actions/useAudioActions';

interface UseChatActionsProps {
  appSettings: AppSettings;
  activeSessionId: string | null;
  isLoading: boolean;
  currentChatSettings: IndividualChatSettings;
  selectedFiles: UploadedFile[];

  // State Setters
  setActiveSessionId: (id: string | null) => void;
  setIsSwitchingModel: (switching: boolean) => void;
  setAppFileError: (error: string | null) => void;
  setCurrentChatSettings: (updater: (prevSettings: IndividualChatSettings) => IndividualChatSettings) => void;
  setSelectedFiles: (files: UploadedFile[]) => void;

  // Functional Dependencies
  updateAndPersistSessions: (
    updater: (prev: SavedChatSession[]) => SavedChatSession[],
    options?: { persist?: boolean },
  ) => void;
  updateMessageInActiveSession: (
    messageId: string,
    updates: Partial<ChatMessage> | ((message: ChatMessage) => ChatMessage),
    options?: { persist?: boolean },
  ) => void;
  appendMessageToSession: (sessionId: string, message: ChatMessage, options?: { persist?: boolean }) => void;
  handleStopGenerating: (options?: {
    silent?: boolean;
    skipLoadingUpdate?: boolean;
  }) => 'stopped' | 'no_local_job' | 'not_loading' | void;
  startNewChat: () => void;
  handleTogglePinSession: (sessionId: string) => void;
  userScrolledUpRef: MutableRefObject<boolean>;
}

export const useChatActions = ({
  appSettings,
  activeSessionId,
  isLoading,
  currentChatSettings,
  selectedFiles,
  setActiveSessionId,
  setIsSwitchingModel,
  setAppFileError,
  setCurrentChatSettings,
  setSelectedFiles,
  updateAndPersistSessions,
  updateMessageInActiveSession,
  appendMessageToSession,
  handleStopGenerating,
  startNewChat,
  handleTogglePinSession,
  userScrolledUpRef,
}: UseChatActionsProps) => {
  const { handleSelectModelInHeader } = useModelSelection({
    appSettings,
    activeSessionId,
    currentChatSettings,
    isLoading,
    updateAndPersistSessions,
    setActiveSessionId,
    setCurrentChatSettings,
    setIsSwitchingModel,
    handleStopGenerating,
    userScrolledUpRef,
  });

  const { handleClearCurrentChat, handleTogglePinCurrentSession } = useChatSessionActions({
    activeSessionId,
    isLoading,
    updateAndPersistSessions,
    setSelectedFiles,
    handleStopGenerating,
    startNewChat,
    handleTogglePinSession,
  });

  const { handleUpdateMessageContent, handleUpdateMessageFile, handleAddUserMessage, handleLiveTranscript } =
    useMessageUpdates({
      activeSessionId,
      setActiveSessionId,
      appSettings,
      currentChatSettings,
      updateAndPersistSessions,
      updateMessageInActiveSession,
      appendMessageToSession,
      userScrolledUpRef,
    });

  const { handleTranscribeAudio } = useAudioActions({
    appSettings,
    currentChatSettings,
    setCurrentChatSettings,
    setAppFileError,
    selectedFiles,
  });

  return {
    handleSelectModelInHeader,
    handleClearCurrentChat,
    handleTranscribeAudio,
    handleTogglePinCurrentSession,
    handleUpdateMessageContent,
    handleUpdateMessageFile,
    handleAddUserMessage,
    handleLiveTranscript,
  };
};
