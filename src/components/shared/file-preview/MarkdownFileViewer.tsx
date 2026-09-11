import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, Code2, Eye, List, Loader2, X } from 'lucide-react';
import { type UploadedFile } from '@/types';
import { useI18n } from '@/contexts/I18nContext';
import { shouldDeferMarkdownPreview } from './markdownPreviewPolicy';
import { extractMarkdownToc, type MarkdownTocItem } from './markdownToc';
import { getMarkdownDocumentStats } from './markdownDocumentStats';
import { VirtualSourceViewer } from './VirtualSourceViewer';
import { interpolate } from '@/i18n/interpolate';
import { isEditableElement } from '@/utils/chat-input/focus';
import { useTextFileContent } from './useTextFileContent';
import { LazyMarkdownRenderer } from '@/components/message/LazyMarkdownRenderer';
import { MARKDOWN_VIEW_MODE_STORAGE_PREFIX, MARKDOWN_TOC_STORAGE_PREFIX } from '@/constants/storageKeys';
import { readPersistentStorageItem, writePersistentStorageItem } from '@/stores/persistentStorage';

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

type MarkdownViewMode = 'preview' | 'source';

const readStoredMarkdownViewMode = (storageKey: string): MarkdownViewMode => {
  return readPersistentStorageItem(storageKey) === 'source' ? 'source' : 'preview';
};

const readStoredTocVisibility = (storageKey: string): boolean => {
  return readPersistentStorageItem(storageKey) === 'open';
};

const scrollPreviewToHeading = (container: HTMLElement, headingIndex: number) => {
  const headings = container.querySelectorAll('h1, h2, h3, h4, h5, h6');
  const target = headings.item(headingIndex) as HTMLElement | null;
  if (!target) return;

  target.scrollIntoView({ behavior: 'smooth', block: 'start' });
  target.classList.remove('heading-target-pulse');
  void target.offsetWidth;
  target.classList.add('heading-target-pulse');
  setTimeout(() => {
    target.classList.remove('heading-target-pulse');
  }, 1800);
};

const MarkdownTocPanel: React.FC<{
  items: MarkdownTocItem[];
  activeHeadingIndex?: number;
  onSelect: (item: MarkdownTocItem) => void;
  translate: (key: string) => string;
}> = ({ items, activeHeadingIndex, onSelect, translate }) => {
  if (items.length === 0) {
    return (
      <div className="px-4 py-6 text-sm text-[var(--theme-text-tertiary)]">{translate('markdownPreviewTocEmpty')}</div>
    );
  }

  return (
    <nav aria-label={translate('markdownPreviewTocTitle')} className="px-3 py-3">
      <ul className="space-y-1">
        {items.map((item) => {
          const isMinorDetailHeading = item.level >= 3 && (item.text === '详情' || item.text === '详细信息');
          const isActive = activeHeadingIndex !== undefined && item.index === activeHeadingIndex;

          return (
            <li key={`${item.id}-${item.line}`}>
              <button
                type="button"
                onClick={() => onSelect(item)}
                className={`group flex w-full items-start gap-2 rounded-lg px-2.5 py-1.5 text-left text-xs transition-colors ${
                  isActive
                    ? 'bg-[var(--theme-bg-accent)]/15 font-semibold text-[var(--theme-text-primary)] shadow-2xs'
                    : isMinorDetailHeading
                      ? 'text-[var(--theme-text-tertiary)] italic hover:bg-[var(--theme-bg-accent)]/10 hover:text-[var(--theme-text-secondary)]'
                      : item.level <= 2
                        ? 'font-medium text-[var(--theme-text-primary)] hover:bg-[var(--theme-bg-accent)]/10'
                        : 'text-[var(--theme-text-secondary)] hover:bg-[var(--theme-bg-accent)]/10 hover:text-[var(--theme-text-primary)]'
                }`}
                style={{ paddingLeft: `${(item.level - 1) * 12 + 8}px` }}
                title={item.text}
              >
                <span
                  className={`mt-1 shrink-0 rounded-full transition-colors ${
                    isActive
                      ? 'h-2 w-2 bg-[var(--theme-bg-accent,#0ea5e9)] ring-2 ring-[var(--theme-bg-accent,#0ea5e9)]/30'
                      : isMinorDetailHeading
                        ? 'h-1 w-1 bg-[var(--theme-text-tertiary)]/40'
                        : item.level === 1
                          ? 'h-1.5 w-1.5 bg-[var(--theme-bg-accent,#0ea5e9)]'
                          : item.level === 2
                            ? 'h-1.5 w-1.5 bg-[var(--theme-text-secondary)]'
                            : 'h-1 w-1 bg-[var(--theme-text-tertiary)]'
                  }`}
                />
                <span className="line-clamp-2 leading-relaxed break-words">{item.text}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
};

export const MarkdownFileViewer: React.FC<MarkdownFileViewerProps> = ({
  file,
  content,
  themeId = 'pearl',
  isEditable = false,
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
  const [tocFilterMode, setTocFilterMode] = useState<'compact' | 'all'>('compact');
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
      writePersistentStorageItem(storageKey, nextMode);
    },
    [storageKey],
  );

  const updateTocVisibility = useCallback(
    (nextVisible: boolean) => {
      setTocVisibleState({ storageKey: tocStorageKey, value: nextVisible });
      writePersistentStorageItem(tocStorageKey, nextVisible ? 'open' : 'closed');
    },
    [tocStorageKey],
  );

  const displayContent = content ?? localContent ?? '';
  const shouldDefer = useMemo(() => shouldDeferMarkdownPreview(displayContent), [displayContent]);
  const showSource = isEditable || mode === 'source' || (shouldDefer && !forcePreview);
  const tocItems = useMemo(() => extractMarkdownToc(displayContent), [displayContent]);
  const documentStats = useMemo(() => getMarkdownDocumentStats(displayContent), [displayContent]);

  const hasRepetitiveHeadings = useMemo(() => {
    return tocItems.some(
      (item) => item.level >= 4 || (item.level >= 3 && (item.text === '详情' || item.text === '详细信息')),
    );
  }, [tocItems]);

  const filteredTocItems = useMemo(() => {
    if (tocFilterMode === 'all' || !hasRepetitiveHeadings) return tocItems;
    return tocItems.filter((item) => item.level <= 3 && item.text !== '详情' && item.text !== '详细信息');
  }, [tocItems, tocFilterMode, hasRepetitiveHeadings]);

  const [activeHeadingIndex, setActiveHeadingIndex] = useState<number>(0);

  useEffect(() => {
    if (showSource) return;
    const container = previewContainerRef.current;
    if (!container) return;

    let ticking = false;
    const updateActiveHeading = () => {
      const headings = container.querySelectorAll('h1, h2, h3, h4, h5, h6');
      if (headings.length === 0) return;

      const containerTop = container.getBoundingClientRect().top;
      let currentIndex = 0;

      for (let i = 0; i < headings.length; i++) {
        const heading = headings[i];
        const rect = heading.getBoundingClientRect();
        if (rect.top - containerTop <= 96) {
          currentIndex = i;
        } else {
          break;
        }
      }

      setActiveHeadingIndex(currentIndex);
      ticking = false;
    };

    const handleScroll = () => {
      if (!ticking) {
        window.requestAnimationFrame(updateActiveHeading);
        ticking = true;
      }
    };

    container.addEventListener('scroll', handleScroll, { passive: true });
    updateActiveHeading();

    return () => {
      container.removeEventListener('scroll', handleScroll);
    };
  }, [showSource, displayContent]);

  const handleTocSelect = useCallback(
    (item: MarkdownTocItem) => {
      if (typeof window !== 'undefined' && window.innerWidth < 640) {
        updateTocVisibility(false);
      }

      if (showSource) {
        setHighlightedSourceLine(item.line);
        return;
      }

      if (!previewContainerRef.current) return;
      scrollPreviewToHeading(previewContainerRef.current, item.index);
      setActiveHeadingIndex(item.index);
    },
    [showSource, updateTocVisibility],
  );

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (isEditable) return;

      const activeElement = document.activeElement as HTMLElement | null;
      const isEditingFieldFocused = Boolean(activeElement && isEditableElement(activeElement));

      if (isEditingFieldFocused) return;

      if (event.key === 'Escape' && tocVisible && typeof window !== 'undefined' && window.innerWidth < 640) {
        event.preventDefault();
        updateTocVisibility(false);
        return;
      }

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
  }, [isEditable, storageKey, tocVisible, updateMode, updateTocVisibility]);

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center text-[var(--theme-text-tertiary)]">
        <Loader2 className="mr-2 animate-spin" /> {t('filePreviewLoadingTextContent')}
      </div>
    );
  }

  const sourceSurface = (
    <div className="h-full w-full bg-[var(--theme-bg-primary)]">
      <VirtualSourceViewer
        content={displayContent}
        highlightLine={highlightedSourceLine}
        onHighlightLineConsumed={() => setHighlightedSourceLine(null)}
        className="h-full w-full bg-[var(--theme-bg-primary)]"
      />
    </div>
  );

  return (
    <div className="flex h-full min-h-0 flex-col bg-[var(--theme-bg-secondary)] text-[var(--theme-text-primary)]">
      <div className="flex h-12 shrink-0 items-center justify-between border-b border-[var(--theme-border-secondary)] bg-[var(--theme-bg-primary)] px-4 sm:px-6">
        <div className="flex items-center gap-2">
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

          {tocItems.length > 0 && (
            <button
              type="button"
              className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors ${
                tocVisible
                  ? 'border-[var(--theme-border-focus)] bg-[var(--theme-bg-accent)]/10 text-[var(--theme-text-primary)]'
                  : 'border-[var(--theme-border-secondary)] text-[var(--theme-text-secondary)] hover:text-[var(--theme-text-primary)]'
              }`}
              onClick={() => updateTocVisibility(!tocVisible)}
              title={t('markdownPreviewTocTitle')}
            >
              <List size={15} />
              {t('markdownPreviewToc')}
            </button>
          )}
        </div>

        <div className="flex items-center gap-3">
          {shouldDefer && !forcePreview && !isEditable && (
            <div className="flex items-center gap-2">
              <span className="hidden items-center gap-1.5 rounded-lg border border-amber-500/20 bg-amber-500/10 px-2.5 py-1 text-xs font-medium text-amber-700 dark:text-amber-300 sm:inline-flex">
                <AlertCircle size={13} className="shrink-0" />
                {t('filePreviewLargeMarkdownNotice')}
              </span>
              <button
                type="button"
                className="rounded-lg border border-[var(--theme-border-focus)] bg-[var(--theme-bg-accent)]/10 px-3 py-1.5 text-xs font-medium text-[var(--theme-text-primary)] transition-colors hover:bg-[var(--theme-bg-accent)]/20 sm:text-sm"
                onClick={() => {
                  updateMode('preview');
                  setForcePreviewState({ storageKey, value: true });
                }}
              >
                {t('filePreviewRenderMarkdownAnyway')}
              </button>
            </div>
          )}

          <div className="rounded-lg border border-[var(--theme-border-secondary)]/50 bg-[var(--theme-bg-secondary)]/40 px-2.5 py-1 font-mono text-xs text-[var(--theme-text-secondary)] shadow-2xs">
            {interpolate(t('markdownPreviewStats'), {
              lines: String(documentStats.lines),
              words: String(documentStats.words),
              characters: String(documentStats.characters),
            })}
          </div>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 overflow-hidden bg-[var(--theme-bg-primary)]">
        {showSource ? (
          <div className="min-h-0 flex-1 overflow-auto custom-scrollbar">
            {isEditable ? (
              <textarea
                ref={textareaRef}
                value={displayContent}
                onChange={(event) => onChange?.(event.target.value)}
                className="h-full min-h-[60vh] w-full resize-none bg-[var(--theme-bg-secondary)] p-5 font-mono text-sm leading-6 text-[var(--theme-text-primary)] outline-none sm:p-8"
                spellCheck={false}
              />
            ) : (
              sourceSurface
            )}
          </div>
        ) : (
          <div
            ref={previewContainerRef}
            className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden custom-scrollbar bg-[var(--theme-bg-primary)]"
          >
            <article className="mx-auto max-w-4xl px-4 pt-6 pb-24 sm:px-8">
              <div className="markdown-body modern-markdown-reader min-h-[60vh] bg-[var(--theme-bg-primary)]">
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
          </div>
        )}

        {tocVisible && (
          <>
            <div
              className="fixed inset-0 z-20 bg-black/40 backdrop-blur-xs transition-opacity sm:hidden"
              onClick={() => updateTocVisibility(false)}
            />
            <aside className="fixed inset-y-0 right-0 z-30 flex w-72 max-w-[85vw] flex-col border-l border-[var(--theme-border-secondary)] bg-[var(--theme-bg-primary)] shadow-2xl custom-scrollbar sm:static sm:z-auto sm:w-80 sm:bg-[var(--theme-bg-secondary)]/30 sm:shadow-none">
              <div className="sticky top-0 z-10 flex h-12 shrink-0 items-center justify-between border-b border-[var(--theme-border-secondary)] bg-[var(--theme-bg-primary)]/90 px-4 backdrop-blur-sm">
                <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-[var(--theme-text-tertiary)]">
                  <List size={14} />
                  <span>{t('markdownPreviewTocTitle')}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  {hasRepetitiveHeadings && (
                    <div className="flex items-center rounded-md border border-[var(--theme-border-secondary)] bg-[var(--theme-bg-secondary)]/60 p-0.5 text-[11px]">
                      <button
                        type="button"
                        onClick={() => setTocFilterMode('compact')}
                        className={`rounded px-1.5 py-0.5 transition-colors ${
                          tocFilterMode === 'compact'
                            ? 'bg-[var(--theme-bg-primary)] font-medium text-[var(--theme-text-primary)] shadow-2xs'
                            : 'text-[var(--theme-text-tertiary)] hover:text-[var(--theme-text-secondary)]'
                        }`}
                        title="仅显示主章节与核心条目"
                      >
                        精简
                      </button>
                      <button
                        type="button"
                        onClick={() => setTocFilterMode('all')}
                        className={`rounded px-1.5 py-0.5 transition-colors ${
                          tocFilterMode === 'all'
                            ? 'bg-[var(--theme-bg-primary)] font-medium text-[var(--theme-text-primary)] shadow-2xs'
                            : 'text-[var(--theme-text-tertiary)] hover:text-[var(--theme-text-secondary)]'
                        }`}
                        title="显示所有层级完整标题"
                      >
                        全部
                      </button>
                    </div>
                  )}
                  <span className="rounded-full bg-[var(--theme-bg-secondary)] px-2 py-0.5 font-mono text-xs text-[var(--theme-text-tertiary)]">
                    {filteredTocItems.length}
                  </span>
                  <button
                    type="button"
                    onClick={() => updateTocVisibility(false)}
                    className="rounded-lg p-1 text-[var(--theme-text-tertiary)] hover:bg-[var(--theme-bg-secondary)] hover:text-[var(--theme-text-primary)] sm:hidden"
                    title={t('close')}
                  >
                    <X size={15} />
                  </button>
                </div>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto custom-scrollbar">
                <MarkdownTocPanel
                  items={filteredTocItems}
                  activeHeadingIndex={activeHeadingIndex}
                  onSelect={handleTocSelect}
                  translate={t}
                />
              </div>
            </aside>
          </>
        )}
      </div>
    </div>
  );
};
