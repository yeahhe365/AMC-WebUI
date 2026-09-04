import React, { useEffect } from 'react';
import { type UploadedFile } from '@/types';
import { usePdfViewer } from '@/hooks/ui/usePdfViewer';
import { PdfSidebar } from './pdf-viewer/PdfSidebar';
import { PdfMainContent } from './pdf-viewer/PdfMainContent';
import { PdfToolbar } from './pdf-viewer/PdfToolbar';
import type { PdfNavHighlight } from '@/stores/mediaNavStore';

interface PdfViewerProps {
  file: UploadedFile;
  /** Visual-grounding box overlay (PDF navigation panel). */
  highlight?: PdfNavHighlight | null;
  /** External jump request; consumed via onTargetPageConsumed once scrolled to. */
  targetPage?: number | null;
  onTargetPageConsumed?: () => void;
  /** Notified whenever scroll tracking lands on a different page. */
  onCurrentPageChange?: (page: number) => void;
}

const PdfViewerContent: React.FC<PdfViewerProps> = ({
  file,
  highlight,
  targetPage,
  onTargetPageConsumed,
  onCurrentPageChange,
}) => {
  const {
    numPages,
    currentPage,
    scale,
    rotation,
    isLoading,
    error,
    showSidebar,
    containerRef,
    sidebarRef,
    setPageRef,
    onDocumentLoadSuccess,
    onDocumentLoadError,
    scrollToPage,
    previousPage,
    nextPage,
    handlePageInputCommit,
    handleZoomIn,
    handleZoomOut,
    handleRotate,
    toggleSidebar,
  } = usePdfViewer(file);

  useEffect(() => {
    if (targetPage == null || !numPages) return;
    // Pages render lazily; keep the request queued until the page exists.
    if (scrollToPage(targetPage)) {
      onTargetPageConsumed?.();
    }
  }, [targetPage, numPages, scrollToPage, onTargetPageConsumed]);

  useEffect(() => {
    onCurrentPageChange?.(currentPage);
  }, [currentPage, onCurrentPageChange]);

  return (
    <div className="w-full h-full relative flex flex-row bg-gray-900 overflow-hidden select-none">
      <PdfSidebar
        fileUrl={file.dataUrl}
        numPages={numPages}
        currentPage={currentPage}
        showSidebar={showSidebar}
        onPageClick={scrollToPage}
        sidebarRef={sidebarRef}
      />

      <div className="flex-grow h-full relative flex flex-col min-w-0">
        <PdfMainContent
          fileUrl={file.dataUrl}
          numPages={numPages}
          scale={scale}
          rotation={rotation}
          isLoading={isLoading}
          error={error}
          onLoadSuccess={onDocumentLoadSuccess}
          onLoadError={onDocumentLoadError}
          setPageRef={setPageRef}
          containerRef={containerRef}
          highlight={highlight}
        />

        <PdfToolbar
          currentPage={currentPage}
          numPages={numPages}
          scale={scale}
          showSidebar={showSidebar}
          onPageInputCommit={handlePageInputCommit}
          onPrevPage={previousPage}
          onNextPage={nextPage}
          onZoomIn={handleZoomIn}
          onZoomOut={handleZoomOut}
          onRotate={handleRotate}
          onToggleSidebar={toggleSidebar}
        />
      </div>
    </div>
  );
};

export const PdfViewer: React.FC<PdfViewerProps> = (props) => <PdfViewerContent key={props.file.id} {...props} />;
