import React, { useState, useEffect, useMemo, useCallback, useRef, Suspense } from 'react';
import { useI18n } from '@/contexts/I18nContext';
import { useChatStore } from '@/stores/chatStore';
import { useUIStore } from '@/stores/uiStore';
import { useLibraryStore } from '@/stores/libraryStore';
import type { LibraryItem, UploadedFile } from '@/types';
import { dbService } from '@/services/db/dbService';
import {
  extractLibraryItemsFromSessions,
  filterAndSortLibraryItems,
  resolveLibraryItemToUploadedFile,
} from '@/utils/library/libraryFiles';
import { triggerDownload } from '@/utils/export/core';
import { fileToBlobUrl, cleanupFilePreviewUrl } from '@/utils/file/filePreviewUrls';
import { EXTENSION_TO_MIME } from '@/constants/fileTypeSupport';
import { isTextFile, isMarkdownFile } from '@/utils/file/fileTypeClassification';
import { lazyNamedComponent } from '@/utils/lazyNamedComponent';
import { LibraryHeader } from './LibraryHeader';
import { LibraryToolbar } from './LibraryToolbar';
import { LibraryListView } from './LibraryListView';
import { LibraryGridView } from './LibraryGridView';
import { LibraryEmptyState } from './LibraryEmptyState';
import { FilePreviewModal } from '@/components/modals/FilePreviewModal';
import { ConfirmationModal } from '@/components/modals/ConfirmationModal';
import { Upload } from 'lucide-react';

const LazyCreateTextFileEditor = lazyNamedComponent(
  () => import('@/components/modals/create-file/CreateTextFileEditor'),
  'CreateTextFileEditor',
);

interface LibraryViewProps {
  onNewChat?: (initialFiles?: UploadedFile[]) => void;
  onSelectSession?: (sessionId: string) => void;
  onClose?: () => void;
  themeId?: string;
}

export const LibraryView: React.FC<LibraryViewProps> = ({
  onNewChat,
  onSelectSession,
  onClose,
  themeId = 'default',
}) => {
  const { t } = useI18n();
  const savedSessions = useChatStore((state) => state.savedSessions);
  const setSelectedFiles = useChatStore((state) => state.setSelectedFiles);
  const setActiveView = useUIStore((state) => state.setActiveView);

  const viewMode = useLibraryStore((state) => state.viewMode);
  const categoryFilter = useLibraryStore((state) => state.categoryFilter);
  const sourceFilter = useLibraryStore((state) => state.sourceFilter);
  const fileTypeFilter = useLibraryStore((state) => state.fileTypeFilter);
  const sortOption = useLibraryStore((state) => state.sortOption);
  const searchQuery = useLibraryStore((state) => state.searchQuery);
  const selectedFileIds = useLibraryStore((state) => state.selectedFileIds);
  const clearSelection = useLibraryStore((state) => state.clearSelection);
  const selectAllFiles = useLibraryStore((state) => state.selectAllFiles);
  const setCategoryFilter = useLibraryStore((state) => state.setCategoryFilter);
  const setSourceFilter = useLibraryStore((state) => state.setSourceFilter);
  const setFileTypeFilter = useLibraryStore((state) => state.setFileTypeFilter);
  const setSearchQuery = useLibraryStore((state) => state.setSearchQuery);

  const [standaloneFiles, setStandaloneFiles] = useState<LibraryItem[]>([]);
  const [historicalFiles, setHistoricalFiles] = useState<LibraryItem[]>([]);
  const [deletedFileIds, setDeletedFileIds] = useState<Set<string>>(new Set());
  const [previewFile, setPreviewFile] = useState<UploadedFile | null>(null);
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [deleteConfirmTarget, setDeleteConfirmTarget] = useState<LibraryItem | 'selected' | null>(null);
  const [showCreateNote, setShowCreateNote] = useState(false);

  const previewOriginalDataUrlRef = useRef<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load standalone files, historical session files, and deleted file tombstones from IndexedDB
  const refreshLibraryFiles = useCallback(async () => {
    const [standalone, historical, deleted] = await Promise.all([
      dbService.getStandaloneLibraryFiles(),
      dbService.getAllHistoricalSessionFiles(),
      dbService.getDeletedLibraryFileIds(),
    ]);
    setStandaloneFiles(standalone);
    setHistoricalFiles(historical);
    setDeletedFileIds(new Set(deleted));
  }, []);

  useEffect(() => {
    void refreshLibraryFiles();
  }, [refreshLibraryFiles]);

  // Merge session files and standalone files, excluding deleted items
  const allItems = useMemo(() => {
    const map = new Map<string, LibraryItem>();

    // 1. Add standalone files first
    standaloneFiles.forEach((file) => {
      if (!deletedFileIds.has(file.id)) {
        map.set(file.id, file);
      }
    });

    // 2. Add historical session files from IndexedDB
    historicalFiles.forEach((file) => {
      if (!deletedFileIds.has(file.id) && !map.has(file.id)) {
        map.set(file.id, file);
      }
    });

    // 3. Add or update with current in-memory sessions (covers active / freshly modified session)
    const inMemorySessionFiles = extractLibraryItemsFromSessions(savedSessions);
    inMemorySessionFiles.forEach((file) => {
      if (!deletedFileIds.has(file.id)) {
        map.set(file.id, file);
      }
    });

    return Array.from(map.values());
  }, [savedSessions, standaloneFiles, historicalFiles, deletedFileIds]);

  // Filtered & sorted items
  const filteredItems = useMemo(() => {
    return filterAndSortLibraryItems(allItems, {
      category: categoryFilter,
      source: sourceFilter,
      fileType: fileTypeFilter,
      sort: sortOption,
      searchQuery,
      viewMode,
    });
  }, [allItems, categoryFilter, sourceFilter, fileTypeFilter, sortOption, searchQuery, viewMode]);

  // Upload handler
  const handleUploadFiles = useCallback(
    async (files: File[]) => {
      if (!files.length) return;

      const newItems: LibraryItem[] = await Promise.all(
        files.map(async (file) => {
          const id = `lib-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
          let textContent: string | undefined;

          const isText =
            file.type.startsWith('text/') ||
            isTextFile({ name: file.name, type: file.type }) ||
            isMarkdownFile({ name: file.name, type: file.type });

          if (isText && file.size <= 5 * 1024 * 1024) {
            try {
              textContent = await file.text();
            } catch {
              // ignore
            }
          }

          return {
            id,
            name: file.name,
            type: file.type || 'application/octet-stream',
            size: file.size,
            timestamp: Date.now(),
            rawFile: file,
            textContent,
            source: 'uploaded' as const,
            isStandalone: true,
          };
        }),
      );

      await dbService.addStandaloneLibraryFiles(newItems);
      await refreshLibraryFiles();
    },
    [refreshLibraryFiles],
  );

  // Drag & Drop handlers
  const handleDragEnter = (e: React.DragEvent) => {
    if (e.dataTransfer.types.includes('Files')) {
      e.preventDefault();
      setIsDraggingOver(true);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    if (e.dataTransfer.types.includes('Files')) {
      e.preventDefault();
    }
  };

  const handleDragLeave = (e: React.DragEvent) => {
    if (e.currentTarget.contains(e.relatedTarget as Node)) return;
    setIsDraggingOver(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    if (!e.dataTransfer.types.includes('Files')) return;
    e.preventDefault();
    setIsDraggingOver(false);

    const droppedFiles = Array.from(e.dataTransfer.files);
    if (droppedFiles.length > 0) {
      await handleUploadFiles(droppedFiles);
    }
  };

  // Start chat with file(s)
  const handleStartChatWithItems = useCallback(
    async (items: LibraryItem[]) => {
      if (!items.length) return;

      const uploadedFiles: UploadedFile[] = await Promise.all(
        items.map((item) =>
          resolveLibraryItemToUploadedFile(item, (i) => dbService.fetchLibraryFileBlob(i), { generateNewId: true }),
        ),
      );

      if (onNewChat) {
        onNewChat(uploadedFiles);
      }
      setSelectedFiles(uploadedFiles);
      setActiveView('chat');
    },
    [onNewChat, setSelectedFiles, setActiveView],
  );

  const handleStartChatWithSelected = useCallback(async () => {
    const selectedItems = allItems.filter((i) => selectedFileIds.has(i.id));
    clearSelection();
    await handleStartChatWithItems(selectedItems);
  }, [allItems, selectedFileIds, clearSelection, handleStartChatWithItems]);

  const handleSelectAll = useCallback(() => {
    selectAllFiles(filteredItems.map((item) => item.id));
  }, [filteredItems, selectAllFiles]);

  const handleSaveNote = useCallback(
    async (content: string | Blob, filename: string) => {
      const sanitizeFilename = (name: string) => name.trim().replace(/[<>:"/\\|?*]+/g, '_');
      const safeFilename = filename.trim() ? sanitizeFilename(filename) : `note-${Date.now()}.md`;
      const extension = safeFilename.includes('.') ? `.${safeFilename.split('.').pop()?.toLowerCase()}` : '.md';
      const resolvedMime =
        content instanceof Blob
          ? content.type || EXTENSION_TO_MIME[extension] || 'application/octet-stream'
          : EXTENSION_TO_MIME[extension] || (extension === '.md' ? 'text/markdown' : 'text/plain');

      const blob = typeof content === 'string' ? new Blob([content], { type: resolvedMime }) : content;
      const textContent = typeof content === 'string' ? content : undefined;
      const file = new File([blob], safeFilename, { type: resolvedMime });

      const newItem: LibraryItem = {
        id: `lib-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
        name: safeFilename,
        type: file.type,
        size: file.size,
        timestamp: Date.now(),
        rawFile: file,
        textContent,
        source: 'uploaded',
        isStandalone: true,
      };

      await dbService.addStandaloneLibraryFiles([newItem]);
      await refreshLibraryFiles();
      setShowCreateNote(false);
    },
    [refreshLibraryFiles],
  );

  // Download item
  const handleDownloadItem = useCallback(async (item: LibraryItem) => {
    // Prevent cross-origin download navigation for YouTube or external links
    if (item.type === 'video/youtube' || item.dataUrl?.startsWith('http://') || item.dataUrl?.startsWith('https://')) {
      if (item.dataUrl) {
        window.open(item.dataUrl, '_blank', 'noopener,noreferrer');
      }
      return;
    }

    let blob = item.rawFile;
    if (!blob) {
      blob = await dbService.fetchLibraryFileBlob(item);
    }

    if (blob) {
      const url = fileToBlobUrl(blob);
      triggerDownload(url, item.name, true);
    } else if (item.dataUrl) {
      // Do not revoke session dataUrl
      triggerDownload(item.dataUrl, item.name, false);
    }
  }, []);

  const handleDownloadSelected = useCallback(async () => {
    const selectedItems = allItems.filter((i) => selectedFileIds.has(i.id));
    for (const item of selectedItems) {
      await handleDownloadItem(item);
    }
  }, [allItems, selectedFileIds, handleDownloadItem]);

  // Delete item
  const handleDeleteItem = useCallback((item: LibraryItem) => {
    setDeleteConfirmTarget(item);
  }, []);

  const handleDeleteSelected = useCallback(() => {
    setDeleteConfirmTarget('selected');
  }, []);

  const handleConfirmDelete = useCallback(async () => {
    if (!deleteConfirmTarget) return;

    if (deleteConfirmTarget === 'selected') {
      const ids = Array.from(selectedFileIds);
      await Promise.all([dbService.deleteStandaloneLibraryFiles(ids), dbService.addDeletedLibraryFileIds(ids)]);
      setDeletedFileIds((prev) => new Set([...prev, ...ids]));
      setHistoricalFiles((prev) => prev.filter((i) => !selectedFileIds.has(i.id)));
      clearSelection();
      await refreshLibraryFiles();
    } else {
      const item = deleteConfirmTarget;
      if (item.isStandalone) {
        await Promise.all([
          dbService.deleteStandaloneLibraryFiles([item.id]),
          dbService.addDeletedLibraryFileIds([item.id]),
        ]);
      } else {
        // Session file: record tombstone so it won't reappear from savedSessions
        await dbService.addDeletedLibraryFileIds([item.id]);
      }
      setDeletedFileIds((prev) => new Set([...prev, item.id]));
      setHistoricalFiles((prev) => prev.filter((i) => i.id !== item.id));
      await refreshLibraryFiles();
    }
  }, [deleteConfirmTarget, selectedFileIds, clearSelection, refreshLibraryFiles]);

  // Preview item
  const handlePreviewItem = useCallback(async (item: LibraryItem) => {
    previewOriginalDataUrlRef.current = item.dataUrl ?? null;
    const file = await resolveLibraryItemToUploadedFile(item, (i) => dbService.fetchLibraryFileBlob(i));
    setPreviewFile(file);
  }, []);

  const handleClosePreview = useCallback(() => {
    if (previewFile?.dataUrl) {
      // Only revoke if the dataUrl was newly created during preview, NOT inherited from item.dataUrl
      if (previewFile.dataUrl !== previewOriginalDataUrlRef.current) {
        cleanupFilePreviewUrl(previewFile);
      }
    }
    previewOriginalDataUrlRef.current = null;
    setPreviewFile(null);
  }, [previewFile]);

  const previewIndex = previewFile ? filteredItems.findIndex((item) => item.id === previewFile.id) : -1;
  const hasPrevPreview = previewIndex > 0;
  const hasNextPreview = previewIndex !== -1 && previewIndex < filteredItems.length - 1;

  const handlePrevPreview = useCallback(() => {
    if (previewIndex > 0) {
      if (previewFile?.dataUrl && previewFile.dataUrl !== previewOriginalDataUrlRef.current) {
        cleanupFilePreviewUrl(previewFile);
      }
      previewOriginalDataUrlRef.current = null;
      void handlePreviewItem(filteredItems[previewIndex - 1]);
    }
  }, [previewIndex, previewFile, filteredItems, handlePreviewItem]);

  const handleNextPreview = useCallback(() => {
    if (previewIndex !== -1 && previewIndex < filteredItems.length - 1) {
      if (previewFile?.dataUrl && previewFile.dataUrl !== previewOriginalDataUrlRef.current) {
        cleanupFilePreviewUrl(previewFile);
      }
      previewOriginalDataUrlRef.current = null;
      void handlePreviewItem(filteredItems[previewIndex + 1]);
    }
  }, [previewIndex, previewFile, filteredItems, handlePreviewItem]);

  const handleClearFilters = () => {
    setCategoryFilter('all');
    setSourceFilter('all');
    setFileTypeFilter('all');
    setSearchQuery('');
  };

  const isFiltered =
    categoryFilter !== 'all' || sourceFilter !== 'all' || fileTypeFilter !== 'all' || searchQuery.trim().length > 0;

  return (
    <div
      className="flex flex-col flex-1 h-full w-full overflow-hidden bg-[var(--theme-bg-primary)] relative"
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {isDraggingOver && (
        <div className="absolute inset-0 z-50 bg-[var(--theme-bg-accent)]/10 backdrop-blur-xs border-2 border-dashed border-[var(--theme-accent)] flex flex-col items-center justify-center pointer-events-none animate-in fade-in duration-100">
          <div className="p-4 rounded-full bg-[var(--theme-bg-primary)] text-[var(--theme-accent)] shadow-xl mb-3">
            <Upload size={32} strokeWidth={2} />
          </div>
          <span className="text-base font-semibold text-[var(--theme-text-primary)]">{t('libraryDropOverlay')}</span>
        </div>
      )}

      <LibraryHeader onUploadFiles={handleUploadFiles} onCreateNote={() => setShowCreateNote(true)} onClose={onClose} />

      <LibraryToolbar
        selectedCount={selectedFileIds.size}
        totalCount={filteredItems.length}
        onStartChat={handleStartChatWithSelected}
        onDownloadSelected={handleDownloadSelected}
        onDeleteSelected={handleDeleteSelected}
        onSelectAll={handleSelectAll}
      />

      <div className="flex-1 overflow-y-auto custom-scrollbar">
        {filteredItems.length === 0 ? (
          <LibraryEmptyState
            isFiltered={isFiltered}
            onClearFilters={handleClearFilters}
            onUploadClick={() => {
              fileInputRef.current?.click();
            }}
          />
        ) : viewMode === 'list' ? (
          <LibraryListView
            items={filteredItems}
            onPreviewItem={handlePreviewItem}
            onStartChatWithItem={(item) => handleStartChatWithItems([item])}
            onDownloadItem={handleDownloadItem}
            onDeleteItem={handleDeleteItem}
            onJumpToSession={(sessionId) => {
              onSelectSession?.(sessionId);
              setActiveView('chat');
            }}
          />
        ) : (
          <LibraryGridView
            items={filteredItems}
            onPreviewItem={handlePreviewItem}
            onStartChatWithItem={(item) => handleStartChatWithItems([item])}
            onDownloadItem={handleDownloadItem}
            onDeleteItem={handleDeleteItem}
            onJumpToSession={(sessionId) => {
              onSelectSession?.(sessionId);
              setActiveView('chat');
            }}
          />
        )}
      </div>

      <input
        ref={fileInputRef}
        type="file"
        multiple
        onChange={(e) => {
          if (e.target.files && e.target.files.length > 0) {
            void handleUploadFiles(Array.from(e.target.files));
            e.target.value = '';
          }
        }}
        className="hidden"
        data-testid="library-empty-file-input"
      />

      {previewFile && (
        <FilePreviewModal
          file={previewFile}
          onClose={handleClosePreview}
          onPrev={handlePrevPreview}
          onNext={handleNextPreview}
          hasPrev={hasPrevPreview}
          hasNext={hasNextPreview}
        />
      )}

      {deleteConfirmTarget && (
        <ConfirmationModal
          isOpen={Boolean(deleteConfirmTarget)}
          onClose={() => setDeleteConfirmTarget(null)}
          onConfirm={handleConfirmDelete}
          title={t('confirm')}
          message={t('libraryDeleteConfirm')}
          isDanger
          confirmLabel={t('delete')}
          cancelLabel={t('cancel')}
        />
      )}

      {showCreateNote && (
        <Suspense fallback={null}>
          <LazyCreateTextFileEditor
            onConfirm={handleSaveNote}
            onCancel={() => setShowCreateNote(false)}
            isProcessing={false}
            isLoading={false}
            themeId={themeId}
          />
        </Suspense>
      )}
    </div>
  );
};
