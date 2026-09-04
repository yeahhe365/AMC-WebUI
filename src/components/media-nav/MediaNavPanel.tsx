import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { useI18n } from '@/contexts/I18nContext';
import { useChatStore } from '@/stores/chatStore';
import { useMediaNavStore, type MediaNavKind } from '@/stores/mediaNavStore';
import { collectSessionMediaFiles } from '@/utils/media-nav/sessionMediaFiles';
import { useIsMobile } from '@/hooks/useDevice';
import { Z_INDEX_SIDE_PANEL_MOBILE, Z_INDEX_TOPMOST_OVERLAY } from '@/constants/layout';
import { FOCUS_VISIBLE_RING_PRIMARY_OFFSET_CLASS } from '@/constants/focusClasses';
import { lazyNamedComponent } from '@/utils/lazyNamedComponent';
import type { UploadedFile } from '@/types';
import { MediaNavView } from './MediaNavView';

const LazyPdfViewer = lazyNamedComponent(() => import('@/components/shared/file-preview/PdfViewerEntry'), 'PdfViewer');

interface MediaEntry {
  file: UploadedFile;
  kind: Exclude<MediaNavKind, 'pdf'> | 'pdf';
}

/**
 * Resizable right-hand panel hosting the media navigation viewers (PDF and
 * video). Sits next to the chat area in MainContent's flex row; the chat
 * shrinks while it is open. On mobile it takes over the full screen.
 */
const MediaNavPanelComponent: React.FC = () => {
  const { t } = useI18n();
  const isMobile = useIsMobile();

  const isOpen = useMediaNavStore((state) => state.isOpen);
  const width = useMediaNavStore((state) => state.width);
  const activeFileId = useMediaNavStore((state) => state.activeFileId);
  const openKind = useMediaNavStore((state) => state.openKind);
  const targetPage = useMediaNavStore((state) => state.targetPage);
  const highlight = useMediaNavStore((state) => state.highlight);
  const consumeTargetPage = useMediaNavStore((state) => state.consumeTargetPage);
  const setPage = useMediaNavStore((state) => state.setPage);
  const setActiveFile = useMediaNavStore((state) => state.setActiveFile);
  const setWidth = useMediaNavStore((state) => state.setWidth);
  const close = useMediaNavStore((state) => state.close);

  const selectedFiles = useChatStore((state) => state.selectedFiles);
  const activeMessages = useChatStore((state) => state.activeMessages);

  const media = useMemo(() => collectSessionMediaFiles(selectedFiles, activeMessages), [selectedFiles, activeMessages]);
  const entries: MediaEntry[] = useMemo(
    () => [
      ...media.pdfs.map((file) => ({ file, kind: 'pdf' as const })),
      ...media.videos.map((file) => ({ file, kind: 'video' as const })),
      ...media.audios.map((file) => ({ file, kind: 'audio' as const })),
    ],
    [media],
  );

  const [isResizing, setIsResizing] = useState(false);
  const isResizingRef = useRef(false);

  // Keep the active document valid. When the panel was opened from (or jumped
  // to) a specific navigation kind, prefer the first file of that kind;
  // otherwise fall back to the first available file.
  useEffect(() => {
    if (entries.length === 0) {
      if (activeFileId !== null) setActiveFile(null);
      return;
    }
    const activeEntry = entries.find((entry) => entry.file.id === activeFileId);
    const preferredKind = openKind ?? activeEntry?.kind;
    const preferred = (preferredKind && entries.find((entry) => entry.kind === preferredKind)) || entries[0];
    if (!activeEntry || activeEntry.kind !== preferred.kind) {
      setActiveFile(preferred.file.id);
    }
  }, [entries, activeFileId, openKind, setActiveFile]);

  const activeEntry: MediaEntry | undefined = useMemo(
    () => entries.find((entry) => entry.file.id === activeFileId) ?? entries[0],
    [entries, activeFileId],
  );
  const isPdfActive = activeEntry ? activeEntry.kind === 'pdf' : openKind === 'pdf' || openKind === null;

  const startResizing = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
    isResizingRef.current = true;
  }, []);

  const stopResizing = useCallback(() => {
    setIsResizing(false);
    isResizingRef.current = false;
  }, []);

  const resize = useCallback(
    (mouseEvent: MouseEvent) => {
      if (isResizingRef.current) {
        setWidth(window.innerWidth - mouseEvent.clientX);
      }
    },
    [setWidth],
  );

  useEffect(() => {
    if (isResizing) {
      window.addEventListener('mousemove', resize);
      window.addEventListener('mouseup', stopResizing);
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
    } else {
      window.removeEventListener('mousemove', resize);
      window.removeEventListener('mouseup', stopResizing);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    }
    return () => {
      window.removeEventListener('mousemove', resize);
      window.removeEventListener('mouseup', stopResizing);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [isResizing, resize, stopResizing]);

  if (!isOpen) return null;

  return (
    <>
      {isResizing && (
        <div
          className={`fixed inset-0 ${Z_INDEX_TOPMOST_OVERLAY} bg-transparent cursor-col-resize`}
          style={{ touchAction: 'none' }}
        />
      )}

      <aside
        data-testid="media-nav-panel"
        className={`h-full flex flex-col bg-[var(--theme-bg-secondary)] border-l border-[var(--theme-border-primary)] shadow-2xl relative flex-shrink-0 z-40 slide-in-right-animate ${
          isMobile ? `fixed inset-0 w-full ${Z_INDEX_SIDE_PANEL_MOBILE}` : ''
        }`}
        style={{ width: isMobile ? '100%' : `${width}px` }}
      >
        {!isMobile && (
          <div
            onMouseDown={startResizing}
            className={`absolute left-0 top-0 bottom-0 w-1.5 -ml-0.5 z-50 cursor-col-resize flex items-center justify-center group transition-colors hover:bg-[var(--theme-bg-accent)] ${
              isResizing ? 'bg-[var(--theme-bg-accent)]' : 'bg-transparent'
            }`}
            title={t('sidePanelDragResize')}
          />
        )}

        <div className="flex items-center justify-between gap-2 px-3 h-12 border-b border-[var(--theme-border-secondary)] bg-[var(--theme-bg-primary)] flex-shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-xs font-semibold text-[var(--theme-text-primary)] flex-shrink-0">
              {t('mediaNavPanelTitle')}
            </span>
            {entries.length > 1 && (
              <select
                value={activeEntry?.file.id ?? ''}
                onChange={(e) => {
                  const entry = entries.find((candidate) => candidate.file.id === e.target.value);
                  if (entry) {
                    setActiveFile(entry.file.id);
                    useMediaNavStore.setState({ openKind: entry.kind });
                  }
                }}
                aria-label={t('pdfNavDocument')}
                className="min-w-0 max-w-[220px] truncate text-xs rounded-md border border-[var(--theme-border-secondary)] bg-[var(--theme-bg-input)] text-[var(--theme-text-primary)] px-2 py-1 focus:outline-none focus:ring-2 focus:ring-[var(--theme-border-focus)]"
              >
                {media.pdfs.length > 0 && (
                  <optgroup label={t('pdfNavLabel')}>
                    {media.pdfs.map((file) => (
                      <option key={file.id} value={file.id}>
                        {file.name}
                      </option>
                    ))}
                  </optgroup>
                )}
                {media.videos.length > 0 && (
                  <optgroup label={t('videoNavLabel')}>
                    {media.videos.map((file) => (
                      <option key={file.id} value={file.id}>
                        {file.name}
                      </option>
                    ))}
                  </optgroup>
                )}
                {media.audios.length > 0 && (
                  <optgroup label={t('audioNavLabel')}>
                    {media.audios.map((file) => (
                      <option key={file.id} value={file.id}>
                        {file.name}
                      </option>
                    ))}
                  </optgroup>
                )}
              </select>
            )}
            {entries.length === 1 && (
              <span
                className="min-w-0 truncate text-xs text-[var(--theme-text-tertiary)]"
                title={activeEntry?.file.name}
              >
                {activeEntry?.file.name}
              </span>
            )}
          </div>

          <button
            type="button"
            onClick={close}
            className={`p-2 text-[var(--theme-text-tertiary)] hover:text-[var(--theme-text-primary)] hover:bg-[var(--theme-bg-tertiary)] rounded-lg transition-colors flex-shrink-0 ${FOCUS_VISIBLE_RING_PRIMARY_OFFSET_CLASS}`}
            aria-label={t('close')}
            title={t('close')}
            data-testid="media-nav-panel-close"
          >
            <X size={16} strokeWidth={1.5} />
          </button>
        </div>

        <div className="flex-grow min-h-0">
          {activeEntry && isPdfActive ? (
            <LazyPdfViewer
              file={activeEntry.file}
              highlight={highlight}
              targetPage={targetPage}
              onTargetPageConsumed={consumeTargetPage}
              onCurrentPageChange={setPage}
            />
          ) : activeEntry ? (
            <MediaNavView file={activeEntry.file} kind={activeEntry.kind === 'audio' ? 'audio' : 'video'} />
          ) : (
            <div className="h-full flex flex-col items-center justify-center gap-3 p-8 text-center">
              <p className="text-sm text-[var(--theme-text-secondary)]">{t('mediaNavEmptyHint')}</p>
            </div>
          )}
        </div>
      </aside>
    </>
  );
};

export const MediaNavPanel = React.memo(MediaNavPanelComponent);
