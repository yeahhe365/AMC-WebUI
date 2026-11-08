import { blobToDataUrl } from '@/utils/file/fileEncoding';
import { isImageMimeType } from '@/utils/file/fileTypeClassification';
import { getServerAuthHeaders } from '@/services/api/apiAuthHeaders';

const FALLBACK_IMAGE_WIDTH = 1200;
const FALLBACK_IMAGE_HEIGHT = 675;
const IMAGE_SIZE_TIMEOUT_MS = 3000;
const IMAGE_FETCH_TIMEOUT_MS = 5000;
const IMAGE_RASTERIZE_TIMEOUT_MS = 5000;

const fetchImageSourceAsDataUrl = async (src: string): Promise<string | null> => {
  try {
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), IMAGE_FETCH_TIMEOUT_MS);
    let response: Response;
    // 只有请求自身端点(/api/image-proxy)时才带部署口令;回落分支是上游原始图片地址,
    // 把口令发过去等于泄露,所以按"是否同源相对路径"区分。
    const authHeaders = src.startsWith('/') ? getServerAuthHeaders() : {};
    try {
      response = await fetch(src, {
        signal: controller.signal,
        ...(Object.keys(authHeaders).length > 0 ? { headers: authHeaders } : {}),
      });
    } finally {
      window.clearTimeout(timeoutId);
    }
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
    const timeoutId = window.setTimeout(() => resolve(null), IMAGE_RASTERIZE_TIMEOUT_MS);

    const cleanup = () => {
      window.clearTimeout(timeoutId);
    };

    image.onload = () => {
      cleanup();
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
    image.onerror = () => {
      cleanup();
      resolve(null);
    };
    image.src = src;
  });

export const ensurePdfEmbeddableImage = async (dataUrl: string): Promise<string | null> => {
  if (isDirectlyEmbeddablePdfImage(dataUrl)) {
    return dataUrl;
  }

  return rasterizeToPngDataUrl(dataUrl);
};
