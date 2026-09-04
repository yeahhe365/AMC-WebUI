import { useCallback, type Dispatch, type SetStateAction } from 'react';
import {
  type AppSettings,
  type ChatSettings as IndividualChatSettings,
  type UploadedFile,
  MediaResolution,
} from '@/types';
import { SUPPORTED_UPLOAD_MIME_TYPES } from '@/constants/fileTypeSupport';
import { logService } from '@/services/logService';
import { formatApiKeyErrorMessage, getGeminiKeyForRequest } from '@/utils/apiKeySelection';
import { generateUniqueId } from '@/utils/chat/ids';
import { getFileMetadataApi } from '@/services/api/fileApi';
import {
  formatGeminiFileApiProcessingError,
  getApiKeyFingerprint,
  toFileApiExpirationTime,
} from '@/utils/chat/geminiFilesApi';
import {
  createProcessingPlaceholderFile,
  getUploadLifecycleForGeminiState,
} from '@/utils/file-upload/fileUploadPolicy';
import { useI18n } from '@/contexts/I18nContext';
import { isVideoMimeType } from '@/utils/file/fileTypeClassification';
import { isThirdPartyApiRoute } from '@/utils/chatApiRoute';
import { interpolate, formatI18nErrorMessage } from '@/i18n/interpolate';

interface UseFileIdAdderProps {
  appSettings: AppSettings;
  setSelectedFiles: Dispatch<SetStateAction<UploadedFile[]>>;
  setAppFileError: Dispatch<SetStateAction<string | null>>;
  currentChatSettings: IndividualChatSettings;
  setCurrentChatSettings: (updater: (prevSettings: IndividualChatSettings) => IndividualChatSettings) => void;
  selectedFiles: UploadedFile[];
}

export const useFileIdAdder = ({
  appSettings,
  setSelectedFiles,
  setAppFileError,
  currentChatSettings,
  setCurrentChatSettings,
  selectedFiles,
}: UseFileIdAdderProps) => {
  const { t } = useI18n();

  const translateApiKeyError = useCallback((error: string) => formatApiKeyErrorMessage(error, t), [t]);

  const addFileById = useCallback(
    async (fileApiId: string) => {
      logService.info(`Attempting to add file by ID: ${fileApiId}`);
      setAppFileError(null);
      if (!fileApiId || !fileApiId.startsWith('files/')) {
        logService.error('Invalid File ID format.', { fileApiId });
        setAppFileError(t('fileIdAdderInvalidFileId'));
        return;
      }
      if (selectedFiles.some((selectedFile) => selectedFile.fileApiName === fileApiId)) {
        logService.warn(`File with ID ${fileApiId} is already added.`);
        setAppFileError(interpolate(t('fileIdAdderDuplicateFile'), { id: fileApiId }));
        return;
      }

      // Adding file by ID is an explicit user action, we rotate key to be safe/fair
      const keyResult = getGeminiKeyForRequest(appSettings, currentChatSettings);
      if ('error' in keyResult) {
        logService.error('Cannot add file by ID: API key not configured.');
        setAppFileError(translateApiKeyError(keyResult.error));
        return;
      }
      const { key: keyToUse, isNewKey } = keyResult;

      if (isNewKey && !isThirdPartyApiRoute(appSettings, currentChatSettings)) {
        logService.info('New API key selected for this session due to adding file by ID.');
        setCurrentChatSettings((prev) => ({ ...prev, lockedApiKey: keyToUse }));
      }

      const tempId = generateUniqueId();
      const defaultResolution =
        currentChatSettings.mediaResolution !== MediaResolution.MEDIA_RESOLUTION_UNSPECIFIED
          ? currentChatSettings.mediaResolution
          : undefined;

      setSelectedFiles((prev) => [
        ...prev,
        createProcessingPlaceholderFile({
          id: tempId,
          name: interpolate(t('fileIdAdderLoadingFile'), { id: fileApiId }),
          type: 'application/octet-stream',
          size: 0,
          progress: 50,
          uploadState: 'processing_api',
          fileApiName: fileApiId,
          transferStrategy: 'remote-file-id',
          mediaResolution: defaultResolution,
        }),
      ]);

      try {
        const fileMetadata = await getFileMetadataApi(keyToUse, fileApiId);
        if (fileMetadata) {
          logService.info(`Successfully fetched metadata for file ID ${fileApiId}`, { metadata: fileMetadata });
          const mimeType = fileMetadata.mimeType ?? 'application/octet-stream';

          // Allow known video types or generic octet-stream (often used for arbitrary files)
          // But strictly validate if it is a supported type if it's not generic
          const isValidType = SUPPORTED_UPLOAD_MIME_TYPES.includes(mimeType) || isVideoMimeType(mimeType);

          if (!isValidType) {
            logService.warn(`Unsupported file type for file ID ${fileApiId}`, { type: mimeType });
            setSelectedFiles((prev) =>
              prev.map((selectedFile) =>
                selectedFile.id === tempId
                  ? {
                      ...selectedFile,
                      name: fileMetadata.displayName || fileApiId,
                      type: mimeType,
                      size: Number(fileMetadata.sizeBytes) || 0,
                      isProcessing: false,
                      error: interpolate(t('fileIdAdderUnsupportedType'), { type: mimeType }),
                      uploadState: 'failed',
                    }
                  : selectedFile,
              ),
            );
            return;
          }
          const { uploadState, isProcessing } = getUploadLifecycleForGeminiState(fileMetadata.state);
          const newFile: UploadedFile = {
            id: tempId,
            name: fileMetadata.displayName || fileApiId,
            type: mimeType,
            size: Number(fileMetadata.sizeBytes) || 0,
            fileUri: fileMetadata.uri,
            fileApiName: fileMetadata.name || fileApiId,
            fileApiExpirationTime: toFileApiExpirationTime(fileMetadata.expirationTime),
            fileApiKeyFingerprint: getApiKeyFingerprint(keyToUse),
            transferStrategy: 'remote-file-id',
            isProcessing,
            progress: 100,
            uploadState,
            error:
              uploadState === 'failed'
                ? formatGeminiFileApiProcessingError(
                    fileMetadata,
                    t('fileIdAdderProcessingFailed'),
                    t('fileIdAdderProcessingFailedWithMessage'),
                  )
                : undefined,
            mediaResolution: defaultResolution,
          };
          setSelectedFiles((prev) => prev.map((selectedFile) => (selectedFile.id === tempId ? newFile : selectedFile)));
        } else {
          logService.error(`File with ID ${fileApiId} not found or inaccessible.`);
          setAppFileError(interpolate(t('fileIdAdderNotFound'), { id: fileApiId }));
          setSelectedFiles((prev) =>
            prev.map((selectedFile) =>
              selectedFile.id === tempId
                ? {
                    ...selectedFile,
                    name: interpolate(t('fileIdAdderNotFoundLabel'), { id: fileApiId }),
                    isProcessing: false,
                    error: t('fileIdAdderNotFoundShort'),
                    uploadState: 'failed',
                  }
                : selectedFile,
            ),
          );
        }
      } catch (error) {
        if (error instanceof Error && error.name === 'SilentError') {
          logService.error('Cannot add file by ID: API key not configured.');
          const translatedApiError = t('apiRuntimeKeyNotConfigured');
          setAppFileError(translatedApiError);
          setSelectedFiles((prev) =>
            prev.map((selectedFile) =>
              selectedFile.id === tempId
                ? {
                    ...selectedFile,
                    name: interpolate(t('fileIdAdderConfigErrorLabel'), { id: fileApiId }),
                    isProcessing: false,
                    error: translatedApiError,
                    uploadState: 'failed',
                  }
                : selectedFile,
            ),
          );
          return;
        }
        logService.error(`Error fetching file metadata for ID ${fileApiId}`, { error });
        setAppFileError(formatI18nErrorMessage(t, 'fileIdAdderFetchError', error));
        setSelectedFiles((prev) =>
          prev.map((selectedFile) =>
            selectedFile.id === tempId
              ? {
                  ...selectedFile,
                  name: interpolate(t('fileIdAdderFetchErrorLabel'), { id: fileApiId }),
                  isProcessing: false,
                  error: t('fileIdAdderFetchErrorShort'),
                  uploadState: 'failed',
                }
              : selectedFile,
          ),
        );
      }
    },
    [
      appSettings,
      currentChatSettings,
      selectedFiles,
      setAppFileError,
      setCurrentChatSettings,
      setSelectedFiles,
      t,
      translateApiKeyError,
    ],
  );

  return { addFileById };
};
