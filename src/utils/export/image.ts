import { logService } from '@/services/logService';
import { toastError } from '@/stores/toastStore';
import { getErrorMessage } from '@/utils/errorMessage';
import { createManagedObjectUrl } from '@/services/objectUrlManager';

import { sanitizeDocumentStylesForPngExport } from './cssColorSanitizer';
import { triggerDownload } from './core';
import { createSnapshotContainer, createExportDOMHeader } from './dom';

const DEFAULT_PNG_EXPORT_SCALE = 2;
const DEFAULT_SVG_IMAGE_SCALE = 3;
const DEFAULT_SNAPSHOT_WIDTH = '800px';
const IMAGE_LOAD_PAINT_DELAY_MS = 500;
const SNAPSHOT_CONTAINER_PAINT_DELAY_MS = 800;
const MAX_CANVAS_HEIGHT_PX = 30000;
const MAX_CANVAS_AREA_PIXELS = 100 * 1000 * 1000;
const MIN_EXPORT_SCALE = 0.5;
const HTML2CANVAS_IMAGE_TIMEOUT_MS = 15000;
const FALLBACK_SVG_WIDTH = 300;
const FALLBACK_SVG_HEIGHT = 150;
const JPEG_MIME_TYPE = 'image/jpeg';

export interface PngExportMessages {
  imageTooLarge: string;
  exportFailed: (message: string) => string;
}

const waitForPaint = (delayMs: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, delayMs));

/**
 * Exports a given HTML element as a PNG image.
 * @param element The HTML element to capture.
 * @param filename The desired filename for the downloaded PNG.
 * @param options Configuration options for html2canvas.
 */
export const exportElementAsPng = async (
  element: HTMLElement,
  filename: string,
  options: { backgroundColor?: string | null; scale?: number; messages: PngExportMessages },
): Promise<boolean> => {
  const html2canvas = (await import('html2canvas')).default;

  // Wait for images so html2canvas does not capture unloaded placeholders.
  const images = Array.from(element.querySelectorAll('img'));
  await Promise.all(
    images.map((image) => {
      if (image.complete) return Promise.resolve();
      return new Promise((resolve) => {
        const resolveImage = () => resolve(undefined);
        image.onload = resolveImage;
        image.onerror = resolveImage;
      });
    }),
  );

  await waitForPaint(IMAGE_LOAD_PAINT_DELAY_MS);

  const width = element.scrollWidth;
  const height = element.scrollHeight;
  let targetScale = options?.scale ?? DEFAULT_PNG_EXPORT_SCALE;

  if (height * targetScale > MAX_CANVAS_HEIGHT_PX) {
    targetScale = MAX_CANVAS_HEIGHT_PX / height;
    logService.warn(`[Export] Content too tall, reducing scale to ${targetScale.toFixed(2)}`);
  }

  if (width * targetScale * (height * targetScale) > MAX_CANVAS_AREA_PIXELS) {
    const areaRatio = MAX_CANVAS_AREA_PIXELS / (width * height);
    targetScale = Math.min(targetScale, Math.sqrt(areaRatio));
    logService.warn(`[Export] Area too large, reducing scale to ${targetScale.toFixed(2)}`);
  }

  targetScale = Math.max(targetScale, MIN_EXPORT_SCALE);

  try {
    const canvas = await html2canvas(element, {
      height,
      width,
      useCORS: true,
      allowTaint: false,
      logging: false,
      backgroundColor: options?.backgroundColor ?? null,
      scale: targetScale,
      ignoreElements: (ignoredElement) => {
        return ignoredElement.classList.contains('no-export');
      },
      imageTimeout: HTML2CANVAS_IMAGE_TIMEOUT_MS,
      onclone: (clonedDoc) => {
        sanitizeDocumentStylesForPngExport(clonedDoc);

        const clonedElement = clonedDoc.querySelector('.is-exporting-png') as HTMLElement;
        if (clonedElement) {
          clonedElement.style.transform = 'none';
          clonedElement.style.maxHeight = 'none';
        }
      },
    });

    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
    if (blob) {
      const url = createManagedObjectUrl(blob);
      triggerDownload(url, filename);
      return true;
    } else {
      logService.error('Canvas to Blob conversion failed (Result is null). The chat may be too long.');
      toastError(options.messages.imageTooLarge);
      return false;
    }
  } catch (error) {
    logService.error('html2canvas error:', error);
    toastError(options.messages.exportFailed(getErrorMessage(error)));
    return false;
  }
};

/**
 * Orchestrates the full process of creating a snapshot container, injecting a header,
 * capturing the content, and downloading the PNG.
 */
export const generateSnapshotPng = async (
  contentElement: HTMLElement,
  filename: string,
  themeId: string,
  headerConfig: { title: string; metaLeft: string; metaRight: string },
  options: { width?: string; scale?: number; messages: PngExportMessages },
): Promise<boolean> => {
  let cleanup = () => {};
  try {
    const { container, innerContent, remove, rootBgColor } = await createSnapshotContainer(
      themeId,
      options.width || DEFAULT_SNAPSHOT_WIDTH,
    );
    cleanup = remove;

    const headerElement = createExportDOMHeader(headerConfig.title, headerConfig.metaLeft, headerConfig.metaRight);
    innerContent.appendChild(headerElement);

    const bodyElement = document.createElement('div');
    bodyElement.style.padding = '0 2rem 2rem 2rem';
    bodyElement.appendChild(contentElement);
    innerContent.appendChild(bodyElement);

    await waitForPaint(SNAPSHOT_CONTAINER_PAINT_DELAY_MS);

    return await exportElementAsPng(container, filename, {
      backgroundColor: rootBgColor,
      scale: options.scale || DEFAULT_PNG_EXPORT_SCALE,
      messages: options.messages,
    });
  } finally {
    cleanup();
  }
};

/**
 * Converts an SVG string to an image data URL and triggers a download.
 *
 * @param svgString The string content of the SVG.
 * @param filename The desired filename for the downloaded image.
 * @param scale The resolution scale factor for the output image.
 * @param mimeType The MIME type of the output image (e.g., 'image/png', 'image/jpeg').
 * @param backgroundColor Optional background color (e.g., '#FFFFFF'). Defaults to white for JPEG, transparent for PNG.
 */
export const exportSvgAsImage = async (
  svgString: string,
  filename: string,
  scale: number = DEFAULT_SVG_IMAGE_SCALE,
  mimeType: string = 'image/png',
  backgroundColor?: string,
): Promise<void> => {
  const parser = new DOMParser();
  const svgDocument = parser.parseFromString(svgString, 'image/svg+xml');
  const svgElement = svgDocument.documentElement;

  if (svgElement.tagName.toLowerCase() !== 'svg') {
    throw new Error('Invalid SVG string');
  }

  // Prefer explicit dimensions, then viewBox, then a conservative fallback.
  let width = parseFloat(svgElement.getAttribute('width') || '0');
  let height = parseFloat(svgElement.getAttribute('height') || '0');
  const viewBox = svgElement.getAttribute('viewBox');

  if ((!width || !height) && viewBox) {
    const viewBoxParts = viewBox.split(/\s+|,/).filter(Boolean).map(parseFloat);
    if (viewBoxParts.length === 4) {
      width = viewBoxParts[2];
      height = viewBoxParts[3];
    }
  }

  if (!width || !height) {
    width = FALLBACK_SVG_WIDTH;
    height = FALLBACK_SVG_HEIGHT;
  }

  const scaledWidth = Math.ceil(width * scale);
  const scaledHeight = Math.ceil(height * scale);

  svgElement.setAttribute('width', scaledWidth.toString());
  svgElement.setAttribute('height', scaledHeight.toString());

  svgElement.style.width = '';
  svgElement.style.height = '';
  svgElement.style.maxWidth = '';
  svgElement.style.maxHeight = '';

  const serializer = new XMLSerializer();
  const scaledSvgString = serializer.serializeToString(svgElement);

  const svgDataUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(scaledSvgString)}`;
  const image = new Image();

  return new Promise((resolve, reject) => {
    image.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = scaledWidth;
      canvas.height = scaledHeight;
      const canvasContext = canvas.getContext('2d');

      if (canvasContext) {
        const fillColor = backgroundColor ?? (mimeType === JPEG_MIME_TYPE ? '#FFFFFF' : undefined);
        if (fillColor) {
          canvasContext.fillStyle = fillColor;
          canvasContext.fillRect(0, 0, canvas.width, canvas.height);
        }

        canvasContext.drawImage(image, 0, 0, scaledWidth, scaledHeight);

        try {
          const dataUrl = canvas.toDataURL(mimeType);
          triggerDownload(dataUrl, filename);
          resolve();
        } catch (dataUrlError) {
          reject(dataUrlError);
        }
      } else {
        reject(new Error('Could not get canvas context.'));
      }
    };

    image.onerror = () => {
      reject(new Error('Failed to load SVG into image element.'));
    };

    image.src = svgDataUrl;
  });
};
