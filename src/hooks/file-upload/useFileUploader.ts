import { useCallback, type Dispatch, type SetStateAction, useRef } from 'react';
import {
  type AppSettings,
  type ChatSettings as IndividualChatSettings,
  type UploadedFile,
  MediaResolution,
} from '@/types';
import { logService } from '@/services/logService';
import { releaseManagedObjectUrl } from '@/services/objectUrlManager';
import { formatApiKeyErrorMessage, getGeminiKeyForRequest } from '@/utils/apiKeySelection';
import {
  buildFileUploadPreflight,
  checkBatchNeedsApiKey,
  getFilesRequiringFileApi,
} from '@/utils/file-upload/fileUploadPolicy';
import { uploadFileItem } from '@/utils/file-upload/uploadFileItem';
import { runWithConcurrencyLimit } from '@/utils/file-upload/uploadQueue';
import { useI18n } from '@/contexts/I18nContext';
import { isThirdPartyApiRoute } from '@/utils/chatApiRoute';
import { useChatStore } from '@/stores/chatStore';

const MAX_CONCURRENT_FILE_UPLOADS = 3;

interface UseFileUploaderProps {
  appSettings: AppSettings;
  selectedFiles: UploadedFile[];
  setSelectedFiles: Dispatch<SetStateAction<UploadedFile[]>>;
  setAppFileError: Dispatch<SetStateAction<string | null>>;
  currentChatSettings: IndividualChatSettings;
  setCurrentChatSettings: (updater: (prevSettings: IndividualChatSettings) => IndividualChatSettings) => void;
}

export const useFileUploader = ({
  appSettings,
  selectedFiles,
  setSelectedFiles,
  setAppFileError,
  currentChatSettings,
  setCurrentChatSettings,
}: UseFileUploaderProps) => {
  const { t } = useI18n();
  const updateUploadedFile = useChatStore((state) => state.updateUploadedFile);
  const uploadStatsRef = useRef<Map<string, { lastLoaded: number; lastTime: number }>>(new Map());

  const uploadFiles = useCallback(
    async (filesArray: File[], options: { setSelectedFiles?: Dispatch<SetStateAction<UploadedFile[]>> } = {}) => {
      if (filesArray.length === 0) return;
      const writeSelectedFiles = options.setSelectedFiles ?? setSelectedFiles;

      const preflight = buildFileUploadPreflight(filesArray, appSettings, selectedFiles, t);
      if (preflight.notice) {
        setAppFileError(preflight.notice);
      }

      if (preflight.filesToUpload.length === 0) {
        return;
      }

      const needsApiKeyForUpload = checkBatchNeedsApiKey(
        preflight.filesToUpload,
        appSettings,
        currentChatSettings.providerId,
      );
      const filesRequiringApi = getFilesRequiringFileApi(
        preflight.filesToUpload,
        appSettings,
        currentChatSettings.providerId,
      );

      let keyToUse: string | null = null;
      if (needsApiKeyForUpload) {
        const keyResult = getGeminiKeyForRequest(appSettings, currentChatSettings);
        if ('error' in keyResult) {
          setAppFileError(formatApiKeyErrorMessage(keyResult.error, t));
          logService.error('Cannot process files: API key not configured.');
          return;
        }
        keyToUse = keyResult.key;
        if (keyResult.isNewKey && !isThirdPartyApiRoute(appSettings, currentChatSettings)) {
          logService.info('New API key selected for this session due to file upload.');
          setCurrentChatSettings((previousSettings) => ({ ...previousSettings, lockedApiKey: keyToUse! }));
        }
      }

      const defaultResolution =
        currentChatSettings.mediaResolution !== MediaResolution.MEDIA_RESOLUTION_UNSPECIFIED
          ? currentChatSettings.mediaResolution
          : undefined;

      const uploadTasks = preflight.filesToUpload.map(
        (file) => () =>
          uploadFileItem({
            file,
            keyToUse,
            forceFileApi: filesRequiringApi.has(file),
            defaultResolution,
            appSettings,
            providerId: currentChatSettings.providerId,
            setSelectedFiles: writeSelectedFiles,
            onFileUpdate: updateUploadedFile,
            uploadStatsRef,
            t,
          }),
      );

      await runWithConcurrencyLimit(uploadTasks, MAX_CONCURRENT_FILE_UPLOADS);
    },
    [
      appSettings,
      currentChatSettings,
      selectedFiles,
      setCurrentChatSettings,
      setAppFileError,
      setSelectedFiles,
      t,
      updateUploadedFile,
    ],
  );

  const cancelUpload = useCallback(
    (fileIdToCancel: string) => {
      logService.warn(`User cancelled file upload: ${fileIdToCancel}`);

      updateUploadedFile(fileIdToCancel, {
        isProcessing: false,
        error: t('uploadCancelled'),
        uploadState: 'cancelled',
        uploadSpeed: undefined,
        dataUrl: undefined,
        rawFile: undefined,
      });

      setSelectedFiles((prevFiles) =>
        prevFiles.map((file) => {
          if (file.id === fileIdToCancel) {
            if (file.abortController) {
              file.abortController.abort();
            }

            releaseManagedObjectUrl(file.dataUrl);

            return {
              ...file,
              isProcessing: false,
              error: t('uploadCancelled'),
              uploadState: 'cancelled',
              uploadSpeed: undefined,
              dataUrl: undefined, // Clear URL so UI gracefully falls back to a file type icon
              rawFile: undefined, // Clear the actual File/Blob reference from memory
            };
          }
          return file;
        }),
      );

      // Clean up speed calculation stats
      uploadStatsRef.current.delete(fileIdToCancel);
    },
    [setSelectedFiles, t, updateUploadedFile],
  );

  return { uploadFiles, cancelUpload };
};
