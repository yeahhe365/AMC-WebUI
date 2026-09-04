import React, { Suspense } from 'react';
import {
  type UploadedFile,
  type AppSettings,
  type ModelOption,
  type VideoMetadata,
  type MediaResolution,
} from '@/types';
import { isMarkdownFile } from '@/utils/file/fileTypeClassification';
import { lazyNamedComponent } from '@/utils/lazyNamedComponent';

const LazyFileConfigModal = lazyNamedComponent(() => import('@/components/modals/FileConfigModal'), 'FileConfigModal');
const LazyTokenCountModal = lazyNamedComponent(() => import('@/components/modals/TokenCountModal'), 'TokenCountModal');
const LazyFilePreviewModal = lazyNamedComponent(
  () => import('@/components/modals/FilePreviewModal'),
  'FilePreviewModal',
);
const LazyMarkdownPreviewModal = lazyNamedComponent(
  () => import('@/components/modals/MarkdownPreviewModal'),
  'MarkdownPreviewModal',
);

interface ChatInputFileModalsProps {
  configuringFile: UploadedFile | null;
  setConfiguringFile: (file: UploadedFile | null) => void;
  showTokenModal: boolean;
  setShowTokenModal: (show: boolean) => void;
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
  onSaveFileConfig,
  previewNavigation,
}) => {
  const markdownPreviewFile = previewFile && isMarkdownFile(previewFile) ? previewFile : null;
  const genericPreviewFile = previewFile && !isMarkdownFile(previewFile) ? previewFile : null;

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

      <Suspense fallback={null}>
        <LazyFilePreviewModal
          file={genericPreviewFile}
          onClose={onClosePreview}
          onPrev={previewNavigation.handlePrevImage}
          onNext={previewNavigation.handleNextImage}
          hasPrev={previewNavigation.currentImageIndex > 0}
          hasNext={
            previewNavigation.currentImageIndex !== -1 &&
            previewNavigation.currentImageIndex < previewNavigation.inputImages.length - 1
          }
          onSaveText={onSaveTextFile}
          initialEditMode={isPreviewEditable}
        />
      </Suspense>

      <Suspense fallback={null}>
        <LazyMarkdownPreviewModal
          file={markdownPreviewFile}
          onClose={onClosePreview}
          onSaveText={onSaveTextFile}
          initialEditMode={isPreviewEditable}
        />
      </Suspense>
    </>
  );
};
