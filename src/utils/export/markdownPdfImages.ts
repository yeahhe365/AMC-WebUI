import { isImageMimeType } from '@/utils/file/fileTypeClassification';

const FALLBACK_IMAGE_WIDTH = 1200;
const FALLBACK_IMAGE_HEIGHT = 675;
const IMAGE_SIZE_TIMEOUT_MS = 3000;

const blobToDataUrl = (blob: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
      } else {
        reject(new Error('Image could not be converted for PDF export.'));
      }
    };
    reader.onerror = () => reject(new Error('Image could not be read for PDF export.'));
    reader.readAsDataURL(blob);
  });

const fetchImageSourceAsDataUrl = async (src: string): Promise<string | null> => {
  try {
    const response = await fetch(src);
    if (!response.ok) {
      return null;
    }

    const blob = await response.blob();
    if (!isImageMimeType(blob.type)) {
      return null;
    }

    return await blobToDataUrl(blob);
  } catch {
    return null;
  }
};

export const fetchImageAsDataUrl = async (src: string): Promise<string | null> => {
  if (src.startsWith('data:image/')) {
    return src;
  }

  const sources = /^https?:\/\//i.test(src) ? [`/api/image-proxy?url=${encodeURIComponent(src)}`, src] : [src];

  for (const source of sources) {
    const dataUrl = await fetchImageSourceAsDataUrl(source);
    if (dataUrl) {
      return dataUrl;
    }
  }

  return null;
};

export const getImageSize = (src: string): Promise<{ width: number; height: number }> =>
  new Promise((resolve) => {
    const image = new Image();
    const timeout = window.setTimeout(
      () => resolve({ width: FALLBACK_IMAGE_WIDTH, height: FALLBACK_IMAGE_HEIGHT }),
      IMAGE_SIZE_TIMEOUT_MS,
    );

    image.onload = () => {
      window.clearTimeout(timeout);
      resolve({
        width: image.naturalWidth || image.width || FALLBACK_IMAGE_WIDTH,
        height: image.naturalHeight || image.height || FALLBACK_IMAGE_HEIGHT,
      });
    };
    image.onerror = () => {
      window.clearTimeout(timeout);
      resolve({ width: FALLBACK_IMAGE_WIDTH, height: FALLBACK_IMAGE_HEIGHT });
    };
    image.src = src;
  });

export const getImageFormat = (dataUrl: string): 'PNG' | 'JPEG' | 'WEBP' => {
  if (dataUrl.startsWith('data:image/png')) return 'PNG';
  if (dataUrl.startsWith('data:image/webp')) return 'WEBP';
  return 'JPEG';
};

const isDirectlyEmbeddablePdfImage = (dataUrl: string): boolean =>
  dataUrl.startsWith('data:image/png') || /^data:image\/jpe?g/i.test(dataUrl);

const rasterizeToPngDataUrl = (src: string): Promise<string | null> =>
  new Promise((resolve) => {
    const image = new Image();
    image.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, image.naturalWidth || image.width);
      canvas.height = Math.max(1, image.naturalHeight || image.height);
      const context = canvas.getContext('2d');
      if (!context) {
        resolve(null);
        return;
      }

      context.drawImage(image, 0, 0);
      try {
        resolve(canvas.toDataURL('image/png'));
      } catch {
        resolve(null);
      }
    };
    image.onerror = () => resolve(null);
    image.src = src;
  });

export const ensurePdfEmbeddableImage = async (dataUrl: string): Promise<string | null> => {
  if (isDirectlyEmbeddablePdfImage(dataUrl)) {
    return dataUrl;
  }

  return rasterizeToPngDataUrl(dataUrl);
};
