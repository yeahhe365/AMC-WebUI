import { useCallback, useState } from 'react';

interface UseDiagramExportOptions {
  /** Current diagram SVG; download is a no-op while empty. */
  svg: string;
  /** Filename stem: `${filenamePrefix}-diagram-${Date.now()}.jpg`. */
  filenamePrefix: string;
  /** Rasterization scale forwarded to `exportSvgAsImage`. */
  scale: number;
  /** Receives the user-facing failure message (stored in the block's error state). */
  onError: (message: string) => void;
  /** Fallback message when the thrown value is not an `Error` instance. */
  fallbackErrorMessage: string;
}

/**
 * Shared JPG download handler for the diagram blocks. Lazily loads the export
 * pipeline, renders the given SVG to a scaled JPEG download, and funnels
 * failures into the caller's error state.
 *
 * Returns `isDownloading` (drives DiagramWrapper's disabled state) and the
 * click handler.
 */
export const useDiagramExport = ({
  svg,
  filenamePrefix,
  scale,
  onError,
  fallbackErrorMessage,
}: UseDiagramExportOptions): {
  isDownloading: boolean;
  handleDownloadJpg: () => Promise<void>;
} => {
  const [isDownloading, setIsDownloading] = useState(false);

  const handleDownloadJpg = useCallback(async () => {
    if (!svg || isDownloading) return;
    setIsDownloading(true);
    try {
      const { exportSvgAsImage } = await import('@/utils/export/image');
      await exportSvgAsImage(svg, `${filenamePrefix}-diagram-${Date.now()}.jpg`, scale, 'image/jpeg');
    } catch (error) {
      onError(error instanceof Error ? error.message : fallbackErrorMessage);
    } finally {
      setIsDownloading(false);
    }
  }, [svg, isDownloading, filenamePrefix, scale, onError, fallbackErrorMessage]);

  return { isDownloading, handleDownloadJpg };
};
