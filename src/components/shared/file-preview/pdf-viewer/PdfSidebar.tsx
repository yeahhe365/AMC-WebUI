import React, { type RefObject } from 'react';
import { Document, Page } from 'react-pdf';
import { X } from 'lucide-react';
import { useI18n } from '@/contexts/I18nContext';

const THUMBNAIL_WINDOW_RADIUS = 5;

interface PdfSidebarProps {
  fileUrl: string | undefined;
  numPages: number | null;
  currentPage: number;
  showSidebar: boolean;
  onPageClick: (pageNum: number) => void;
  sidebarRef: RefObject<HTMLDivElement>;
  isOverlay?: boolean;
  onClose?: () => void;
}

export const PdfSidebar: React.FC<PdfSidebarProps> = ({
  fileUrl,
  numPages,
  currentPage,
  showSidebar,
  onPageClick,
  sidebarRef,
  isOverlay = true,
  onClose,
}) => {
  const { t } = useI18n();

  if (!showSidebar) return null;

  return (
    <>
      {isOverlay && (
        <div
          className="absolute inset-0 z-30 bg-black/40 backdrop-blur-[1px] cursor-pointer animate-in fade-in duration-200"
          onClick={onClose}
          aria-hidden="true"
        />
      )}
      <div
        className={`bg-gray-950 border-r border-white/10 flex flex-col h-full select-none ${
          isOverlay
            ? 'absolute left-0 top-0 bottom-0 z-40 w-44 shadow-2xl bg-gray-950/95 animate-in slide-in-from-left duration-200'
            : 'relative flex-shrink-0 w-44'
        }`}
        data-testid="pdf-sidebar"
      >
        <div className="flex items-center justify-between px-3 py-2 border-b border-white/10 flex-shrink-0 bg-white/[0.02]">
          <span className="text-xs font-semibold text-white/80">
            {t('pdfToggleThumbnails')} {numPages ? `(${numPages})` : ''}
          </span>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="p-1 rounded text-white/50 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
              aria-label={t('close')}
              title={t('close')}
            >
              <X size={14} />
            </button>
          )}
        </div>

        <div ref={sidebarRef} className="flex-grow overflow-y-auto custom-scrollbar p-3">
          <Document file={fileUrl} loading={null} error={null} className="flex flex-col gap-4 items-center">
            {numPages &&
              Array.from(new Array(numPages), (_, index) => {
                const pageNum = index + 1;
                const shouldRenderThumbnail = Math.abs(pageNum - currentPage) <= THUMBNAIL_WINDOW_RADIUS;
                return (
                  <div
                    key={pageNum}
                    data-thumbnail-page={pageNum}
                    className="cursor-pointer group flex flex-col items-center"
                    onClick={() => onPageClick(pageNum)}
                  >
                    <div
                      className={`relative transition-all duration-200 ${
                        currentPage === pageNum ? 'ring-2 ring-blue-500 shadow-lg' : 'hover:ring-2 hover:ring-white/30'
                      }`}
                    >
                      {shouldRenderThumbnail ? (
                        <Page
                          pageNumber={pageNum}
                          width={110}
                          renderTextLayer={false}
                          renderAnnotationLayer={false}
                          className="shadow-sm bg-white rounded-[2px] overflow-hidden"
                          loading={<div className="w-[110px] h-[150px] bg-white/5 animate-pulse rounded-sm" />}
                        />
                      ) : (
                        <div className="w-[110px] h-[150px] bg-white/5 rounded-sm border border-white/10 flex items-center justify-center text-white/35 text-xs font-mono">
                          PAGE {pageNum}
                        </div>
                      )}
                      <div className="absolute bottom-1 right-1 bg-black/80 text-white text-[10px] px-1.5 py-0.5 rounded font-mono">
                        {pageNum}
                      </div>
                    </div>
                  </div>
                );
              })}
          </Document>
        </div>
      </div>
    </>
  );
};
