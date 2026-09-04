import type { File as GeminiFile, Part } from '@google/genai';
import { getErrorMessage } from '@/utils/errorMessage';
import type { ChatMessage, UploadedFile } from '@/types';
import { getFileMetadataApi, uploadFileApi } from '@/services/api/fileApi';
import { getUploadLifecycleForGeminiState } from '@/utils/file-upload/fileUploadPolicy';
import { logService } from '@/services/logService';
import {
  formatGeminiFileApiProcessingError,
  formatHistoryFileApiUnavailablePartText,
  getApiKeyFingerprint,
  getGeminiFilesApiName,
  getGeminiFilesApiNameFromUri,
  isFileApiKeyMismatch,
  isGeminiFilesApiReferenceStillValid,
  sessionHasGeminiFilesApiReferences,
  shouldRefreshGeminiFilesApiReferenceFromExpiration,
  toFileApiExpirationTime,
  usesGeminiFilesApiReference,
} from '@/utils/chat/geminiFilesApi';
import { formatMessageSenderText } from './i18nFormat';
import { createFileReferenceUnavailablePatch } from '../../../shared/fileReferencePatch';

export { formatHistoryFileApiUnavailablePartText, sessionHasGeminiFilesApiReferences };

type FileApiReferenceErrorKey =
  | 'messageSenderWaitForFiles'
  | 'messageSenderFileReferenceExpiredNoBackup'
  | 'messageSenderFileReferenceRefreshFailed'
  | 'messageSenderFileReferenceVerifyFailed';

type FilePatch = Partial<UploadedFile>;

interface EnsureFilesApiReferencesParams {
  files: UploadedFile[];
  apiKey: string;
  abortSignal: AbortSignal;
  onFileUpdate?: (fileId: string, patch: FilePatch) => void;
}

type EnsureFilesApiReferencesResult =
  | { ok: true; files: UploadedFile[] }
  | {
      ok: false;
      files: UploadedFile[];
      errorKey: FileApiReferenceErrorKey;
      fileName?: string;
    };

interface EnsureHistoryFilesApiReferencesParams {
  messages: ChatMessage[];
  apiKey: string;
  abortSignal: AbortSignal;
  translate: (key: string) => string;
}

type EnsureHistoryFilesApiReferencesResult =
  | { ok: true; messages: ChatMessage[]; changed: boolean }
  | {
      ok: false;
      messages: ChatMessage[];
      errorKey: FileApiReferenceErrorKey;
      fileName?: string;
    };

interface FileReferenceErrorResult {
  ok: false;
  errorKey: string;
  fileName?: string;
}

interface HistoryFileGroup {
  fileApiName: string;
  representative: UploadedFile;
  oldUris: Set<string>;
}

type ResolvedRemoteFile =
  | { kind: 'active'; patch: FilePatch }
  | { kind: 'wait'; patch: FilePatch; fileName: string }
  | { kind: 'uploaded'; patch: FilePatch }
  | { kind: 'needs-backup' }
  | { kind: 'refresh-failed'; patch: FilePatch; fileName: string }
  | { kind: 'verify-failed'; fileName: string };

const toUploadableFile = (file: UploadedFile): File | null => {
  if (file.rawFile instanceof File) {
    return file.rawFile;
  }

  if (file.rawFile instanceof Blob) {
    return new File([file.rawFile], file.name, { type: file.type || file.rawFile.type });
  }

  return null;
};

const applyFilePatch = (
  files: UploadedFile[],
  fileId: string,
  patch: FilePatch,
  onFileUpdate?: (fileId: string, patch: FilePatch) => void,
) => {
  onFileUpdate?.(fileId, patch);
  return files.map((file) => (file.id === fileId ? { ...file, ...patch } : file));
};

const buildActivePatchFromMetadata = (metadata: GeminiFile, fallbackFile: UploadedFile, apiKey: string): FilePatch =>
  ({
    fileUri: metadata.uri ?? fallbackFile.fileUri,
    fileApiName: metadata.name ?? fallbackFile.fileApiName,
    uploadState: 'active',
    isProcessing: false,
    error: undefined,
    fileApiExpirationTime: toFileApiExpirationTime((metadata as { expirationTime?: unknown }).expirationTime),
    fileApiKeyFingerprint: getApiKeyFingerprint(apiKey),
  }) as FilePatch;

const FILES_API_ACCESS_DENIED_PATTERN = /403|PERMISSION_DENIED|permission/i;

const isFilesApiAccessDeniedError = (error: unknown): boolean => {
  const message = error instanceof Error ? error.message : String(error ?? '');
  return FILES_API_ACCESS_DENIED_PATTERN.test(message);
};

const createSyntheticHistoryFile = (fileApiName: string): UploadedFile => ({
  id: fileApiName,
  name: fileApiName,
  type: 'application/octet-stream',
  size: 0,
  fileApiName,
  uploadState: 'active',
  transferStrategy: 'remote-file-id',
});

const pickRepresentative = (current: UploadedFile, candidate: UploadedFile): UploadedFile => {
  if (toUploadableFile(current)) {
    return current;
  }
  if (toUploadableFile(candidate) || current.id === current.fileApiName) {
    return candidate;
  }
  return current;
};

const collectHistoryFileGroups = (messages: ChatMessage[]): HistoryFileGroup[] => {
  const groups = new Map<string, HistoryFileGroup>();

  const addUri = (group: HistoryFileGroup, uri?: string) => {
    if (uri) {
      group.oldUris.add(uri);
    }
  };

  const ensureGroup = (fileApiName: string, file?: UploadedFile): HistoryFileGroup => {
    const existing = groups.get(fileApiName);
    if (!existing) {
      const group: HistoryFileGroup = {
        fileApiName,
        representative: file ?? createSyntheticHistoryFile(fileApiName),
        oldUris: new Set([fileApiName]),
      };
      groups.set(fileApiName, group);
      return group;
    }

    if (file) {
      existing.representative = pickRepresentative(existing.representative, file);
    }

    return existing;
  };

  for (const message of messages) {
    for (const file of message.files ?? []) {
      if (!usesGeminiFilesApiReference(file)) {
        continue;
      }
      const fileApiName = getGeminiFilesApiName(file);
      if (!fileApiName) {
        continue;
      }
      const group = ensureGroup(fileApiName, file);
      addUri(group, file.fileUri);
      addUri(group, file.fileApiName);
    }

    for (const part of message.apiParts ?? []) {
      const fileUri = part.fileData?.fileUri;
      const fileApiName = getGeminiFilesApiNameFromUri(fileUri);
      if (!fileApiName) {
        continue;
      }
      const group = ensureGroup(fileApiName);
      addUri(group, fileUri);
    }
  }

  return [...groups.values()];
};

const fileBelongsToGroup = (file: UploadedFile, group: HistoryFileGroup): boolean =>
  getGeminiFilesApiName(file) === group.fileApiName;

const partBelongsToGroup = (part: Part, group: HistoryFileGroup): boolean => {
  const fileUri = part.fileData?.fileUri;
  if (!fileUri) {
    return false;
  }
  return group.oldUris.has(fileUri) || getGeminiFilesApiNameFromUri(fileUri) === group.fileApiName;
};

const mapMatchingMessages = (
  messages: ChatMessage[],
  group: HistoryFileGroup,
  updateMessage: (message: ChatMessage) => ChatMessage,
): { messages: ChatMessage[]; changed: boolean } => {
  let changed = false;
  const nextMessages = messages.map((message) => {
    const hasMatchingFile = message.files?.some((file) => fileBelongsToGroup(file, group)) ?? false;
    const hasMatchingPart = message.apiParts?.some((part) => partBelongsToGroup(part, group)) ?? false;
    if (!hasMatchingFile && !hasMatchingPart) {
      return message;
    }
    const nextMessage = updateMessage(message);
    if (nextMessage === message) {
      return message;
    }
    changed = true;
    return nextMessage;
  });
  return { messages: nextMessages, changed };
};

const filePatchChangesFile = (file: UploadedFile, patch: FilePatch): boolean =>
  (
    [
      'fileUri',
      'fileApiName',
      'uploadState',
      'fileApiExpirationTime',
      'fileApiKeyFingerprint',
      'error',
      'transferStrategy',
      'omittedFromApiHistory',
    ] as const
  ).some((key) => key in patch && file[key] !== patch[key]);

const applyHistoryFilePatch = (
  messages: ChatMessage[],
  group: HistoryFileGroup,
  patch: FilePatch,
): { messages: ChatMessage[]; changed: boolean } =>
  mapMatchingMessages(messages, group, (message) => {
    const nextFiles = message.files?.map((file) => (fileBelongsToGroup(file, group) ? { ...file, ...patch } : file));
    const nextApiParts = message.apiParts?.map((part) =>
      partBelongsToGroup(part, group) && part.fileData
        ? {
            ...part,
            fileData: {
              ...part.fileData,
              fileUri: patch.fileUri ?? part.fileData.fileUri,
            },
          }
        : part,
    );
    const filesChanged = Boolean(
      message.files?.some((file) => fileBelongsToGroup(file, group) && filePatchChangesFile(file, patch)),
    );
    const partsChanged = Boolean(
      message.apiParts?.some(
        (part) =>
          partBelongsToGroup(part, group) && part.fileData?.fileUri !== (patch.fileUri ?? part.fileData?.fileUri),
      ),
    );
    if (!filesChanged && !partsChanged) {
      return message;
    }

    return {
      ...message,
      files: nextFiles,
      apiParts: nextApiParts,
    };
  });

const degradeHistoryFile = (
  messages: ChatMessage[],
  group: HistoryFileGroup,
  translate: (key: string) => string,
): { messages: ChatMessage[]; changed: boolean } => {
  const fileName = group.representative.name;
  const note = formatHistoryFileApiUnavailablePartText(fileName);
  const patch: FilePatch = createFileReferenceUnavailablePatch(
    formatMessageSenderText(translate('messageSenderHistoryFileReferenceUnavailable'), { filename: fileName }),
  );

  return mapMatchingMessages(messages, group, (message) => ({
    ...message,
    files: message.files?.map((file) => (fileBelongsToGroup(file, group) ? { ...file, ...patch } : file)),
    apiParts: message.apiParts?.map((part) => (partBelongsToGroup(part, group) ? { text: note } : part)),
  }));
};

const resolveRemoteFileReference = async (
  file: UploadedFile,
  apiKey: string,
  abortSignal: AbortSignal,
): Promise<ResolvedRemoteFile> => {
  const fileApiName = getGeminiFilesApiName(file);
  if (!fileApiName) {
    return { kind: 'active', patch: {} };
  }

  const uploadableFile = toUploadableFile(file);
  // Files API access is scoped to the uploading key's project: once the key
  // changed, a local backup must be re-uploaded right away — metadata probing
  // would only yield 403. Without a backup we still probe, since keys from the
  // same project remain valid.
  const keyChanged = isFileApiKeyMismatch(file, apiKey);
  if (!keyChanged || !uploadableFile) {
    if (!keyChanged && isGeminiFilesApiReferenceStillValid(file)) {
      return { kind: 'active', patch: {} };
    }

    if (!shouldRefreshGeminiFilesApiReferenceFromExpiration(file)) {
      try {
        const metadata = await getFileMetadataApi(apiKey, fileApiName);

        if (metadata?.state === 'ACTIVE') {
          return { kind: 'active', patch: buildActivePatchFromMetadata(metadata, file, apiKey) };
        }

        if (metadata && metadata.state !== 'FAILED') {
          const lifecycle = getUploadLifecycleForGeminiState(metadata.state);
          return {
            kind: 'wait',
            fileName: file.name,
            patch: {
              ...lifecycle,
              fileUri: metadata.uri ?? file.fileUri,
              fileApiName: metadata.name ?? file.fileApiName,
              fileApiExpirationTime: toFileApiExpirationTime((metadata as { expirationTime?: unknown }).expirationTime),
              fileApiKeyFingerprint: getApiKeyFingerprint(apiKey),
            } as FilePatch,
          };
        }
      } catch (error) {
        if (!isFilesApiAccessDeniedError(error)) {
          logService.warn('Could not verify Files API reference before send; leaving history unchanged.', {
            fileName: file.name,
            fileApiName,
            error,
          });
          return { kind: 'verify-failed', fileName: file.name };
        }
        logService.warn(
          'Files API reference is not accessible with the current key; falling back to re-upload when a local backup exists.',
          {
            fileName: file.name,
            fileApiName,
            error,
          },
        );
      }
    }
  }

  if (!uploadableFile) {
    return { kind: 'needs-backup' };
  }

  try {
    const uploadedFile = await uploadFileApi(
      apiKey,
      uploadableFile,
      file.type || uploadableFile.type || 'application/octet-stream',
      file.name,
      abortSignal,
    );
    const lifecycle = getUploadLifecycleForGeminiState(uploadedFile.state);
    const error =
      lifecycle.uploadState === 'failed'
        ? formatGeminiFileApiProcessingError(uploadedFile, 'File API processing failed')
        : undefined;
    const patch = {
      ...lifecycle,
      progress: 100,
      fileUri: uploadedFile.uri,
      fileApiName: uploadedFile.name,
      rawFile: file.rawFile ?? uploadableFile,
      error,
      omittedFromApiHistory: undefined,
      fileApiExpirationTime: toFileApiExpirationTime((uploadedFile as { expirationTime?: unknown }).expirationTime),
      fileApiKeyFingerprint: getApiKeyFingerprint(apiKey),
    } as FilePatch;

    if (lifecycle.uploadState !== 'active') {
      return { kind: 'wait', patch, fileName: file.name };
    }

    return { kind: 'uploaded', patch };
  } catch (error) {
    logService.error('Failed to refresh Files API reference before send.', {
      fileName: file.name,
      fileApiName,
      error,
    });
    return {
      kind: 'refresh-failed',
      fileName: file.name,
      patch: {
        isProcessing: false,
        uploadState: 'failed',
        error: getErrorMessage(error),
      },
    };
  }
};

const isBlockingResolution = (
  resolved: ResolvedRemoteFile,
): resolved is Extract<ResolvedRemoteFile, { kind: 'wait' | 'refresh-failed' | 'verify-failed' }> =>
  resolved.kind === 'wait' || resolved.kind === 'refresh-failed' || resolved.kind === 'verify-failed';

const blockingErrorKey = (
  resolved: Extract<ResolvedRemoteFile, { kind: 'wait' | 'refresh-failed' | 'verify-failed' }>,
): FileApiReferenceErrorKey => {
  if (resolved.kind === 'wait') {
    return 'messageSenderWaitForFiles';
  }
  if (resolved.kind === 'verify-failed') {
    return 'messageSenderFileReferenceVerifyFailed';
  }
  return 'messageSenderFileReferenceRefreshFailed';
};

export const ensureFilesApiReferences = async ({
  files,
  apiKey,
  abortSignal,
  onFileUpdate,
}: EnsureFilesApiReferencesParams): Promise<EnsureFilesApiReferencesResult> => {
  let nextFiles = files;

  for (const file of files) {
    if (!usesGeminiFilesApiReference(file)) {
      continue;
    }

    const currentFile = nextFiles.find((candidate) => candidate.id === file.id) ?? file;
    const resolved = await resolveRemoteFileReference(currentFile, apiKey, abortSignal);

    if (resolved.kind === 'active' || resolved.kind === 'uploaded') {
      if (Object.keys(resolved.patch).length > 0) {
        nextFiles = applyFilePatch(nextFiles, currentFile.id, resolved.patch, onFileUpdate);
      }
      continue;
    }

    if (resolved.kind === 'wait') {
      nextFiles = applyFilePatch(nextFiles, currentFile.id, resolved.patch, onFileUpdate);
      return {
        ok: false,
        files: nextFiles,
        errorKey: 'messageSenderWaitForFiles',
        fileName: resolved.fileName,
      };
    }

    if (resolved.kind === 'needs-backup') {
      return {
        ok: false,
        files: nextFiles,
        errorKey: 'messageSenderFileReferenceExpiredNoBackup',
        fileName: currentFile.name,
      };
    }

    if (resolved.kind === 'verify-failed') {
      return {
        ok: false,
        files: nextFiles,
        errorKey: 'messageSenderFileReferenceVerifyFailed',
        fileName: resolved.fileName,
      };
    }

    nextFiles = applyFilePatch(nextFiles, currentFile.id, resolved.patch, onFileUpdate);
    return {
      ok: false,
      files: nextFiles,
      errorKey: 'messageSenderFileReferenceRefreshFailed',
      fileName: resolved.fileName,
    };
  }

  return { ok: true, files: nextFiles };
};

export const ensureHistoryFilesApiReferences = async ({
  messages,
  apiKey,
  abortSignal,
  translate,
}: EnsureHistoryFilesApiReferencesParams): Promise<EnsureHistoryFilesApiReferencesResult> => {
  const groups = collectHistoryFileGroups(messages);
  if (groups.length === 0) {
    return { ok: true, messages, changed: false };
  }

  const resolutions = await Promise.all(
    groups.map(async (group) => ({
      group,
      resolved: await resolveRemoteFileReference(group.representative, apiKey, abortSignal),
    })),
  );

  const blocking = resolutions.find((item) => isBlockingResolution(item.resolved));
  if (blocking && isBlockingResolution(blocking.resolved)) {
    return {
      ok: false,
      messages,
      errorKey: blockingErrorKey(blocking.resolved),
      fileName: blocking.resolved.fileName,
    };
  }

  let nextMessages = messages;
  let changed = false;

  for (const { group, resolved } of resolutions) {
    if (resolved.kind === 'needs-backup') {
      const applied = degradeHistoryFile(nextMessages, group, translate);
      nextMessages = applied.messages;
      changed = changed || applied.changed;
      continue;
    }

    if (resolved.kind === 'active' || resolved.kind === 'uploaded') {
      const applied = applyHistoryFilePatch(nextMessages, group, resolved.patch);
      nextMessages = applied.messages;
      changed = changed || applied.changed;
    }
  }

  return { ok: true, messages: changed ? nextMessages : messages, changed };
};

export const formatFileReferenceErrorMessage = (
  result: FileReferenceErrorResult,
  translate: (key: string) => string,
): string => {
  const template = translate(result.errorKey);
  return result.fileName ? formatMessageSenderText(template, { filename: result.fileName }) : template;
};
