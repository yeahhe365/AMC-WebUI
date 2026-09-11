import React, { Suspense } from 'react';
import {
  type UploadedFile,
  type AppSettings,
  type ModelOption,
  type VideoMetadata,
  type MediaResolution,
  type LibraryItem,
  type ChatSettings,
} from '@/types';
import type { File as GeminiFile } from '@google/genai';
import { lazyNamedComponent } from '@/utils/lazyNamedComponent';

const LazyFileConfigModal = lazyNamedComponent(() => import('@/components/modals/FileConfigModal'), 'FileConfigModal');
const LazyTokenCountModal = lazyNamedComponent(() => import('@/components/modals/TokenCountModal'), 'TokenCountModal');
const LazyFilePreviewModal = lazyNamedComponent(
  () => import('@/components/modals/FilePreviewModal'),
  'FilePreviewModal',
);
const LazyLibraryPickerModal = lazyNamedComponent(
  () => import('@/components/modals/LibraryPickerModal'),
  'LibraryPickerModal',
);
const LazyCloudFilesModal = lazyNamedComponent(
  () => import('@/components/modals/cloud-files/CloudFilesModal'),
  'CloudFilesModal',
);
const LazyFolderZipImportModal = lazyNamedComponent(
  () => import('@/components/modals/FolderZipImportModal'),
  'FolderZipImportModal',
);

interface ChatInputFileModalsProps {
  configuringFile: UploadedFile | null;
  setConfiguringFile: (file: UploadedFile | null) => void;
  showTokenModal: boolean;
  setShowTokenModal: (show: boolean) => void;
  showLibraryPicker?: boolean;
  setShowLibraryPicker?: (show: boolean) => void;
  onImportFromLibrary?: (items: LibraryItem[]) => Promise<void>;
  showCloudFilesModal?: boolean;
  setShowCloudFilesModal?: (show: boolean) => void;
  onAddFilesFromCloud?: (files: GeminiFile[]) => void;
  onAddFileById?: (fileId: string) => Promise<void>;
  showFolderZipModal?: boolean;
  setShowFolderZipModal?: (show: boolean) => void;
  onSelectFolderImport?: () => void;
  onSelectZipImport?: () => void;
  rawAppSettings?: AppSettings;
  currentChatSettings?: ChatSettings;
  isImageGenerationModel?: boolean;
  isTranscribeModel?: boolean;
  previewFile: UploadedFile | null;
  onClosePreview: () => void;
  inputText: string;
  selectedFiles: UploadedFile[];
  appSettings: AppSettings;
  availableModels: ModelOption[];
  currentModelId: string;
  isGemini3: boolean;
  isPreviewEditable?: boolean;
  onSaveTextFile?: (fileId: string, content: string, newName: string) => void;
  onConvertToContext?: (contextFile: File) => void | Promise<void>;
  onSaveFileConfig: (
    fileId: string,
    updates: { videoMetadata?: VideoMetadata; mediaResolution?: MediaResolution },
  ) => void;
  previewNavigation: {
    handlePrevImage: () => void;
    handleNextImage: () => void;
    currentImageIndex: number;
    inputImages: UploadedFile[];
  };
}

export const ChatInputFileModals: React.FC<ChatInputFileModalsProps> = ({
  configuringFile,
  setConfiguringFile,
  showTokenModal,
  setShowTokenModal,
  showLibraryPicker,
  setShowLibraryPicker,
  onImportFromLibrary,
  showCloudFilesModal,
  setShowCloudFilesModal,
  onAddFilesFromCloud,
  onAddFileById,
  showFolderZipModal,
  setShowFolderZipModal,
  onSelectFolderImport,
  onSelectZipImport,
  rawAppSettings,
  currentChatSettings,
  isImageGenerationModel,
  isTranscribeModel,
  previewFile,
  onClosePreview,
  inputText,
  selectedFiles,
  appSettings,
  availableModels,
  currentModelId,
  isGemini3,
  isPreviewEditable,
  onSaveTextFile,
  onConvertToContext,
  onSaveFileConfig,
  previewNavigation,
}) => {
  return (
    <>
      {configuringFile && (
        <Suspense fallback={null}>
          <LazyFileConfigModal
            isOpen={!!configuringFile}
            onClose={() => setConfiguringFile(null)}
            file={configuringFile}
            onSave={onSaveFileConfig}
            isGemini3={isGemini3}
            globalMediaResolution={appSettings.mediaResolution}
          />
        </Suspense>
      )}

      <Suspense fallback={null}>
        <LazyTokenCountModal
          isOpen={showTokenModal}
          onClose={() => setShowTokenModal(false)}
          initialText={inputText}
          initialFiles={selectedFiles}
          appSettings={appSettings}
          availableModels={availableModels}
          currentModelId={currentModelId}
        />
      </Suspense>

      {showLibraryPicker && setShowLibraryPicker && onImportFromLibrary && (
        <Suspense fallback={null}>
          <LazyLibraryPickerModal
            isOpen={showLibraryPicker}
            onClose={() => setShowLibraryPicker(false)}
            onConfirm={onImportFromLibrary}
            initialCategory={isTranscribeModel ? 'audio' : isImageGenerationModel ? 'image' : 'all'}
          />
        </Suspense>
      )}

      {showCloudFilesModal && setShowCloudFilesModal && (
        <Suspense fallback={null}>
          <LazyCloudFilesModal
            isOpen={showCloudFilesModal}
            onClose={() => setShowCloudFilesModal(false)}
            onAddFiles={onAddFilesFromCloud}
            onAddFileById={onAddFileById}
            appSettings={rawAppSettings ?? appSettings}
            currentChatSettings={currentChatSettings ?? ({} as ChatSettings)}
          />
        </Suspense>
      )}

      {showFolderZipModal && setShowFolderZipModal && onSelectFolderImport && onSelectZipImport && (
        <Suspense fallback={null}>
          <LazyFolderZipImportModal
            isOpen={showFolderZipModal}
            onClose={() => setShowFolderZipModal(false)}
            onSelectFolder={onSelectFolderImport}
            onSelectZip={onSelectZipImport}
          />
        </Suspense>
      )}

      <Suspense fallback={null}>
        <LazyFilePreviewModal
          file={previewFile}
          onClose={onClosePreview}
          onPrev={previewNavigation.handlePrevImage}
          onNext={previewNavigation.handleNextImage}
          hasPrev={previewNavigation.currentImageIndex > 0}
          hasNext={
            previewNavigation.currentImageIndex !== -1 &&
            previewNavigation.currentImageIndex < previewNavigation.inputImages.length - 1
          }
          onSaveText={onSaveTextFile}
          onConvertToContext={onConvertToContext}
          initialEditMode={isPreviewEditable}
        />
      </Suspense>
    </>
  );
};
