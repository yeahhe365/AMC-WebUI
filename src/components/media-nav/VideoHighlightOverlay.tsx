import React from 'react';
import { X } from 'lucide-react';

import type { VideoDisplayRect } from '@/utils/media-nav/videoGeometry';

export interface VideoAnnotation {
  box2d?: [number, number, number, number];
  point?: [number, number];
  snippet?: string;
}

interface VideoHighlightOverlayProps {
  annotation: VideoAnnotation | null;
  visible: boolean;
  isPlaying?: boolean;
  onClose?: () => void;
  /** Exact rendered rectangle of the video stream within the container. */
  displayRect?: VideoDisplayRect | null;
}

/**
 * Minimalist camera viewfinder / reticle overlay for video moments.
 * Clean, subtle corner brackets, entrance focus pulse, and smart auto-dimming during playback.
 */
export const VideoHighlightOverlay: React.FC<VideoHighlightOverlayProps> = ({
  annotation,
  visible,
  isPlaying = false,
  onClose,
  displayRect,
}) => {
  const [isDimmed, setIsDimmed] = React.useState(false);
  const [isHovered, setIsHovered] = React.useState(false);

  React.useEffect(() => {
    if (!isPlaying) {
      setIsDimmed(false);
      return undefined;
    }
    const timer = setTimeout(() => {
      setIsDimmed(true);
    }, 2500);
    return () => clearTimeout(timer);
  }, [isPlaying, annotation]);

  if (!visible || !annotation) return null;
  const { box2d, point, snippet } = annotation;
  if (!box2d && !point) return null;

  let top = 0;
  let left = 0;
  let width = 0;
  let height = 0;
  let isPoint = false;

  if (box2d && box2d.length === 4) {
    const [ymin, xmin, ymax, xmax] = box2d;
    const actualYmin = Math.min(ymin, ymax);
    const actualYmax = Math.max(ymin, ymax);
    const actualXmin = Math.min(xmin, xmax);
    const actualXmax = Math.max(xmin, xmax);
    top = actualYmin / 10;
    left = actualXmin / 10;
    height = Math.max((actualYmax - actualYmin) / 10, 0.5);
    width = Math.max((actualXmax - actualXmin) / 10, 0.5);
  } else if (point && point.length === 2) {
    isPoint = true;
    const [y, x] = point;
    top = y / 10;
    left = x / 10;
  }

  const isAutoDimmed = isDimmed && !isHovered;

  return (
    <div
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className={`absolute ${displayRect ? '' : 'inset-0'} z-20 overflow-visible transition-opacity duration-300 ${
        isAutoDimmed ? 'opacity-25 hover:opacity-100 pointer-events-auto' : 'opacity-100 pointer-events-none'
      }`}
      style={
        displayRect
          ? {
              top: `${displayRect.top}px`,
              left: `${displayRect.left}px`,
              width: `${displayRect.width}px`,
              height: `${displayRect.height}px`,
            }
          : undefined
      }
      data-testid="video-highlight-overlay"
    >
      {!isPoint ? (
        <div
          key={`box-${top}-${left}-${width}-${height}`}
          data-testid="video-highlight-box"
          className="absolute rounded border border-white/35 bg-white/[0.03] transition-all duration-300 animate-reticle-pulse"
          style={{
            top: `${top}%`,
            left: `${left}%`,
            width: `${width}%`,
            height: `${height}%`,
          }}
        >
          <div className="absolute -top-[1px] -left-[1px] w-3 h-3 border-t-2 border-l-2 border-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)] rounded-tl-[2px]" />
          <div className="absolute -top-[1px] -right-[1px] w-3 h-3 border-t-2 border-r-2 border-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)] rounded-tr-[2px]" />
          <div className="absolute -bottom-[1px] -left-[1px] w-3 h-3 border-b-2 border-l-2 border-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)] rounded-bl-[2px]" />
          <div className="absolute -bottom-[1px] -right-[1px] w-3 h-3 border-b-2 border-r-2 border-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)] rounded-br-[2px]" />
        </div>
      ) : (
        <div
          key={`pt-${top}-${left}`}
          data-testid="video-highlight-point"
          className="absolute -translate-x-1/2 -translate-y-1/2 animate-reticle-pulse"
          style={{
            top: `${top}%`,
            left: `${left}%`,
          }}
        >
          <div className="relative flex items-center justify-center">
            <div className="w-5 h-5 rounded-full border-2 border-white drop-shadow-[0_1px_3px_rgba(0,0,0,0.9)] flex items-center justify-center">
              <div className="w-1.5 h-1.5 rounded-full bg-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]" />
            </div>
            <div className="absolute w-7 h-7 rounded-full border border-white/40 animate-pulse pointer-events-none" />
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
              <div className="w-0 h-0 border-x-4 border-x-transparent border-b-[5px] border-b-black/80 drop-shadow-sm" />
            )}
            <div className="inline-flex items-center gap-1.5 bg-black/80 backdrop-blur-md text-white/95 text-[11px] font-medium px-2 py-0.5 rounded-md shadow-2xl border border-white/20 whitespace-nowrap drop-shadow-md">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 drop-shadow-[0_0_4px_rgba(52,211,153,0.8)] flex-shrink-0" />
              <span className="max-w-[200px] truncate tracking-wide">{snippet || 'Target'}</span>
              {onClose && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onClose();
                  }}
                  className="ml-1 p-0.5 rounded text-white/50 hover:text-white hover:bg-white/20 transition-colors cursor-pointer"
                  title="Close annotation"
                  aria-label="Close annotation"
                >
                  <X size={11} strokeWidth={2} />
                </button>
              )}
            </div>
            {!isNearTop && (
              <div className="w-0 h-0 border-x-4 border-x-transparent border-t-[5px] border-t-black/80 drop-shadow-sm" />
            )}
          </div>
        );
      })()}
    </div>
  );
};
