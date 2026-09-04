import { type MutableRefObject, useCallback, useMemo } from 'react';
import type { SupportedLanguage } from '@/i18n/languageRegistry';
import {
  type AppSettings,
  type ChatMessage,
  type UploadedFile,
  type ChatSettings as IndividualChatSettings,
  type ImageOutputMode,
} from '@/types';
import { useI18n } from '@/contexts/I18nContext';
import { logService } from '@/services/logService';
import { formatApiKeyErrorMessage } from '@/utils/apiKeySelection';
import { useChatStore } from '@/stores/chatStore';
import { isServerCodeExecutionMode } from '@/utils/codeExecution';
import { getModelCapabilities } from '@/utils/model/modelCapabilities';
import { resolveChatApiRoute } from '@/utils/chatApiRoute';
import { updateSessionById } from '@/utils/chat/sessionMutations';
import { sessionHasGeminiFilesApiReferences, usesGeminiFilesApiReference } from '@/utils/chat/geminiFilesApi';

import {
  ensureFilesApiReferences,
  ensureHistoryFilesApiReferences,
  formatFileReferenceErrorMessage,
} from './fileApiReference';
import { sendImageEditMessage } from './imageEditStrategy';
import { prepareFilesForOpenAICompatibleMode, prepareHistoryForOpenAICompatibleMode } from './openaiCompatibleFiles';
import { validateMessageBeforeSend } from './sendMessageValidation';
import { createSenderStoreActions } from './senderStoreActions';
import { sendStandardMessage } from './standardChatStrategy';
import { sendTranscribeMessage } from './transcribeStrategy';
import { sendTtsMessage } from './ttsStrategy';
import { useChatStreamHandler } from './useChatStreamHandler';
import { useMessageLifecycle } from './useMessageLifecycle';
import { useModelRequestRunner } from './useModelRequestRunner';
import { useStreamResume } from './useStreamResume';

interface MessageSenderProps {
  appSettings: AppSettings;
  currentChatSettings: IndividualChatSettings;
  messages: ChatMessage[];
  selectedFiles: UploadedFile[];
  setSelectedFiles: (files: UploadedFile[] | ((prev: UploadedFile[]) => UploadedFile[])) => void;
  editingMessageId: string | null;
  setEditingMessageId: (id: string | null) => void;
  setAppFileError: (error: string | null) => void;
  aspectRatio: string;
  imageSize?: string;
  imageOutputMode: ImageOutputMode;
  userScrolledUpRef: MutableRefObject<boolean>;
  activeSessionId: string | null;
  sessionKeyMapRef: MutableRefObject<Map<string, string>>;
  language: SupportedLanguage;
}

export const useMessageSender = (props: MessageSenderProps) => {
  const { t } = useI18n();
  const {
    appSettings,
    currentChatSettings,
    messages,
    selectedFiles,
    setSelectedFiles,
    editingMessageId,
    setEditingMessageId,
    setAppFileError,
    aspectRatio,
    imageSize,
    imageOutputMode,
    userScrolledUpRef,
    activeSessionId,
    sessionKeyMapRef,
    language,
  } = props;
  const senderStoreActions = useMemo(() => createSenderStoreActions(), []);
  const { updateAndPersistSessions, setActiveSessionId, setSessionLoading, activeJobs } = senderStoreActions;

  const translateApiKeyError = useCallback((error: string) => formatApiKeyErrorMessage(error, t), [t]);

  const { getStreamHandlers } = useChatStreamHandler({
    appSettings,
    updateAndPersistSessions,
    setSessionLoading,
    activeJobs,
  });

  const { resumePendingStream } = useStreamResume({
    appSettings,
    getStreamHandlers,
    activeJobs,
    sessionKeyMapRef,
    setSessionLoading,
  });

  const { runMessageLifecycle } = useMessageLifecycle({
    updateAndPersistSessions,
    setSessionLoading,
    activeJobs,
  });

  const { prepareModelRequest } = useModelRequestRunner({
    appSettings,
    currentChatSettings,
    updateAndPersistSessions,
    setActiveSessionId,
    translateApiKeyError,
  });

  const handleSendMessage = useCallback(
    async (overrideOptions?: {
      text?: string;
      files?: UploadedFile[];
      editingId?: string;
      isContinueMode?: boolean;
      isFastMode?: boolean;
      settingsOverride?: IndividualChatSettings;
    }) => {
      const textToUse = overrideOptions?.text ?? '';
      // Prefer explicitly-passed files, then the live store value when the
      // closure's selectedFiles has gone stale. In the pending-submission flush
      // path handleSendMessage can run before React commits the new files, so
      // the closed-over selectedFiles may still show isProcessing: true; reading
      // the store here lets a send that would otherwise be blocked (and its text
      // silently dropped) proceed with the real current files.
      const storeSelectedFiles = useChatStore.getState().selectedFiles;
      const filesToUse =
        overrideOptions?.files ?? (selectedFiles === storeSelectedFiles ? selectedFiles : storeSelectedFiles);
      const effectiveEditingId = overrideOptions?.editingId ?? editingMessageId;
      const isContinueMode = overrideOptions?.isContinueMode ?? false;
      const isFastMode = overrideOptions?.isFastMode ?? false;

      const sessionToUpdate = overrideOptions?.settingsOverride ?? currentChatSettings;
      const apiRoute = resolveChatApiRoute(appSettings, sessionToUpdate);
      const activeModelId = apiRoute.modelId;
      const capabilities = getModelCapabilities(activeModelId);
      const isTtsModel = capabilities.isTtsModel;
      const isTranscribeModel = capabilities.isTranscribeModel;
      const isGemini3Image = capabilities.isGemini3ImageModel;
      const permissions = capabilities.permissions ?? {
        canAcceptAttachments: !isTtsModel && !capabilities.isNativeAudioModel,
        requiresTextPrompt: isTtsModel || isGemini3Image,
      };

      logService.info(`Sending message with model ${activeModelId}`, {
        textLength: textToUse.length,
        fileCount: filesToUse.length,
        editingId: effectiveEditingId,
        sessionId: activeSessionId,
        isContinueMode,
        isFastMode,
      });

      const isServerCodeExecutionEnabled = isServerCodeExecutionMode(sessionToUpdate);
      const validation = validateMessageBeforeSend({
        text: textToUse,
        files: filesToUse,
        permissions,
        isContinueMode,
        isServerCodeExecutionEnabled,
        isGemini3Image,
        isTranscribeModel,
        activeModelId,
        t,
      });
      if (!validation.ok) {
        if (validation.fileError !== undefined) {
          setAppFileError(validation.fileError);
        }
        return;
      }

      setAppFileError(null);

      const continueTargetMessage =
        isContinueMode && effectiveEditingId ? messages.find((message) => message.id === effectiveEditingId) : null;
      const request = prepareModelRequest({
        activeModelId,
        apiRoute,
        files: filesToUse,
        historyMessages: messages,
        keySettings: sessionToUpdate,
        generationId: continueTargetMessage ? (effectiveEditingId ?? undefined) : undefined,
        // Continue reuses the target's generation id so stream state stays
        // aligned, but the turn starts fresh: a new generationStartTime keeps
        // timing metrics (TTFT, thinking time, elapsed time) measured from this
        // run, not from when the target message was originally generated.
        generationStartTime: undefined,
        messages: {
          noModelSelected: t('messageSenderNoModelSelected'),
          noModelTitle: t('messageSenderErrorSessionTitle'),
          apiKeyTitle: t('messageSenderApiKeyErrorSessionTitle'),
        },
      });

      if (!request.ok) {
        return;
      }
      const { keyToUse, shouldLockKey, generationId, abortController: newAbortController } = request;
      let filesReadyForSend = filesToUse;
      const isAnyFileUploading = filesToUse.some((file) => file.uploadState === 'uploading' || file.isProcessing);

      if (!isAnyFileUploading && filesToUse.length > 0) {
        const fileReferenceResult =
          apiRoute.apiMode === 'third-party'
            ? prepareFilesForOpenAICompatibleMode(filesToUse)
            : await ensureFilesApiReferences({
                files: filesToUse,
                apiKey: keyToUse,
                abortSignal: newAbortController.signal,
                onFileUpdate: (fileId, patch) => {
                  if (overrideOptions?.files !== undefined) {
                    return;
                  }

                  setSelectedFiles((prev) => prev.map((file) => (file.id === fileId ? { ...file, ...patch } : file)));
                },
              });

        if (!fileReferenceResult.ok) {
          setAppFileError(formatFileReferenceErrorMessage(fileReferenceResult, t));
          return;
        }
        filesReadyForSend = fileReferenceResult.files;
      }
      let messagesForTurn = messages;

      const persistHistoryIfChanged = (nextMessages: ChatMessage[], changed: boolean) => {
        if (!changed || !activeSessionId) {
          return;
        }

        const refreshedById = new Map(nextMessages.map((message) => [message.id, message]));
        const keepLockedApiKey =
          sessionHasGeminiFilesApiReferences(nextMessages) ||
          filesReadyForSend.some((file) => usesGeminiFilesApiReference(file));
        updateAndPersistSessions((prev) =>
          updateSessionById(prev, activeSessionId, (session) => ({
            ...session,
            messages: session.messages.map((message) => refreshedById.get(message.id) ?? message),
            settings: keepLockedApiKey ? session.settings : { ...session.settings, lockedApiKey: null },
          })),
        );
      };

      if (apiRoute.apiMode === 'third-party' && !isTtsModel) {
        const historyReferenceResult = await prepareHistoryForOpenAICompatibleMode({
          messages,
          translate: t,
        });
        messagesForTurn = historyReferenceResult.messages;
        persistHistoryIfChanged(historyReferenceResult.messages, historyReferenceResult.changed);
      } else if (apiRoute.apiMode !== 'third-party' && !isTtsModel) {
        const historyReferenceResult = await ensureHistoryFilesApiReferences({
          messages,
          apiKey: keyToUse,
          abortSignal: newAbortController.signal,
          translate: t,
        });
        if (!historyReferenceResult.ok) {
          setAppFileError(formatFileReferenceErrorMessage(historyReferenceResult, t));
          return;
        }
        messagesForTurn = historyReferenceResult.messages;
        persistHistoryIfChanged(historyReferenceResult.messages, historyReferenceResult.changed);
      }

      if (appSettings.isAutoScrollOnSendEnabled) {
        userScrolledUpRef.current = false;
      }
      if (overrideOptions?.files === undefined) setSelectedFiles([]);

      if (isTtsModel) {
        await sendTtsMessage({
          keyToUse,
          activeSessionId,
          generationId,
          abortController: newAbortController,
          appSettings,
          currentChatSettings: sessionToUpdate,
          text: textToUse.trim(),
          shouldLockKey,
          updateAndPersistSessions,
          setActiveSessionId,
          runMessageLifecycle,
          t,
        });
        if (editingMessageId) setEditingMessageId(null);
        return;
      }

      if (isTranscribeModel) {
        await sendTranscribeMessage({
          keyToUse,
          activeSessionId,
          generationId,
          abortController: newAbortController,
          appSettings,
          currentChatSettings: sessionToUpdate,
          text: textToUse.trim(),
          files: filesReadyForSend,
          shouldLockKey,
          updateAndPersistSessions,
          setActiveSessionId,
          runMessageLifecycle,
          t,
        });
        if (editingMessageId) setEditingMessageId(null);
        return;
      }

      if (isGemini3Image && appSettings.generateQuadImages) {
        const editIndex = effectiveEditingId
          ? messagesForTurn.findIndex((message) => message.id === effectiveEditingId)
          : -1;
        const historyMessages = editIndex !== -1 ? messagesForTurn.slice(0, editIndex) : messagesForTurn;
        await sendImageEditMessage({
          keyToUse,
          activeSessionId,
          messages: historyMessages,
          generationId,
          abortController: newAbortController,
          appSettings,
          currentChatSettings: sessionToUpdate,
          text: textToUse.trim(),
          files: filesReadyForSend,
          editingMessageId: effectiveEditingId,
          aspectRatio,
          imageSize,
          imageOutputMode,
          shouldLockKey,
          updateAndPersistSessions,
          setActiveSessionId,
          runMessageLifecycle,
          t,
        });
        if (editingMessageId) setEditingMessageId(null);
        return;
      }

      await sendStandardMessage({
        props: {
          appSettings,
          currentChatSettings: sessionToUpdate,
          messages: messagesForTurn,
          setEditingMessageId,
          setAppFileError,
          aspectRatio,
          imageSize,
          imageOutputMode,
          userScrolledUpRef,
          activeSessionId,
          sessionKeyMapRef,
          language,
          ...senderStoreActions,
        },
        getStreamHandlers,
        runMessageLifecycle,
        text: textToUse,
        files: filesReadyForSend,
        editingMessageId: effectiveEditingId,
        activeModelId,
        isContinueMode,
        isFastMode,
        request,
      });
    },
    [
      appSettings,
      currentChatSettings,
      messages,
      selectedFiles,
      setSelectedFiles,
      editingMessageId,
      setEditingMessageId,
      setAppFileError,
      aspectRatio,
      imageSize,
      imageOutputMode,
      userScrolledUpRef,
      activeSessionId,
      sessionKeyMapRef,
      language,
      updateAndPersistSessions,
      setActiveSessionId,
      getStreamHandlers,
      runMessageLifecycle,
      senderStoreActions,
      prepareModelRequest,
      t,
    ],
  );

  return { handleSendMessage, resumePendingStream };
};
