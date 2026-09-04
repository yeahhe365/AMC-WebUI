const tintedUrlCache = new Map<string, string>();
const imagePromiseCache = new Map<string, Promise<HTMLImageElement>>();

const loadImage = (src: string): Promise<HTMLImageElement> => {
  let promise = imagePromiseCache.get(src);
  if (!promise) {
    promise = new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error(`Failed to load favicon: ${src}`));
      img.src = src;
    });
    imagePromiseCache.set(src, promise);
  }
  return promise;
};

/**
 * Tints the favicon shape with a solid status color (silhouette recolor).
 *
 * Draws the source favicon onto a canvas, then uses `source-in` composite to
 * keep only the icon's alpha shape and flood-fill it with the status color. The
 * result is a flat-color silhouette that's more legible at favicon size than an
 * overlaid badge dot. Returns a PNG data URL (no blob-URL lifecycle to manage),
 * cached per (src, color) pair so repeat state transitions don't re-render.
 *
 * Returns `null` when the image can't be decoded or the canvas is unavailable,
 * so callers fall back to the default href without extra handling.
 */
export const getTintedFaviconUrl = async (baseSrc: string, color: string): Promise<string | null> => {
  const cacheKey = `${baseSrc}::${color}`;
  const cached = tintedUrlCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  try {
    const img = await loadImage(baseSrc);
    const size = Math.max(img.naturalWidth, img.naturalHeight, 64);
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const context = canvas.getContext('2d');
    if (!context) {
      return null;
    }

    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = 'high';
    context.drawImage(img, 0, 0, size, size);
    // Keep only the icon's alpha shape and fill it with the status color.
    context.globalCompositeOperation = 'source-in';
    context.fillStyle = color;
    context.fillRect(0, 0, size, size);

    const dataUrl = canvas.toDataURL('image/png');
    tintedUrlCache.set(cacheKey, dataUrl);
    return dataUrl;
  } catch {
    return null;
  }
};
