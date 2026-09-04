import React, { useRef } from 'react';
import { createPortal } from 'react-dom';
import { useWindowContext } from '@/contexts/WindowContext';
import { Z_INDEX_MODAL_BACKDROP } from '@/constants/layout';
import { useHtmlPreviewModal } from '@/hooks/ui/useHtmlPreviewModal';
import { HtmlPreviewHeader } from './html-preview/HtmlPreviewHeader';
import { HtmlPreviewContent } from './html-preview/HtmlPreviewContent';
import type { LiveArtifactFollowupPayload } from '@/utils/live-artifacts/liveArtifactFollowup';
import { DEFAULT_HTML_PREVIEW_PRIVILEGE, type HtmlPreviewPrivilege } from '@/utils/html-preview/previewPrivilege';

interface HtmlPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  htmlContent: string | null;
  initialTrueFullscreenRequest?: boolean;
  privilege?: HtmlPreviewPrivilege;
  themeId?: string;
  baseFontSize?: number;
  onLiveArtifactFollowUp?: (payload: LiveArtifactFollowupPayload) => void;
}

export const HtmlPreviewModal: React.FC<HtmlPreviewModalProps> = ({
  isOpen,
  onClose,
  htmlContent,
  initialTrueFullscreenRequest,
  privilege = DEFAULT_HTML_PREVIEW_PRIVILEGE,
  themeId,
  baseFontSize,
  onLiveArtifactFollowUp,
}) => {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const { document: targetDocument } = useWindowContext();

  const {
    isActuallyOpen,
    isTrueFullscreen,
    isDirectFullscreenLaunch,
    scale,
    isPreviewReady,
    contentHeight,
    isScreenshotting,
    handleZoomIn,
    handleZoomOut,
    handleDownload,
    handleScreenshot,
    handleRefresh,
    iframeRefreshKey,
    enterTrueFullscreen,
    exitTrueFullscreen,
    getPreviewTitle,
    MIN_ZOOM,
    MAX_ZOOM,
  } = useHtmlPreviewModal({
    isOpen,
    onClose,
    htmlContent,
    initialTrueFullscreenRequest,
    privilege,
    themeId,
    iframeRef,
    onLiveArtifactFollowUp: privilege === 'sanitized' ? onLiveArtifactFollowUp : undefined,
  });

  if (!isActuallyOpen || !htmlContent) {
    return null;
  }

  const animationClass = isOpen
    ? initialTrueFullscreenRequest
      ? ''
      : 'modal-enter-animation'
    : 'modal-exit-animation';

  const containerClass = isDirectFullscreenLaunch
    ? `fixed inset-0 ${Z_INDEX_MODAL_BACKDROP} opacity-0 pointer-events-none`
    : `fixed inset-0 bg-black/80 flex items-center justify-center ${Z_INDEX_MODAL_BACKDROP}`;

  return createPortal(
    <div className={containerClass} role="dialog" aria-modal="true" aria-labelledby="html-preview-modal-title">
      <div className={`bg-[var(--theme-bg-secondary)] w-full h-full flex flex-col overflow-hidden ${animationClass}`}>
        <HtmlPreviewHeader
          title={getPreviewTitle()}
          privilege={privilege}
          scale={scale}
          isTrueFullscreen={isTrueFullscreen}
          isPreviewReady={isPreviewReady}
          isScreenshotting={isScreenshotting}
          minZoom={MIN_ZOOM}
          maxZoom={MAX_ZOOM}
          onZoomIn={handleZoomIn}
          onZoomOut={handleZoomOut}
          onRefresh={handleRefresh}
          onDownload={handleDownload}
          onScreenshot={handleScreenshot}
          onToggleFullscreen={isTrueFullscreen ? exitTrueFullscreen : enterTrueFullscreen}
          onClose={onClose}
        />

        <HtmlPreviewContent
          key={iframeRefreshKey}
          iframeRef={iframeRef}
          htmlContent={htmlContent}
          scale={scale}
          contentHeight={contentHeight}
          privilege={privilege}
          themeId={themeId}
          baseFontSize={baseFontSize}
        />
      </div>
    </div>,
    targetDocument.body,
  );
};
