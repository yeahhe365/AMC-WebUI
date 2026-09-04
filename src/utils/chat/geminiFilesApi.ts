import type { ChatMessage, SavedChatSession, UploadedFile } from '@/types';
import { usesRemoteFileReference } from './fileTransferStrategy';

const FILE_API_REFRESH_LEEWAY_MS = 5 * 60 * 1000;

const GEMINI_FILES_NAME_PATTERN = /(?:^|\/)files\/([^/?#]+)/;
const YOUTUBE_URI_PATTERN = /youtu\.?be|youtube\.com/i;

type GeminiFilesApiNameSource = Pick<UploadedFile, 'fileApiName' | 'fileUri'>;
type GeminiFilesApiExpirationSource = Pick<UploadedFile, 'fileApiExpirationTime'>;

const isYoutubeFileUri = (uri?: string): boolean => Boolean(uri && YOUTUBE_URI_PATTERN.test(uri));

export const getGeminiFilesApiNameFromUri = (uri?: string): string | null => {
  if (!uri || isYoutubeFileUri(uri)) {
    return null;
  }

  const match = uri.match(GEMINI_FILES_NAME_PATTERN);
  return match ? `files/${match[1]}` : null;
};

export const getGeminiFilesApiName = (file: GeminiFilesApiNameSource): string | null =>
  getGeminiFilesApiNameFromUri(file.fileApiName) ?? getGeminiFilesApiNameFromUri(file.fileUri);

export const usesGeminiFilesApiReference = (
  file: Pick<UploadedFile, 'fileApiName' | 'fileUri' | 'rawFile' | 'transferStrategy'>,
): boolean => usesRemoteFileReference(file) && Boolean(getGeminiFilesApiName(file));

export const sessionHasGeminiFilesApiReferences = (messages: ChatMessage[]): boolean =>
  messages.some(
    (message) =>
      (message.files?.some((file) => !file.omittedFromApiHistory && Boolean(getGeminiFilesApiName(file))) ?? false) ||
      (message.apiParts?.some((part) => Boolean(getGeminiFilesApiNameFromUri(part.fileData?.fileUri))) ?? false),
  );

export const toFileApiExpirationTime = (expirationTime: unknown): string | undefined => {
  if (expirationTime instanceof Date) {
    return expirationTime.toISOString();
  }

  return typeof expirationTime === 'string' ? expirationTime : undefined;
};

const FNV_32_OFFSET_BASIS = 0x811c9dc5;
const FNV_32_PRIME = 0x01000193;

/**
 * Stable, non-cryptographic fingerprint of an API key. Files API uploads are
 * only accessible with keys from the uploading project, so this lets us detect
 * key switches and re-upload from the local backup instead of failing.
 */
export const getApiKeyFingerprint = (apiKey: string): string => {
  let hash = FNV_32_OFFSET_BASIS;
  for (let index = 0; index < apiKey.length; index += 1) {
    hash ^= apiKey.charCodeAt(index);
    hash = Math.imul(hash, FNV_32_PRIME) >>> 0;
  }
  return `fnv1a-${hash.toString(16)}-${apiKey.length}`;
};

type FileApiKeyFingerprintSource = Pick<UploadedFile, 'fileApiKeyFingerprint'>;

export const isFileApiKeyMismatch = (file: FileApiKeyFingerprintSource, apiKey: string): boolean =>
  Boolean(file.fileApiKeyFingerprint) && file.fileApiKeyFingerprint !== getApiKeyFingerprint(apiKey);

const getExpirationTimestamp = (file: GeminiFilesApiExpirationSource): number | undefined => {
  if (!file.fileApiExpirationTime) {
    return undefined;
  }

  const expiresAt = Date.parse(file.fileApiExpirationTime);
  return Number.isFinite(expiresAt) ? expiresAt : undefined;
};

export const isGeminiFilesApiReferenceStillValid = (file: GeminiFilesApiExpirationSource): boolean => {
  const expiresAt = getExpirationTimestamp(file);
  return expiresAt !== undefined && expiresAt > Date.now() + FILE_API_REFRESH_LEEWAY_MS;
};

export const shouldRefreshGeminiFilesApiReferenceFromExpiration = (file: GeminiFilesApiExpirationSource): boolean => {
  const expiresAt = getExpirationTimestamp(file);
  return expiresAt !== undefined && expiresAt <= Date.now() + FILE_API_REFRESH_LEEWAY_MS;
};

type GeminiFileApiErrorSource = {
  error?: {
    message?: unknown;
    code?: unknown;
  } | null;
  state?: unknown;
} | null;

const getGeminiFileApiErrorMessage = (file: GeminiFileApiErrorSource | undefined): string | undefined => {
  const message = file?.error?.message;
  if (typeof message !== 'string') {
    return undefined;
  }

  const trimmed = message.trim();
  return trimmed.length > 0 ? trimmed : undefined;
};

export const formatGeminiFileApiProcessingError = (
  file: GeminiFileApiErrorSource | undefined,
  fallback: string,
  withMessageTemplate?: string,
): string => {
  const message = getGeminiFileApiErrorMessage(file);
  if (!message) {
    return fallback;
  }

  if (withMessageTemplate) {
    return withMessageTemplate.replaceAll('{message}', message);
  }

  return message;
};

export const formatHistoryFileApiUnavailablePartText = (fileName: string): string =>
  `[System Note: The previously attached file '${fileName}' is no longer available via the Files API. Content omitted from history.]`;

export const INVALID_FILE_API_KEY_FINGERPRINT = 'invalidated';

const FILES_API_PERMISSION_DENIED_PATTERN =
  /You do not have permission to access the File|(?:\b403\b|PERMISSION_DENIED).*?\bFile\b|\bFile\b.*?(?:\b403\b|PERMISSION_DENIED)/i;

export const isFilesApiPermissionDeniedError = (error: unknown): boolean => {
  const message = error instanceof Error ? error.message : String(error ?? '');
  return FILES_API_PERMISSION_DENIED_PATTERN.test(message);
};

export const extractFilesApiIdentifierFromError = (error: unknown): string | null => {
  const message = error instanceof Error ? error.message : String(error ?? '');
  const match =
    message.match(/permission to access the File\s+([a-zA-Z0-9_-]+)/i) ||
    message.match(/files\/([a-zA-Z0-9_-]+)/i);
  return match ? match[1] : null;
};

export const invalidateFilesApiReference = (file: UploadedFile): UploadedFile => ({
  ...file,
  fileApiKeyFingerprint: INVALID_FILE_API_KEY_FINGERPRINT,
  fileApiExpirationTime: new Date(0).toISOString(),
});

export const invalidateSessionFilesApiReferences = (
  session: SavedChatSession,
  error: unknown,
): SavedChatSession => {
  if (!isFilesApiPermissionDeniedError(error)) {
    return session;
  }

  const targetIdentifier = extractFilesApiIdentifierFromError(error);

  const fileMatches = (file: UploadedFile, targetId?: string | null): boolean => {
    if (!usesGeminiFilesApiReference(file)) {
      return false;
    }
    if (!targetId) {
      return true;
    }
    return Boolean(
      (file.fileApiName && file.fileApiName.includes(targetId)) ||
      (file.fileUri && file.fileUri.includes(targetId)) ||
      file.id === targetId,
    );
  };

  const hasSpecificMatch = targetIdentifier
    ? session.messages.some((msg) => msg.files?.some((file) => fileMatches(file, targetIdentifier)))
    : false;

  const targetToUse = hasSpecificMatch ? targetIdentifier : null;

  let sessionChanged = false;
  const nextMessages = session.messages.map((message) => {
    if (!message.files?.length) {
      return message;
    }

    let messageChanged = false;
    const nextFiles = message.files.map((file) => {
      if (fileMatches(file, targetToUse)) {
        messageChanged = true;
        return invalidateFilesApiReference(file);
      }
      return file;
    });

    if (messageChanged) {
      sessionChanged = true;
      return { ...message, files: nextFiles };
    }
    return message;
  });

  const nextSettings = session.settings?.lockedApiKey
    ? { ...session.settings, lockedApiKey: null }
    : session.settings;

  if (nextSettings !== session.settings) {
    sessionChanged = true;
  }

  return sessionChanged
    ? {
        ...session,
        messages: nextMessages,
        settings: nextSettings,
      }
    : session;
};

