import React, { useCallback } from 'react';
import { MapPin } from 'lucide-react';
import { useI18n } from '@/contexts/I18nContext';
import { seekSessionPdf } from '@/utils/media-nav/seekPdf';
import { extractTextFromNode } from '@/utils/reactNodeText';
import { useMediaNavStore } from '@/stores/mediaNavStore';
import { useChatStore } from '@/stores/chatStore';
import { collectSessionMediaFiles, resolveNamedFile } from '@/utils/media-nav/sessionMediaFiles';
import { Tooltip } from '@/components/shared/Tooltip';

interface InlinePdfLocateButtonProps {
  pageNumber: number;
  docName?: string;
  box2d?: [number, number, number, number];
  point?: [number, number];
  snippet?: string;
  messageId?: string;
  children: React.ReactNode;
}

/**
 * Minimalist graphite keycap inline PDF locate button.
 * Matches InlineTimestampSeekButton styling with a subtle red map pin
 * indicating PDF page/element location.
 * Supports reverse grounding (synchronized page scroll pulse) and hover mini-preview.
 */
export const InlinePdfLocateButton: React.FC<InlinePdfLocateButtonProps> = ({
  pageNumber,
  docName,
  box2d,
  point,
  snippet,
  messageId,
  children,
}) => {
  const { t } = useI18n();

  const isOpen = useMediaNavStore((state) => state.isOpen);
  const openKind = useMediaNavStore((state) => state.openKind);
  const activeFileId = useMediaNavStore((state) => state.activeFileId);
  const currentPage = useMediaNavStore((state) => state.currentPage);

  const activePdfMatches = useChatStore(
    useCallback(
      (state) => {
        const { pdfs } = collectSessionMediaFiles(state.selectedFiles, state.activeMessages);
        if (pdfs.length === 0) return true;
        const activePdf = (activeFileId ? pdfs.find((p) => p.id === activeFileId) : null) ?? pdfs[0];
        if (!activePdf) return true;
        if (docName) {
          const target = resolveNamedFile(pdfs, docName, activeFileId);
          return target?.id === activePdf.id;
        }
        return pdfs.length === 1;
      },
      [docName, activeFileId],
    ),
  );

  const isActive = Boolean(isOpen && openKind === 'pdf' && currentPage === pageNumber && activePdfMatches);

  const handleClick = (e: React.MouseEvent) => {
    // If user is selecting text (e.g. dragging mouse or double-clicking to copy),
    // prevent accidental panel opening.
    const selection = window.getSelection();
    if (selection && !selection.isCollapsed && selection.toString().trim().length > 0) {
      return;
    }

    e.preventDefault();
    e.stopPropagation();
    seekSessionPdf({
      pageNumber,
      docName,
      box2d,
      point,
      snippet,
      messageId,
    });
  };

  const labelText = extractTextFromNode(children);
  const buttonTitle = labelText ? `${t('pdfNavLocateButton')}: ${labelText}` : t('pdfNavLocateButton');

  const tooltipPreview = (
    <div className="flex flex-col gap-1 max-w-[220px] text-xs select-none">
      <div className="flex items-center gap-1.5 font-semibold text-[var(--theme-text-primary)]">
        <span className="w-1.5 h-1.5 rounded-full bg-red-500 flex-shrink-0" />
        <span>第 {pageNumber} 页</span>
        {docName && (
          <span className="text-[10px] text-[var(--theme-text-tertiary)] truncate font-normal">({docName})</span>
        )}
      </div>
      {snippet && (
        <div className="text-[var(--theme-text-primary)] text-[11px] leading-tight font-normal line-clamp-2">
          {snippet}
        </div>
      )}
      {box2d && (
        <div className="flex items-center gap-2 mt-1">
          <div className="w-6 h-8 rounded-sm border border-zinc-500/70 bg-white/10 relative overflow-hidden flex-shrink-0 shadow-inner">
            <div
              className="absolute border border-red-500 bg-red-500/35 rounded-[1px]"
              style={{
                top: `${box2d[0] / 10}%`,
                left: `${box2d[1] / 10}%`,
                height: `${Math.max(12, (box2d[2] - box2d[0]) / 10)}%`,
                width: `${Math.max(12, (box2d[3] - box2d[1]) / 10)}%`,
              }}
            />
          </div>
          <span className="text-[10px] text-[var(--theme-text-tertiary)] opacity-80">区域定位 · 点击展开</span>
        </div>
      )}
      {!box2d && <div className="text-[10px] text-[var(--theme-text-tertiary)] opacity-80 mt-0.5">点击跳转阅读</div>}
    </div>
  );

  return (
    <Tooltip text={tooltipPreview} side="top" align="center" asChild delayDuration={300}>
      <button
        type="button"
        onClick={handleClick}
        className={`inline-flex items-center gap-1 px-1.5 py-0.5 -my-0.5 mx-0.5 rounded-[5px] text-[0.82em] active:scale-[0.97] transition-all cursor-pointer align-baseline ${
          isActive
            ? 'font-semibold text-red-800 dark:text-red-200 bg-red-50/95 dark:bg-red-950/60 border border-red-400/90 dark:border-red-500/80 shadow-[0_0_8px_rgba(239,68,68,0.35)] ring-1.5 ring-red-500/70 scale-[1.02]'
            : 'font-medium text-zinc-700 dark:text-zinc-200 bg-zinc-100/90 dark:bg-zinc-800/80 hover:bg-zinc-200/90 dark:hover:bg-zinc-700/80 hover:text-zinc-900 dark:hover:text-white border border-zinc-200/80 dark:border-zinc-700/60 shadow-[0_1px_1px_rgba(0,0,0,0.04)] dark:shadow-none'
        }`}
        title={buttonTitle}
        data-testid="inline-pdf-locate-btn"
        data-active={isActive ? 'true' : undefined}
      >
        <MapPin
          size={9}
          aria-hidden="true"
          className={`flex-shrink-0 select-none pointer-events-none transition-colors ${
            isActive ? 'text-red-600 dark:text-red-400 animate-pulse' : 'text-red-500/90 dark:text-red-400/90'
          }`}
          data-selection-copy="exclude"
        />
        <span className="select-text">{children}</span>
      </button>
    </Tooltip>
  );
};
