import React, { useRef } from 'react';
import type { ImageNavHighlight } from '@/stores/mediaNavStore';

export interface ImageMinimapProps {
  src: string;
  scale: number;
  pan: { x: number; y: number };
  imageDimensions: { width: number; height: number };
  viewportDimensions: { width: number; height: number };
  rotation?: number;
  highlights?: ImageNavHighlight[];
  onPanTo: (x: number, y: number) => void;
}

/**
 * Interactive Viewport Minimap (Radar view) for zoomed images.
 * Shows a high-contrast thumbnail in the bottom-right corner with a draggable/clickable
 * viewport rect and visual indicators for all highlighted targets.
 */
export const ImageMinimap: React.FC<ImageMinimapProps> = ({
  src,
  scale,
  pan,
  imageDimensions,
  viewportDimensions,
  rotation = 0,
  highlights = [],
  onPanTo,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);

  // Only show when sufficiently zoomed in
  if (scale <= 1.15) return null;

  const { width: imgW, height: imgH } = imageDimensions;
  const { width: vpW, height: vpH } = viewportDimensions;

  if (imgW <= 0 || imgH <= 0 || vpW <= 0 || vpH <= 0) return null;

  // Viewport rect size as fraction of image
  const vpFractionW = Math.min(1, vpW / (imgW * scale));
  const vpFractionH = Math.min(1, vpH / (imgH * scale));

  // Current center relative to image:
  // pan is delta from center
  const centerFractionX = 0.5 - pan.x / (imgW * scale);
  const centerFractionY = 0.5 - pan.y / (imgH * scale);

  const rectLeft = Math.max(0, Math.min(1 - vpFractionW, centerFractionX - vpFractionW / 2));
  const rectTop = Math.max(0, Math.min(1 - vpFractionH, centerFractionY - vpFractionH / 2));

  const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    e.stopPropagation();
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect || rect.width <= 0 || rect.height <= 0) return;

    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;

    const targetFractionX = clickX / rect.width;
    const targetFractionY = clickY / rect.height;

    // Pan required to place target fraction at center of viewport
    const targetPanX = -(targetFractionX - 0.5) * imgW * scale;
    const targetPanY = -(targetFractionY - 0.5) * imgH * scale;

    onPanTo(targetPanX, targetPanY);
  };

  const isQuarterTurn = rotation % 180 !== 0;
  const aspectRatio = isQuarterTurn ? `${imgH} / ${imgW}` : `${imgW} / ${imgH}`;

  return (
    <div
      ref={containerRef}
      data-testid="image-minimap"
      onClick={handleClick}
      className="absolute bottom-6 right-6 z-40 w-32 sm:w-40 rounded-lg overflow-hidden border border-white/25 bg-black/85 backdrop-blur-md shadow-2xl cursor-crosshair select-none transition-all duration-200 hover:border-white/50"
      style={{ aspectRatio }}
      title="缩略导航地图：点击快速平移"
      aria-label="图片缩略导航地图"
    >
      <img
        src={src}
        alt="Minimap thumbnail"
        className="w-full h-full object-contain pointer-events-none opacity-70"
        style={{ transform: `rotate(${rotation}deg)` }}
        draggable={false}
      />

      {highlights.map((hl, idx) => {
        const box = hl.box2d;
        const pt = hl.point;
        if (!box && !pt) return null;

        let dotX = 50;
        let dotY = 50;
        if (box && box.length === 4) {
          dotX = (box[1] + box[3]) / 20;
          dotY = (box[0] + box[2]) / 20;
        } else if (pt && pt.length === 2) {
          dotX = pt[1] / 10;
          dotY = pt[0] / 10;
        }

        return (
          <div
            key={`dot-${idx}-${dotX}-${dotY}`}
            data-testid="image-minimap-dot"
            className="absolute -translate-x-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full bg-red-500 shadow-[0_0_4px_rgba(239,68,68,0.9)] pointer-events-none"
            style={{ left: `${dotX}%`, top: `${dotY}%` }}
          />
        );
      })}

      <div
        data-testid="image-minimap-viewport"
        className="absolute border-1.5 border-blue-400 bg-blue-500/20 rounded-sm shadow-inner pointer-events-none transition-all duration-75"
        style={{
          left: `${rectLeft * 100}%`,
          top: `${rectTop * 100}%`,
          width: `${vpFractionW * 100}%`,
          height: `${vpFractionH * 100}%`,
        }}
      />
    </div>
  );
};
