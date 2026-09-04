import type { MutableRefObject } from 'react';
import { type AppSettings, type ChatProviderId, type UploadedFile, type MediaResolution } from '@/types';
import { SUPPORTED_UPLOAD_MIME_TYPES } from '@/constants/fileTypeSupport';
import { logService } from '@/services/logService';
import { releaseManagedObjectUrl } from '@/services/objectUrlManager';
import { generateUniqueId } from '@/utils/chat/ids';
import { fileToBlobUrl } from '@/utils/file/filePreviewUrls';
import { uploadFileApi } from '@/services/api/fileApi';
import {
  formatGeminiFileApiProcessingError,
  getApiKeyFingerprint,
  toFileApiExpirationTime,
} from '@/utils/chat/geminiFilesApi';
import {
  createProcessingPlaceholderFile,
  formatSpeed,
  getEffectiveMimeType,
  getUploadLifecycleForGeminiState,
  shouldUseFileApi,
} from './fileUploadPolicy';
import { getTranslator } from '@/i18n/translations';
import { interpolate, formatI18nErrorMessage } from '@/i18n/interpolate';

type Translator = ReturnType<typeof getTranslator>;

const UPLOAD_SPEED_UPDATE_INTERVAL_MS = 500;
const PERCENT_MULTIPLIER = 100;

interface UploadFileItemParams {
  file: File;
  keyToUse: string | null;
  forceFileApi?: boolean;
  defaultResolution: MediaResolution | undefined;
  appSettings: AppSettings;
  /** Session provider — when third-party the Gemini Files API is never used. */
  providerId?: ChatProviderId;
  setSelectedFiles: React.Dispatch<React.SetStateAction<UploadedFile[]>>;
  uploadStatsRef: MutableRefObject<Map<string, { lastLoaded: number; lastTime: number }>>;
  t?: Translator;
  onFileUpdate?: (fileId: string, patch: Partial<UploadedFile>) => void;
}

export const uploadFileItem = async ({
  file,
  keyToUse,
  forceFileApi = false,
  defaultResolution,
  appSettings,
  providerId,
  setSelectedFiles,
  uploadStatsRef,
  t = getTranslator('en'),
  onFileUpdate,
}: UploadFileItemParams) => {
  const fileId = generateUniqueId();
  const effectiveMimeType = getEffectiveMimeType(file);

  if (!SUPPORTED_UPLOAD_MIME_TYPES.includes(effectiveMimeType)) {
    logService.warn(`Unsupported file type skipped: ${file.name}`, {
      type: file.type,
      effectiveType: effectiveMimeType,
    });
    setSelectedFiles((previousFiles) => [
      ...previousFiles,
      {
        id: fileId,
        name: file.name,
        type: file.type || 'unknown',
        size: file.size,
        isProcessing: false,
        progress: 0,
        error: interpolate(t('uploadUnsupportedType'), { filename: file.name }),
        uploadState: 'failed',
      },
    ]);
    return;
  }

  const shouldUploadFile = forceFileApi || shouldUseFileApi(file, appSettings, providerId);

  const dataUrl = fileToBlobUrl(file);

  if (shouldUploadFile) {
    if (!keyToUse) {
      const errorMsg = t('uploadMissingApiKey');
      logService.error(errorMsg);
      releaseManagedObjectUrl(dataUrl);
      setSelectedFiles((previousFiles) => [
        ...previousFiles,
        {
          id: fileId,
          name: file.name,
          type: effectiveMimeType,
          size: file.size,
          isProcessing: false,
          progress: 0,
          error: errorMsg,
          uploadState: 'failed',
        },
      ]);
      return;
    }
    const controller = new AbortController();
    const apiKeyFingerprint = getApiKeyFingerprint(keyToUse);

    const initialFileState: UploadedFile = createProcessingPlaceholderFile({
      id: fileId,
      name: file.name,
      type: effectiveMimeType,
      size: file.size,
      progress: 0,
      rawFile: file,
      dataUrl,
      transferStrategy: 'files-api',
      uploadState: 'uploading',
      abortController: controller,
      uploadSpeed: t('uploadStarting'),
      mediaResolution: defaultResolution,
    });

    uploadStatsRef.current.set(fileId, { lastLoaded: 0, lastTime: Date.now() });

    setSelectedFiles((previousFiles) => [...previousFiles, initialFileState]);

    let lastReportedPercent = -1;
    const handleProgress = (loaded: number, total: number) => {
      const now = Date.now();
      const stats = uploadStatsRef.current.get(fileId);

      let speedStr = '';
      if (stats) {
        const timeDiff = now - stats.lastTime;
        if (timeDiff > UPLOAD_SPEED_UPDATE_INTERVAL_MS) {
          const bytesDiff = loaded - stats.lastLoaded;
          const bytesPerSecond = bytesDiff / (timeDiff / 1000);
          speedStr = formatSpeed(bytesPerSecond);

          uploadStatsRef.current.set(fileId, { lastLoaded: loaded, lastTime: now });
        }
      }

      const progressPercent = Math.round((loaded / total) * PERCENT_MULTIPLIER);

      if (progressPercent === lastReportedPercent && !speedStr && progressPercent < 100) {
        return;
      }
      lastReportedPercent = progressPercent;

      const patch: Partial<UploadedFile> = {
        progress: progressPercent,
      };
      if (speedStr) {
        patch.uploadSpeed = speedStr;
      }
      onFileUpdate?.(fileId, patch);

      setSelectedFiles((previousFiles) =>
        previousFiles.map((selectedFile) => {
          if (selectedFile.id === fileId) {
            return {
              ...selectedFile,
              progress: progressPercent,
              uploadSpeed: speedStr || selectedFile.uploadSpeed,
            };
          }
          return selectedFile;
        }),
      );
    };

    try {
      const uploadedFileInfo = await uploadFileApi(
        keyToUse,
        file,
        effectiveMimeType,
        file.name,
        controller.signal,
        handleProgress,
      );

      logService.info(`File uploaded, initial state: ${uploadedFileInfo.state}`, { fileInfo: uploadedFileInfo });

      const { uploadState, isProcessing } = getUploadLifecycleForGeminiState(uploadedFileInfo.state);

      onFileUpdate?.(fileId, {
        isProcessing,
        progress: 100,
        fileUri: uploadedFileInfo.uri,
        fileApiName: uploadedFileInfo.name,
        fileApiExpirationTime: toFileApiExpirationTime(uploadedFileInfo.expirationTime),
        fileApiKeyFingerprint: apiKeyFingerprint,
        rawFile: file,
        transferStrategy: 'files-api',
        uploadState,
        error:
          uploadState === 'failed'
            ? formatGeminiFileApiProcessingError(
                uploadedFileInfo,
                t('uploadApiProcessingFailed'),
                t('uploadApiProcessingFailedWithMessage'),
              )
            : undefined,
        abortController: undefined,
        uploadSpeed: undefined,
      });

      setSelectedFiles((previousFiles) =>
        previousFiles.map((selectedFile) =>
          selectedFile.id === fileId
            ? {
                ...selectedFile,
                isProcessing,
                progress: 100,
                fileUri: uploadedFileInfo.uri,
                fileApiName: uploadedFileInfo.name,
                fileApiExpirationTime: toFileApiExpirationTime(uploadedFileInfo.expirationTime),
                fileApiKeyFingerprint: apiKeyFingerprint,
                rawFile: file,
                transferStrategy: 'files-api',
                uploadState,
                error:
                  uploadState === 'failed'
                    ? formatGeminiFileApiProcessingError(
                        uploadedFileInfo,
                        t('uploadApiProcessingFailed'),
                        t('uploadApiProcessingFailedWithMessage'),
                      )
                    : selectedFile.error || undefined,
                abortController: undefined,
                uploadSpeed: undefined,
              }
            : selectedFile,
        ),
      );
    } catch (uploadError) {
      let errorMsg = formatI18nErrorMessage(t, 'uploadFailedWithMessage', uploadError);
      let uploadStateUpdate: UploadedFile['uploadState'] = 'failed';

      if (uploadError instanceof Error && uploadError.name === 'AbortError') {
        errorMsg = t('uploadCancelledByUser');
        uploadStateUpdate = 'cancelled';
        logService.warn(`File upload cancelled by user: ${file.name}`);
      } else {
        logService.error(`File upload failed for ${file.name}`, { error: uploadError });
      }

      releaseManagedObjectUrl(dataUrl);

      onFileUpdate?.(fileId, {
        isProcessing: false,
        error: errorMsg,
        uploadState: uploadStateUpdate,
        abortController: undefined,
        uploadSpeed: undefined,
        dataUrl: undefined,
        rawFile: undefined,
      });

      setSelectedFiles((previousFiles) =>
        previousFiles.map((selectedFile) =>
          selectedFile.id === fileId
            ? {
                ...selectedFile,
                isProcessing: false,
                error: errorMsg,
                uploadState: uploadStateUpdate,
                abortController: undefined,
                uploadSpeed: undefined,
                dataUrl: undefined,
                rawFile: undefined,
              }
            : selectedFile,
        ),
      );
    } finally {
      uploadStatsRef.current.delete(fileId);
    }
  } else {
    const initialFileState: UploadedFile = createProcessingPlaceholderFile({
      id: fileId,
      name: file.name,
      type: effectiveMimeType,
      size: file.size,
      progress: 0,
      rawFile: file,
      dataUrl,
      transferStrategy: 'inline',
      mediaResolution: defaultResolution,
    });
    setSelectedFiles((previousFiles) => [...previousFiles, initialFileState]);

    onFileUpdate?.(fileId, { isProcessing: false, progress: 100, uploadState: 'active' });

    setSelectedFiles((previousFiles) =>
      previousFiles.map((selectedFile) =>
        selectedFile.id === fileId
          ? { ...selectedFile, isProcessing: false, progress: 100, uploadState: 'active' }
          : selectedFile,
      ),
    );
  }
};
