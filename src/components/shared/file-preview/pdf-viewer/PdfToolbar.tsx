import React, { useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, ZoomIn, ZoomOut, RotateCw, PanelLeft } from 'lucide-react';
import { ToolbarButton, ToolbarDivider } from '@/components/shared/file-preview/FloatingToolbar';
import { Tooltip } from '@/components/shared/Tooltip';
import { useI18n } from '@/contexts/I18nContext';

interface PdfToolbarProps {
  currentPage: number;
  numPages: number | null;
  scale: number;
  showSidebar: boolean;
  onPageInputCommit: (value: string) => void;
  onPrevPage: () => void;
  onNextPage: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onRotate: () => void;
  onToggleSidebar: () => void;
  isFitToWidth?: boolean;
  onFitToWidth?: () => void;
}

export const PdfToolbar: React.FC<PdfToolbarProps> = ({
  currentPage,
  numPages,
  scale,
  showSidebar,
  onPageInputCommit,
  onPrevPage,
  onNextPage,
  onZoomIn,
  onZoomOut,
  onRotate,
  onToggleSidebar,
  isFitToWidth,
  onFitToWidth,
}) => {
  const { t } = useI18n();
  const inputRef = useRef<HTMLInputElement>(null);
  const [pageInputDraft, setPageInputDraft] = useState(String(currentPage));
  const [isEditingPageInput, setIsEditingPageInput] = useState(false);

  const pageInput = isEditingPageInput ? pageInputDraft : String(currentPage);

  const handlePageInputChange = (value: string) => {
    if (!isEditingPageInput) {
      setIsEditingPageInput(true);
    }
    setPageInputDraft(value);
  };

  const handlePageInputFocus = () => {
    setIsEditingPageInput(true);
    setPageInputDraft(String(currentPage));
  };

  const commitPageInput = () => {
    onPageInputCommit(pageInputDraft);
    setIsEditingPageInput(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      commitPageInput();
      inputRef.current?.blur();
    }
  };

  if (!numPages || numPages <= 0) return null;

  return (
    <div className="flex-shrink-0 w-full bg-[#101113] border-t border-white/10 px-3 sm:px-4 py-2 flex items-center justify-between sm:justify-center gap-1.5 sm:gap-3 z-30 select-none">
      <Tooltip text={`${t('pdfToggleThumbnails')} (T)`} asChild>
        <ToolbarButton onClick={onToggleSidebar} active={showSidebar} title={t('pdfToggleThumbnails')}>
          <PanelLeft size={18} />
        </ToolbarButton>
      </Tooltip>

      <ToolbarDivider />

      <div className="flex items-center gap-1">
        <Tooltip text={`${t('pdfPreviousPage')} (← / K)`} asChild>
          <ToolbarButton onClick={onPrevPage} disabled={currentPage <= 1} title={t('pdfPreviousPage')}>
            <ChevronLeft size={18} />
          </ToolbarButton>
        </Tooltip>

        <div className="flex items-center bg-white/10 border border-white/15 rounded-md px-2 py-0.5 text-xs font-mono text-white/90">
          <input
            ref={inputRef}
            type="text"
            value={pageInput}
            onChange={(e) => handlePageInputChange(e.target.value)}
            onFocus={handlePageInputFocus}
            onKeyDown={handleKeyDown}
            onBlur={commitPageInput}
            className="w-7 bg-transparent text-center font-mono text-xs text-white focus:bg-white/15 focus:outline-none rounded px-0.5 py-0.5 leading-none transition-colors"
            aria-label={t('pdfPageNumberAria')}
          />
          <span className="text-white/50 select-none whitespace-nowrap leading-none pl-0.5">/ {numPages}</span>
        </div>

        <Tooltip text={`${t('pdfNextPage')} (→ / J)`} asChild>
          <ToolbarButton onClick={onNextPage} disabled={currentPage >= numPages} title={t('pdfNextPage')}>
            <ChevronRight size={18} />
          </ToolbarButton>
        </Tooltip>
      </div>

      <ToolbarDivider />

      <div className="flex items-center gap-1">
        <Tooltip text={`${t('filePreviewZoomOut')} (-)`} asChild>
          <ToolbarButton onClick={onZoomOut} disabled={scale <= 0.4} title={t('filePreviewZoomOut')}>
            <ZoomOut size={18} />
          </ToolbarButton>
        </Tooltip>
        <Tooltip text={`${isFitToWidth ? t('filePreviewResetView') : t('pdfFitWidth')} (W)`} asChild>
          <button
            type="button"
            onClick={onFitToWidth}
            title={isFitToWidth ? t('filePreviewResetView') : t('pdfFitWidth')}
            aria-label={isFitToWidth ? t('filePreviewResetView') : t('pdfFitWidth')}
            className={`min-w-[48px] text-center px-1.5 py-0.5 rounded font-mono text-xs transition-colors cursor-pointer select-none ${
              isFitToWidth
                ? 'text-sky-400 font-semibold bg-sky-500/15 border border-sky-500/30'
                : 'text-white/90 hover:text-white hover:bg-white/10'
            }`}
          >
            {Math.round(scale * 100)}%
          </button>
        </Tooltip>
        <Tooltip text={`${t('filePreviewZoomIn')} (+)`} asChild>
          <ToolbarButton onClick={onZoomIn} disabled={scale >= 3.0} title={t('filePreviewZoomIn')}>
            <ZoomIn size={18} />
          </ToolbarButton>
        </Tooltip>
      </div>

      <ToolbarDivider />

      <Tooltip text={`${t('pdfRotate')} (R)`} asChild>
        <ToolbarButton onClick={onRotate} title={t('pdfRotate')}>
          <RotateCw size={18} />
        </ToolbarButton>
      </Tooltip>
    </div>
  );
};
