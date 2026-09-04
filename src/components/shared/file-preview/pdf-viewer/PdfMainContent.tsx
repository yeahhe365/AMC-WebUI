import React, { useState, useEffect, useRef, type MutableRefObject } from 'react';
import { Document, Page } from 'react-pdf';
import { Loader2, AlertCircle } from 'lucide-react';
import { useI18n } from '@/contexts/I18nContext';
import type { PdfNavHighlight } from '@/stores/mediaNavStore';
import PdfHighlightOverlay from '@/components/media-nav/PdfHighlightOverlay';

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
}

const LazyPdfPage = ({
  pageNum,
  scale,
  rotation,
  setPageRef,
  containerRef,
  highlight,
}: {
  pageNum: number;
  scale: number;
  rotation: number;
  setPageRef: (pageNum: number, element: HTMLDivElement | null) => void;
  containerRef: MutableRefObject<HTMLDivElement | null>;
  highlight?: PdfNavHighlight | null;
}) => {
  const [isVisible, setIsVisible] = useState(false);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const wrapperRef = useRef<HTMLDivElement | null>(null);

  const isRotated = rotation === 90 || rotation === 270;
  const estimatedWidth = (isRotated ? 842 : 595) * scale;
  const estimatedHeight = (isRotated ? 595 : 842) * scale;

  useEffect(() => {
    const el = wrapperRef.current;
    const container = containerRef.current;
    if (!el || !container) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
        } else {
          const rect = el.getBoundingClientRect();
          if (rect.height > 0 && rect.width > 0) {
            setDimensions({ width: rect.width, height: rect.height });
          }
          setIsVisible(false);
        }
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
      className="shadow-2xl relative bg-white flex items-center justify-center transition-all duration-200"
      style={{
        height: isVisible ? 'auto' : dimensions.height ? `${dimensions.height}px` : `${estimatedHeight}px`,
        width: isVisible ? 'auto' : dimensions.width ? `${dimensions.width}px` : `${estimatedWidth}px`,
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
      {highlight && highlight.pageNumber === pageNum && <PdfHighlightOverlay highlight={highlight} />}
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
}) => {
  const { t } = useI18n();
  return (
    <div className="flex-1 min-h-0 relative flex flex-col min-w-0">
      <div ref={containerRef} className="flex-grow overflow-y-auto custom-scrollbar p-4 sm:p-8 pb-8 relative">
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
                    key={`${pageNum}:${scale}:${rotation}`}
                    pageNum={pageNum}
                    scale={scale}
                    rotation={rotation}
                    setPageRef={setPageRef}
                    containerRef={containerRef}
                    highlight={highlight}
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
