import React, { useMemo } from 'react';
import { useI18n } from '@/contexts/I18nContext';
import { useChatInput } from '@/hooks/chat-input/useChatInput';
import { INITIAL_TEXTAREA_HEIGHT_PX } from './chatInputTextAreaMetrics';
import {
  ChatInputActionsContext,
  ChatInputComposerStatusContext,
  ChatInputContext,
  ChatInputToolbarContext,
  type ChatInputActionsContextValue,
  type ChatInputComposerStatusContextValue,
  type ChatInputContextValue,
  type ChatInputToolbarContextValue,
} from './ChatInputContext';

const useLatestCallback = <Args extends unknown[], ReturnValue>(callback: (...args: Args) => ReturnValue) => {
  const callbackRef = React.useRef(callback);

  React.useLayoutEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  return React.useCallback((...args: Args) => callbackRef.current(...args), []);
};

export const ChatInputProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { t } = useI18n();
  const logic = useChatInput();
  const { inputState, localFileState, voiceState, liveApi, queuedSubmissions, handlers, isAnyModalOpen } = logic;
  const queuedCount = queuedSubmissions.length;

  const handleStartLiveCamera = React.useCallback(async () => {
    const didStart = await liveApi.startCamera();
    if (didStart && !liveApi.isConnected) {
      await liveApi.connect();
    }
  }, [liveApi]);

  const handleStartLiveScreenShare = React.useCallback(async () => {
    const didStart = await liveApi.startScreenShare();
    if (didStart && !liveApi.isConnected) {
      await liveApi.connect();
    }
  }, [liveApi]);

  const inputDisabled =
    isAnyModalOpen ||
    voiceState.isTranscribing ||
    inputState.isWaitingForUpload ||
    voiceState.isRecording ||
    localFileState.isConverting;
  const actionDisabled =
    inputState.isAddingById || isAnyModalOpen || inputState.isWaitingForUpload || localFileState.isConverting;
  const hasTrimmedInput = inputState.inputText.trim().length > 0;

  const onAttachmentAction = useLatestCallback(logic.modalsState.handleAttachmentAction);
  const onRecordButtonClick = useLatestCallback(voiceState.handleVoiceInputClick);
  const onCancelRecording = useLatestCallback(voiceState.handleCancelRecording);
  const onToggleFullscreen = useLatestCallback(inputState.handleToggleFullscreen);
  const onStartLiveSession = useLatestCallback(() => liveApi.connect());
  const onDisconnectLiveSession = useLatestCallback(() => liveApi.disconnect());
  const onToggleLiveMute = useLatestCallback(() => liveApi.toggleMute());
  const onStartLiveCamera = useLatestCallback(() => handleStartLiveCamera());
  const onStartLiveScreenShare = useLatestCallback(() => handleStartLiveScreenShare());
  const onStopLiveVideo = useLatestCallback(() => liveApi.stopVideo());
  const onToggleToolAndFocus = useLatestCallback(handlers.handleToggleToolAndFocus);
  const onCountTokens = useLatestCallback(() => localFileState.setShowTokenModal(true));
  const onNewChat = useLatestCallback(() => logic.chatInput.onNewChat());
  const onAddFileByIdSubmit = useLatestCallback(handlers.handleAddFileByIdSubmit);
  const onCancelAddById = useLatestCallback(() => {
    logic.modalsState.setShowAddByIdInput(false);
    inputState.setFileIdInput('');
    inputState.textareaRef.current?.focus();
  });
  const onAddUrlSubmit = useLatestCallback(() => handlers.handleAddUrl(inputState.urlInput));
  const onCancelAddUrl = useLatestCallback(() => {
    logic.modalsState.setShowAddByUrlInput(false);
    inputState.setUrlInput('');
    inputState.textareaRef.current?.focus();
  });
  const onEditTtsContext = useLatestCallback(() => logic.modalsState.setShowTtsContextEditor(true));
  const onTranslate = useLatestCallback(handlers.handleTranslate);
  const onPasteFromClipboard = useLatestCallback(handlers.handlePasteFromClipboard);
  const onClearInput = useLatestCallback(handlers.handleClearInput);
  const onFastSendMessage = useLatestCallback(handlers.handleFastSubmit);
  const onQueueMessage = useLatestCallback(handlers.queueCurrentSubmission);
  const onCancelPendingUploadSend = useLatestCallback(handlers.cancelPendingUploadSend);

  const queuedSubmissionsView = useMemo(
    () =>
      queuedSubmissions.length > 0
        ? {
            title: t('queuedSubmissionTitle'),
            items: queuedSubmissions.map((submission) => ({
              id: submission.id,
              previewText:
                submission.inputText.trim() ||
                submission.textToSend.trim() ||
                t('queuedSubmissionAttachmentOnlyPreview'),
              fileCount: submission.files.length,
            })),
            onEditItem: handlers.restoreQueuedSubmission,
            onRemoveItem: handlers.removeQueuedSubmission,
            onReorderItem: handlers.reorderQueuedSubmissions,
            onClearAll: handlers.removeAllQueuedSubmissions,
          }
        : undefined,
    [
      handlers.removeAllQueuedSubmissions,
      handlers.removeQueuedSubmission,
      handlers.reorderQueuedSubmissions,
      handlers.restoreQueuedSubmission,
      queuedSubmissions,
      t,
    ],
  );

  const toolbarValue = useMemo<ChatInputToolbarContextValue>(
    () => ({
      appSettings: logic.chatInput.appSettings,
      currentChatSettings: logic.chatInput.currentChatSettings,
      capabilities: logic.capabilities,
      isLoading: logic.chatInput.isLoading,
      setCurrentChatSettings: logic.chatInput.setCurrentChatSettings,
      onToggleQuadImages: logic.chatInput.onToggleQuadImages,
      showAddByIdInput: logic.modalsState.showAddByIdInput,
      fileIdInput: inputState.fileIdInput,
      setFileIdInput: inputState.setFileIdInput,
      onAddFileByIdSubmit,
      onCancelAddById,
      isAddingById: inputState.isAddingById,
      showAddByUrlInput: logic.modalsState.showAddByUrlInput,
      urlInput: inputState.urlInput,
      setUrlInput: inputState.setUrlInput,
      onAddUrlSubmit,
      onCancelAddUrl,
      isAddingByUrl: inputState.isAddingByUrl,
      ttsContext: inputState.ttsContext,
      onEditTtsContext,
      onAttachmentAction,
    }),
    [
      logic.capabilities,
      logic.chatInput.appSettings,
      logic.chatInput.currentChatSettings,
      logic.chatInput.isLoading,
      logic.chatInput.onToggleQuadImages,
      logic.chatInput.setCurrentChatSettings,
      inputState.fileIdInput,
      inputState.isAddingById,
      inputState.isAddingByUrl,
      inputState.setFileIdInput,
      inputState.setUrlInput,
      inputState.ttsContext,
      inputState.urlInput,
      logic.modalsState.showAddByIdInput,
      logic.modalsState.showAddByUrlInput,
      onAddFileByIdSubmit,
      onAddUrlSubmit,
      onCancelAddById,
      onCancelAddUrl,
      onEditTtsContext,
      onAttachmentAction,
    ],
  );

  const actionsValue = useMemo<ChatInputActionsContextValue>(
    () => ({
      currentModelId: logic.chatInput.currentChatSettings.modelId,
      providerId: logic.chatInput.currentChatSettings.providerId,
      toolStates: logic.chatInput.toolStates,
      onAttachmentAction,
      onNewChat,
      disabled: actionDisabled,
      onRecordButtonClick,
      onCancelRecording,
      isRecording: !!voiceState.isRecording,
      isMicInitializing: !!voiceState.isMicInitializing,
      isTranscribing: voiceState.isTranscribing,
      isWaitingForUpload: inputState.isWaitingForUpload,
      isTranslating: inputState.isTranslating,
      onToggleFullscreen,
      isFullscreen: inputState.isFullscreen,
      onStartLiveSession,
      onDisconnectLiveSession,
      isLiveConnected: liveApi.isConnected,
      isLiveMuted: liveApi.isMuted,
      onToggleLiveMute,
      onStartLiveCamera,
      onStartLiveScreenShare,
      onStopLiveVideo,
      liveVideoSource: liveApi.videoSource,
      onToggleToolAndFocus,
      onCountTokens,
      isImageGenerationModel: logic.capabilities.isImageGenerationModel || false,
      isTranscribeModel: logic.capabilities.isTranscribeModel || false,
      isNativeAudioModel: logic.capabilities.isNativeAudioModel || false,
      isLiveTranslate: logic.capabilities.isLiveTranslate || false,
      isLiveTranscribe: logic.capabilities.isLiveTranscribe || false,
      isTtsModel: logic.capabilities.isTtsModel || false,
      canAddYouTubeVideo: !!logic.capabilities.permissions?.canUseYouTubeUrl,
      isLoading: logic.chatInput.isLoading,
      isEditing: logic.chatInput.isEditing,
      showInputTranslationButton: logic.chatInput.appSettings.showInputTranslationButton ?? false,
      showInputPasteButton: logic.chatInput.appSettings.showInputPasteButton ?? true,
      showInputClearButton: logic.chatInput.appSettings.showInputClearButton ?? true,
      showVoiceInputButton: logic.chatInput.appSettings.showVoiceInputButton ?? false,
    }),
    [
      actionDisabled,
      inputState.isFullscreen,
      inputState.isTranslating,
      inputState.isWaitingForUpload,
      liveApi.isConnected,
      liveApi.isMuted,
      liveApi.videoSource,
      logic.capabilities.isImageGenerationModel,
      logic.capabilities.isTranscribeModel,
      logic.capabilities.isNativeAudioModel,
      logic.capabilities.isLiveTranslate,
      logic.capabilities.isLiveTranscribe,
      logic.capabilities.isTtsModel,
      logic.capabilities.permissions?.canUseYouTubeUrl,
      logic.chatInput.appSettings.showInputClearButton,
      logic.chatInput.appSettings.showInputPasteButton,
      logic.chatInput.appSettings.showInputTranslationButton,
      logic.chatInput.appSettings.showVoiceInputButton,
      logic.chatInput.currentChatSettings.modelId,
      logic.chatInput.currentChatSettings.providerId,
      logic.chatInput.isEditing,
      logic.chatInput.isLoading,
      logic.chatInput.toolStates,
      onAttachmentAction,
      onNewChat,
      onCancelRecording,
      onCountTokens,
      onDisconnectLiveSession,
      onRecordButtonClick,
      onStartLiveCamera,
      onStartLiveScreenShare,
      onStartLiveSession,
      onStopLiveVideo,
      onToggleFullscreen,
      onToggleLiveMute,
      onToggleToolAndFocus,
      voiceState.isMicInitializing,
      voiceState.isRecording,
      voiceState.isTranscribing,
    ],
  );

  const composerStatusValue = useMemo<ChatInputComposerStatusContextValue>(
    () => ({
      hasTrimmedInput,
      canSend: logic.canSend,
      canQueueMessage: logic.canQueueMessage,
      queuedCount,
      onTranslate,
      onPasteFromClipboard,
      onClearInput,
      onFastSendMessage,
      onQueueMessage,
      onCancelPendingUploadSend,
    }),
    [
      hasTrimmedInput,
      logic.canQueueMessage,
      logic.canSend,
      queuedCount,
      onClearInput,
      onFastSendMessage,
      onPasteFromClipboard,
      onQueueMessage,
      onCancelPendingUploadSend,
      onTranslate,
    ],
  );

  const value = useMemo<ChatInputContextValue>(
    () => ({
      ...logic,
      inputDisabled,
      initialTextareaHeight: INITIAL_TEXTAREA_HEIGHT_PX,
      handleStartLiveCamera,
      handleStartLiveScreenShare,
      queuedSubmissionsView,
    }),
    [handleStartLiveCamera, handleStartLiveScreenShare, inputDisabled, logic, queuedSubmissionsView],
  );

  return (
    <ChatInputContext.Provider value={value}>
      <ChatInputToolbarContext.Provider value={toolbarValue}>
        <ChatInputActionsContext.Provider value={actionsValue}>
          <ChatInputComposerStatusContext.Provider value={composerStatusValue}>
            {children}
          </ChatInputComposerStatusContext.Provider>
        </ChatInputActionsContext.Provider>
      </ChatInputToolbarContext.Provider>
    </ChatInputContext.Provider>
  );
};
