import { useCallback, type Dispatch, type SetStateAction } from 'react';

import { logService } from '@/services/logService';
import { useChatStore } from '@/stores/chatStore';
import { type AppSettings, type ChatSettings as IndividualChatSettings, type UploadedFile } from '@/types';

import { useFileIdAdder } from './useFileIdAdder';
import { useFilePreProcessing } from './useFilePreProcessing';
import { useFileUploader } from './useFileUploader';

interface UseFileUploadProps {
  appSettings: AppSettings;
  selectedFiles: UploadedFile[];
  setSelectedFiles: Dispatch<SetStateAction<UploadedFile[]>>;
  setAppFileError: Dispatch<SetStateAction<string | null>>;
  currentChatSettings: IndividualChatSettings;
  setCurrentChatSettings: (updater: (prevSettings: IndividualChatSettings) => IndividualChatSettings) => void;
}

export const useFileUpload = ({
  appSettings,
  selectedFiles,
  setSelectedFiles,
  setAppFileError,
  currentChatSettings,
  setCurrentChatSettings,
}: UseFileUploadProps) => {
  const { processFiles } = useFilePreProcessing({ appSettings, setSelectedFiles });

  const { uploadFiles, cancelUpload } = useFileUploader({
    appSettings,
    selectedFiles,
    setSelectedFiles,
    setAppFileError,
    currentChatSettings,
    setCurrentChatSettings,
  });

  const { addFileById, addFilesFromCloud } = useFileIdAdder({
    appSettings,
    setSelectedFiles,
    setAppFileError,
    currentChatSettings,
    setCurrentChatSettings,
    selectedFiles,
  });

  const handleProcessAndAddFiles = useCallback(
    async (files: FileList | File[]) => {
      if (!files || files.length === 0) return;
      setAppFileError(null);
      logService.info(`Processing ${files.length} files.`);
      const operationSessionId = useChatStore.getState().activeSessionId;
      const operationGeneration = useChatStore.getState().getFileOperationGeneration();
      const isStillCurrentSession = () => {
        const chatStore = useChatStore.getState();
        return (
          chatStore.activeSessionId === operationSessionId &&
          chatStore.getFileOperationGeneration() === operationGeneration
        );
      };
      const setSelectedFilesForCurrentSession: Dispatch<SetStateAction<UploadedFile[]>> = (updater) => {
        if (!isStillCurrentSession()) {
          return;
        }

        setSelectedFiles(updater);
      };

      const processedFiles = await processFiles(files, {
        setSelectedFiles: setSelectedFilesForCurrentSession,
      });

      if (!isStillCurrentSession()) {
        return;
      }

      await uploadFiles(processedFiles, {
        setSelectedFiles: setSelectedFilesForCurrentSession,
      });
    },
    [processFiles, uploadFiles, setAppFileError, setSelectedFiles],
  );

  return {
    handleProcessAndAddFiles,
    handleCancelFileUpload: cancelUpload,
    handleAddFileById: addFileById,
    handleAddFilesFromCloud: addFilesFromCloud,
  };
};
