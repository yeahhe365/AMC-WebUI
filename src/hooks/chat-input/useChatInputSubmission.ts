import { useCallback, useEffect, useRef, type Dispatch, type RefObject, type SetStateAction } from 'react';
import { type AppSettings, type UploadedFile, type ChatSettings } from '@/types';
import { buildPendingChatInputSubmission } from '@/utils/chat-input/pendingSubmission';
import { useLiveModeHandler, type LiveModeApi } from './useLiveModeHandler';
import { useMessageQueue } from './useMessageQueue';

type SetSelectedFiles = (files: UploadedFile[] | ((prevFiles: UploadedFile[]) => UploadedFile[])) => void;

interface ChatInputSubmissionState {
  inputText: string;
  quotes: string[];
  ttsContext: string;
  isFullscreen: boolean;
  clearCurrentDraft: () => void;
  setInputText: Dispatch<SetStateAction<string>>;
  setQuotes: Dispatch<SetStateAction<string[]>>;
  setWaitingForUpload: (isWaiting: boolean) => void;
  startSendAnimation: () => void;
  stopSendAnimation: () => void;
  exitFullscreen: () => void;
  textareaRef: RefObject<HTMLTextAreaElement>;
}

interface UseChatInputSubmissionParams {
  activeSessionId: string | null;
  appSettings: AppSettings;
  currentChatSettings: ChatSettings;
  selectedFiles: UploadedFile[];
  setSelectedFiles: SetSelectedFiles;
  setAppFileError: (error: string | null) => void;
  uploadFailureMessage: string;
  isLoading: boolean;
  isEditing: boolean;
  editMode: 'update' | 'resend';
  editingMessageId: string | null;
  canSend: boolean;
  canQueueMessageBase: boolean;
  submissionState: ChatInputSubmissionState;
  isNativeAudioModel: boolean;
  liveApi: LiveModeApi;
  onUpdateMessageContent: (messageId: string, content: string) => void;
  setEditingMessageId: (id: string | null) => void;
  onMessageSent: () => void;
  onAddUserMessage?: (text: string, files?: UploadedFile[]) => void;
  onSendMessage: (text: string, options?: { isFastMode?: boolean; files?: UploadedFile[] }) => void;
}

export const useChatInputSubmission = ({
  activeSessionId,
  appSettings,
  currentChatSettings,
  selectedFiles,
  setSelectedFiles,
  setAppFileError,
  uploadFailureMessage,
  isLoading,
  isEditing,
  editMode,
  editingMessageId,
  canSend,
  canQueueMessageBase,
  submissionState,
  isNativeAudioModel,
  liveApi,
  onUpdateMessageContent,
  setEditingMessageId,
  onMessageSent,
  onAddUserMessage,
  onSendMessage,
}: UseChatInputSubmissionParams) => {
  const sendAnimationTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const {
    inputText,
    quotes,
    ttsContext,
    isFullscreen,
    clearCurrentDraft,
    setInputText,
    setQuotes,
    setWaitingForUpload,
    startSendAnimation,
    stopSendAnimation,
    exitFullscreen,
    textareaRef,
  } = submissionState;

  const { handleSmartSendMessage } = useLiveModeHandler({
    isNativeAudioModel,
    selectedFiles,
    setSelectedFiles,
    setAppFileError,
    appSettings,
    currentChatSettings,
    currentModelId: currentChatSettings.modelId,
    mediaResolution: currentChatSettings.mediaResolution,
    liveApi,
    onAddUserMessage,
    onSendMessage,
  });

  const clearSendAnimationTimer = useCallback(() => {
    if (sendAnimationTimeoutRef.current === null) {
      return;
    }

    clearTimeout(sendAnimationTimeoutRef.current);
    sendAnimationTimeoutRef.current = null;
  }, []);

  useEffect(() => clearSendAnimationTimer, [clearSendAnimationTimer]);

  const completeEditSubmission = useCallback(
    (messageId: string, content: string) => {
      onUpdateMessageContent(messageId, content);
      setEditingMessageId(null);
      clearCurrentDraft();
      setInputText('');
      setQuotes([]);
      onMessageSent();
    },
    [clearCurrentDraft, onMessageSent, onUpdateMessageContent, setEditingMessageId, setInputText, setQuotes],
  );

  const completeSendSubmission = useCallback(
    (
      textToSend: string,
      isFastMode: boolean,
      options?: {
        files?: UploadedFile[];
        preserveComposer?: boolean;
      },
    ) => {
      const preserveComposer = options?.preserveComposer ?? false;
      const files = options?.files;

      if (!preserveComposer) {
        clearCurrentDraft();
      }

      handleSmartSendMessage(textToSend, { isFastMode, files });

      if (!preserveComposer) {
        setInputText('');
        setQuotes([]);
      }

      onMessageSent();
      startSendAnimation();
      clearSendAnimationTimer();
      sendAnimationTimeoutRef.current = setTimeout(() => {
        sendAnimationTimeoutRef.current = null;
        stopSendAnimation();
      }, 400);

      if (!preserveComposer && isFullscreen) {
        exitFullscreen();
      }
    },
    [
      clearCurrentDraft,
      clearSendAnimationTimer,
      exitFullscreen,
      handleSmartSendMessage,
      isFullscreen,
      onMessageSent,
      setInputText,
      setQuotes,
      startSendAnimation,
      stopSendAnimation,
    ],
  );

  const {
    canQueueMessage,
    activeQueuedSubmissions,
    queueCurrentSubmission,
    cancelPendingSubmission,
    restoreQueuedSubmission,
    removeQueuedSubmission,
    removeAllQueuedSubmissions,
    reorderQueuedSubmissions,
  } = useMessageQueue({
    activeSessionId,
    modelId: currentChatSettings.modelId,
    inputText,
    quotes,
    ttsContext,
    selectedFiles,
    isLoading,
    canQueueMessageBase,
    clearCurrentDraft,
    setInputText,
    setQuotes,
    setWaitingForUpload,
    textareaRef,
    setSelectedFiles,
    setAppFileError,
    uploadFailureMessage,
    completeEditSubmission,
    completeSendSubmission,
  });

  const performSubmit = useCallback(
    (isFastMode: boolean) => {
      if (!canSend) {
        return;
      }

      const submission = buildPendingChatInputSubmission({
        inputText,
        quotes,
        modelId: currentChatSettings.modelId,
        ttsContext,
        isEditing,
        editMode,
        editingMessageId,
        isFastMode,
      });

      if (
        selectedFiles.some((file) => file.uploadState === 'failed' || file.uploadState === 'cancelled' || !!file.error)
      ) {
        setAppFileError(uploadFailureMessage);
        return;
      }

      if (submission.kind === 'edit') {
        completeEditSubmission(submission.messageId, submission.content);
        return;
      }

      completeSendSubmission(submission.textToSend, submission.isFastMode);
    },
    [
      canSend,
      completeEditSubmission,
      completeSendSubmission,
      currentChatSettings.modelId,
      editMode,
      editingMessageId,
      inputText,
      isEditing,
      quotes,
      selectedFiles,
      setAppFileError,
      ttsContext,
      uploadFailureMessage,
    ],
  );

  const handleSubmit = useCallback(() => {
    performSubmit(false);
  }, [performSubmit]);

  const handleFastSubmit = useCallback(() => {
    performSubmit(true);
  }, [performSubmit]);

  return {
    canQueueMessage,
    activeQueuedSubmissions,
    queueCurrentSubmission,
    cancelPendingUploadSend: cancelPendingSubmission,
    restoreQueuedSubmission,
    removeQueuedSubmission,
    removeAllQueuedSubmissions,
    reorderQueuedSubmissions,
    handleSubmit,
    handleFastSubmit,
    performSubmit,
    handleSmartSendMessage,
  };
};
