import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Document, Page } from 'react-pdf';
import { ensurePdfWorkerConfigured } from '@/utils/pdfRuntime';
import {
  readPdfThumbnailCache,
  writePdfThumbnailCache,
  getPdfThumbnailCacheKey,
  type PdfThumbnailTargetFile,
} from './pdfThumbnailCache';

interface PdfFileThumbnailProps {
  file: PdfThumbnailTargetFile;
  fallback: React.ReactNode;
  width?: number;
  className?: string;
}

export const PdfFileThumbnail: React.FC<PdfFileThumbnailProps> = ({ file, fallback, width, className }) => {
  ensurePdfWorkerConfigured();

  const containerRef = useRef<HTMLDivElement | null>(null);
  const cacheKey = useMemo(() => getPdfThumbnailCacheKey(file, width), [file, width]);
  const [cachedImageUrl, setCachedImageUrl] = useState(() => readPdfThumbnailCache(cacheKey) ?? null);
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    setCachedImageUrl(readPdfThumbnailCache(cacheKey) ?? null);
    setHasError(false);
  }, [cacheKey]);

  if (!file.dataUrl || hasError) {
    return <>{fallback}</>;
  }

  const objectFitClass = className?.match(/\bobject-(contain|cover|fill|none|scale-down)\b/)?.[0] ?? 'object-cover';
  const cleanedClassName = className
    ? className.replace(/\bobject-(contain|cover|fill|none|scale-down)\b/g, '').trim()
    : '';

  if (cachedImageUrl) {
    return (
      <img src={cachedImageUrl} alt={file.name} className={`h-full w-full ${objectFitClass} ${cleanedClassName}`} />
    );
  }

  const handleRenderSuccess = () => {
    const canvas = containerRef.current?.querySelector('canvas');
    if (!canvas) {
      return;
    }

    try {
      const imageUrl = canvas.toDataURL('image/png');
      writePdfThumbnailCache(cacheKey, imageUrl);
      setCachedImageUrl(imageUrl);
    } catch {
      // Keep the rendered PDF canvas in place if the browser refuses canvas export.
    }
  };

  return (
    <div ref={containerRef} className={`h-full w-full overflow-hidden bg-white ${cleanedClassName}`}>
      <Document
        file={file.dataUrl}
        loading={fallback}
        error={fallback}
        onLoadError={() => setHasError(true)}
        className="flex h-full w-full items-start justify-center overflow-hidden"
      >
        <Page
          pageNumber={1}
          width={width ?? 92}
          renderAnnotationLayer={false}
          renderTextLayer={false}
          loading={fallback}
          onRenderSuccess={handleRenderSuccess}
          className="origin-top scale-[0.98]"
        />
      </Document>
    </div>
  );
};
