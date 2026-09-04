import type { UploadedFile } from '@/types';
import { logService } from '@/services/logService';
import { CODE_EXECUTION_TEXT_FILE_LIMIT_BYTES } from '@/utils/codeExecution';
import { isAudioMimeType, isImageMimeType, isPdfMimeType, isTextFile } from '@/utils/file/fileTypeClassification';
import { normalizeModelId } from '@/utils/model/modelId';
import type { MessageSenderTranslator } from './messageSenderTypes';

interface MessageSendPermissions {
  canAcceptAttachments: boolean;
  requiresTextPrompt: boolean;
}

interface ValidateMessageBeforeSendOptions {
  text: string;
  files: UploadedFile[];
  permissions: MessageSendPermissions;
  isContinueMode: boolean;
  isServerCodeExecutionEnabled: boolean;
  isGemini3Image: boolean;
  isTranscribeModel?: boolean;
  activeModelId: string;
  t: MessageSenderTranslator;
}

type MessageSendValidationResult = { ok: true } | { ok: false; fileError?: string };

const isHostedGemma4TextImageModel = (modelId: string): boolean => {
  const normalizedModelId = normalizeModelId(modelId);
  return normalizedModelId === 'gemma-4-31b-it' || normalizedModelId === 'gemma-4-26b-a4b-it';
};

export const validateMessageBeforeSend = ({
  text,
  files,
  permissions,
  isContinueMode,
  isServerCodeExecutionEnabled,
  isGemini3Image,
  isTranscribeModel,
  activeModelId,
  t,
}: ValidateMessageBeforeSendOptions): MessageSendValidationResult => {
  const trimmedText = text.trim();

  const hasUsableFiles = files.some(
    (file) =>
      file.uploadState === 'active' ||
      file.uploadState === 'uploading' ||
      file.uploadState === 'processing_api' ||
      file.isProcessing,
  );

  if (!trimmedText && !permissions.requiresTextPrompt && !isContinueMode && !hasUsableFiles) {
    return { ok: false };
  }

  if (permissions.requiresTextPrompt && !trimmedText) {
    return { ok: false };
  }

  if (files.some((file) => file.uploadState === 'failed' || file.uploadState === 'cancelled' || !!file.error)) {
    logService.warn('Send message blocked: failed or cancelled attachments are still selected.');
    return { ok: false, fileError: t('messageSenderFileUploadFailedBeforeSend') };
  }

  if (isServerCodeExecutionEnabled) {
    const oversizedTextFile = files.find(
      (file) => isTextFile(file) && file.size > CODE_EXECUTION_TEXT_FILE_LIMIT_BYTES,
    );

    if (oversizedTextFile) {
      logService.warn('Send message blocked: code execution text file is too large.', {
        fileName: oversizedTextFile.name,
        fileSize: oversizedTextFile.size,
      });
      return { ok: false, fileError: t('messageSenderCodeExecutionTextFileTooLarge') };
    }
  }

  if (isGemini3Image) {
    const allowsPdfReferences = normalizeModelId(activeModelId) === 'gemini-3.1-flash-image-preview';
    const hasUnsupportedAttachments = files.some((file) => {
      if (isImageMimeType(file.type)) return false;
      if (allowsPdfReferences && isPdfMimeType(file.type)) return false;
      return true;
    });

    if (hasUnsupportedAttachments) {
      logService.warn('Send message blocked: image model received unsupported attachment types.', {
        activeModelId,
        attachmentTypes: files.map((file) => file.type),
      });
      return {
        ok: false,
        fileError: allowsPdfReferences
          ? t('messageSenderImageModelSupportsImageAndPdfOnly')
          : t('messageSenderImageModelSupportsImageOnly'),
      };
    }
  }

  const imageReferenceCount = files.filter((file) => isImageMimeType(file.type)).length;
  if (isGemini3Image && imageReferenceCount > 14) {
    logService.warn('Send message blocked: Gemini 3 image model reference image limit exceeded.', {
      imageReferenceCount,
      activeModelId,
    });
    return { ok: false, fileError: t('messageSenderImageReferenceLimit') };
  }

  if (isHostedGemma4TextImageModel(activeModelId)) {
    const hasUnsupportedGemmaAttachment = files.some((file) => !isTextFile(file) && !isImageMimeType(file.type));
    if (hasUnsupportedGemmaAttachment) {
      logService.warn('Send message blocked: hosted Gemma 4 model received unsupported attachment types.', {
        activeModelId,
        attachmentTypes: files.map((file) => file.type),
      });
      return { ok: false, fileError: t('messageSenderGemma4TextImageOnly') };
    }
  }

  if (isTranscribeModel) {
    const usableFiles = files.filter(
      (file) => !file.error && file.uploadState !== 'failed' && file.uploadState !== 'cancelled',
    );
    const hasAudioAttachment = usableFiles.some((file) => isAudioMimeType(file.type));
    if (!hasAudioAttachment && !isContinueMode) {
      logService.warn('Send message blocked: transcribe model requires at least one audio attachment.');
      return { ok: false, fileError: t('messageSenderTranscribeRequiresAudio') };
    }

    const hasUnsupportedAttachment = files.some((file) => !isAudioMimeType(file.type));
    if (hasUnsupportedAttachment) {
      logService.warn('Send message blocked: transcribe model received non-audio attachment types.', {
        activeModelId,
        attachmentTypes: files.map((file) => file.type),
      });
      return { ok: false, fileError: t('messageSenderTranscribeSupportsAudioOnly') };
    }
  }

  if (!permissions.canAcceptAttachments && files.length > 0) {
    logService.warn('Send message blocked: current model does not support file attachments.');
    return { ok: false, fileError: t('messageSenderAttachmentsNotSupported') };
  }

  return { ok: true };
};
