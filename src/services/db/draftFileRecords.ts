import type { UploadedFile } from '@/types';
import { createManagedObjectUrl, releaseManagedObjectUrlsByOwner } from '@/services/objectUrlManager';
import { deleteKeyValue, getKeyValue, setKeyValue } from './indexedDbAccess';

const DRAFT_FILES_KEY_PREFIX = 'draft_files:';

export const getDraftFilesKey = (sessionId: string): string => `${DRAFT_FILES_KEY_PREFIX}${sessionId}`;

export const sanitizeDraftFileForStorage = (file: UploadedFile): UploadedFile => {
  const sanitized: UploadedFile = {
    id: file.id,
    name: file.name,
    type: file.type,
    size: file.size,
  };

  if (file.rawFile instanceof Blob) {
    sanitized.rawFile = file.rawFile;
  }

  if (file.textContent) {
    sanitized.textContent = file.textContent;
  }

  if (file.fileUri) {
    sanitized.fileUri = file.fileUri;
  }

  if (file.fileApiName) {
    sanitized.fileApiName = file.fileApiName;
  }

  if (file.fileApiExpirationTime) {
    sanitized.fileApiExpirationTime = file.fileApiExpirationTime;
  }

  if (file.fileApiKeyFingerprint) {
    sanitized.fileApiKeyFingerprint = file.fileApiKeyFingerprint;
  }

  if (file.transferStrategy) {
    sanitized.transferStrategy = file.transferStrategy;
  }

  if (file.uploadState) {
    // If was uploading or processing during refresh/unload, reset to pending (or active if fileUri was set)
    if (file.uploadState === 'uploading' || file.uploadState === 'processing_api' || file.isProcessing) {
      sanitized.uploadState = file.fileUri ? 'active' : 'pending';
      sanitized.isProcessing = false;
    } else {
      sanitized.uploadState = file.uploadState;
      sanitized.isProcessing = file.isProcessing;
    }
  }

  if (file.omittedFromApiHistory !== undefined) {
    sanitized.omittedFromApiHistory = file.omittedFromApiHistory;
  }

  if (file.uploadSpeed) {
    sanitized.uploadSpeed = file.uploadSpeed;
  }

  if (file.videoMetadata) {
    sanitized.videoMetadata = file.videoMetadata;
  }

  if (file.mediaResolution) {
    sanitized.mediaResolution = file.mediaResolution;
  }

  if (file.progress !== undefined) {
    sanitized.progress = file.progress;
  }

  if (file.error) {
    sanitized.error = file.error;
  }

  return sanitized;
};

export const rehydrateDraftFile = (file: UploadedFile, sessionId: string): UploadedFile => {
  const rawCandidate = file.rawFile as unknown;
  if (rawCandidate instanceof Blob) {
    try {
      const dataUrl = createManagedObjectUrl(rawCandidate, {
        key: `draft-file:${sessionId}:${file.id}`,
        ownerId: `draft:${sessionId}`,
      });
      return { ...file, dataUrl, isProcessing: false };
    } catch {
      return { ...file, dataUrl: undefined, isProcessing: false, error: 'Preview failed to load' };
    }
  }

  if (rawCandidate) {
    const rest = { ...file };
    delete rest.rawFile;
    return { ...rest, isProcessing: false };
  }

  return { ...file, isProcessing: false };
};

export const saveDraftFiles = async (sessionId: string, files: UploadedFile[]): Promise<void> => {
  if (!sessionId) {
    return;
  }

  if (!files || files.length === 0) {
    await deleteDraftFiles(sessionId);
    return;
  }

  const sanitized = files.map(sanitizeDraftFileForStorage);
  await setKeyValue(getDraftFilesKey(sessionId), sanitized);
};

export const getDraftFiles = async (sessionId: string): Promise<UploadedFile[]> => {
  if (!sessionId) {
    return [];
  }

  const persisted = await getKeyValue<UploadedFile[]>(getDraftFilesKey(sessionId));
  if (!persisted || !Array.isArray(persisted) || persisted.length === 0) {
    return [];
  }

  return persisted.map((file) => rehydrateDraftFile(file, sessionId));
};

export const deleteDraftFiles = async (sessionId: string): Promise<void> => {
  if (!sessionId) {
    return;
  }

  releaseManagedObjectUrlsByOwner(`draft:${sessionId}`);
  await deleteKeyValue(getDraftFilesKey(sessionId));
};
