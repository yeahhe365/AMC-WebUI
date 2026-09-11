import React from 'react';
import { X } from 'lucide-react';
import { useMediaNavStore, type PdfNavHighlight } from '@/stores/mediaNavStore';
import { getRotatedCoords } from '@/utils/media-nav/seekPdf';

export interface PdfHighlightOverlayProps {
  highlight: PdfNavHighlight | null;
  visible?: boolean;
  rotation?: number;
  onClose?: () => void;
}

/**
 * Precision visual-grounding viewfinder & reticle overlay for PDF pages.
 * Matches VideoHighlightOverlay's HUD styling, precision corner brackets,
 * and edge-protection flipping logic.
 */
export const PdfHighlightOverlay: React.FC<PdfHighlightOverlayProps> = ({
  highlight,
  visible = true,
  rotation = 0,
  onClose,
}) => {
  if (!visible || !highlight) return null;
  const { box2d, point, snippet } = highlight;
  if (!box2d && !point) return null;

  const coords = getRotatedCoords(box2d, point, rotation);
  if (!coords) return null;

  const { top, left, width, height, isPoint } = coords;

  const handleClose = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onClose) {
      onClose();
    } else {
      useMediaNavStore.getState().clearHighlight();
    }
  };

  return (
    <div
      className="absolute inset-0 pointer-events-none z-20 overflow-visible transition-opacity duration-300"
      data-testid="pdf-highlight-overlay"
    >
      {!isPoint ? (
        <div
          key={`pdf-box-${top}-${left}-${width}-${height}`}
          data-testid="pdf-highlight-box"
          className="absolute rounded border border-red-500/50 dark:border-red-400/50 bg-red-500/[0.07] dark:bg-red-500/[0.12] transition-all duration-300 animate-reticle-pulse"
          style={{
            top: `${top}%`,
            left: `${left}%`,
            width: `${width}%`,
            height: `${height}%`,
          }}
        >
          <div className="absolute -top-[1px] -left-[1px] w-3 h-3 border-t-2 border-l-2 border-red-600 dark:border-red-400 drop-shadow-[0_1px_2px_rgba(0,0,0,0.3)] rounded-tl-[2px]" />
          <div className="absolute -top-[1px] -right-[1px] w-3 h-3 border-t-2 border-r-2 border-red-600 dark:border-red-400 drop-shadow-[0_1px_2px_rgba(0,0,0,0.3)] rounded-tr-[2px]" />
          <div className="absolute -bottom-[1px] -left-[1px] w-3 h-3 border-b-2 border-l-2 border-red-600 dark:border-red-400 drop-shadow-[0_1px_2px_rgba(0,0,0,0.3)] rounded-bl-[2px]" />
          <div className="absolute -bottom-[1px] -right-[1px] w-3 h-3 border-b-2 border-r-2 border-red-600 dark:border-red-400 drop-shadow-[0_1px_2px_rgba(0,0,0,0.3)] rounded-br-[2px]" />
        </div>
      ) : (
        <div
          key={`pdf-pt-${top}-${left}`}
          data-testid="pdf-highlight-point"
          className="absolute -translate-x-1/2 -translate-y-1/2 animate-reticle-pulse"
          style={{
            top: `${top}%`,
            left: `${left}%`,
          }}
        >
          <div className="relative flex items-center justify-center">
            <div className="w-5 h-5 rounded-full border-2 border-red-600 dark:border-red-400 drop-shadow-[0_1px_3px_rgba(0,0,0,0.5)] flex items-center justify-center">
              <div className="w-1.5 h-1.5 rounded-full bg-red-600 dark:bg-red-400 drop-shadow-[0_1px_2px_rgba(0,0,0,0.5)]" />
            </div>
            <div className="absolute w-7 h-7 rounded-full border border-red-500/40 animate-pulse pointer-events-none" />
          </div>
        </div>
      )}

      {(() => {
        const isNearTop = top < 14;
        const rawTargetX = isPoint ? left : left + width / 2;
        const clampedLeft = Math.max(8, Math.min(92, rawTargetX));
        const rawTargetY = isNearTop ? (isPoint ? top : top + height) : top;

        return (
          <div
            className="absolute flex flex-col items-center z-30 pointer-events-auto transition-transform duration-200"
            style={{
              top: `${rawTargetY}%`,
              left: `${clampedLeft}%`,
              transform: isNearTop ? 'translate(-50%, 0) translateY(8px)' : 'translate(-50%, -100%) translateY(-6px)',
            }}
          >
            {isNearTop && (
              <div className="w-0 h-0 border-x-4 border-x-transparent border-b-[5px] border-b-black/85 drop-shadow-sm" />
            )}
            <div className="inline-flex items-center gap-1.5 bg-black/85 backdrop-blur-md text-white/95 text-[11px] font-medium px-2 py-0.5 rounded-md shadow-2xl border border-white/20 whitespace-nowrap drop-shadow-md">
              <span className="w-1.5 h-1.5 rounded-full bg-red-400 drop-shadow-[0_0_4px_rgba(248,113,113,0.8)] flex-shrink-0" />
              <span className="max-w-[200px] truncate tracking-wide">{snippet || 'PDF'}</span>
              <button
                type="button"
                onClick={handleClose}
                className="ml-1 p-0.5 rounded text-white/50 hover:text-white hover:bg-white/20 transition-colors cursor-pointer"
                title="Close annotation"
                aria-label="Close annotation"
                data-testid="pdf-highlight-close"
              >
                <X size={11} strokeWidth={2} />
              </button>
            </div>
            {!isNearTop && (
              <div className="w-0 h-0 border-x-4 border-x-transparent border-t-[5px] border-t-black/85 drop-shadow-sm" />
            )}
          </div>
        );
      })()}
    </div>
  );
};
