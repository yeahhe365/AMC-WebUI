import React, { useEffect, useRef, useState } from 'react';
import type { UploadedFile } from '@/types';
import { renderAsync } from 'docx-preview';
import { GoogleSpinner } from '@/components/icons/GoogleSpinner';
import { AlertCircle } from 'lucide-react';
import { useI18n } from '@/contexts/I18nContext';

interface DocxViewerProps {
  file: UploadedFile;
}

export const DocxViewer: React.FC<DocxViewerProps> = ({ file }) => {
  const { t } = useI18n();
  const containerRef = useRef<HTMLDivElement>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setError(null);

    const loadDocx = async () => {
      try {
        let blob: Blob | null = null;
        if (file.rawFile instanceof Blob) {
          blob = file.rawFile;
        } else if (file.dataUrl) {
          const response = await fetch(file.dataUrl);
          blob = await response.blob();
        }

        if (!blob) {
          throw new Error('No file data available for Word document preview.');
        }

        if (cancelled || !containerRef.current) return;

        // Clear previous content
        containerRef.current.innerHTML = '';

        await renderAsync(blob, containerRef.current, undefined, {
          inWrapper: true,
          ignoreWidth: false,
          ignoreHeight: false,
          breakPages: true,
          renderHeaders: true,
          renderFooters: true,
        });

        if (!cancelled) {
          setIsLoading(false);
        }
      } catch (docxError) {
        if (!cancelled) {
          setError(docxError instanceof Error ? docxError.message : t('filePreviewWordUnavailable'));
          setIsLoading(false);
        }
      }
    };

    void loadDocx();

    return () => {
      cancelled = true;
    };
  }, [file, t]);

  return (
    <div className="w-full h-full overflow-auto bg-[var(--theme-bg-tertiary)]/20 flex flex-col items-center pt-4 sm:pt-6 pb-12 px-2 sm:px-6 custom-scrollbar">
      {isLoading && (
        <div className="flex flex-col items-center justify-center m-auto text-[var(--theme-text-secondary)] gap-3">
          <GoogleSpinner size={32} />
          <p className="text-sm font-medium">{t('filePreviewLoadingWord')}</p>
        </div>
      )}

      {error && !isLoading && (
        <div className="flex flex-col items-center justify-center m-auto text-[var(--theme-text-danger)] gap-3 max-w-md text-center p-6 bg-[var(--theme-bg-secondary)] rounded-2xl border border-[var(--theme-border-secondary)]">
          <AlertCircle size={36} />
          <p className="text-sm">{error}</p>
          {file.textContent && (
            <div className="mt-4 text-left w-full text-xs text-[var(--theme-text-primary)] font-mono whitespace-pre-wrap max-h-60 overflow-y-auto p-3 bg-[var(--theme-bg-input)] rounded-lg">
              {file.textContent}
            </div>
          )}
        </div>
      )}

      <div
        ref={containerRef}
        className={`docx-preview-container w-full max-w-4xl transition-opacity duration-300 ${
          isLoading || error ? 'opacity-0 h-0 overflow-hidden' : 'opacity-100'
        }`}
      />
    </div>
  );
};
