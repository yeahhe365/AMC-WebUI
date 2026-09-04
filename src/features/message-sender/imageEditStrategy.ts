import type { Part } from '@google/genai';
import { getErrorMessage } from '@/utils/errorMessage';
import {
  type AppSettings,
  type ChatMessage,
  type ChatSettings as IndividualChatSettings,
  type UploadedFile,
  type ImageOutputMode,
} from '@/types';
import { editImageApi } from '@/services/api/generation/imageEditApi';
import { logService } from '@/services/logService';
import {
  buildContentParts,
  createChatHistoryForApi,
  GEMINI_IMAGE_HISTORY_REHYDRATION_ERROR,
} from '@/utils/chat/builder';
import { createUploadedFileFromBase64 } from '@/utils/chat/parsing';
import { shouldStripThinkingFromContext } from '@/utils/model/modelCapabilities';
import { isImageMimeType } from '@/utils/file/fileTypeClassification';
import { appendApiPart } from '@/features/chat-streaming/messageStreamParts';
import { formatMessageSenderText } from './i18nFormat';
import { runOptimisticMessagePipeline, type MessageLifecycleRunner } from './messagePipeline';
import type { MessageSenderTranslator, SessionsUpdater } from './messageSenderTypes';

const stripGeneratedInlinePayload = (part: Part): Part => {
  const inlineData = (part as Part & { inlineData?: { mimeType?: string; data?: string } }).inlineData;
  if (!inlineData?.data) return part;

  return {
    ...part,
    inlineData: {
      ...inlineData,
      data: '',
    },
  } as Part;
};

const translateImageHistoryError = (error: unknown, t: MessageSenderTranslator): unknown => {
  if (error instanceof Error && error.message === GEMINI_IMAGE_HISTORY_REHYDRATION_ERROR) {
    return new Error(t('messageSenderImageEditHistoryMissingGeneratedImage'));
  }

  return error;
};

interface SendImageEditMessageParams {
  keyToUse: string;
  activeSessionId: string | null;
  messages: ChatMessage[];
  generationId: string;
  abortController: AbortController;
  appSettings: AppSettings;
  currentChatSettings: IndividualChatSettings;
  text: string;
  files: UploadedFile[];
  editingMessageId: string | null;
  aspectRatio: string;
  imageSize: string | undefined;
  imageOutputMode: ImageOutputMode;
  shouldLockKey?: boolean;
  updateAndPersistSessions: SessionsUpdater;
  setActiveSessionId: (id: string | null) => void;
  runMessageLifecycle: MessageLifecycleRunner;
  t: MessageSenderTranslator;
}

export const sendImageEditMessage = async ({
  keyToUse,
  activeSessionId,
  messages,
  generationId,
  abortController,
  appSettings,
  currentChatSettings,
  text,
  files,
  editingMessageId,
  aspectRatio,
  imageSize,
  imageOutputMode,
  shouldLockKey,
  updateAndPersistSessions,
  setActiveSessionId,
  runMessageLifecycle,
  t,
}: SendImageEditMessageParams) => {
  const imageFiles = files.filter((file) => isImageMimeType(file.type));
  const { contentParts: promptParts } = await buildContentParts(text, imageFiles, currentChatSettings.modelId);

  await runOptimisticMessagePipeline({
    activeSessionId,
    appSettings,
    currentChatSettings,
    updateAndPersistSessions,
    setActiveSessionId,
    text,
    files,
    generationId,
    editingMessageId,
    shouldGenerateTitle: !activeSessionId || (!!editingMessageId && messages.length === 0),
    shouldLockKey,
    keyToLock: keyToUse,
    abortController,
    errorPrefix: t('messageSenderImageEditErrorPrefix'),
    runMessageLifecycle,
    userMessageOptions: {
      apiParts: promptParts,
    },
    execute: async () => {
      const alwaysKeepThinking =
        currentChatSettings.alwaysKeepThinkingInContext ?? appSettings.alwaysKeepThinkingInContext ?? false;
      const shouldStripThinking = shouldStripThinkingFromContext(
        currentChatSettings.modelId,
        currentChatSettings.hideThinkingInContext ?? appSettings.hideThinkingInContext,
        alwaysKeepThinking,
      );

      let historyMessages = messages;
      if (editingMessageId) {
        const index = messages.findIndex((message) => message.id === editingMessageId);
        if (index !== -1) historyMessages = messages.slice(0, index);
      }

      let historyForApi: Awaited<ReturnType<typeof createChatHistoryForApi>>;
      try {
        historyForApi = await createChatHistoryForApi(
          historyMessages,
          shouldStripThinking,
          currentChatSettings.modelId,
          false,
          alwaysKeepThinking,
        );
      } catch (error) {
        throw translateImageHistoryError(error, t);
      }

      const callApi = () =>
        editImageApi(
          keyToUse,
          currentChatSettings.modelId,
          historyForApi,
          promptParts,
          abortController.signal,
          aspectRatio,
          imageSize,
          {
            systemInstruction: currentChatSettings.systemInstruction,
            showThoughts: currentChatSettings.showThoughts,
            thinkingBudget: currentChatSettings.thinkingBudget,
            thinkingLevel: currentChatSettings.thinkingLevel,
            isGoogleSearchEnabled: !!currentChatSettings.isGoogleSearchEnabled,
            isDeepSearchEnabled: !!currentChatSettings.isDeepSearchEnabled,
            safetySettings: currentChatSettings.safetySettings,
            imageOutputMode,
          },
        );

      const apiCalls = appSettings.generateQuadImages ? [callApi(), callApi(), callApi(), callApi()] : [callApi()];
      const results = await Promise.allSettled(apiCalls);

      if (abortController.signal.aborted) throw new Error('aborted');

      let combinedText = '';
      const combinedFiles: UploadedFile[] = [];
      let combinedApiParts: Part[] = [];
      let successfulImageCount = 0;

      results.forEach((result, index) => {
        const prefix =
          results.length > 1
            ? formatMessageSenderText(t('messageSenderImageEditResultPrefix'), { index: index + 1 })
            : '';

        if (result.status === 'fulfilled') {
          const parts: Part[] = result.value;
          combinedApiParts = parts.reduce<Part[]>(
            (acc, part) => appendApiPart(acc, stripGeneratedInlinePayload(part)),
            combinedApiParts,
          );
          let hasImagePart = false;
          let textPartContent = '';

          parts.forEach((part) => {
            if (part.text) {
              textPartContent += part.text;
            } else if (part.inlineData) {
              const { mimeType, data } = part.inlineData;
              if (mimeType && data) {
                hasImagePart = true;
                successfulImageCount++;
                const newFile = createUploadedFileFromBase64(data, mimeType, `edited-image-${index + 1}`);
                combinedFiles.push(newFile);
              }
            }
          });

          if (textPartContent.trim()) {
            combinedText += `${prefix}${textPartContent.trim()}\n\n`;
          } else if (!hasImagePart && results.length > 1) {
            combinedText += `${prefix}${t('messageSenderImageEditNoImageGenerated')}\n\n`;
          }
        } else {
          logService.error(`Image edit API call failed for index ${index}`, { error: result.reason });
          combinedText += `${prefix}${formatMessageSenderText(t('messageSenderImageEditRequestFailed'), {
            message: getErrorMessage(result.reason),
          })}\n\n`;
        }
      });

      if (appSettings.generateQuadImages && successfulImageCount < 4 && successfulImageCount > 0) {
        const failureReason = combinedText.toLowerCase().includes('block')
          ? t('messageSenderImageEditSafetyFailure')
          : t('messageSenderImageEditPartialFailure');
        combinedText += `\n${formatMessageSenderText(t('messageSenderImageEditPartialNote'), {
          count: successfulImageCount,
          reason: failureReason,
        })}`;
      } else if (successfulImageCount === 0 && combinedText.trim() === '') {
        combinedText = t('messageSenderImageEditEmptyFailure');
      }

      return {
        patch: {
          isLoading: false,
          content: combinedText.trim(),
          files: combinedFiles,
          apiParts: combinedApiParts,
          generationEndTime: new Date(),
        },
        feedback: {
          notification: {
            title: t('messageSenderImageEditReadyTitle'),
            body: t('messageSenderImageEditReadyBody'),
          },
        },
      };
    },
  });
};
