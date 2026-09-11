import type { ImageNavHighlight } from '@/stores/mediaNavStore';

export interface ExportAnnotatedImageOptions {
  imageSrc: string;
  fileName?: string;
  highlights: ImageNavHighlight[];
  rotation?: number;
}

const loadImage = (src: string): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = (e) => reject(e);
    img.src = src;
  });

/**
 * Composite high-res original image with visual grounding HUD annotations
 * (bounding boxes, corner brackets, arrows, numbered badges) onto a canvas and trigger PNG download.
 */
export const exportAnnotatedImage = async (options: ExportAnnotatedImageOptions): Promise<void> => {
  const { imageSrc, fileName = 'image.png', highlights, rotation = 0 } = options;
  if (!imageSrc) return;

  const img = await loadImage(imageSrc);
  const naturalW = img.naturalWidth || img.width;
  const naturalH = img.naturalHeight || img.height;

  if (naturalW <= 0 || naturalH <= 0) return;

  const rad = ((rotation % 360) * Math.PI) / 180;
  const isQuarterTurn = rotation % 180 !== 0;
  const canvasW = isQuarterTurn ? naturalH : naturalW;
  const canvasH = isQuarterTurn ? naturalW : naturalH;

  const canvas = document.createElement('canvas');
  canvas.width = canvasW;
  canvas.height = canvasH;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  ctx.save();

  // Position and rotate
  ctx.translate(canvasW / 2, canvasH / 2);
  ctx.rotate(rad);
  ctx.drawImage(img, -naturalW / 2, -naturalH / 2, naturalW, naturalH);

  // Draw annotations in original image coordinate space
  ctx.translate(-naturalW / 2, -naturalH / 2);

  // Base scale for line thickness and fonts based on image resolution
  const resScale = Math.max(0.6, Math.min(3.5, naturalW / 1000));
  const cornerLen = Math.max(12, Math.round(18 * resScale));
  const lineWidth = Math.max(2, Math.round(2.5 * resScale));
  const bracketWidth = Math.max(3, Math.round(4.5 * resScale));
  const fontSize = Math.max(13, Math.round(15 * resScale));

  highlights.forEach((hl, idx) => {
    const { box2d, point, label, snippet, index } = hl;
    const itemIndex = typeof index === 'number' ? index : idx + 1;
    const displayText = (highlights.length > 1 ? `[${itemIndex}] ` : '') + (label || snippet || '目标定位');

    // 1. Draw Bounding Box
    if (box2d && box2d.length === 4) {
      const [ymin, xmin, ymax, xmax] = box2d;
      const x = (Math.min(xmin, xmax) / 1000) * naturalW;
      const y = (Math.min(ymin, ymax) / 1000) * naturalH;
      const w = (Math.abs(xmax - xmin) / 1000) * naturalW;
      const h = (Math.abs(ymax - ymin) / 1000) * naturalH;

      // Fill semi-transparent
      ctx.fillStyle = 'rgba(239, 68, 68, 0.12)';
      ctx.fillRect(x, y, w, h);

      // Bounding box border
      ctx.strokeStyle = 'rgba(239, 68, 68, 0.65)';
      ctx.lineWidth = lineWidth;
      ctx.strokeRect(x, y, w, h);

      // 4 Cyber HUD Corner brackets
      ctx.strokeStyle = '#ef4444';
      ctx.lineWidth = bracketWidth;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'miter';

      // Top-Left
      ctx.beginPath();
      ctx.moveTo(x, y + cornerLen);
      ctx.lineTo(x, y);
      ctx.lineTo(x + cornerLen, y);
      ctx.stroke();

      // Top-Right
      ctx.beginPath();
      ctx.moveTo(x + w - cornerLen, y);
      ctx.lineTo(x + w, y);
      ctx.lineTo(x + w, y + cornerLen);
      ctx.stroke();

      // Bottom-Left
      ctx.beginPath();
      ctx.moveTo(x, y + h - cornerLen);
      ctx.lineTo(x, y + h);
      ctx.lineTo(x + cornerLen, y + h);
      ctx.stroke();

      // Bottom-Right
      ctx.beginPath();
      ctx.moveTo(x + w - cornerLen, y + h);
      ctx.lineTo(x + w, y + h);
      ctx.lineTo(x + w, y + h - cornerLen);
      ctx.stroke();

      // Badge on top of box
      const badgeX = x + w / 2;
      const badgeY = y > 40 * resScale ? y - 10 * resScale : y + h + 24 * resScale;
      drawBadge(ctx, displayText, badgeX, badgeY, fontSize, resScale);
    } else if (point && point.length === 2) {
      // 2. Draw Point Reticle
      const [py, px] = point;
      const x = (px / 1000) * naturalW;
      const y = (py / 1000) * naturalH;
      const radius = 10 * resScale;

      ctx.strokeStyle = '#ef4444';
      ctx.lineWidth = bracketWidth;
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.stroke();

      ctx.fillStyle = '#ef4444';
      ctx.beginPath();
      ctx.arc(x, y, radius * 0.4, 0, Math.PI * 2);
      ctx.fill();

      // Badge near point
      const badgeY = y > 40 * resScale ? y - 16 * resScale : y + 24 * resScale;
      drawBadge(ctx, displayText, x, badgeY, fontSize, resScale);
    }
  });

  ctx.restore();

  // Export to Blob and download
  await new Promise<void>((resolve) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        resolve();
        return;
      }
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const baseName = fileName.replace(/\.[^/.]+$/, '');
      a.download = `${baseName}_annotated.png`;
      a.href = url;
      a.click();
      setTimeout(() => {
        URL.revokeObjectURL(url);
        resolve();
      }, 1000);
    }, 'image/png');
  });
};

const drawBadge = (
  ctx: CanvasRenderingContext2D,
  text: string,
  centerX: number,
  centerY: number,
  fontSize: number,
  scale: number,
) => {
  ctx.save();
  ctx.font = `600 ${fontSize}px sans-serif`;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'center';

  const textMetrics = ctx.measureText(text);
  const paddingX = 10 * scale;
  const paddingY = 6 * scale;
  const badgeWidth = textMetrics.width + paddingX * 2;
  const badgeHeight = fontSize + paddingY * 2;
  const badgeX = centerX - badgeWidth / 2;
  const badgeY = centerY - badgeHeight / 2;
  const radius = 6 * scale;

  // Background rounded rect
  ctx.fillStyle = 'rgba(15, 23, 42, 0.88)';
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
  ctx.lineWidth = 1.5 * scale;

  ctx.beginPath();
  if (typeof ctx.roundRect === 'function') {
    ctx.roundRect(badgeX, badgeY, badgeWidth, badgeHeight, radius);
  } else {
    ctx.rect(badgeX, badgeY, badgeWidth, badgeHeight);
  }
  ctx.fill();
  ctx.stroke();

  // Text
  ctx.fillStyle = '#ffffff';
  ctx.fillText(text, centerX, centerY);
  ctx.restore();
};
