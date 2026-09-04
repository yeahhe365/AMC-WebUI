import React, { useState, type RefObject } from 'react';
import { useI18n } from '@/contexts/I18nContext';
import { LazyMarkdownRenderer } from '@/components/message/LazyMarkdownRenderer';

interface CreateFileBodyProps {
  textContent: string;
  setTextContent: (text: string) => void;
  debouncedContent: string;
  textareaRef: RefObject<HTMLTextAreaElement>;
  isPreviewMode: boolean;
  supportsRichPreview: boolean;
  useMonospaceFont: boolean;
  handlePaste: (e: React.ClipboardEvent<HTMLTextAreaElement>) => void;
  handleDrop: (e: React.DragEvent) => void;
  onSaveKeyDown: (event: React.KeyboardEvent<HTMLElement>) => void;
  themeId: string;
}

export const CreateFileBody: React.FC<CreateFileBodyProps> = ({
  textContent,
  setTextContent,
  debouncedContent,
  textareaRef,
  isPreviewMode,
  supportsRichPreview,
  useMonospaceFont,
  handlePaste,
  handleDrop,
  onSaveKeyDown,
  themeId,
}) => {
  const { t } = useI18n();
  const [isDragging, setIsDragging] = useState(false);

  const onDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer.types.includes('Files')) setIsDragging(true);
  };

  const onDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isDragging && e.dataTransfer.types.includes('Files')) setIsDragging(true);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    handleDrop(e);
    setIsDragging(false);
  };

  return (
    <div className="flex-grow flex flex-col p-4 min-h-0 bg-[var(--theme-bg-primary)]">
      <div className="flex-grow flex flex-col lg:flex-row gap-4 min-h-0 h-full">
        <div
          className={`
                    relative rounded-lg border overflow-hidden focus-within:ring-2 focus-within:ring-[var(--theme-border-focus)] focus-within:border-transparent transition-all bg-[var(--theme-bg-input)]
                    ${isDragging ? 'border-[var(--theme-bg-accent)] ring-2 ring-[var(--theme-bg-accent)] bg-[var(--theme-bg-accent)]/10' : 'border-[var(--theme-border-secondary)]'}
                    ${supportsRichPreview ? 'lg:w-1/2' : 'w-full max-w-4xl mx-auto'}
                    ${supportsRichPreview && isPreviewMode ? 'hidden lg:block' : 'flex-grow h-full'}
                `}
        >
          <textarea
            ref={textareaRef}
            value={textContent}
            onChange={(e) => setTextContent(e.target.value)}
            onPaste={handlePaste}
            onKeyDown={onSaveKeyDown}
            onDragEnter={onDragEnter}
            onDragLeave={onDragLeave}
            onDragOver={onDragOver}
            onDrop={onDrop}
            className={`absolute inset-0 w-full h-full p-4 bg-transparent border-none text-[var(--theme-text-primary)] placeholder-[var(--theme-text-tertiary)] resize-none custom-scrollbar outline-none text-sm leading-relaxed ${
              useMonospaceFont ? 'font-mono' : ''
            }`}
            placeholder={t('createTextContentPlaceholder')}
            aria-label={t('createTextContentAria')}
            spellCheck={false}
          />
          {isDragging && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none bg-[var(--theme-bg-accent)]/10">
              <div className="bg-[var(--theme-bg-accent)] text-[var(--theme-text-accent)] px-4 py-2 rounded-lg font-medium shadow-lg">
                {t('createTextDropImageToInsert')}
              </div>
            </div>
          )}
        </div>

        {supportsRichPreview && (
          <div
            className={`
                        relative rounded-lg border border-[var(--theme-border-secondary)] overflow-hidden bg-[var(--theme-bg-input)]
                        lg:w-1/2
                        ${isPreviewMode ? 'flex-grow h-full' : 'hidden lg:block'}
                    `}
          >
            <div className="absolute inset-0 w-full h-full overflow-auto custom-scrollbar">
              <div
                className="w-full min-h-full bg-[var(--theme-bg-primary)] text-[var(--theme-text-primary)] p-4 sm:p-6 transition-colors duration-300"
                style={{ fontSize: '16px' }}
              >
                <div className="markdown-body">
                  <LazyMarkdownRenderer
                    content={debouncedContent || t('createTextEmptyPreview')}
                    isLoading={false}
                    onImageClick={() => {}}
                    onOpenHtmlPreview={() => {}}
                    onOpenSidePanel={() => {}}
                    expandCodeBlocksByDefault={true}
                    isMermaidRenderingEnabled={true}
                    isGraphvizRenderingEnabled={true}
                    allowHtml={true}
                    themeId={themeId}
                    fallbackMode="raw"
                  />
                </div>
                <div className="mt-8 pt-4 border-t border-[var(--theme-border-secondary)] text-center text-xs text-[var(--theme-text-tertiary)] hidden print:block">
                  {t('createTextGeneratedWith')}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
