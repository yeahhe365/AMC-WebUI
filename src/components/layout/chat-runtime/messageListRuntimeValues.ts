import { useCallback, useMemo } from 'react';

import type { AppViewModel } from '@/hooks/app/useApp';
import type { ChatMessageListRuntimeValue } from './chatRuntimeTypes';

interface MessageListRuntimeValuesOptions {
  app: AppViewModel;
}

export const useChatMessageListRuntimeValues = ({ app }: MessageListRuntimeValuesOptions) => {
  const { chatState, sessionTitle, handleOpenSidePanel, handleSuggestionClick } = app;

  // Destructure chatState members into stable local references so the memo
  // below is not invalidated by the whole chatState object changing identity on
  // every render (see inputRuntimeValues.ts for the same rationale).
  const {
    setScrollContainerRef,
    handleEditMessage,
    handleDeleteMessage,
    handleRetryMessage,
    handleUpdateMessageFile,
    handleContinueGeneration,
    handleForkMessage,
    handleQuickTTS,
  } = chatState;

  const onFollowUpSuggestionClick = useCallback(
    (text: string) => {
      handleSuggestionClick('follow-up', text);
    },
    [handleSuggestionClick],
  );

  const onFollowUpSuggestionFill = useCallback(
    (text: string) => {
      handleSuggestionClick('follow-up-fill', text);
    },
    [handleSuggestionClick],
  );

  return useMemo<ChatMessageListRuntimeValue>(
    () => ({
      sessionTitle,
      setScrollContainerRef,
      onEditMessage: handleEditMessage,
      onDeleteMessage: handleDeleteMessage,
      onRetryMessage: handleRetryMessage,
      onUpdateMessageFile: handleUpdateMessageFile,
      onFollowUpSuggestionClick,
      onFollowUpSuggestionFill,
      onContinueGeneration: handleContinueGeneration,
      onForkMessage: handleForkMessage,
      onQuickTTS: handleQuickTTS,
      onOpenSidePanel: handleOpenSidePanel,
    }),
    [
      handleContinueGeneration,
      handleDeleteMessage,
      handleEditMessage,
      handleForkMessage,
      handleOpenSidePanel,
      handleQuickTTS,
      handleRetryMessage,
      handleUpdateMessageFile,
      onFollowUpSuggestionClick,
      onFollowUpSuggestionFill,
      sessionTitle,
      setScrollContainerRef,
    ],
  );
};
