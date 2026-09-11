import React from 'react';
import { X, ChevronLeft, ChevronRight } from 'lucide-react';
import { useMediaNavStore, type ImageNavHighlight } from '@/stores/mediaNavStore';

export interface ImageHighlightOverlayProps {
  highlight?: ImageNavHighlight | null;
  highlights?: ImageNavHighlight[];
  visible?: boolean;
  scale?: number;
  onClose?: () => void;
  onSelectHighlight?: (index: number) => void;
}

/**
 * Precision visual-grounding overlay for images.
 * Supports HUD bounding boxes (BBox) with corner brackets,
 * multi-target simultaneous displays with numbered indicators (① ② ③),
 * and high-contrast SVG guide arrows pointing directly at target coordinates.
 * Compensates for image scale so UI reticle, arrows, and badges maintain crisp, constant pixel sizes.
 */
export const ImageHighlightOverlay: React.FC<ImageHighlightOverlayProps> = ({
  highlight,
  highlights: propHighlights,
  visible = true,
  scale = 1,
  onClose,
  onSelectHighlight,
}) => {
  const storeHighlights = useMediaNavStore((state) => state.imageHighlights);
  const highlights = propHighlights || (storeHighlights.length > 0 ? storeHighlights : highlight ? [highlight] : []);
  const activeHighlight = highlight || highlights.find((h) => h.isActive) || highlights[0] || null;

  if (!visible || !activeHighlight) return null;
  const { box2d, point, arrow, label, snippet } = activeHighlight;
  if (!box2d && !point) return null;

  const counterScale = scale > 0 ? 1 / Math.max(0.15, Math.min(10, scale)) : 1;

  let boxTop = 0;
  let boxLeft = 0;
  let boxWidth = 0;
  let boxHeight = 0;
  let hasBox = false;

  if (box2d && box2d.length === 4) {
    hasBox = true;
    const [ymin, xmin, ymax, xmax] = box2d;
    const actualYmin = Math.min(ymin, ymax);
    const actualYmax = Math.max(ymin, ymax);
    const actualXmin = Math.min(xmin, xmax);
    const actualXmax = Math.max(xmin, xmax);
    boxTop = actualYmin / 10;
    boxLeft = actualXmin / 10;
    boxHeight = Math.max((actualYmax - actualYmin) / 10, 0.5);
    boxWidth = Math.max((actualXmax - actualXmin) / 10, 0.5);
  }

  let pointTop = 0;
  let pointLeft = 0;
  let hasPoint = false;

  if (point && point.length === 2) {
    hasPoint = true;
    const [y, x] = point;
    pointTop = y / 10;
    pointLeft = x / 10;
  } else if (!hasBox) {
    return null;
  }

  const handleClose = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onClose) {
      onClose();
    } else {
      useMediaNavStore.getState().clearImageHighlight();
    }
  };

  const handleSelectHighlight = (idx: number) => {
    if (onSelectHighlight) {
      onSelectHighlight(idx);
    } else {
      useMediaNavStore.getState().setActiveImageHighlightIndex(idx);
    }
  };

  const activeIdx = highlights.indexOf(activeHighlight);
  const activeItemIndex =
    typeof activeHighlight.index === 'number' ? activeHighlight.index : activeIdx >= 0 ? activeIdx + 1 : 1;

  const handleStep = (direction: -1 | 1) => {
    if (highlights.length <= 1) return;
    const nextIdx = (activeIdx + direction + highlights.length) % highlights.length;
    handleSelectHighlight(nextIdx);
  };

  // Show point reticle/arrow if there is no box, or if an arrow was explicitly requested
  const showPoint = hasPoint && (!hasBox || Boolean(arrow));

  // Determine incoming angle/offset for the guide arrow.
  // Note: SVG arrow path natively points UP (0deg).
  // The arrow is placed at (dx, dy) relative to target (0, 0) and points toward the target.
  const getArrowTransform = () => {
    const preferred = arrow?.toLowerCase() || '';

    // 1. Explicit directional directives
    if (preferred.includes('bottom-left')) {
      return { dx: -32, dy: 32, rotation: 45, labelPlacement: 'bottom' as const };
    }
    if (preferred.includes('bottom-right')) {
      return { dx: 32, dy: 32, rotation: -45, labelPlacement: 'bottom' as const };
    }
    if (preferred.includes('top-right')) {
      return { dx: 32, dy: -32, rotation: -135, labelPlacement: 'top' as const };
    }
    if (preferred.includes('top-left')) {
      return { dx: -32, dy: -32, rotation: 135, labelPlacement: 'top' as const };
    }
    if (preferred.includes('bottom')) {
      return { dx: 0, dy: 42, rotation: 0, labelPlacement: 'bottom' as const };
    }
    if (preferred.includes('top')) {
      return { dx: 0, dy: -42, rotation: 180, labelPlacement: 'top' as const };
    }
    if (preferred.includes('right')) {
      return { dx: 42, dy: 0, rotation: -90, labelPlacement: 'right' as const };
    }
    if (preferred.includes('left')) {
      return { dx: -42, dy: 0, rotation: 90, labelPlacement: 'left' as const };
    }

    // 2. Automatic screen-edge avoidance when no explicit preference
    if (pointTop < 18) {
      return { dx: 0, dy: 42, rotation: 0, labelPlacement: 'bottom' as const };
    }
    if (pointTop > 82) {
      return { dx: 0, dy: -42, rotation: 180, labelPlacement: 'top' as const };
    }
    if (pointLeft < 18) {
      return { dx: 42, dy: 0, rotation: -90, labelPlacement: 'right' as const };
    }
    if (pointLeft > 82) {
      return { dx: -42, dy: 0, rotation: 90, labelPlacement: 'left' as const };
    }

    return {
      dx: -32,
      dy: -32,
      rotation: 135,
      labelPlacement: 'top' as const,
    };
  };

  const arrowConfig = showPoint ? getArrowTransform() : null;
  const baseText = label || snippet || '目标定位';
  const displayText = highlights.length > 1 ? `[${activeItemIndex}] ${baseText}` : baseText;

  // Badge positioning anchor: prefer target point when point is displayed, otherwise top center of bounding box
  const badgeAnchorX = showPoint ? pointLeft : Math.max(8, Math.min(92, boxLeft + boxWidth / 2));
  const badgeAnchorY = showPoint ? pointTop : boxTop;
  const isNearTop = badgeAnchorY < 14;

  return (
    <div
      className="absolute inset-0 pointer-events-none z-20 overflow-visible transition-opacity duration-300"
      data-testid="image-highlight-overlay"
    >
      {highlights.length > 1 && (
        <div
          data-testid="image-multi-highlight-switcher"
          className="absolute top-3 right-3 z-30 pointer-events-auto flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-zinc-900/90 backdrop-blur-md border border-white/20 text-white text-xs font-mono shadow-2xl select-none"
          style={{ transform: `scale(${counterScale})`, transformOrigin: 'top right' }}
        >
          <span className="text-[10px] text-zinc-400 font-sans">目标</span>
          <span className="font-bold text-red-400">{activeItemIndex}</span>
          <span className="text-zinc-500">/</span>
          <span className="text-zinc-300">{highlights.length}</span>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              handleStep(-1);
            }}
            className="p-0.5 rounded hover:bg-white/20 text-zinc-300 hover:text-white transition-colors cursor-pointer"
            aria-label="上一个目标"
            title="上一个目标"
            data-testid="image-highlight-prev"
          >
            <ChevronLeft size={13} />
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              handleStep(1);
            }}
            className="p-0.5 rounded hover:bg-white/20 text-zinc-300 hover:text-white transition-colors cursor-pointer"
            aria-label="下一个目标"
            title="下一个目标"
            data-testid="image-highlight-next"
          >
            <ChevronRight size={13} />
          </button>
        </div>
      )}

      {highlights.map((h, idx) => {
        if (h === activeHighlight) return null;
        const itemIdx = typeof h.index === 'number' ? h.index : idx + 1;
        const hBox = h.box2d && h.box2d.length === 4 ? h.box2d : null;
        const hPoint = h.point && h.point.length === 2 ? h.point : null;

        if (hBox) {
          const [ymin, xmin, ymax, xmax] = hBox;
          const top = Math.min(ymin, ymax) / 10;
          const left = Math.min(xmin, xmax) / 10;
          const width = Math.max(Math.abs(xmax - xmin) / 10, 0.5);
          const height = Math.max(Math.abs(ymax - ymin) / 10, 0.5);

          return (
            <div
              key={`inactive-box-${idx}-${top}-${left}`}
              data-testid="image-inactive-box"
              onClick={(e) => {
                e.stopPropagation();
                handleSelectHighlight(idx);
              }}
              className="absolute rounded border border-dashed border-red-400/60 bg-red-500/[0.04] hover:bg-red-500/[0.16] hover:border-red-500 cursor-pointer pointer-events-auto transition-all group/box shadow-sm"
              style={{ top: `${top}%`, left: `${left}%`, width: `${width}%`, height: `${height}%` }}
              title={`目标 [${itemIdx}]: ${h.label || h.snippet || ''}`}
            >
              <div
                className="absolute -top-2 -left-2 w-4 h-4 rounded-full bg-red-600/90 text-white text-[9px] font-bold flex items-center justify-center shadow-md border border-white/40 group-hover/box:scale-110 group-hover/box:bg-red-500 transition-all"
                style={{ transform: `scale(${counterScale})`, transformOrigin: 'top left' }}
              >
                {itemIdx}
              </div>
            </div>
          );
        }

        if (hPoint) {
          const [y, x] = hPoint;
          const top = y / 10;
          const left = x / 10;
          return (
            <div
              key={`inactive-pt-${idx}-${top}-${left}`}
              data-testid="image-inactive-point"
              onClick={(e) => {
                e.stopPropagation();
                handleSelectHighlight(idx);
              }}
              className="absolute -translate-x-1/2 -translate-y-1/2 cursor-pointer pointer-events-auto group/pt"
              style={{ top: `${top}%`, left: `${left}%` }}
              title={`目标 [${itemIdx}]: ${h.label || h.snippet || ''}`}
            >
              <div
                className="w-4 h-4 rounded-full bg-red-600/80 hover:bg-red-500 text-white text-[9px] font-bold flex items-center justify-center shadow-md border border-white/40 group-hover/pt:scale-125 transition-all"
                style={{ transform: `scale(${counterScale})` }}
              >
                {itemIdx}
              </div>
            </div>
          );
        }

        return null;
      })}
      {hasBox && (
        <div
          key={`img-box-${boxTop}-${boxLeft}-${boxWidth}-${boxHeight}`}
          data-testid="image-highlight-box"
          className="absolute rounded border border-red-500/60 dark:border-red-400/60 bg-red-500/[0.08] dark:bg-red-500/[0.14] transition-all duration-300 shadow-[0_0_12px_rgba(239,68,68,0.25)] animate-reticle-pulse"
          style={{
            top: `${boxTop}%`,
            left: `${boxLeft}%`,
            width: `${boxWidth}%`,
            height: `${boxHeight}%`,
          }}
        >
          <div
            className="absolute -top-[1px] -left-[1px] w-3 h-3 border-t-2 border-l-2 border-red-600 dark:border-red-400 drop-shadow-[0_1px_2px_rgba(0,0,0,0.4)] rounded-tl-[2px]"
            style={{ transform: `scale(${counterScale})`, transformOrigin: 'top left' }}
          />
          <div
            className="absolute -top-[1px] -right-[1px] w-3 h-3 border-t-2 border-r-2 border-red-600 dark:border-red-400 drop-shadow-[0_1px_2px_rgba(0,0,0,0.4)] rounded-tr-[2px]"
            style={{ transform: `scale(${counterScale})`, transformOrigin: 'top right' }}
          />
          <div
            className="absolute -bottom-[1px] -left-[1px] w-3 h-3 border-b-2 border-l-2 border-red-600 dark:border-red-400 drop-shadow-[0_1px_2px_rgba(0,0,0,0.4)] rounded-bl-[2px]"
            style={{ transform: `scale(${counterScale})`, transformOrigin: 'bottom left' }}
          />
          <div
            className="absolute -bottom-[1px] -right-[1px] w-3 h-3 border-b-2 border-r-2 border-red-600 dark:border-red-400 drop-shadow-[0_1px_2px_rgba(0,0,0,0.4)] rounded-br-[2px]"
            style={{ transform: `scale(${counterScale})`, transformOrigin: 'bottom right' }}
          />
        </div>
      )}

      {showPoint && (
        <div
          key={`img-pt-${pointTop}-${pointLeft}`}
          data-testid="image-highlight-point"
          className="absolute -translate-x-1/2 -translate-y-1/2 pointer-events-none animate-reticle-pulse"
          style={{
            top: `${pointTop}%`,
            left: `${pointLeft}%`,
          }}
        >
          <div className="relative flex items-center justify-center" style={{ transform: `scale(${counterScale})` }}>
            <div className="w-5 h-5 rounded-full border-2 border-red-600 dark:border-red-400 drop-shadow-[0_1px_4px_rgba(0,0,0,0.7)] flex items-center justify-center">
              <div className="w-1.5 h-1.5 rounded-full bg-red-600 dark:bg-red-400 drop-shadow-[0_1px_2px_rgba(0,0,0,0.6)]" />
            </div>
            <div className="absolute w-7 h-7 rounded-full border border-red-500/50 animate-pulse" />
          </div>

          {arrowConfig && (
            <div
              className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 transition-transform duration-300 pointer-events-none"
              style={{
                transform: `translate(${arrowConfig.dx * counterScale}px, ${arrowConfig.dy * counterScale}px) rotate(${arrowConfig.rotation}deg) scale(${counterScale})`,
              }}
            >
              <svg
                width="38"
                height="44"
                viewBox="0 0 38 44"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
                className="filter drop-shadow-[0_2px_4px_rgba(0,0,0,0.5)] animate-bounce"
              >
                <path
                  d="M19 2L35 24H24V42H14V24H3L19 2Z"
                  fill="#ef4444"
                  stroke="#ffffff"
                  strokeWidth="2.5"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
          )}
        </div>
      )}

      <div
        className="absolute flex flex-col items-center z-30 pointer-events-auto transition-transform duration-200"
        style={{
          top: `${isNearTop && hasBox ? boxTop + boxHeight : badgeAnchorY}%`,
          left: `${Math.max(8, Math.min(92, badgeAnchorX))}%`,
          transform: `${
            isNearTop && hasBox ? 'translate(-50%, 0) translateY(8px)' : 'translate(-50%, -100%) translateY(-10px)'
          } scale(${counterScale})`,
          transformOrigin: isNearTop && hasBox ? 'top center' : 'bottom center',
        }}
      >
        {isNearTop && hasBox && (
          <div className="w-0 h-0 border-x-4 border-x-transparent border-b-[5px] border-b-black/85 drop-shadow-sm" />
        )}
        <div className="inline-flex items-center gap-1.5 bg-black/85 backdrop-blur-md text-white/95 text-[11px] font-medium px-2.5 py-0.5 rounded-md shadow-2xl border border-white/20 whitespace-nowrap drop-shadow-md">
          <span className="w-1.5 h-1.5 rounded-full bg-red-400 drop-shadow-[0_0_4px_rgba(248,113,113,0.8)] flex-shrink-0" />
          <span className="max-w-[220px] truncate tracking-wide">{displayText}</span>
          <button
            type="button"
            onClick={handleClose}
            className="ml-1 p-0.5 rounded text-white/50 hover:text-white hover:bg-white/20 transition-colors cursor-pointer"
            title="关闭标注"
            aria-label="关闭标注"
            data-testid="image-highlight-close"
          >
            <X size={11} strokeWidth={2} />
          </button>
        </div>
        {(!isNearTop || !hasBox) && (
          <div className="w-0 h-0 border-x-4 border-x-transparent border-t-[5px] border-t-black/85 drop-shadow-sm" />
        )}
      </div>
    </div>
  );
};
