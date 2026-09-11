import React, { useEffect, useRef } from 'react';
import { type UploadedFile } from '@/types';
import { usePdfViewer } from '@/hooks/ui/usePdfViewer';
import { PdfSidebar } from './pdf-viewer/PdfSidebar';
import { PdfMainContent } from './pdf-viewer/PdfMainContent';
import { PdfToolbar } from './pdf-viewer/PdfToolbar';
import { PdfSelectionBubble } from './pdf-viewer/PdfSelectionBubble';
import { usePdfHotkeys } from './pdf-viewer/usePdfHotkeys';
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
  defaultShowSidebar?: boolean;
  isCompact?: boolean;
  onQuote?: (text: string) => void;
}

const PdfViewerContent: React.FC<PdfViewerProps> = ({
  file,
  highlight,
  targetPage,
  onTargetPageConsumed,
  onCurrentPageChange,
  defaultShowSidebar = false,
  isCompact = true,
  onQuote,
}) => {
  const viewerWrapperRef = useRef<HTMLDivElement>(null);
  const {
    numPages,
    currentPage,
    scale,
    rotation,
    isLoading,
    error,
    showSidebar,
    isFitToWidth,
    pageNaturalWidth,
    pageNaturalHeight,
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
    handleFitToWidth,
    toggleSidebar,
    closeSidebar,
  } = usePdfViewer(file, {
    defaultShowSidebar,
    defaultFitToWidth: true,
  });

  usePdfHotkeys({
    containerRef: viewerWrapperRef,
    onPrevPage: previousPage,
    onNextPage: nextPage,
    onFirstPage: () => scrollToPage(1),
    onLastPage: () => scrollToPage(numPages || 1),
    onZoomIn: handleZoomIn,
    onZoomOut: handleZoomOut,
    onRotate: handleRotate,
    onFitToWidth: handleFitToWidth,
    onToggleSidebar: toggleSidebar,
  });

  const isHighlightForCurrentFile =
    !highlight?.docName ||
    highlight.docName.toLowerCase() === file.name.toLowerCase() ||
    file.name.toLowerCase().includes(highlight.docName.toLowerCase()) ||
    highlight.docName.toLowerCase().includes(file.name.toLowerCase());
  const effectiveHighlight = isHighlightForCurrentFile ? highlight : null;

  useEffect(() => {
    if (targetPage == null || !numPages) return;
    // If targetPage is invalid / out of bounds, clamp and consume to prevent stuck queue
    if (targetPage < 1 || targetPage > numPages) {
      const clampedPage = Math.max(1, Math.min(numPages, targetPage));
      scrollToPage(clampedPage, effectiveHighlight?.pageNumber === targetPage ? effectiveHighlight : null);
      onTargetPageConsumed?.();
      return;
    }
    // Pages render lazily; keep the request queued until the page exists.
    if (scrollToPage(targetPage, effectiveHighlight?.pageNumber === targetPage ? effectiveHighlight : null)) {
      onTargetPageConsumed?.();
    }
  }, [targetPage, numPages, scrollToPage, onTargetPageConsumed, effectiveHighlight]);

  useEffect(() => {
    onCurrentPageChange?.(currentPage);
  }, [currentPage, onCurrentPageChange]);

  return (
    <div
      ref={viewerWrapperRef}
      tabIndex={0}
      className="w-full h-full relative flex flex-row bg-gray-900 overflow-hidden focus:outline-none"
    >
      <PdfSidebar
        fileUrl={file.dataUrl}
        numPages={numPages}
        currentPage={currentPage}
        showSidebar={showSidebar}
        onPageClick={scrollToPage}
        sidebarRef={sidebarRef}
        isOverlay={isCompact}
        onClose={closeSidebar}
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
          highlight={effectiveHighlight}
          pageNaturalWidth={pageNaturalWidth}
          pageNaturalHeight={pageNaturalHeight}
        />

        <PdfToolbar
          currentPage={currentPage}
          numPages={numPages}
          scale={scale}
          showSidebar={showSidebar}
          isFitToWidth={isFitToWidth}
          onPageInputCommit={handlePageInputCommit}
          onPrevPage={previousPage}
          onNextPage={nextPage}
          onZoomIn={handleZoomIn}
          onZoomOut={handleZoomOut}
          onRotate={handleRotate}
          onToggleSidebar={toggleSidebar}
          onFitToWidth={handleFitToWidth}
        />

        <PdfSelectionBubble containerRef={containerRef} onQuote={onQuote} />
      </div>
    </div>
  );
};

export const PdfViewer: React.FC<PdfViewerProps> = (props) => <PdfViewerContent key={props.file.id} {...props} />;
