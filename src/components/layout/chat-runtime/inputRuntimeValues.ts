import { useCallback, useMemo } from 'react';

import type { AppViewModel } from '@/hooks/app/useApp';
import { useChatStore } from '@/stores/chatStore';
import type { ModelOption, UploadedFile } from '@/types';
import type { ChatInputRuntimeValue } from './chatRuntimeTypes';

interface InputRuntimeValuesOptions {
  app: AppViewModel;
  availableModels: ModelOption[];
  onOpenSettings: () => void;
  onSelectModel: (modelId: string) => void;
}

export const useChatInputRuntimeValues = ({
  app,
  availableModels,
  onOpenSettings,
  onSelectModel,
}: InputRuntimeValuesOptions) => {
  const {
    setAppSettings,
    chatState,
    pipState,
    handleLoadLiveArtifactsPromptAndSave,
    handleToggleBBoxMode,
    handleToggleGuideMode,
    handleSuggestionClick,
  } = app;

  // Destructure the chatState members used below into local constants. The
  // members are stable useCallback references (their deps — activeMessages,
  // selectedFiles, currentChatSettings, appSettings, store actions — do not
  // change while a background session churns the savedSessions array). Keeping
  // the destructured members as the only deps prevents the whole chatState
  // object (a new literal every render) from invalidating this context value
  // and, downstream, the markdown renderer's components map.
  const {
    handleSendMessage,
    handleStopGenerating,
    handleCancelEdit,
    handleProcessAndAddFiles,
    handleAddFileById,
    handleCancelFileUpload,
    handleTranscribeAudio,
    handleClearCurrentChat,
    startNewChat,
    handleTogglePinCurrentSession,
    handleRetryLastTurn,
    handleEditLastUserMessage,
    setCurrentChatSettings,
    handleAddUserMessage,
    handleLiveTranscript,
    liveClientFunctions,
    handleUpdateMessageContent,
  } = chatState;

  const onMessageSent = useCallback(() => {
    useChatStore.getState().setCommandedInput(null);
  }, []);

  const onSendMessage = useCallback(
    (text: string, options?: { isFastMode?: boolean; files?: UploadedFile[] }) => {
      handleSendMessage({ text, ...options });
    },
    [handleSendMessage],
  );

  const onToggleQuadImages = useCallback(() => {
    setAppSettings((prev) => ({
      ...prev,
      generateQuadImages: !prev.generateQuadImages,
    }));
  }, [setAppSettings]);

  const onSuggestionClick = useCallback(
    (text: string) => {
      handleSuggestionClick('homepage', text);
    },
    [handleSuggestionClick],
  );

  const onOrganizeInfoClick = useCallback(
    (text: string) => {
      handleSuggestionClick('organize', text);
    },
    [handleSuggestionClick],
  );

  return useMemo<ChatInputRuntimeValue>(
    () => ({
      onMessageSent,
      onSendMessage,
      onStopGenerating: handleStopGenerating,
      onCancelEdit: handleCancelEdit,
      onProcessFiles: handleProcessAndAddFiles,
      onAddFileById: handleAddFileById,
      onCancelUpload: handleCancelFileUpload,
      onTranscribeAudio: handleTranscribeAudio,
      onClearChat: handleClearCurrentChat,
      onNewChat: startNewChat,
      onOpenSettings,
      onToggleLiveArtifactsPrompt: handleLoadLiveArtifactsPromptAndSave,
      onTogglePinCurrentSession: handleTogglePinCurrentSession,
      onRetryLastTurn: handleRetryLastTurn,
      onSelectModel,
      availableModels,
      onEditLastUserMessage: handleEditLastUserMessage,
      onTogglePip: pipState.togglePip,
      isPipActive: pipState.isPipActive,
      onToggleQuadImages,
      setCurrentChatSettings,
      onSuggestionClick,
      onOrganizeInfoClick,
      onAddUserMessage: handleAddUserMessage,
      onLiveTranscript: handleLiveTranscript,
      liveClientFunctions,
      onEditMessageContent: handleUpdateMessageContent,
      onToggleBBox: handleToggleBBoxMode,
      onToggleGuide: handleToggleGuideMode,
    }),
    [
      availableModels,
      handleAddFileById,
      handleAddUserMessage,
      handleCancelEdit,
      handleCancelFileUpload,
      handleClearCurrentChat,
      handleEditLastUserMessage,
      handleLiveTranscript,
      handleLoadLiveArtifactsPromptAndSave,
      handleProcessAndAddFiles,
      handleRetryLastTurn,
      handleStopGenerating,
      handleToggleBBoxMode,
      handleToggleGuideMode,
      handleTogglePinCurrentSession,
      handleTranscribeAudio,
      handleUpdateMessageContent,
      liveClientFunctions,
      onMessageSent,
      onOpenSettings,
      onOrganizeInfoClick,
      onSelectModel,
      onSendMessage,
      onSuggestionClick,
      onToggleQuadImages,
      pipState.isPipActive,
      pipState.togglePip,
      setCurrentChatSettings,
      startNewChat,
    ],
  );
};
