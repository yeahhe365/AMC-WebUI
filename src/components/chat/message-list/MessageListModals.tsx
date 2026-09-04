import React, { Suspense } from 'react';
import { type UploadedFile, type VideoMetadata, type MediaResolution } from '@/types';
import { lazyNamedComponent } from '@/utils/lazyNamedComponent';
import type { LiveArtifactFollowupPayload } from '@/utils/live-artifacts/liveArtifactFollowup';
import type { HtmlPreviewRequest } from '@/utils/html-preview/previewPrivilege';

const LazyHtmlPreviewModal = lazyNamedComponent(
  () => import('@/components/modals/HtmlPreviewModal'),
  'HtmlPreviewModal',
);
const LazyFilePreviewModal = lazyNamedComponent(
  () => import('@/components/modals/FilePreviewModal'),
  'FilePreviewModal',
);
const LazyMarkdownPreviewModal = lazyNamedComponent(
  () => import('@/components/modals/MarkdownPreviewModal'),
  'MarkdownPreviewModal',
);
const LazyFileConfigModal = lazyNamedComponent(() => import('@/components/modals/FileConfigModal'), 'FileConfigModal');

interface MessageListConfiguringFile {
  file: UploadedFile;
  messageId: string;
}

interface MessageListModalsProps {
  genericPreviewFile: UploadedFile | null;
  markdownPreviewFile: UploadedFile | null;
  closeFilePreviewModal: () => void;
  handlePrevImage: () => void;
  handleNextImage: () => void;
  currentImageIndex: number;
  imageCount: number;
  isHtmlPreviewModalOpen: boolean;
  htmlPreview: HtmlPreviewRequest | null;
  handleCloseHtmlPreview: () => void;
  handleLiveArtifactFollowUp: (payload: LiveArtifactFollowupPayload) => void;
  configuringFile: MessageListConfiguringFile | null;
  setConfiguringFile: (file: MessageListConfiguringFile | null) => void;
  handleSaveFileConfig: (
    fileId: string,
    updates: { videoMetadata?: VideoMetadata; mediaResolution?: MediaResolution },
  ) => void;
  isGemini3: boolean;
}

export const MessageListModals: React.FC<MessageListModalsProps> = ({
  genericPreviewFile,
  markdownPreviewFile,
  closeFilePreviewModal,
  handlePrevImage,
  handleNextImage,
  currentImageIndex,
  imageCount,
  isHtmlPreviewModalOpen,
  htmlPreview,
  handleCloseHtmlPreview,
  handleLiveArtifactFollowUp,
  configuringFile,
  setConfiguringFile,
  handleSaveFileConfig,
  isGemini3,
}) => (
  <>
    {genericPreviewFile && (
      <Suspense fallback={null}>
        <LazyFilePreviewModal
          file={genericPreviewFile}
          onClose={closeFilePreviewModal}
          onPrev={handlePrevImage}
          onNext={handleNextImage}
          hasPrev={currentImageIndex > 0}
          hasNext={currentImageIndex !== -1 && currentImageIndex < imageCount - 1}
        />
      </Suspense>
    )}

    {markdownPreviewFile && (
      <Suspense fallback={null}>
        <LazyMarkdownPreviewModal file={markdownPreviewFile} onClose={closeFilePreviewModal} />
      </Suspense>
    )}

    {isHtmlPreviewModalOpen && htmlPreview !== null && (
      <Suspense fallback={null}>
        <LazyHtmlPreviewModal
          isOpen={isHtmlPreviewModalOpen}
          onClose={handleCloseHtmlPreview}
          htmlContent={htmlPreview.html}
          initialTrueFullscreenRequest={htmlPreview.initialTrueFullscreen}
          privilege={htmlPreview.privilege}
          themeId={htmlPreview.themeId}
          baseFontSize={htmlPreview.baseFontSize}
          onLiveArtifactFollowUp={htmlPreview.privilege === 'sanitized' ? handleLiveArtifactFollowUp : undefined}
        />
      </Suspense>
    )}

    {configuringFile && (
      <Suspense fallback={null}>
        <LazyFileConfigModal
          isOpen={!!configuringFile}
          onClose={() => setConfiguringFile(null)}
          file={configuringFile.file}
          onSave={handleSaveFileConfig}
          isGemini3={isGemini3}
        />
      </Suspense>
    )}
  </>
);
