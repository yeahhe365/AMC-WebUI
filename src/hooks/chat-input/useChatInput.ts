import { useCallback, useMemo } from 'react';
import { deferToNextTick } from '@/utils/deferToNextTick';
import { useVoiceInput } from './useVoiceInput';
import { useSlashCommands } from './useSlashCommands';
import { useChatInputCore } from './useChatInputCore';
import { useChatInputFile } from './useChatInputFile';
import { useChatInputGlobalEffects } from './useChatInputGlobalEffects';
import { useChatInputSubmission } from './useChatInputSubmission';
import { useChatInputClipboard } from './useChatInputClipboard';
import { useChatInputKeyboard } from './useChatInputKeyboard';
import { useChatInputTranslation } from './useChatInputTranslation';
import { getChatInputAvailability, getCurrentChatInputMode } from '@/utils/chat-input/chatInputAvailability';

export const useChatInput = () => {
  const core = useChatInputCore();
  const { t, chatInput, inputState, fileRefs, targetDocument, insertText, capabilities, liveApi } = core;
  const {
    appSettings,
    currentChatSettings,
    activeSessionId,
    isEditing,
    onProcessFiles,
    commandedInput,
    onSendMessage,
    onMessageSent,
    setEditingMessageId,
    onTranscribeAudio,
    onUpdateMessageContent,
    onCancelEdit,
    onStopGenerating,
    toolStates = {},
    onClearChat,
    onNewChat,
    onOpenSettings,
    onToggleLiveArtifactsPrompt,
    onTogglePinCurrentSession,
    onRetryLastTurn,
    onSelectModel,
    availableModels,
    onEditLastUserMessage,
    onTogglePip,
    setCurrentChatSettings,
    onAddUserMessage,
    selectedFiles,
    setSelectedFiles,
    setAppFileError,
    isLoading,
    editMode,
    editingMessageId,
    onAddFileById,
    isProcessingFile,
  } = chatInput;

  const {
    filePreProcessing,
    modalsState,
    localFileState,
    removeSelectedFile,
    handleAddFileByIdSubmit,
    handleSaveFileConfig,
  } = useChatInputFile({
    fileIdInput: inputState.fileIdInput,
    isAddingById: inputState.isAddingById,
    setAddingById: inputState.setAddingById,
    setFileIdInput: inputState.setFileIdInput,
    setInputText: inputState.setInputText,
    textareaRef: inputState.textareaRef,
    selectedFiles,
    setSelectedFiles,
    setAppFileError,
    onProcessFiles,
    onAddFileById,
    isLoading,
    fileRefs,
    justInitiatedFileOpRef: inputState.justInitiatedFileOpRef,
  });

  const voiceState = useVoiceInput({
    onTranscribeAudio,
    setInputText: inputState.setInputText,
    setAppFileError,
    textareaRef: inputState.textareaRef,
  });

  const slashCommandState = useSlashCommands({
    t,
    toolStates,
    onClearChat,
    onNewChat,
    onOpenSettings,
    onToggleLiveArtifactsPrompt,
    onTogglePinCurrentSession,
    onRetryLastTurn,
    onAttachmentAction: modalsState.handleAttachmentAction,
    availableModels,
    onSelectModel,
    onMessageSent,
    setIsHelpModalOpen: modalsState.setIsHelpModalOpen,
    textareaRef: inputState.textareaRef,
    onEditLastUserMessage,
    setInputText: inputState.setInputText,
    onTogglePip,
    currentModelId: currentChatSettings.modelId,
    providerId: currentChatSettings.providerId,
    onSetThinkingLevel: (level) => setCurrentChatSettings((prev) => ({ ...prev, thinkingLevel: level })),
    thinkingLevel: currentChatSettings.thinkingLevel,
    inputText: inputState.inputText,
  });

  const { canSend, canQueueMessageBase, isAnyModalOpen } = getChatInputAvailability({
    inputState,
    modalsState,
    localFileState,
    selectedFiles,
    capabilities,
    activeSessionId,
    isLoading,
    isEditing,
  });

  const {
    canQueueMessage,
    activeQueuedSubmissions,
    queueCurrentSubmission,
    cancelPendingUploadSend,
    restoreQueuedSubmission,
    removeQueuedSubmission,
    removeAllQueuedSubmissions,
    reorderQueuedSubmissions,
    handleSubmit,
    handleFastSubmit,
    handleSmartSendMessage,
  } = useChatInputSubmission({
    activeSessionId,
    appSettings,
    currentChatSettings,
    selectedFiles,
    setSelectedFiles,
    setAppFileError,
    uploadFailureMessage: t('messageSenderFileUploadFailedBeforeSend'),
    isLoading,
    isEditing,
    editMode,
    editingMessageId,
    canSend,
    canQueueMessageBase,
    submissionState: {
      inputText: inputState.inputText,
      quotes: inputState.quotes,
      ttsContext: inputState.ttsContext,
      isFullscreen: inputState.isFullscreen,
      clearCurrentDraft: inputState.clearCurrentDraft,
      setInputText: inputState.setInputText,
      setQuotes: inputState.setQuotes,
      setWaitingForUpload: inputState.setWaitingForUpload,
      startSendAnimation: inputState.startSendAnimation,
      stopSendAnimation: inputState.stopSendAnimation,
      exitFullscreen: inputState.exitFullscreen,
      textareaRef: inputState.textareaRef,
    },
    isNativeAudioModel: capabilities.isNativeAudioModel,
    liveApi,
    onUpdateMessageContent,
    setEditingMessageId,
    onMessageSent,
    onAddUserMessage,
    onSendMessage,
  });

  const chatInputMode = getCurrentChatInputMode({
    inputState,
    localFileState,
    capabilities,
    liveApi,
    activeQueuedSubmissions,
    canQueueMessage,
    isEditing,
    isProcessingFile,
  });

  const { handleAddUrl, handlePaste, handlePasteAction, handlePasteFromClipboard, handleClearInput } =
    useChatInputClipboard({
      appSettings,
      isAddingById: inputState.isAddingById,
      showCreateTextFileEditor: modalsState.showCreateTextFileEditor,
      showRecorder: modalsState.showRecorder,
      showLibraryPicker: modalsState.showLibraryPicker,
      justInitiatedFileOpRef: inputState.justInitiatedFileOpRef,
      textareaRef: inputState.textareaRef,
      setInputText: inputState.setInputText,
      setUrlInput: inputState.setUrlInput,
      setShowAddByUrlInput: modalsState.setShowAddByUrlInput,
      setSelectedFiles,
      setAppFileError,
      onProcessFiles,
      insertText,
    });

  const { handleTranslate } = useChatInputTranslation({
    appSettings,
    currentChatSettings,
    inputText: inputState.inputText,
    isTranslating: inputState.isTranslating,
    setInputText: inputState.setInputText,
    setTranslating: inputState.setTranslating,
    setAppFileError,
  });

  const { handleInputChange, handleKeyDown } = useChatInputKeyboard({
    appSettings,
    keyboardState: {
      inputText: inputState.inputText,
      isFullscreen: inputState.isFullscreen,
      isMobile: inputState.isMobile,
      isComposingRef: inputState.isComposingRef,
      compositionEndedAtRef: inputState.compositionEndedAtRef,
      setInputText: inputState.setInputText,
      handleToggleFullscreen: inputState.handleToggleFullscreen,
    },
    slashCommandState,
    isLoading,
    isEditing,
    canSend,
    canQueueMessage,
    handleSubmit,
    queueCurrentSubmission,
    onStopGenerating,
    onCancelEdit,
    onEditLastUserMessage,
  });

  const handleCompositionEnd = useCallback(
    (value: string) => {
      inputState.handleCompositionEnd();
      slashCommandState.handleInputChange(value);
    },
    [inputState, slashCommandState],
  );

  const handleToggleToolAndFocus = useCallback(
    (toggleFunc: () => void) => {
      toggleFunc();
      deferToNextTick(() => inputState.textareaRef.current?.focus());
    },
    [inputState.textareaRef],
  );

  const handlers = useMemo(
    () => ({
      handleFileChange: filePreProcessing.handleFileChange,
      handleFolderChange: filePreProcessing.handleFolderChange,
      handleZipChange: filePreProcessing.handleZipChange,
      handleAddUrl,
      handlePaste,
      handlePasteAction,
      handleInputChange,
      handleSubmit,
      handleFastSubmit,
      handleTranslate,
      handlePasteFromClipboard,
      handleClearInput,
      handleKeyDown,
      onCompositionStart: inputState.handleCompositionStart,
      onCompositionEnd: handleCompositionEnd,
      removeSelectedFile,
      handleAddFileByIdSubmit,
      handleToggleToolAndFocus,
      handleSaveFileConfig,
      queueCurrentSubmission,
      cancelPendingUploadSend,
      restoreQueuedSubmission,
      removeQueuedSubmission,
      removeAllQueuedSubmissions,
      reorderQueuedSubmissions,
    }),
    [
      handleAddFileByIdSubmit,
      handleAddUrl,
      handleClearInput,
      handleFastSubmit,
      filePreProcessing.handleFileChange,
      filePreProcessing.handleFolderChange,
      filePreProcessing.handleZipChange,
      handleInputChange,
      handleKeyDown,
      handlePaste,
      handlePasteAction,
      handlePasteFromClipboard,
      handleSaveFileConfig,
      queueCurrentSubmission,
      cancelPendingUploadSend,
      removeQueuedSubmission,
      removeAllQueuedSubmissions,
      reorderQueuedSubmissions,
      restoreQueuedSubmission,
      handleSubmit,
      handleToggleToolAndFocus,
      handleTranslate,
      inputState.handleCompositionStart,
      handleCompositionEnd,
      removeSelectedFile,
    ],
  );

  useChatInputGlobalEffects({
    appSettings,
    commandedInput,
    isAnyModalOpen,
    isProcessingFile,
    isAddingById: inputState.isAddingById,
    selectedFileCount: selectedFiles.length,
    targetDocument,
    textareaRef: inputState.textareaRef,
    prevIsProcessingFileRef: inputState.prevIsProcessingFileRef,
    justInitiatedFileOpRef: inputState.justInitiatedFileOpRef,
    setInputText: inputState.setInputText,
    setQuotes: inputState.setQuotes,
    insertText,
    handlePasteAction,
  });

  const result = useMemo(
    () => ({
      chatInput,
      inputState,
      capabilities,
      liveApi,
      modalsState,
      localFileState,
      voiceState,
      slashCommandState,
      handlers,
      targetDocument,
      canSend,
      canQueueMessage,
      queuedSubmissions: activeQueuedSubmissions,
      chatInputMode,
      isAnyModalOpen,
      handleSmartSendMessage,
    }),
    [
      activeQueuedSubmissions,
      canQueueMessage,
      canSend,
      capabilities,
      chatInput,
      chatInputMode,
      handleSmartSendMessage,
      handlers,
      inputState,
      isAnyModalOpen,
      liveApi,
      localFileState,
      modalsState,
      slashCommandState,
      targetDocument,
      voiceState,
    ],
  );

  return result;
};
