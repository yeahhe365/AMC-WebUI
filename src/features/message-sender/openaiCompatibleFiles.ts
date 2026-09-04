import type { Part } from '@google/genai';
import type { ChatMessage, UploadedFile } from '@/types';
import { blobToBase64 } from '@/utils/file/fileEncoding';
import { isAudioMimeType, isImageMimeType, isTextFile } from '@/utils/file/fileTypeClassification';
import {
  formatHistoryFileApiUnavailablePartText,
  getGeminiFilesApiName,
  getGeminiFilesApiNameFromUri,
  usesGeminiFilesApiReference,
} from '@/utils/chat/geminiFilesApi';
import { formatMessageSenderText } from './i18nFormat';
import { createFileReferenceUnavailablePatch } from '../../../shared/fileReferencePatch';

type OpenAICompatibleFilesResult =
  | { ok: true; files: UploadedFile[] }
  | {
      ok: false;
      files: UploadedFile[];
      errorKey: 'messageSenderOpenaiCompatibleFileReferenceUnsupported';
      fileName: string;
    };

interface PrepareHistoryForOpenAICompatibleModeParams {
  messages: ChatMessage[];
  translate: (key: string) => string;
}

const canSendInlineToOpenAICompatibleApi = (file: UploadedFile): boolean =>
  isImageMimeType(file.type) || isAudioMimeType(file.type) || isTextFile(file);

const hasLocalFileBackup = (file: UploadedFile): boolean => typeof Blob !== 'undefined' && file.rawFile instanceof Blob;

const canInlineHistoricalFile = (file: UploadedFile): boolean =>
  hasLocalFileBackup(file) && canSendInlineToOpenAICompatibleApi(file);

export const prepareFilesForOpenAICompatibleMode = (files: UploadedFile[]): OpenAICompatibleFilesResult => {
  const preparedFiles: UploadedFile[] = [];

  for (const file of files) {
    if (!usesGeminiFilesApiReference(file)) {
      preparedFiles.push(file);
      continue;
    }

    if (!hasLocalFileBackup(file) || !canSendInlineToOpenAICompatibleApi(file)) {
      return {
        ok: false,
        files,
        errorKey: 'messageSenderOpenaiCompatibleFileReferenceUnsupported',
        fileName: file.name,
      };
    }

    preparedFiles.push({
      ...file,
      fileUri: undefined,
      fileApiName: undefined,
      fileApiExpirationTime: undefined,
      transferStrategy: 'inline',
    });
  }

  return { ok: true, files: preparedFiles };
};

const omitHistoricalFile = (file: UploadedFile, translate: (key: string) => string): UploadedFile => ({
  ...file,
  ...createFileReferenceUnavailablePatch(
    formatMessageSenderText(translate('messageSenderHistoryFileReferenceUnavailable'), { filename: file.name }),
  ),
});

const inlineHistoricalFile = (file: UploadedFile): UploadedFile => ({
  ...file,
  fileUri: undefined,
  fileApiName: undefined,
  fileApiExpirationTime: undefined,
  transferStrategy: 'inline',
});

const findHistoricalFileForUri = (files: UploadedFile[] | undefined, fileUri?: string): UploadedFile | undefined => {
  const fileApiName = getGeminiFilesApiNameFromUri(fileUri);
  if (!fileApiName) {
    return undefined;
  }

  return files?.find((file) => getGeminiFilesApiName(file) === fileApiName);
};

export const prepareHistoryForOpenAICompatibleMode = async ({
  messages,
  translate,
}: PrepareHistoryForOpenAICompatibleModeParams): Promise<{ messages: ChatMessage[]; changed: boolean }> => {
  let changed = false;
  const nextMessages = await Promise.all(
    messages.map(async (message) => {
      const nextFiles = message.files
        ? message.files.map((file) => {
            if (!usesGeminiFilesApiReference(file)) {
              return file;
            }
            changed = true;
            return canInlineHistoricalFile(file) ? inlineHistoricalFile(file) : omitHistoricalFile(file, translate);
          })
        : message.files;

      if (!message.apiParts?.length) {
        if (nextFiles === message.files) {
          return message;
        }
        return { ...message, files: nextFiles };
      }

      const nextApiParts: Part[] = [];
      for (const part of message.apiParts) {
        const fileUri = part.fileData?.fileUri;
        if (!getGeminiFilesApiNameFromUri(fileUri)) {
          nextApiParts.push(part);
          continue;
        }

        changed = true;
        const matchingFile = findHistoricalFileForUri(message.files, fileUri);
        if (matchingFile && canInlineHistoricalFile(matchingFile) && matchingFile.rawFile instanceof Blob) {
          nextApiParts.push({
            inlineData: {
              mimeType: matchingFile.type || part.fileData?.mimeType || 'application/octet-stream',
              data: await blobToBase64(matchingFile.rawFile),
            },
          });
          continue;
        }

        nextApiParts.push({
          text: formatHistoryFileApiUnavailablePartText(
            matchingFile?.name ?? getGeminiFilesApiNameFromUri(fileUri) ?? 'file',
          ),
        });
      }

      return {
        ...message,
        files: nextFiles,
        apiParts: nextApiParts,
      };
    }),
  );

  return { messages: changed ? nextMessages : messages, changed };
};
