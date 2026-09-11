import React, { useCallback } from 'react';
import { ScanSearch } from 'lucide-react';
import { useI18n } from '@/contexts/I18nContext';
import { seekSessionImage } from '@/utils/media-nav/seekImage';
import { extractTextFromNode } from '@/utils/reactNodeText';
import { useChatStore } from '@/stores/chatStore';
import { useMediaNavStore } from '@/stores/mediaNavStore';
import { collectSessionMediaFiles, resolveNamedFile } from '@/utils/media-nav/sessionMediaFiles';
import { Tooltip } from '@/components/shared/Tooltip';

interface InlineImageLocateButtonProps {
  fileName?: string;
  imageName?: string;
  box2d?: [number, number, number, number];
  point?: [number, number];
  arrow?: string;
  label?: string;
  snippet?: string;
  messageId?: string;
  children: React.ReactNode;
}

/**
 * Minimalist graphite keycap inline image locate button.
 * Matches InlinePdfLocateButton styling with a red ScanSearch icon
 * indicating image visual-grounding target location.
 * Supports reverse grounding (synchronized focus pulse) and hover mini crop preview.
 */
export const InlineImageLocateButton: React.FC<InlineImageLocateButtonProps> = ({
  fileName,
  imageName,
  box2d,
  point,
  arrow,
  label,
  snippet,
  messageId,
  children,
}) => {
  const { t } = useI18n();

  const imageFile = useChatStore(
    useCallback(
      (state) => {
        const { images } = collectSessionMediaFiles(state.selectedFiles, state.activeMessages);
        return resolveNamedFile(images, fileName ?? imageName);
      },
      [fileName, imageName],
    ),
  );

  const isActive = useMediaNavStore(
    useCallback(
      (state) => {
        if (!state.isOpen || state.openKind !== 'image' || !state.imageHighlight) return false;
        const hl = state.imageHighlight;
        if (messageId && hl.messageId && messageId === hl.messageId) {
          if (snippet && hl.snippet) return snippet === hl.snippet;
          if (label && hl.label) return label === hl.label;
        }
        if (snippet && hl.snippet && snippet === hl.snippet) return true;
        if (label && hl.label && label === hl.label) return true;
        if (box2d && hl.box2d) {
          return (
            box2d[0] === hl.box2d[0] && box2d[1] === hl.box2d[1] && box2d[2] === hl.box2d[2] && box2d[3] === hl.box2d[3]
          );
        }
        if (point && hl.point) {
          return point[0] === hl.point[0] && point[1] === hl.point[1];
        }
        return false;
      },
      [messageId, snippet, label, box2d, point],
    ),
  );

  const handleClick = (e: React.MouseEvent) => {
    const selection = window.getSelection();
    if (selection && !selection.isCollapsed && selection.toString().trim().length > 0) {
      return;
    }

    e.preventDefault();
    e.stopPropagation();
    seekSessionImage({
      fileName: fileName ?? imageName,
      box2d,
      point,
      arrow,
      label,
      snippet,
      messageId,
    });
  };

  const labelText = extractTextFromNode(children);
  const buttonTitle = labelText ? `${t('imageNavLocateButton')}: ${labelText}` : t('imageNavLocateButton');

  const tooltipPreview = (
    <div className="flex flex-col gap-1.5 max-w-[240px] text-xs select-none">
      <div className="flex items-center gap-1.5 font-semibold text-[var(--theme-text-primary)]">
        <span className="w-1.5 h-1.5 rounded-full bg-red-500 flex-shrink-0" />
        <span className="truncate">{label || snippet || '目标定位'}</span>
      </div>

      {imageFile?.dataUrl ? (
        <div className="w-40 h-28 rounded-md border border-white/20 bg-black/90 overflow-hidden relative shadow-md">
          <img
            src={imageFile.dataUrl}
            alt={label || 'Preview'}
            className="w-full h-full object-cover transition-transform duration-200 pointer-events-none"
            style={
              box2d
                ? {
                    transform: 'scale(2.6)',
                    transformOrigin: `${(box2d[1] + box2d[3]) / 20}% ${(box2d[0] + box2d[2]) / 20}%`,
                  }
                : point
                  ? {
                      transform: 'scale(2.6)',
                      transformOrigin: `${point[1] / 10}% ${point[0] / 10}%`,
                    }
                  : undefined
            }
          />
          {box2d && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="w-10 h-10 border-2 border-red-500 rounded-sm shadow-[0_0_8px_rgba(239,68,68,0.8)]" />
            </div>
          )}
          {point && !box2d && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="w-3 h-3 rounded-full border-2 border-red-500 bg-red-400/80 shadow-[0_0_8px_rgba(239,68,68,0.9)]" />
            </div>
          )}
        </div>
      ) : (
        box2d && (
          <div className="flex items-center gap-2">
            <div className="w-16 h-12 rounded border border-zinc-500/60 bg-white/10 relative overflow-hidden flex-shrink-0">
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
            <span className="text-[10px] text-[var(--theme-text-tertiary)] opacity-80">精准视觉框选</span>
          </div>
        )
      )}

      {snippet && snippet !== label && (
        <div className="text-[var(--theme-text-primary)] text-[11px] leading-tight font-normal line-clamp-2">
          {snippet}
        </div>
      )}
      <div className="text-[10px] text-[var(--theme-text-tertiary)] opacity-80">点击展开大图定位</div>
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
        data-testid="inline-image-locate-btn"
        data-active={isActive ? 'true' : undefined}
      >
        <ScanSearch
          size={10}
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
