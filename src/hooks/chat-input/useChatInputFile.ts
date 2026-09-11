import { useCallback, type Dispatch, type MutableRefObject, type RefObject, type SetStateAction } from 'react';
import { type UploadedFile, type VideoMetadata, type MediaResolution, type SetSelectedFiles } from '@/types';
import { cleanupFilePreviewUrl } from '@/utils/file/filePreviewUrls';
import { useFilePreProcessingEffects } from './useFilePreProcessingEffects';
import { useChatInputFileUi } from './useChatInputFileUi';
import type { ChatInputBooleanUpdate } from '@/utils/chat-input/chatInputStateMachine';

interface ChatInputFileRefs {
  fileInputRef: RefObject<HTMLInputElement>;
  imageInputRef: RefObject<HTMLInputElement>;
  folderInputRef: RefObject<HTMLInputElement>;
  zipInputRef: RefObject<HTMLInputElement>;
  cameraInputRef: RefObject<HTMLInputElement>;
}

interface UseChatInputFileParams {
  fileIdInput: string;
  isAddingById: boolean;
  setAddingById: (value: ChatInputBooleanUpdate) => void;
  setFileIdInput: Dispatch<SetStateAction<string>>;
  setInputText: Dispatch<SetStateAction<string>>;
  textareaRef: RefObject<HTMLTextAreaElement>;
  selectedFiles: UploadedFile[];
  setSelectedFiles: SetSelectedFiles;
  setAppFileError: (error: string | null) => void;
  onProcessFiles: (files: FileList | File[]) => Promise<void>;
  onAddFileById: (fileId: string) => Promise<void>;
  isLoading: boolean;
  fileRefs: ChatInputFileRefs;
  justInitiatedFileOpRef: MutableRefObject<boolean>;
}

export const useChatInputFile = ({
  fileIdInput,
  isAddingById,
  setAddingById,
  setFileIdInput,
  setInputText,
  textareaRef,
  selectedFiles,
  setSelectedFiles,
  setAppFileError,
  onProcessFiles,
  onAddFileById,
  isLoading,
  fileRefs,
  justInitiatedFileOpRef,
}: UseChatInputFileParams) => {
  const { fileInputRef, imageInputRef, folderInputRef, zipInputRef, cameraInputRef } = fileRefs;

  const filePreProcessing = useFilePreProcessingEffects({
    fileInputRef,
    imageInputRef,
    folderInputRef,
    zipInputRef,
    justInitiatedFileOpRef,
    onProcessFiles,
    setSelectedFiles,
    setAppFileError,
  });

  const { modalsState, localFileState } = useChatInputFileUi({
    selectedFiles,
    setSelectedFiles,
    setInputText,
    setAppFileError,
    onProcessFiles,
    onOpenFolderPicker: filePreProcessing.handleOpenFolderPicker,
    onScreenshot: filePreProcessing.handleScreenshot,
    fileInputRef,
    imageInputRef,
    folderInputRef,
    zipInputRef,
    cameraInputRef,
    justInitiatedFileOpRef,
    textareaRef,
    isConverting: filePreProcessing.isConverting,
    setIsConverting: filePreProcessing.setIsConverting,
  });

  const removeSelectedFile = useCallback(
    (fileIdToRemove: string) => {
      setSelectedFiles((prev) => {
        const fileToRemove = prev.find((file) => file.id === fileIdToRemove);
        cleanupFilePreviewUrl(fileToRemove);
        return prev.filter((file) => file.id !== fileIdToRemove);
      });
    },
    [setSelectedFiles],
  );

  const handleAddFileByIdSubmit = useCallback(async () => {
    if (!fileIdInput.trim() || isAddingById || isLoading) {
      return;
    }

    setAddingById(true);
    justInitiatedFileOpRef.current = true;
    try {
      await onAddFileById(fileIdInput.trim());
      setFileIdInput('');
    } finally {
      setAddingById(false);
    }
  }, [fileIdInput, isAddingById, isLoading, justInitiatedFileOpRef, onAddFileById, setAddingById, setFileIdInput]);

  const handleSaveFileConfig = useCallback(
    (
      fileId: string,
      updates: {
        videoMetadata?: VideoMetadata;
        mediaResolution?: MediaResolution;
      },
    ) => {
      setSelectedFiles((prev) => prev.map((file) => (file.id === fileId ? { ...file, ...updates } : file)));
    },
    [setSelectedFiles],
  );

  return {
    filePreProcessing,
    modalsState,
    localFileState,
    removeSelectedFile,
    handleAddFileByIdSubmit,
    handleSaveFileConfig,
  };
};
