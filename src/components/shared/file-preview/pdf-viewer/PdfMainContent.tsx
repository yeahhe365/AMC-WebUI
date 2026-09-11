import React, { useState, useEffect, useRef, type MutableRefObject } from 'react';
import { Document, Page } from 'react-pdf';
import { Loader2, AlertCircle } from 'lucide-react';
import { useI18n } from '@/contexts/I18nContext';
import type { PdfNavHighlight } from '@/stores/mediaNavStore';
import { PdfHighlightOverlay } from '@/components/media-nav/PdfHighlightOverlay';

interface PdfMainContentProps {
  fileUrl: string | undefined;
  numPages: number | null;
  scale: number;
  rotation: number;
  isLoading: boolean;
  error: string | null;
  onLoadSuccess: (data: { numPages: number }) => void;
  onLoadError: (error: Error) => void;
  setPageRef: (pageNum: number, element: HTMLDivElement | null) => void;
  containerRef: MutableRefObject<HTMLDivElement | null>;
  /** Visual-grounding box rendered on top of its page (PDF navigation panel). */
  highlight?: PdfNavHighlight | null;
  pageNaturalWidth?: number;
  pageNaturalHeight?: number;
}

const LazyPdfPage = ({
  pageNum,
  scale,
  rotation,
  setPageRef,
  containerRef,
  highlight,
  pageNaturalWidth = 595,
  pageNaturalHeight = 842,
}: {
  pageNum: number;
  scale: number;
  rotation: number;
  setPageRef: (pageNum: number, element: HTMLDivElement | null) => void;
  containerRef: MutableRefObject<HTMLDivElement | null>;
  highlight?: PdfNavHighlight | null;
  pageNaturalWidth?: number;
  pageNaturalHeight?: number;
}) => {
  const [isVisible, setIsVisible] = useState(false);
  const wrapperRef = useRef<HTMLDivElement | null>(null);

  const isRotated = rotation === 90 || rotation === 270;
  const effectiveWidth = isRotated ? pageNaturalHeight : pageNaturalWidth;
  const effectiveHeight = isRotated ? pageNaturalWidth : pageNaturalHeight;
  const estimatedWidth = effectiveWidth * scale;
  const estimatedHeight = effectiveHeight * scale;

  useEffect(() => {
    const el = wrapperRef.current;
    const container = containerRef.current;
    if (!el || !container) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        setIsVisible(entry.isIntersecting);
      },
      {
        root: container,
        rootMargin: '150% 0px 150% 0px',
        threshold: 0,
      },
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [containerRef]);

  return (
    <div
      ref={(el) => {
        wrapperRef.current = el;
        setPageRef(pageNum, el);
      }}
      data-page-number={pageNum}
      className="shadow-2xl relative bg-white flex items-center justify-center"
      style={{
        minHeight: `${estimatedHeight}px`,
        minWidth: `${estimatedWidth}px`,
      }}
    >
      {isVisible ? (
        <Page
          pageNumber={pageNum}
          scale={scale}
          rotate={rotation}
          renderTextLayer={true}
          renderAnnotationLayer={true}
          className="bg-white"
          loading={
            <div className="absolute inset-0 flex items-center justify-center text-gray-400">
              <Loader2 size={24} className="animate-spin" />
            </div>
          }
        />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-50 text-gray-300">
          <span className="text-sm font-mono font-medium">PAGE {pageNum}</span>
        </div>
      )}
      {highlight && highlight.pageNumber === pageNum && (
        <PdfHighlightOverlay highlight={highlight} rotation={rotation} />
      )}
    </div>
  );
};

export const PdfMainContent: React.FC<PdfMainContentProps> = ({
  fileUrl,
  numPages,
  scale,
  rotation,
  isLoading,
  error,
  onLoadSuccess,
  onLoadError,
  setPageRef,
  containerRef,
  highlight,
  pageNaturalWidth,
  pageNaturalHeight,
}) => {
  const { t } = useI18n();
  return (
    <div className="flex-1 min-h-0 relative flex flex-col min-w-0">
      <div ref={containerRef} className="flex-grow overflow-y-auto custom-scrollbar p-2 sm:p-4 pb-8 relative">
        <div
          className={`flex flex-col items-center gap-6 transition-opacity duration-300 ${isLoading ? 'opacity-0' : 'opacity-100'}`}
        >
          <Document
            file={fileUrl}
            onLoadSuccess={onLoadSuccess}
            onLoadError={onLoadError}
            loading={null}
            error={null}
            className="flex flex-col items-center gap-6 w-full"
          >
            {numPages &&
              Array.from(new Array(numPages), (_, index) => {
                const pageNum = index + 1;
                return (
                  <LazyPdfPage
                    key={pageNum}
                    pageNum={pageNum}
                    scale={scale}
                    rotation={rotation}
                    setPageRef={setPageRef}
                    containerRef={containerRef}
                    highlight={highlight}
                    pageNaturalWidth={pageNaturalWidth}
                    pageNaturalHeight={pageNaturalHeight}
                  />
                );
              })}
          </Document>
        </div>

        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="bg-black/80 p-4 rounded-xl flex flex-col items-center gap-2 text-white">
              <Loader2 size={32} className="animate-spin" />
              <span className="text-sm font-medium">{t('pdfLoading')}</span>
            </div>
          </div>
        )}

        {error && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="bg-red-950/80 p-6 rounded-xl flex flex-col items-center gap-3 text-red-200 border border-red-500/30 max-w-sm text-center">
              <AlertCircle size={32} />
              <span className="text-sm font-medium">{error}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
