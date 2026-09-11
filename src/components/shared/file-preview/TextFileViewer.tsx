import React, { useMemo } from 'react';
import { Loader2 } from 'lucide-react';
import { type UploadedFile } from '@/types';
import { useI18n } from '@/contexts/I18nContext';
import { MarkdownFileViewer } from './MarkdownFileViewer';
import { useTextFileContent } from './useTextFileContent';
import { CodeEditor } from '@/components/shared/CodeEditor';

export const resolveFileLanguage = (fileName?: string, mimeType?: string): string => {
  const name = (fileName || '').toLowerCase();
  const lastDot = name.lastIndexOf('.');
  const ext = lastDot >= 0 ? name.slice(lastDot) : '';
  switch (ext) {
    case '.js':
    case '.jsx':
    case '.mjs':
    case '.cjs':
      return 'javascript';
    case '.ts':
    case '.tsx':
      return 'typescript';
    case '.py':
    case '.py3':
      return 'python';
    case '.json':
    case '.jsonc':
      return 'json';
    case '.html':
    case '.htm':
      return 'html';
    case '.css':
    case '.scss':
    case '.less':
      return 'css';
    case '.md':
    case '.markdown':
      return 'markdown';
    case '.xml':
    case '.svg':
      return 'xml';
    case '.sql':
      return 'sql';
    case '.c':
    case '.cpp':
    case '.cc':
    case '.cxx':
    case '.h':
    case '.hpp':
      return 'cpp';
    case '.rs':
      return 'rust';
    case '.java':
      return 'java';
    case '.php':
      return 'php';
    case '.yaml':
    case '.yml':
      return 'yaml';
    case '.go':
      return 'go';
  }

  const mime = (mimeType || '').toLowerCase();
  if (mime.includes('html')) return 'html';
  if (mime.includes('javascript')) return 'javascript';
  if (mime.includes('typescript')) return 'typescript';
  if (mime.includes('json')) return 'json';
  if (mime.includes('css')) return 'css';
  if (mime.includes('markdown')) return 'markdown';
  if (mime.includes('xml') || mime.includes('svg')) return 'xml';
  if (mime.includes('python')) return 'python';
  if (mime.includes('sql')) return 'sql';
  if (mime.includes('yaml')) return 'yaml';

  return 'plaintext';
};

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
  const { localContent, hasProvidedContent, isLoading } = useTextFileContent(file, content, onLoad, {
    isEditable,
    errorLogLabel: 'Failed to load text content',
    ignoreStaleResponses: false,
    fetchTrigger: 'file',
  });

  const fileLanguage = useMemo(() => {
    return resolveFileLanguage(file.name, file.type);
  }, [file.name, file.type]);

  if (renderMode === 'markdown') {
    return (
      <MarkdownFileViewer
        file={file}
        content={content}
        themeId={themeId}
        isEditable={isEditable}
        layout="contained"
        onChange={onChange}
        onLoad={onLoad}
      />
    );
  }

  const displayContent = content ?? localContent;
  const shouldShowLoading = hasProvidedContent ? false : isLoading;

  return (
    <div className="w-full h-full relative group bg-[var(--theme-bg-secondary)] text-[var(--theme-text-primary)]">
      {shouldShowLoading ? (
        <div className="flex items-center justify-center h-full text-[var(--theme-text-tertiary)]">
          <Loader2 className="animate-spin mr-2" /> {t('filePreviewLoadingTextContent')}
        </div>
      ) : (
        <div className="w-full h-full flex flex-col bg-[var(--theme-bg-code-block)]">
          <CodeEditor
            value={displayContent || ''}
            onChange={(val) => onChange && onChange(val)}
            language={fileLanguage}
            readOnly={!isEditable}
          />
        </div>
      )}
    </div>
  );
};
