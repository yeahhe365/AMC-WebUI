import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Code2, Eye, List, Loader2 } from 'lucide-react';
import { type UploadedFile } from '@/types';
import { useI18n } from '@/contexts/I18nContext';
import { LazyMarkdownRenderer } from '@/components/message/LazyMarkdownRenderer';
import { LARGE_FILE_PREVIEW_LENGTH_THRESHOLD, shouldDeferMarkdownPreview } from './markdownPreviewPolicy';
import { extractMarkdownToc, type MarkdownTocItem } from './markdownToc';
import { getMarkdownDocumentStats } from './markdownDocumentStats';
import { VirtualSourceViewer } from './VirtualSourceViewer';
import { interpolate } from '@/i18n/interpolate';
import { isEditableElement } from '@/utils/chat-input/focus';
import { useTextFileContent } from './useTextFileContent';

const TOGGLE_BUTTON_BASE_CLASS =
  'inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors';
const TOGGLE_BUTTON_ACTIVE_CLASS = 'bg-[var(--theme-bg-accent)] text-white shadow-sm';
const TOGGLE_BUTTON_INACTIVE_CLASS = 'text-[var(--theme-text-secondary)] hover:text-[var(--theme-text-primary)]';

interface MarkdownFileViewerProps {
  file: UploadedFile;
  content?: string | null;
  themeId?: string;
  isEditable?: boolean;
  layout?: 'contained' | 'overlay';
  onChange?: (value: string) => void;
  onLoad?: (content: string) => void;
}

const MARKDOWN_VIEW_MODE_STORAGE_PREFIX = 'markdown-preview-mode:';
const MARKDOWN_TOC_STORAGE_PREFIX = 'markdown-preview-toc:';

type MarkdownViewMode = 'preview' | 'source';

const readStoredMarkdownViewMode = (storageKey: string): MarkdownViewMode => {
  try {
    return localStorage.getItem(storageKey) === 'source' ? 'source' : 'preview';
  } catch {
    return 'preview';
  }
};

const readStoredTocVisibility = (storageKey: string): boolean => {
  try {
    return localStorage.getItem(storageKey) === 'open';
  } catch {
    return false;
  }
};

const scrollPreviewToHeading = (container: HTMLElement, headingIndex: number) => {
  const headings = container.querySelectorAll('h1, h2, h3, h4, h5, h6');
  const target = headings.item(headingIndex);
  if (!target) return;

  target.scrollIntoView({ behavior: 'smooth', block: 'start' });
};

const MarkdownTocPanel: React.FC<{
  items: MarkdownTocItem[];
  onSelect: (item: MarkdownTocItem) => void;
  translate: (key: string) => string;
}> = ({ items, onSelect, translate }) => {
  if (items.length === 0) {
    return (
      <div className="px-4 py-6 text-sm text-[var(--theme-text-tertiary)]">{translate('markdownPreviewTocEmpty')}</div>
    );
  }

  return (
    <nav aria-label={translate('markdownPreviewTocTitle')} className="px-3 py-4">
      <ul className="space-y-1">
        {items.map((item) => (
          <li key={`${item.id}-${item.line}`}>
            <button
              type="button"
              onClick={() => onSelect(item)}
              className="w-full rounded-lg px-2 py-1.5 text-left text-sm text-[var(--theme-text-secondary)] transition-colors hover:bg-[var(--theme-bg-secondary)] hover:text-[var(--theme-text-primary)]"
              style={{ paddingLeft: `${(item.level - 1) * 12 + 8}px` }}
              title={item.text}
            >
              <span className="line-clamp-2">{item.text}</span>
            </button>
          </li>
        ))}
      </ul>
    </nav>
  );
};

export const MarkdownFileViewer: React.FC<MarkdownFileViewerProps> = ({
  file,
  content,
  themeId = 'pearl',
  isEditable = false,
  layout = 'contained',
  onChange,
  onLoad,
}) => {
  const { t } = useI18n();
  const storageKey = useMemo(() => `${MARKDOWN_VIEW_MODE_STORAGE_PREFIX}${file.id}:${file.name}`, [file.id, file.name]);
  const tocStorageKey = useMemo(() => `${MARKDOWN_TOC_STORAGE_PREFIX}${file.id}:${file.name}`, [file.id, file.name]);
  const [modeState, setModeState] = useState<{ storageKey: string; mode: MarkdownViewMode }>(() => ({
    storageKey,
    mode: readStoredMarkdownViewMode(storageKey),
  }));
  const [forcePreviewState, setForcePreviewState] = useState<{ storageKey: string; value: boolean }>(() => ({
    storageKey,
    value: false,
  }));
  const [tocVisibleState, setTocVisibleState] = useState<{ storageKey: string; value: boolean }>(() => ({
    storageKey: tocStorageKey,
    value: readStoredTocVisibility(tocStorageKey),
  }));
  const [highlightedSourceLine, setHighlightedSourceLine] = useState<number | null>(null);
  const { localContent, isLoading, textareaRef } = useTextFileContent(file, content, onLoad, {
    isEditable,
    errorLogLabel: 'Failed to load markdown content',
    ignoreStaleResponses: true,
    fetchTrigger: 'dataUrl',
  });
  const previewContainerRef = useRef<HTMLDivElement>(null);
  const mode = modeState.storageKey === storageKey ? modeState.mode : readStoredMarkdownViewMode(storageKey);
  const forcePreview = forcePreviewState.storageKey === storageKey && forcePreviewState.value;
  const tocVisible =
    tocVisibleState.storageKey === tocStorageKey ? tocVisibleState.value : readStoredTocVisibility(tocStorageKey);

  const updateMode = useCallback(
    (nextMode: MarkdownViewMode) => {
      setModeState({ storageKey, mode: nextMode });
      try {
        localStorage.setItem(storageKey, nextMode);
      } catch {
        // localStorage may be unavailable; keep the in-memory mode change.
      }
    },
    [storageKey],
  );

  const updateTocVisibility = useCallback(
    (nextVisible: boolean) => {
      setTocVisibleState({ storageKey: tocStorageKey, value: nextVisible });
      try {
        localStorage.setItem(tocStorageKey, nextVisible ? 'open' : 'closed');
      } catch {
        // localStorage may be unavailable; keep the in-memory visibility change.
      }
    },
    [tocStorageKey],
  );

  const displayContent = content ?? localContent ?? '';
  const shouldDefer = useMemo(() => shouldDeferMarkdownPreview(displayContent), [displayContent]);
  const showSource = isEditable || mode === 'source' || (shouldDefer && !forcePreview);
  const tocItems = useMemo(() => extractMarkdownToc(displayContent), [displayContent]);
  const documentStats = useMemo(() => getMarkdownDocumentStats(displayContent), [displayContent]);
  const shouldVirtualizeSource = displayContent.length > LARGE_FILE_PREVIEW_LENGTH_THRESHOLD;
  const contentPaddingClass = layout === 'overlay' ? 'pt-24 pb-24' : '';

  const handleTocSelect = useCallback(
    (item: MarkdownTocItem) => {
      if (showSource) {
        setHighlightedSourceLine(item.line);
        return;
      }

      if (!previewContainerRef.current) return;
      scrollPreviewToHeading(previewContainerRef.current, item.index);
    },
    [showSource],
  );

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (isEditable) return;

      const activeElement = document.activeElement as HTMLElement | null;
      const isEditingFieldFocused = !!activeElement && isEditableElement(activeElement);

      if (isEditingFieldFocused) return;

      if ((event.metaKey || event.ctrlKey) && event.altKey && event.key.toLowerCase() === 'p') {
        event.preventDefault();
        updateMode('preview');
        setForcePreviewState({ storageKey, value: true });
        return;
      }

      if ((event.metaKey || event.ctrlKey) && event.altKey && event.key.toLowerCase() === 's') {
        event.preventDefault();
        updateMode('source');
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isEditable, storageKey, updateMode]);

  if (isLoading) {
    return (
      <div
        className={`flex h-full items-center justify-center text-[var(--theme-text-tertiary)] ${contentPaddingClass}`}
      >
        <Loader2 className="mr-2 animate-spin" /> {t('filePreviewLoadingTextContent')}
      </div>
    );
  }

  const sourceSurface = shouldVirtualizeSource ? (
    <VirtualSourceViewer
      content={displayContent}
      highlightLine={highlightedSourceLine}
      onHighlightLineConsumed={() => setHighlightedSourceLine(null)}
      className="rounded-2xl border border-[var(--theme-border-secondary)] bg-[var(--theme-bg-primary)] shadow-sm"
    />
  ) : (
    <div className="mx-auto max-w-5xl px-4 py-6 sm:px-8">
      <pre className="min-h-[60vh] whitespace-pre-wrap break-words rounded-2xl border border-[var(--theme-border-secondary)] bg-[var(--theme-bg-primary)] p-5 font-mono text-sm leading-6 text-[var(--theme-text-primary)] shadow-sm sm:p-8">
        {displayContent}
      </pre>
    </div>
  );

  return (
    <div
      className={`flex h-full min-h-0 flex-col bg-[var(--theme-bg-secondary)] text-[var(--theme-text-primary)] ${contentPaddingClass}`}
    >
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--theme-border-secondary)] bg-[var(--theme-bg-primary)] px-4 py-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 rounded-xl border border-[var(--theme-border-secondary)] bg-[var(--theme-bg-secondary)] p-1">
            <button
              type="button"
              className={`${TOGGLE_BUTTON_BASE_CLASS} ${!showSource ? TOGGLE_BUTTON_ACTIVE_CLASS : TOGGLE_BUTTON_INACTIVE_CLASS}`}
              onClick={() => {
                updateMode('preview');
                setForcePreviewState({ storageKey, value: true });
              }}
              disabled={isEditable}
              title={t('markdownPreviewPreviewShortcut')}
            >
              <Eye size={15} />
              {t('markdownPreviewPreview')}
            </button>
            <button
              type="button"
              className={`${TOGGLE_BUTTON_BASE_CLASS} ${showSource ? TOGGLE_BUTTON_ACTIVE_CLASS : TOGGLE_BUTTON_INACTIVE_CLASS}`}
              onClick={() => updateMode('source')}
              title={t('markdownPreviewSourceShortcut')}
            >
              <Code2 size={15} />
              {t('markdownPreviewSource')}
            </button>
          </div>

          {!showSource && tocItems.length > 0 && (
            <button
              type="button"
              className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors ${tocVisible ? 'border-[var(--theme-border-focus)] bg-[var(--theme-bg-accent)]/10 text-[var(--theme-text-primary)]' : 'border-[var(--theme-border-secondary)] text-[var(--theme-text-secondary)] hover:text-[var(--theme-text-primary)]'}`}
              onClick={() => updateTocVisibility(!tocVisible)}
              title={t('markdownPreviewTocTitle')}
            >
              <List size={15} />
              {t('markdownPreviewToc')}
            </button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {shouldDefer && !forcePreview && !isEditable && (
            <button
              type="button"
              className="rounded-lg border border-[var(--theme-border-focus)] bg-[var(--theme-bg-accent)]/10 px-3 py-1.5 text-sm font-medium text-[var(--theme-text-primary)] transition-colors hover:bg-[var(--theme-bg-accent)]/20"
              onClick={() => {
                updateMode('preview');
                setForcePreviewState({ storageKey, value: true });
              }}
            >
              {t('filePreviewRenderMarkdownAnyway')}
            </button>
          )}

          <p className="text-xs text-[var(--theme-text-tertiary)]">
            {interpolate(t('markdownPreviewStats'), {
              lines: String(documentStats.lines),
              words: String(documentStats.words),
              characters: String(documentStats.characters),
            })}
          </p>
        </div>
      </div>

      {shouldDefer && !forcePreview && !isEditable && (
        <div className="border-b border-[var(--theme-border-secondary)] bg-[var(--theme-bg-primary)] px-4 py-2">
          <p className="text-sm text-[var(--theme-text-secondary)]">{t('filePreviewLargeMarkdownNotice')}</p>
        </div>
      )}

      <div className="flex min-h-0 flex-1 overflow-hidden">
        <div className="min-h-0 flex-1 overflow-auto custom-scrollbar">
          {showSource ? (
            isEditable ? (
              <textarea
                ref={textareaRef}
                value={displayContent}
                onChange={(event) => onChange?.(event.target.value)}
                className="h-full min-h-[60vh] w-full resize-none bg-[var(--theme-bg-secondary)] p-5 font-mono text-sm leading-6 text-[var(--theme-text-primary)] outline-none sm:p-8"
                spellCheck={false}
              />
            ) : (
              sourceSurface
            )
          ) : (
            <article className="mx-auto max-w-4xl px-4 py-6 sm:px-8 sm:py-10">
              <div
                ref={previewContainerRef}
                className="markdown-body min-h-[60vh] rounded-2xl border border-[var(--theme-border-secondary)] bg-[var(--theme-bg-primary)] p-6 shadow-sm sm:p-10"
              >
                <LazyMarkdownRenderer
                  content={displayContent}
                  isLoading={false}
                  onImageClick={() => {}}
                  onOpenHtmlPreview={() => {}}
                  onOpenSidePanel={() => {}}
                  expandCodeBlocksByDefault={true}
                  isMermaidRenderingEnabled={true}
                  isGraphvizRenderingEnabled={true}
                  allowHtml={true}
                  themeId={themeId}
                  interactiveMode="disabled"
                  fallbackMode="raw"
                />
              </div>
            </article>
          )}
        </div>

        {!showSource && tocVisible && (
          <aside className="hidden w-64 shrink-0 overflow-auto border-l border-[var(--theme-border-secondary)] bg-[var(--theme-bg-primary)] custom-scrollbar sm:block">
            <div className="border-b border-[var(--theme-border-secondary)] px-4 py-3">
              <h3 className="text-sm font-semibold text-[var(--theme-text-primary)]">{t('markdownPreviewTocTitle')}</h3>
            </div>
            <MarkdownTocPanel items={tocItems} onSelect={handleTocSelect} translate={t} />
          </aside>
        )}
      </div>
    </div>
  );
};
