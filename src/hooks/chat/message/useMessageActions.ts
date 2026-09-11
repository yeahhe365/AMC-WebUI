import { type MutableRefObject, useCallback } from 'react';
import { type ChatMessage, type UploadedFile, type SessionsUpdater, type CommandedInputSetter } from '@/types';
import { logService } from '@/services/logService';
import { CHAT_INPUT_TEXTAREA_SELECTOR } from '@/constants/layout';
import { cleanupFilePreviewUrls } from '@/utils/file/filePreviewUrls';
import { getVisibleChatMessages } from '@/utils/chat/visibility';
import { cloneMessagesWithFreshIds, createNewSession } from '@/utils/chat/session';
import { updateSessionById } from '@/utils/chat/sessionMutations';
import { INVALID_FILE_API_KEY_FINGERPRINT } from '@/utils/chat/geminiFilesApi';
import { resolveUploadableFile } from '@/features/message-sender/fileApiReference';
import { releaseSessionLoadingForGenerationHandoff } from '@/features/message-sender/activeGenerationJobs';
import { isGenerationLeaseHeldByOther } from '@/features/message-sender/generationLease';
import { useChatStore } from '@/stores/chatStore';
import { toastError } from '@/stores/toastStore';
import { useI18n } from '@/contexts/I18nContext';

type ActiveSessionSetter = (id: string | null, options?: { history?: 'push' | 'replace' | 'none' | 'auto' }) => void;
type SendMessageFunc = (overrideOptions?: {
  text?: string;
  files?: UploadedFile[];
  editingId?: string;
  isContinueMode?: boolean;
}) => Promise<void>;

interface UseMessageActionsOptions {
  messages: ChatMessage[];
  isLoading: boolean;
  activeSessionId: string | null;
  editingMessageId: string | null;
  activeJobs: MutableRefObject<Map<string, AbortController>>;
  setCommandedInput: CommandedInputSetter;
  setSelectedFiles: (files: UploadedFile[] | ((prev: UploadedFile[]) => UploadedFile[])) => void;
  setEditingMessageId: (id: string | null) => void;
  setEditMode: (mode: 'update' | 'resend') => void;
  setAppFileError: (error: string | null) => void;
  updateAndPersistSessions: SessionsUpdater;
  setActiveSessionId: ActiveSessionSetter;
  userScrolledUpRef: MutableRefObject<boolean>;
  handleSendMessage: SendMessageFunc;
  setSessionLoading: (sessionId: string, isLoading: boolean) => void;
}

export const useMessageActions = ({
  messages,
  isLoading,
  activeSessionId,
  editingMessageId,
  activeJobs,
  setCommandedInput,
  setSelectedFiles,
  setEditingMessageId,
  setEditMode,
  setAppFileError,
  updateAndPersistSessions,
  setActiveSessionId,
  userScrolledUpRef,
  handleSendMessage,
  setSessionLoading,
}: UseMessageActionsOptions) => {
  const { t } = useI18n();
  /**
   * @returns `stopped` when a local job was aborted; `no_local_job` when loading is remote/orphan
   * (and a cross-tab abort was requested); `not_loading` when nothing to stop.
   *
   * 薄封装:唯一实现在 `chatStore.stopGenerating`,签名与副作用时序与其完全一致。
   * 通过 `getState()` 在调用时刻读取最新 store 状态,不订阅、不随渲染重建。
   */
  const handleStopGenerating = useCallback(
    (options: { silent?: boolean; skipLoadingUpdate?: boolean } = {}): 'stopped' | 'no_local_job' | 'not_loading' =>
      useChatStore.getState().stopGenerating(options),
    [],
  );

  /** 薄封装:唯一实现在 `chatStore.cancelEdit`,清空编辑态与文件选择并重置 editMode。 */
  const handleCancelEdit = useCallback(() => {
    useChatStore.getState().cancelEdit();
  }, []);

  const handleEditMessage = useCallback(
    (messageId: string, mode: 'update' | 'resend' = 'resend') => {
      logService.info('User initiated message edit', { messageId, mode });
      const messageToEdit = messages.find((message) => message.id === messageId);
      if (messageToEdit) {
        if (isLoading) handleStopGenerating();
        setCommandedInput({ text: messageToEdit.content || '', id: Date.now() });
        setSelectedFiles(messageToEdit.files || []);
        setEditingMessageId(messageId);
        setEditMode(mode);
        setAppFileError(null);
        (document.querySelector(CHAT_INPUT_TEXTAREA_SELECTOR) as HTMLTextAreaElement)?.focus();
      }
    },
    [
      messages,
      isLoading,
      handleStopGenerating,
      setCommandedInput,
      setSelectedFiles,
      setEditingMessageId,
      setEditMode,
      setAppFileError,
    ],
  );

  const handleDeleteMessage = useCallback(
    (messageId: string) => {
      if (!activeSessionId) return;
      logService.info('User deleted message', { messageId, sessionId: activeSessionId });

      const messageToDelete = messages.find((message) => message.id === messageId);
      if (messageToDelete?.isLoading) {
        handleStopGenerating();
      }

      if (messageToDelete) {
        cleanupFilePreviewUrls(messageToDelete.files);
      }

      const relatedToolMessageIds = new Set(
        messages.filter((message) => message.toolParentMessageId === messageId).map((message) => message.id),
      );
      relatedToolMessageIds.add(messageId);

      updateAndPersistSessions((prev) =>
        updateSessionById(prev, activeSessionId, (session) => ({
          ...session,
          messages: session.messages.filter((message) => !relatedToolMessageIds.has(message.id)),
        })),
      );

      if (editingMessageId === messageId) handleCancelEdit();
      userScrolledUpRef.current = false;
    },
    [
      activeSessionId,
      messages,
      editingMessageId,
      handleStopGenerating,
      updateAndPersistSessions,
      handleCancelEdit,
      userScrolledUpRef,
    ],
  );

  const handleRetryMessage = useCallback(
    async (modelMessageIdToRetry: string) => {
      if (!activeSessionId) return;
      logService.info('User retrying message', { modelMessageId: modelMessageIdToRetry, sessionId: activeSessionId });

      const visibleMessages = getVisibleChatMessages(messages);
      const modelMessageIndex = visibleMessages.findIndex((message) => message.id === modelMessageIdToRetry);
      if (modelMessageIndex === -1) {
        logService.warn('Retry blocked: message not found', { modelMessageId: modelMessageIdToRetry });
        return;
      }

      // Cleanup artifacts (images/audio) from the model message being discarded to prevent memory leaks
      const modelMessage = visibleMessages[modelMessageIndex];
      if (modelMessage.files) cleanupFilePreviewUrls(modelMessage.files);

      let userMessageToResend: ChatMessage | undefined;
      for (let i = modelMessageIndex - 1; i >= 0; i--) {
        if (visibleMessages[i].role === 'user') {
          userMessageToResend = visibleMessages[i];
          break;
        }
      }

      if (!userMessageToResend) {
        logService.warn('Retry blocked: no preceding user message found', {
          modelMessageId: modelMessageIdToRetry,
          modelMessageIndex,
        });
        toastError(t('messageSenderUnknownError'));
        return;
      }

      if (isLoading) {
        // Stop current generation but keep the session marked as "loading" in UI state
        // because we are about to immediately restart it. This prevents UI flicker.
        const stopResult = handleStopGenerating({ silent: true, skipLoadingUpdate: true });
        if (stopResult === 'no_local_job' || isGenerationLeaseHeldByOther(activeSessionId)) {
          logService.warn('Retry blocked: generation is owned by another tab', {
            sessionId: activeSessionId,
            stopResult,
          });
          const errorMsg = t('chatGeneratingInOtherTab');
          setAppFileError(errorMsg);
          toastError(errorMsg);
          return;
        }
      } else if (isGenerationLeaseHeldByOther(activeSessionId)) {
        logService.warn('Retry blocked: generation lease held by another tab', { sessionId: activeSessionId });
        const errorMsg = t('chatGeneratingInOtherTab');
        setAppFileError(errorMsg);
        toastError(errorMsg);
        return;
      }

      try {
        const rehydratedFiles = userMessageToResend.files
          ? await Promise.all(
              userMessageToResend.files.map(async (f) => {
                const uploadable = await resolveUploadableFile(f);
                const isFailedOrInvalid =
                  f.fileApiKeyFingerprint === INVALID_FILE_API_KEY_FINGERPRINT ||
                  f.uploadState === 'failed' ||
                  Boolean(f.error);

                return {
                  ...f,
                  rawFile: uploadable ?? f.rawFile,
                  error: undefined,
                  uploadState: 'active' as const,
                  ...(isFailedOrInvalid ? { fileApiKeyFingerprint: INVALID_FILE_API_KEY_FINGERPRINT } : {}),
                };
              }),
            )
          : undefined;

        await handleSendMessage({
          text: userMessageToResend.content,
          files: rehydratedFiles,
          editingId: userMessageToResend.id,
        });
      } finally {
        if (isLoading) {
          releaseSessionLoadingForGenerationHandoff({
            activeJobs,
            setSessionLoading,
            sessionId: activeSessionId,
          });
        }
      }
    },
    [
      activeSessionId,
      messages,
      isLoading,
      handleStopGenerating,
      handleSendMessage,
      activeJobs,
      setSessionLoading,
      setAppFileError,
      t,
    ],
  );

  const handleRetryLastTurn = useCallback(async () => {
    if (!activeSessionId) return;

    const lastModelMessage = [...getVisibleChatMessages(messages)]
      .reverse()
      .find((message) => message.role === 'model' || message.role === 'error');

    if (lastModelMessage) {
      logService.info('User retrying last turn via command', {
        modelMessageId: lastModelMessage.id,
        sessionId: activeSessionId,
      });
      await handleRetryMessage(lastModelMessage.id);
    } else {
      logService.warn('Could not retry last turn: no model message found.');
    }
  }, [activeSessionId, messages, handleRetryMessage]);

  const handleEditLastUserMessage = useCallback(() => {
    if (isLoading) {
      handleStopGenerating();
    }
    const lastUserMessage = [...getVisibleChatMessages(messages)].reverse().find((message) => message.role === 'user');
    if (lastUserMessage) {
      logService.info('User editing last message via command', { messageId: lastUserMessage.id });
      handleEditMessage(lastUserMessage.id, 'resend');
    } else {
      logService.warn('Could not edit last message: no user message found.');
    }
  }, [messages, isLoading, handleEditMessage, handleStopGenerating]);

  const handleContinueGeneration = useCallback(
    async (messageId: string) => {
      if (!activeSessionId) return;

      const message = messages.find((candidateMessage) => candidateMessage.id === messageId);
      if (!message || message.role !== 'model') return;

      logService.info('User requested Continue Generation', { messageId });

      if (isLoading) {
        const stopResult = handleStopGenerating({ silent: true });
        if (stopResult === 'no_local_job' || isGenerationLeaseHeldByOther(activeSessionId)) {
          logService.warn('Continue blocked: generation is owned by another tab', {
            sessionId: activeSessionId,
            stopResult,
          });
          setAppFileError(t('chatGeneratingInOtherTab'));
          return;
        }
      } else if (isGenerationLeaseHeldByOther(activeSessionId)) {
        setAppFileError(t('chatGeneratingInOtherTab'));
        return;
      }

      // IMPORTANT: Ensure UI input is cleared/reset when continuing, to avoid "prefilling" input box
      // although handleSendMessage doesn't use it, UI effects might.
      setCommandedInput(null);
      setAppFileError(null);
      setEditingMessageId(null);

      // Pass isContinueMode: true and the ID of the model message we want to extend
      await handleSendMessage({
        editingId: messageId,
        isContinueMode: true,
      });
    },
    [
      activeSessionId,
      messages,
      isLoading,
      handleStopGenerating,
      handleSendMessage,
      setCommandedInput,
      setAppFileError,
      setEditingMessageId,
      t,
    ],
  );

  const handleForkMessage = useCallback(
    (messageId: string) => {
      if (!activeSessionId) return;

      const visibleMessages = getVisibleChatMessages(messages);
      const forkIndex = visibleMessages.findIndex((message) => message.id === messageId);
      if (forkIndex === -1) return;

      const selectedMessage = visibleMessages[forkIndex];
      const sourceIndex = messages.findIndex((message) => message.id === selectedMessage.id);
      if (sourceIndex === -1) return;

      const normalizedMessages = cloneMessagesWithFreshIds(messages.slice(0, sourceIndex + 1));

      let forkedSessionId: string | null = null;

      updateAndPersistSessions((prev) => {
        const sourceSession = prev.find((session) => session.id === activeSessionId);
        if (!sourceSession) return prev;

        const forkedSession = createNewSession(
          sourceSession.settings,
          normalizedMessages,
          `${sourceSession.title} (Fork)`,
          sourceSession.groupId ?? null,
          'manual',
        );
        forkedSessionId = forkedSession.id;
        return [forkedSession, ...prev];
      });

      if (forkedSessionId) {
        logService.info('User forked chat session from message', { messageId, sessionId: activeSessionId });
        setActiveSessionId(forkedSessionId, { history: 'push' });
        userScrolledUpRef.current = false;
      }
    },
    [activeSessionId, messages, updateAndPersistSessions, setActiveSessionId, userScrolledUpRef],
  );

  return {
    handleStopGenerating,
    handleEditMessage,
    handleCancelEdit,
    handleDeleteMessage,
    handleRetryMessage,
    handleRetryLastTurn,
    handleEditLastUserMessage,
    handleContinueGeneration,
    handleForkMessage,
  };
};
