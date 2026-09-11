import { logService } from '@/services/logService';
import {
  type Dispatch,
  type MutableRefObject,
  type RefObject,
  type SetStateAction,
  useCallback,
  useMemo,
  useState,
} from 'react';

import type { UploadedFile, AttachmentAction, LibraryItem } from '@/types';
import { dbService } from '@/services/db/dbService';
import { resolveLibraryItemToUploadedFile } from '@/utils/library/libraryFiles';
import { EXTENSION_TO_MIME } from '@/constants/fileTypeSupport';
import { createManagedObjectUrl } from '@/services/objectUrlManager';
import { cleanupFilePreviewUrl, cleanupReplacedFilePreviewUrl } from '@/utils/file/filePreviewUrls';
import { isTextFile } from '@/utils/file/fileTypeClassification';
import { useFileModalState } from '@/hooks/ui/useFileModalState';
import { readUploadedTextFileContent } from '@/utils/chat-input/textFileToInput';
import { useI18n } from '@/contexts/I18nContext';

interface UseChatInputFileUiOptions {
  selectedFiles: UploadedFile[];
  setSelectedFiles: Dispatch<SetStateAction<UploadedFile[]>>;
  setInputText: Dispatch<SetStateAction<string>>;
  setAppFileError: (error: string | null) => void;
  onProcessFiles: (files: FileList | File[]) => Promise<void>;
  onOpenFolderPicker: () => Promise<void>;
  onScreenshot: () => Promise<void>;
  fileInputRef: RefObject<HTMLInputElement>;
  imageInputRef: RefObject<HTMLInputElement>;
  folderInputRef: RefObject<HTMLInputElement>;
  zipInputRef: RefObject<HTMLInputElement>;
  cameraInputRef: RefObject<HTMLInputElement>;
  justInitiatedFileOpRef: MutableRefObject<boolean>;
  textareaRef: RefObject<HTMLTextAreaElement>;
  isConverting: boolean;
  setIsConverting: Dispatch<SetStateAction<boolean>>;
}

export const useChatInputFileUi = ({
  selectedFiles,
  setSelectedFiles,
  setInputText,
  setAppFileError,
  onProcessFiles,
  onOpenFolderPicker,
  onScreenshot,
  fileInputRef,
  imageInputRef,
  folderInputRef,
  zipInputRef,
  cameraInputRef,
  justInitiatedFileOpRef,
  textareaRef,
  isConverting,
  setIsConverting,
}: UseChatInputFileUiOptions) => {
  const { t } = useI18n();
  const [showCreateTextFileEditor, setShowCreateTextFileEditor] = useState(false);
  const [editingFile, setEditingFile] = useState<UploadedFile | null>(null);
  const [showRecorder, setShowRecorder] = useState(false);
  const [showAddByIdInput, setShowAddByIdInput] = useState(false);
  const [showCloudFilesModal, setShowCloudFilesModal] = useState(false);
  const [showAddByUrlInput, setShowAddByUrlInput] = useState(false);
  const [isHelpModalOpen, setIsHelpModalOpen] = useState(false);
  const [showTtsContextEditor, setShowTtsContextEditor] = useState(false);
  const [showTokenModal, setShowTokenModal] = useState(false);
  const [showLibraryPicker, setShowLibraryPicker] = useState(false);
  const [showFolderZipModal, setShowFolderZipModal] = useState(false);

  const {
    previewFile,
    closePreview,
    allImages: inputImages,
    currentImageIndex,
    handlePrevImage,
    handleNextImage,
    configuringFile,
    setConfiguringFile,
    openPreview,
    openConfiguration,
    isPreviewEditable,
  } = useFileModalState<UploadedFile>(selectedFiles);

  const handleSelectFolderImport = useCallback(() => {
    setShowFolderZipModal(false);
    if (window.showDirectoryPicker) {
      void onOpenFolderPicker();
    } else {
      folderInputRef.current?.click();
    }
  }, [folderInputRef, onOpenFolderPicker]);

  const handleSelectZipImport = useCallback(() => {
    setShowFolderZipModal(false);
    zipInputRef.current?.click();
  }, [zipInputRef]);

  const handleAttachmentAction = useCallback(
    (action: AttachmentAction) => {
      setShowAddByIdInput(false);
      setShowAddByUrlInput(false);

      switch (action) {
        case 'upload':
          fileInputRef.current?.click();
          break;
        case 'library':
          setShowLibraryPicker(true);
          break;
        case 'gallery':
          imageInputRef.current?.click();
          break;
        case 'folder':
          setShowFolderZipModal(true);
          break;
        case 'zip':
          zipInputRef.current?.click();
          break;
        case 'camera':
          cameraInputRef.current?.click();
          break;
        case 'recorder':
          setShowRecorder(true);
          break;
        case 'id':
          setShowCloudFilesModal(true);
          break;
        case 'url':
          setShowAddByUrlInput(true);
          break;
        case 'text':
          setEditingFile(null);
          setShowCreateTextFileEditor(true);
          break;
        case 'screenshot':
          void onScreenshot();
          break;
      }
    },
    [cameraInputRef, fileInputRef, imageInputRef, onScreenshot, zipInputRef],
  );

  const handleImportFromLibrary = useCallback(
    async (items: LibraryItem[]) => {
      if (!items.length) return;

      const newUploadedFiles: UploadedFile[] = await Promise.all(
        items.map((item) =>
          resolveLibraryItemToUploadedFile(item, (i) => dbService.fetchLibraryFileBlob(i), { generateNewId: true }),
        ),
      );

      setSelectedFiles((prev) => {
        const existingIds = new Set(prev.map((f) => f.id));
        const nonDuplicates = newUploadedFiles.filter((f) => !existingIds.has(f.id));
        return [...prev, ...nonDuplicates];
      });

      setShowLibraryPicker(false);
      textareaRef.current?.focus();
    },
    [setSelectedFiles, textareaRef],
  );

  const handleConfirmCreateTextFile = useCallback(
    async (content: string | Blob, filename: string) => {
      justInitiatedFileOpRef.current = true;

      const sanitizeFilename = (name: string) => name.trim().replace(/[<>:"/\\|?*]+/g, '_');

      let finalFilename = filename.trim() ? sanitizeFilename(filename) : `file-${Date.now()}.txt`;

      if (!finalFilename.includes('.')) {
        finalFilename += '.md';
      }

      const extension = `.${finalFilename.split('.').pop()?.toLowerCase()}`;
      const mimeType =
        content instanceof Blob
          ? content.type || EXTENSION_TO_MIME[extension] || 'application/octet-stream'
          : EXTENSION_TO_MIME[extension] || 'text/plain';
      const newFile = new File([content], finalFilename, { type: mimeType });

      setShowCreateTextFileEditor(false);
      setEditingFile(null);
      await onProcessFiles([newFile]);
    },
    [justInitiatedFileOpRef, onProcessFiles],
  );

  const handleAudioRecord = useCallback(
    async (file: File) => {
      justInitiatedFileOpRef.current = true;
      setShowRecorder(false);
      await onProcessFiles([file]);
      textareaRef.current?.focus();
    },
    [justInitiatedFileOpRef, onProcessFiles, textareaRef],
  );

  const handleEditFile = useCallback((file: UploadedFile) => {
    setEditingFile(file);
    setShowCreateTextFileEditor(true);
  }, []);

  const handleSaveTextFile = useCallback(
    async (content: string | Blob, filename: string) => {
      if (editingFile) {
        const sanitizeFilename = (name: string) => name.trim().replace(/[<>:"/\\|?*]+/g, '_');
        let finalName = filename.trim() ? sanitizeFilename(filename) : `file-${Date.now()}.txt`;
        if (!finalName.includes('.')) {
          finalName += '.md';
        }

        const extension = `.${finalName.split('.').pop()?.toLowerCase()}`;
        const type =
          content instanceof Blob
            ? content.type || EXTENSION_TO_MIME[extension] || 'application/octet-stream'
            : EXTENSION_TO_MIME[extension] || editingFile.type || 'text/plain';

        const nextRawFile = new File([content], finalName, { type });
        const nextDataUrl = createManagedObjectUrl(nextRawFile, { ownerId: `selected-file:${editingFile.id}` });

        setSelectedFiles((prev) =>
          prev.map((file) =>
            file.id === editingFile.id
              ? (() => {
                  const nextFile = {
                    ...file,
                    name: finalName,
                    type,
                    textContent: typeof content === 'string' ? content : undefined,
                    size: nextRawFile.size,
                    rawFile: nextRawFile,
                    dataUrl: nextDataUrl,
                  };
                  cleanupReplacedFilePreviewUrl(file, nextFile);
                  return nextFile;
                })()
              : file,
          ),
        );
        setShowCreateTextFileEditor(false);
        setEditingFile(null);
        return;
      }

      await handleConfirmCreateTextFile(content, filename);
    },
    [editingFile, handleConfirmCreateTextFile, setSelectedFiles],
  );

  const handleSavePreviewTextFile = useCallback(
    (fileId: string, content: string, newName: string) => {
      setSelectedFiles((prev) =>
        prev.map((file) =>
          file.id === fileId
            ? (() => {
                const nextRawFile = new File([content], newName, { type: 'text/plain' });
                const nextFile = {
                  ...file,
                  name: newName,
                  textContent: content,
                  size: content.length,
                  dataUrl: createManagedObjectUrl(nextRawFile, { ownerId: `selected-file:${fileId}` }),
                  rawFile: nextRawFile,
                };
                cleanupReplacedFilePreviewUrl(file, nextFile);
                return nextFile;
              })()
            : file,
        ),
      );
    },
    [setSelectedFiles],
  );

  const handleConfigureFile = useCallback(
    (file: UploadedFile) => {
      if (isTextFile(file)) {
        openPreview(file, { editable: true });
        return;
      }

      openConfiguration(file);
    },
    [openConfiguration, openPreview],
  );

  const handlePreviewFile = useCallback(
    (file: UploadedFile) => {
      openPreview(file);
    },
    [openPreview],
  );

  const handleMoveTextFileToInput = useCallback(
    async (file: UploadedFile) => {
      try {
        setAppFileError(null);
        const content = await readUploadedTextFileContent(file);
        setInputText(content);
        setSelectedFiles((prev) => {
          const fileToRemove = prev.find((candidate) => candidate.id === file.id);
          cleanupFilePreviewUrl(fileToRemove);
          return prev.filter((candidate) => candidate.id !== file.id);
        });

        requestAnimationFrame(() => {
          const textarea = textareaRef.current;
          if (!textarea) {
            return;
          }

          textarea.focus();
          textarea.setSelectionRange(content.length, content.length);
        });
      } catch (error) {
        logService.error('Failed to move text file into input:', error);
        setAppFileError(t('selectedFileReadTextFailed'));
      }
    },
    [setAppFileError, setInputText, setSelectedFiles, t, textareaRef],
  );

  const handleConvertZipToContext = useCallback(
    async (contextFile: File) => {
      const currentPreview = previewFile;
      closePreview();

      if (currentPreview) {
        setSelectedFiles((prev) => {
          cleanupFilePreviewUrl(currentPreview);
          return prev.filter((candidate) => candidate.id !== currentPreview.id);
        });
      }

      await onProcessFiles([contextFile]);
    },
    [closePreview, onProcessFiles, previewFile, setSelectedFiles],
  );

  const modalsState = useMemo(
    () => ({
      showCreateTextFileEditor,
      setShowCreateTextFileEditor,
      editingFile,
      setEditingFile,
      showRecorder,
      setShowRecorder,
      showAddByIdInput,
      setShowAddByIdInput,
      showCloudFilesModal,
      setShowCloudFilesModal,
      showAddByUrlInput,
      setShowAddByUrlInput,
      isHelpModalOpen,
      setIsHelpModalOpen,
      showTtsContextEditor,
      setShowTtsContextEditor,
      showLibraryPicker,
      setShowLibraryPicker,
      handleImportFromLibrary,
      showFolderZipModal,
      setShowFolderZipModal,
      handleSelectFolderImport,
      handleSelectZipImport,
      fileInputRef,
      imageInputRef,
      folderInputRef,
      zipInputRef,
      cameraInputRef,
      handleAttachmentAction,
      handleConfirmCreateTextFile,
      handleAudioRecord,
      handleEditFile,
    }),
    [
      editingFile,
      cameraInputRef,
      fileInputRef,
      folderInputRef,
      handleAttachmentAction,
      handleAudioRecord,
      handleConfirmCreateTextFile,
      handleEditFile,
      handleImportFromLibrary,
      handleSelectFolderImport,
      handleSelectZipImport,
      imageInputRef,
      isHelpModalOpen,
      showAddByIdInput,
      showCloudFilesModal,
      showAddByUrlInput,
      showCreateTextFileEditor,
      showFolderZipModal,
      showLibraryPicker,
      showRecorder,
      showTtsContextEditor,
      zipInputRef,
    ],
  );

  const localFileState = useMemo(
    () => ({
      configuringFile,
      setConfiguringFile,
      previewFile,
      closePreviewFile: closePreview,
      isPreviewEditable,
      isConverting,
      setIsConverting,
      showTokenModal,
      setShowTokenModal,
      handleSaveTextFile,
      handleSavePreviewTextFile,
      handleConfigureFile,
      handleMoveTextFileToInput,
      handlePreviewFile,
      handlePrevImage,
      handleNextImage,
      inputImages,
      currentImageIndex,
      handleConvertZipToContext,
    }),
    [
      closePreview,
      configuringFile,
      currentImageIndex,
      handleConfigureFile,
      handleConvertZipToContext,
      handleMoveTextFileToInput,
      handleNextImage,
      handlePreviewFile,
      handlePrevImage,
      handleSavePreviewTextFile,
      handleSaveTextFile,
      inputImages,
      isConverting,
      isPreviewEditable,
      previewFile,
      setConfiguringFile,
      setIsConverting,
      showTokenModal,
    ],
  );

  return {
    modalsState,
    localFileState,
  };
};
