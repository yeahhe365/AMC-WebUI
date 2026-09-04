import { logService } from '@/services/logService';
import { buildContentParts } from '@/utils/chat/builder';
import { isServerCodeExecutionMode } from '@/utils/codeExecution';
import { getModelCapabilities } from '@/utils/model/modelCapabilities';
import { resolveChatApiRoute } from '@/utils/chatApiRoute';
import type { UploadedFile } from '@/types';
import { runOptimisticMessagePipeline, type MessageLifecycleRunner } from './messagePipeline';
import { resolveStandardChatTurn } from './standardChatTurn';
import { performStandardChatApiCall } from './standardChatApiCall';
import { waitForFilesReady } from './waitForFilesReady';
import { useChatStore } from '@/stores/chatStore';
import { updateMessageInSession } from '@/utils/chat/sessionMutations';
import { ensureFilesApiReferences, formatFileReferenceErrorMessage } from './fileApiReference';
import { prepareFilesForOpenAICompatibleMode } from './openaiCompatibleFiles';
import { getTranslator } from '@/i18n/translations';
import { formatMessageSenderText } from './i18nFormat';
import type { GetStreamHandlers, StandardChatProps } from './messageSenderTypes';
import type { PreparedModelRequest } from './useModelRequestRunner';

interface SendStandardMessageParams {
  props: Omit<StandardChatProps, 'getStreamHandlers'>;
  getStreamHandlers: GetStreamHandlers;
  runMessageLifecycle: MessageLifecycleRunner;
  text: string;
  files: UploadedFile[];
  editingMessageId: string | null;
  activeModelId: string;
  isContinueMode?: boolean;
  isFastMode?: boolean;
  request: PreparedModelRequest;
}

export const sendStandardMessage = async ({
  props,
  getStreamHandlers,
  runMessageLifecycle,
  text: textToUse,
  files: filesToUse,
  editingMessageId: effectiveEditingId,
  activeModelId,
  isContinueMode = false,
  isFastMode = false,
  request,
}: SendStandardMessageParams) => {
  const {
    appSettings,
    currentChatSettings,
    messages,
    setEditingMessageId,
    aspectRatio,
    imageSize,
    imageOutputMode,
    userScrolledUpRef,
    activeSessionId,
    setActiveSessionId,
    updateAndPersistSessions,
    sessionKeyMapRef,
  } = props;
  const effectiveActiveModelId = resolveChatApiRoute(appSettings, currentChatSettings).modelId || activeModelId;
  const settingsForPersistence = { ...currentChatSettings };
  const settingsForApi = { ...currentChatSettings };

  if (isFastMode) {
    const capabilities = getModelCapabilities(effectiveActiveModelId);
    // gemini-3.7-flash / gemini-3.8-flash rejects MINIMAL with an API error — fall back to LOW there.
    const targetLevel =
      capabilities.isGemini3FlashModel && capabilities.supportsMinimalThinkingLevel ? 'MINIMAL' : 'LOW';

    settingsForApi.thinkingLevel = targetLevel;
    settingsForApi.thinkingBudget = 0;
    logService.info(`Fast Mode activated (One-off): Overriding thinking level to ${targetLevel}.`);
  }

  const { keyToUse, shouldLockKey, generationId, generationStartTime, abortController: newAbortController } = request;

  const successfullyProcessedFiles = filesToUse.filter(
    (file) => file.uploadState === 'active' && !file.error && !file.isProcessing,
  );
  const preferCodeExecutionFileInputs = isServerCodeExecutionMode(settingsForApi);

  const { contentParts: promptParts, enrichedFiles } = await buildContentParts(
    textToUse.trim(),
    successfullyProcessedFiles,
    effectiveActiveModelId,
    settingsForApi.mediaResolution,
    preferCodeExecutionFileInputs,
  );

  // Gemini 3.6+ rejects prefilled model turns (HTTP 400). Raw mode ends the payload with a
  // model role `<thinking>` prefix, so it is unsafe for those models even if listed as raw-capable.
  const modelIdLower = effectiveActiveModelId.toLowerCase();
  const bansModelTurnPrefill =
    /gemini-3\.[6-9]/.test(modelIdLower) ||
    modelIdLower.includes('gemini-3.5-flash-lite') ||
    /gemini-[4-9]/.test(modelIdLower);
  const isRawMode = Boolean(
    (settingsForApi.isRawModeEnabled ?? appSettings.isRawModeEnabled) &&
    !isContinueMode &&
    !bansModelTurnPrefill &&
    getModelCapabilities(effectiveActiveModelId).supportsRawReasoningPrefill,
  );

  const lastMessage = messages[messages.length - 1];
  const cumulativeTotalTokens = lastMessage?.cumulativeTotalTokens || 0;
  const placement =
    isContinueMode && effectiveEditingId
      ? ({ type: 'continue-model', targetMessageId: effectiveEditingId } as const)
      : ({ type: 'append-turn' } as const);

  await runOptimisticMessagePipeline({
    activeSessionId,
    appSettings,
    currentChatSettings: settingsForPersistence,
    updateAndPersistSessions,
    setActiveSessionId,
    text: textToUse.trim(),
    files: filesToUse.length ? filesToUse : undefined,
    generationId,
    generationStartTime,
    editingMessageId: effectiveEditingId,
    shouldGenerateTitle: (session) => !activeSessionId || session?.title === 'New Chat',
    shouldLockKey,
    keyToLock: keyToUse,
    abortController: newAbortController,
    errorPrefix: 'Error',
    runMessageLifecycle,
    placement,
    userMessageOptions: {
      apiParts: promptParts,
      cumulativeTotalTokens: cumulativeTotalTokens > 0 ? cumulativeTotalTokens : undefined,
    },
    modelMessageOptions: {
      content: isRawMode ? '<thinking>' : '',
    },
    afterStart: (turn) => {
      userScrolledUpRef.current = false;
      sessionKeyMapRef.current.set(turn.finalSessionId, keyToUse);
      if (effectiveEditingId) {
        setEditingMessageId(null);
      }
    },
    execute: async (turn) => {
      let effectivePromptParts = promptParts;
      let effectiveEnrichedFiles = enrichedFiles;

      if (filesToUse.some((file) => file.uploadState === 'uploading' || file.isProcessing)) {
        const waitResult = await waitForFilesReady(
          filesToUse.map((file) => file.id),
          newAbortController.signal,
        );

        const t = getTranslator(props.language);
        if (!waitResult.ok) {
          if (newAbortController.signal.aborted) {
            return undefined;
          }
          return {
            patch: {
              content: formatMessageSenderText(t('messageSenderErrorWithPrefix'), {
                prefix: t('messageSenderApiErrorPrefix'),
                message: waitResult.error || t('messageSenderFileUploadFailedBeforeSend'),
              }),
              isLoading: false,
              generationEndTime: new Date(),
            },
          };
        }

        const state = useChatStore.getState();
        const activeMessagesMatch =
          turn.finalSessionId === state.activeSessionId
            ? state.activeMessages.find((m) => m.id === turn.userMessage?.id)
            : undefined;
        const currentSession = state.savedSessions.find((s) => s.id === turn.finalSessionId);
        const currentUserMsg =
          activeMessagesMatch ?? currentSession?.messages.find((m) => m.id === turn.userMessage?.id);
        const readyFiles = currentUserMsg?.files ?? filesToUse;

        let filesReadyForSend: UploadedFile[];
        const apiRoute = resolveChatApiRoute(appSettings, settingsForApi);
        if (apiRoute.apiMode === 'third-party') {
          const openAiFilesResult = prepareFilesForOpenAICompatibleMode(readyFiles);
          if (!openAiFilesResult.ok) {
            return {
              patch: {
                content: formatMessageSenderText(t('messageSenderErrorWithPrefix'), {
                  prefix: t('messageSenderApiErrorPrefix'),
                  message: formatFileReferenceErrorMessage(openAiFilesResult, t),
                }),
                isLoading: false,
                generationEndTime: new Date(),
              },
            };
          }
          filesReadyForSend = openAiFilesResult.files;
        } else {
          const fileRefResult = await ensureFilesApiReferences({
            files: readyFiles,
            apiKey: keyToUse,
            abortSignal: newAbortController.signal,
          });
          if (!fileRefResult.ok) {
            return {
              patch: {
                content: formatMessageSenderText(t('messageSenderErrorWithPrefix'), {
                  prefix: t('messageSenderApiErrorPrefix'),
                  message: formatFileReferenceErrorMessage(fileRefResult, t),
                }),
                isLoading: false,
                generationEndTime: new Date(),
              },
            };
          }
          filesReadyForSend = fileRefResult.files;
        }

        const built = await buildContentParts(
          textToUse.trim(),
          filesReadyForSend,
          effectiveActiveModelId,
          settingsForApi.mediaResolution,
          preferCodeExecutionFileInputs,
        );
        effectivePromptParts = built.contentParts;
        effectiveEnrichedFiles = built.enrichedFiles;

        if (turn.userMessage?.id) {
          updateAndPersistSessions((prev) =>
            updateMessageInSession(prev, turn.finalSessionId, turn.userMessage!.id, (msg) => ({
              ...msg,
              files: effectiveEnrichedFiles,
              apiParts: effectivePromptParts,
            })),
          );
        }
      }

      await performStandardChatApiCall({
        appSettings,
        messages,
        updateAndPersistSessions,
        getStreamHandlers,
        aspectRatio,
        imageSize,
        imageOutputMode,
        resolveTurn: resolveStandardChatTurn,
        finalSessionId: turn.finalSessionId,
        generationId,
        generationStartTime,
        keyToUse,
        activeModelId: effectiveActiveModelId,
        promptParts: effectivePromptParts,
        effectiveEditingId,
        isContinueMode,
        isRawMode,
        sessionToUpdate: settingsForApi,
        newAbortController,
        textToUse,
        enrichedFiles: effectiveEnrichedFiles,
      });

      return undefined;
    },
  });
};
