import React from 'react';
import { Loader2 } from 'lucide-react';
import { type UploadedFile } from '@/types';
import { useI18n } from '@/contexts/I18nContext';
import { LARGE_FILE_PREVIEW_LENGTH_THRESHOLD } from './markdownPreviewPolicy';
import { MarkdownFileViewer } from './MarkdownFileViewer';
import { VirtualSourceViewer } from './VirtualSourceViewer';
import { useTextFileContent } from './useTextFileContent';

interface TextFileViewerProps {
  file: UploadedFile;
  content?: string | null;
  renderMode?: 'plain' | 'markdown';
  themeId?: string;
  isEditable?: boolean;
  onChange?: (value: string) => void;
  onLoad?: (content: string) => void;
}

export const TextFileViewer: React.FC<TextFileViewerProps> = ({
  file,
  content,
  renderMode = 'plain',
  themeId = 'pearl',
  isEditable = false,
  onChange,
  onLoad,
}) => {
  const { t } = useI18n();
  const { localContent, hasProvidedContent, isLoading, textareaRef } = useTextFileContent(file, content, onLoad, {
    isEditable,
    errorLogLabel: 'Failed to load text content',
    ignoreStaleResponses: false,
    fetchTrigger: 'file',
  });

  if (renderMode === 'markdown') {
    return (
      <MarkdownFileViewer
        file={file}
        content={content}
        themeId={themeId}
        isEditable={isEditable}
        layout="overlay"
        onChange={onChange}
        onLoad={onLoad}
      />
    );
  }

  const displayContent = content ?? localContent;
  const isLargeFile = (displayContent?.length || 0) > LARGE_FILE_PREVIEW_LENGTH_THRESHOLD;
  const shouldShowLoading = hasProvidedContent ? false : isLoading;
  const shouldVirtualizePlainText = isLargeFile;

  const plainTextSurface = shouldVirtualizePlainText ? (
    <VirtualSourceViewer content={displayContent || ''} />
  ) : (
    <div className="w-full h-full p-4 sm:p-8 pt-24 pb-24 overflow-auto custom-scrollbar select-text cursor-text">
      <div className="max-w-4xl mx-auto min-h-[50vh] rounded-lg border border-[var(--theme-border-secondary)] bg-[var(--theme-bg-primary)] p-6 shadow-xl">
        <pre className="text-sm font-mono text-[var(--theme-text-primary)] whitespace-pre-wrap break-all">
          {displayContent}
        </pre>
      </div>
    </div>
  );

  return (
    <div className="w-full h-full relative group bg-[var(--theme-bg-secondary)] text-[var(--theme-text-primary)]">
      {shouldShowLoading ? (
        <div className="flex items-center justify-center h-full text-[var(--theme-text-tertiary)]">
          <Loader2 className="animate-spin mr-2" /> {t('filePreviewLoadingTextContent')}
        </div>
      ) : isEditable ? (
        <textarea
          ref={textareaRef}
          value={displayContent || ''}
          onChange={(event) => onChange && onChange(event.target.value)}
          className="w-full h-full p-4 sm:p-8 pt-24 pb-24 bg-transparent text-sm font-mono text-[var(--theme-text-primary)] whitespace-pre-wrap break-all outline-none resize-none custom-scrollbar"
          spellCheck={false}
        />
      ) : (
        plainTextSurface
      )}
    </div>
  );
};
