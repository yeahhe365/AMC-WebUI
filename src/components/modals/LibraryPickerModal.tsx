import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Modal } from '@/components/shared/Modal';
import { useI18n } from '@/contexts/I18nContext';
import { interpolate } from '@/i18n/interpolate';
import { useChatStore } from '@/stores/chatStore';
import { dbService } from '@/services/db/dbService';
import {
  extractLibraryItemsFromSessions,
  filterAndSortLibraryItems,
  formatLibraryDate,
  resolveLibraryItemToUploadedFile,
} from '@/utils/library/libraryFiles';
import { formatFileSize } from '@/utils/file/fileSize';
import { LibraryItemThumbnail } from '@/components/library/LibraryItemThumbnail';
import { FilePreviewModal } from './FilePreviewModal';
import { cleanupFilePreviewUrl } from '@/utils/file/filePreviewUrls';
import { isTextFile, isMarkdownFile } from '@/utils/file/fileTypeClassification';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/shared/Popover';
import {
  Library,
  Search,
  X,
  Check,
  LayoutGrid,
  List,
  Loader2,
  FolderOpen,
  SlidersHorizontal,
  Upload,
  Eye,
  Sparkles,
  FileText,
  FileSpreadsheet,
  Presentation,
  RotateCcw,
  ArrowUpDown,
  Layers,
} from 'lucide-react';
import { MODAL_CLOSE_BUTTON_CLASS } from '@/constants/buttonClasses';
import type {
  LibraryItem,
  LibraryCategoryFilter,
  LibrarySourceFilter,
  LibraryFileTypeFilter,
  LibrarySortOption,
  UploadedFile,
} from '@/types';
import { logService } from '@/services/logService';

interface LibraryPickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (selectedItems: LibraryItem[]) => Promise<void>;
  initialCategory?: LibraryCategoryFilter;
}

export const LibraryPickerModal: React.FC<LibraryPickerModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  initialCategory = 'all',
}) => {
  const { t, language } = useI18n();
  const savedSessions = useChatStore((state) => state.savedSessions);

  const [standaloneFiles, setStandaloneFiles] = useState<LibraryItem[]>([]);
  const [historicalFiles, setHistoricalFiles] = useState<LibraryItem[]>([]);
  const [deletedFileIds, setDeletedFileIds] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(true);
  const [isImporting, setIsImporting] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [previewFile, setPreviewFile] = useState<UploadedFile | null>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<LibraryCategoryFilter>(initialCategory);
  const [sourceFilter, setSourceFilter] = useState<LibrarySourceFilter>('all');
  const [fileTypeFilter, setFileTypeFilter] = useState<LibraryFileTypeFilter>('all');
  const [sortOption, setSortOption] = useState<LibrarySortOption>('date_desc');
  const [isFilterMenuOpen, setIsFilterMenuOpen] = useState(false);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const searchInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const previewOriginalDataUrlRef = useRef<string | null>(null);

  // Load files when modal opens
  useEffect(() => {
    if (!isOpen) return;

    let active = true;
    const loadFiles = async () => {
      setIsLoading(true);
      try {
        const [standalone, historical, deleted] = await Promise.all([
          dbService.getStandaloneLibraryFiles(),
          dbService.getAllHistoricalSessionFiles(),
          dbService.getDeletedLibraryFileIds(),
        ]);
        if (active) {
          setStandaloneFiles(standalone);
          setHistoricalFiles(historical);
          setDeletedFileIds(new Set(deleted));
        }
      } catch (loadError) {
        logService.error('Failed to load library files for picker', loadError);
      } finally {
        if (active) {
          setIsLoading(false);
        }
      }
    };

    void loadFiles();
    setSelectedIds(new Set());
    setSearchQuery('');
    setCategoryFilter(initialCategory);
    setSourceFilter('all');
    setFileTypeFilter('all');
    setSortOption('date_desc');
    setIsFilterMenuOpen(false);

    return () => {
      active = false;
    };
  }, [isOpen, initialCategory]);

  // Focus search on open
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => searchInputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  const categories: {
    key: LibraryCategoryFilter;
    labelKey: 'libraryTabAll' | 'libraryTabImages' | 'libraryTabDocuments' | 'libraryTabAudio' | 'libraryTabVideo';
  }[] = [
    { key: 'all', labelKey: 'libraryTabAll' },
    { key: 'image', labelKey: 'libraryTabImages' },
    { key: 'document', labelKey: 'libraryTabDocuments' },
    { key: 'audio', labelKey: 'libraryTabAudio' },
    { key: 'video', labelKey: 'libraryTabVideo' },
  ];

  const hasAdvancedFilters = sourceFilter !== 'all' || fileTypeFilter !== 'all' || sortOption !== 'date_desc';

  const handleResetFilters = useCallback(() => {
    setSourceFilter('all');
    setFileTypeFilter('all');
    setSortOption('date_desc');
    setIsFilterMenuOpen(false);
  }, []);

  const handleSelectSubtype = useCallback(
    (type: LibraryFileTypeFilter) => {
      setFileTypeFilter(type);
      if (type !== 'all' && (categoryFilter === 'image' || categoryFilter === 'audio' || categoryFilter === 'video')) {
        setCategoryFilter('document');
      }
      setIsFilterMenuOpen(false);
    },
    [categoryFilter],
  );

  // Upload handlers
  const handleUploadFiles = useCallback(async (files: File[]) => {
    if (!files.length) return;
    setIsUploading(true);
    try {
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
      const updated = await dbService.getStandaloneLibraryFiles();
      setStandaloneFiles(updated);

      // Auto-select uploaded files
      setSelectedIds((prev) => {
        const next = new Set(prev);
        newItems.forEach((item) => next.add(item.id));
        return next;
      });
    } catch (uploadError) {
      logService.error('Failed to upload files to library in picker', uploadError);
    } finally {
      setIsUploading(false);
    }
  }, []);

  const handleFileInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files && e.target.files.length > 0) {
        const files = Array.from(e.target.files);
        void handleUploadFiles(files);
        e.target.value = '';
      }
    },
    [handleUploadFiles],
  );

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    if (e.dataTransfer.types.includes('Files')) {
      e.preventDefault();
      setIsDraggingOver(true);
    }
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    if (e.dataTransfer.types.includes('Files')) {
      e.preventDefault();
    }
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    if (e.currentTarget.contains(e.relatedTarget as Node)) return;
    setIsDraggingOver(false);
  }, []);

  const handleDrop = useCallback(
    async (e: React.DragEvent) => {
      if (!e.dataTransfer.types.includes('Files')) return;
      e.preventDefault();
      setIsDraggingOver(false);

      const droppedFiles = Array.from(e.dataTransfer.files);
      if (droppedFiles.length > 0) {
        await handleUploadFiles(droppedFiles);
      }
    },
    [handleUploadFiles],
  );

  // Preview handlers
  const handlePreviewItem = useCallback(async (item: LibraryItem) => {
    try {
      previewOriginalDataUrlRef.current = item.dataUrl ?? null;
      const file = await resolveLibraryItemToUploadedFile(item, (i) => dbService.fetchLibraryFileBlob(i));
      setPreviewFile(file);
    } catch (previewError) {
      logService.error('Failed to resolve file for preview', previewError);
    }
  }, []);

  const handleClosePreview = useCallback(() => {
    if (previewFile?.dataUrl) {
      if (previewFile.dataUrl !== previewOriginalDataUrlRef.current) {
        cleanupFilePreviewUrl(previewFile);
      }
    }
    previewOriginalDataUrlRef.current = null;
    setPreviewFile(null);
  }, [previewFile]);

  // Merge items, excluding deleted items
  const allItems = useMemo(() => {
    const map = new Map<string, LibraryItem>();

    standaloneFiles.forEach((file) => {
      if (!deletedFileIds.has(file.id)) {
        map.set(file.id, file);
      }
    });

    historicalFiles.forEach((file) => {
      if (!deletedFileIds.has(file.id) && !map.has(file.id)) {
        map.set(file.id, file);
      }
    });

    const inMemorySessionFiles = extractLibraryItemsFromSessions(savedSessions);
    inMemorySessionFiles.forEach((file) => {
      if (!deletedFileIds.has(file.id)) {
        map.set(file.id, file);
      }
    });

    return Array.from(map.values());
  }, [standaloneFiles, historicalFiles, savedSessions, deletedFileIds]);

  // Filter and sort items
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

  const toggleSelectItem = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const handleSelectAllToggle = useCallback(() => {
    if (filteredItems.length === 0) return;
    const allFilteredSelected = filteredItems.every((item) => selectedIds.has(item.id));
    if (allFilteredSelected) {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        filteredItems.forEach((item) => next.delete(item.id));
        return next;
      });
    } else {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        filteredItems.forEach((item) => next.add(item.id));
        return next;
      });
    }
  }, [filteredItems, selectedIds]);

  const handleConfirmSelection = useCallback(async () => {
    if (selectedIds.size === 0 || isImporting) return;

    const itemsToImport = allItems.filter((item) => selectedIds.has(item.id));
    if (itemsToImport.length === 0) return;

    setIsImporting(true);
    try {
      await onConfirm(itemsToImport);
      onClose();
    } catch (importError) {
      logService.error('Failed to import items from library', importError);
    } finally {
      setIsImporting(false);
    }
  }, [allItems, isImporting, onClose, onConfirm, selectedIds]);

  const handleItemDoubleClick = useCallback(
    async (item: LibraryItem) => {
      if (isImporting) return;
      setIsImporting(true);
      try {
        await onConfirm([item]);
        onClose();
      } catch (importError) {
        logService.error('Failed to import single item from library', importError);
      } finally {
        setIsImporting(false);
      }
    },
    [isImporting, onClose, onConfirm],
  );

  const allFilteredSelected = filteredItems.length > 0 && filteredItems.every((item) => selectedIds.has(item.id));

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      contentClassName="w-full max-w-3xl sm:max-w-4xl h-[85vh] max-h-[720px] bg-[var(--theme-bg-primary)] rounded-2xl shadow-2xl flex flex-col overflow-hidden border border-[var(--theme-border-primary)] relative"
      noPadding
      ariaLabel={t('attachMenuLibrary')}
    >
      <div
        className="flex flex-col flex-1 h-full w-full overflow-hidden relative"
        onDragEnter={handleDragEnter}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {isDraggingOver && (
          <div className="absolute inset-0 z-50 bg-[var(--theme-bg-accent)]/10 backdrop-blur-xs border-2 border-dashed border-[var(--theme-accent)] flex flex-col items-center justify-center pointer-events-none animate-in fade-in duration-100 rounded-2xl">
            <div className="p-3.5 rounded-full bg-[var(--theme-bg-primary)] text-[var(--theme-accent)] shadow-xl mb-2">
              <Upload size={28} strokeWidth={2} />
            </div>
            <span className="text-sm font-semibold text-[var(--theme-text-primary)]">{t('libraryDropOverlay')}</span>
          </div>
        )}

        <div className="flex items-center justify-between px-5 py-3.5 border-b border-[var(--theme-border-secondary)] bg-[var(--theme-bg-secondary)]/40 flex-shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-[var(--theme-bg-tertiary)] flex items-center justify-center text-[var(--theme-text-primary)]">
              <Library size={18} />
            </div>
            <div>
              <h2 className="text-base font-semibold text-[var(--theme-text-primary)] leading-tight">
                {t('attachMenuLibrary')}
              </h2>
              <p className="text-xs text-[var(--theme-text-tertiary)]">
                {interpolate(t('librarySelectedCount'), { count: selectedIds.size })}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <input ref={fileInputRef} type="file" multiple className="hidden" onChange={handleFileInputChange} />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-xl border border-[var(--theme-border-secondary)] text-[var(--theme-text-primary)] hover:bg-[var(--theme-bg-secondary)] active:scale-95 transition-all cursor-pointer"
            >
              {isUploading ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />}
              <span>{t('libraryUpload')}</span>
            </button>
            <button type="button" onClick={onClose} className={MODAL_CLOSE_BUTTON_CLASS} aria-label={t('close')}>
              <X size={18} />
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2.5 px-5 py-2.5 border-b border-[var(--theme-border-secondary)] bg-[var(--theme-bg-primary)] flex-shrink-0">
          <div className="relative flex-1 min-w-[180px]">
            <Search
              size={15}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--theme-text-tertiary)] pointer-events-none"
            />
            <input
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t('librarySearchPlaceholder')}
              className="w-full pl-9 pr-8 py-1.5 text-xs sm:text-sm bg-[var(--theme-bg-secondary)] border border-[var(--theme-border-secondary)] rounded-xl text-[var(--theme-text-primary)] placeholder-[var(--theme-text-tertiary)] focus:outline-none focus:border-[var(--theme-border-focus)] focus:ring-1 focus:ring-[var(--theme-border-focus)] transition-colors"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--theme-text-tertiary)] hover:text-[var(--theme-text-primary)] p-0.5 rounded cursor-pointer"
              >
                <X size={14} />
              </button>
            )}
          </div>

          <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
            <div className="flex items-center bg-[var(--theme-bg-secondary)] p-1 rounded-xl border border-[var(--theme-border-secondary)] text-xs font-medium overflow-x-auto no-scrollbar">
              {categories.map((cat) => {
                const isActive = categoryFilter === cat.key && fileTypeFilter === 'all';
                return (
                  <button
                    key={cat.key}
                    type="button"
                    onClick={() => {
                      setCategoryFilter(cat.key);
                      setFileTypeFilter('all');
                    }}
                    className={`px-2.5 py-1 rounded-lg transition-colors whitespace-nowrap cursor-pointer ${
                      isActive
                        ? 'bg-[var(--theme-bg-primary)] text-[var(--theme-text-primary)] shadow-xs font-semibold'
                        : 'text-[var(--theme-text-secondary)] hover:text-[var(--theme-text-primary)]'
                    }`}
                  >
                    {t(cat.labelKey)}
                  </button>
                );
              })}
            </div>

            <Popover open={isFilterMenuOpen} onOpenChange={setIsFilterMenuOpen}>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  aria-label={t('librarySort')}
                  title={t('librarySort')}
                  className={`p-1.5 rounded-xl border transition-colors cursor-pointer ${
                    hasAdvancedFilters || isFilterMenuOpen
                      ? 'bg-[var(--theme-bg-tertiary)] border-[var(--theme-border-focus)] text-[var(--theme-text-primary)] shadow-xs'
                      : 'border-[var(--theme-border-secondary)] bg-[var(--theme-bg-secondary)] text-[var(--theme-text-tertiary)] hover:text-[var(--theme-text-primary)] hover:bg-[var(--theme-bg-tertiary)]'
                  }`}
                >
                  <SlidersHorizontal size={15} strokeWidth={2} />
                </button>
              </PopoverTrigger>

              <PopoverContent
                align="end"
                sideOffset={8}
                className="w-64 rounded-2xl p-2 text-xs max-h-[calc(80vh-180px)] overflow-y-auto custom-scrollbar"
              >
                <div className="px-2.5 py-1 text-[11px] font-semibold text-[var(--theme-text-tertiary)] uppercase tracking-wider">
                  {t('librarySource')}
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setSourceFilter('all');
                    setIsFilterMenuOpen(false);
                  }}
                  className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-left text-[var(--theme-text-primary)] hover:bg-[var(--theme-bg-tertiary)] transition-colors cursor-pointer"
                >
                  <span className="flex items-center gap-2">
                    <Layers size={14} className="text-[var(--theme-text-secondary)]" />
                    <span>{t('librarySourceAll')}</span>
                  </span>
                  {sourceFilter === 'all' && <Check size={14} className="text-[var(--theme-accent)]" />}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setSourceFilter('uploaded');
                    setIsFilterMenuOpen(false);
                  }}
                  className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-left text-[var(--theme-text-primary)] hover:bg-[var(--theme-bg-tertiary)] transition-colors cursor-pointer"
                >
                  <span className="flex items-center gap-2">
                    <Upload size={14} className="text-[var(--theme-text-secondary)]" />
                    <span>{t('librarySourceUploaded')}</span>
                  </span>
                  {sourceFilter === 'uploaded' && <Check size={14} className="text-[var(--theme-accent)]" />}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setSourceFilter('generated');
                    setIsFilterMenuOpen(false);
                  }}
                  className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-left text-[var(--theme-text-primary)] hover:bg-[var(--theme-bg-tertiary)] transition-colors cursor-pointer"
                >
                  <span className="flex items-center gap-2">
                    <Sparkles size={14} className="text-[var(--theme-text-secondary)]" />
                    <span>{t('librarySourceGenerated')}</span>
                  </span>
                  {sourceFilter === 'generated' && <Check size={14} className="text-[var(--theme-accent)]" />}
                </button>

                <div className="my-1.5 border-t border-[var(--theme-border-secondary)]" />

                <div className="px-2.5 py-1 text-[11px] font-semibold text-[var(--theme-text-tertiary)] uppercase tracking-wider">
                  {t('libraryDocFormats')}
                </div>
                <button
                  type="button"
                  onClick={() => handleSelectSubtype('all')}
                  className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-left text-[var(--theme-text-primary)] hover:bg-[var(--theme-bg-tertiary)] transition-colors cursor-pointer"
                >
                  <span className="flex items-center gap-2">
                    <FileText size={14} className="text-[var(--theme-text-secondary)]" />
                    <span>{t('libraryDocFormatAll')}</span>
                  </span>
                  {fileTypeFilter === 'all' && <Check size={14} className="text-[var(--theme-accent)]" />}
                </button>
                <button
                  type="button"
                  onClick={() => handleSelectSubtype('pdf')}
                  className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-left text-[var(--theme-text-primary)] hover:bg-[var(--theme-bg-tertiary)] transition-colors cursor-pointer"
                >
                  <span className="flex items-center gap-2">
                    <FileText size={14} className="text-red-500" />
                    <span>PDF</span>
                  </span>
                  {fileTypeFilter === 'pdf' && <Check size={14} className="text-[var(--theme-accent)]" />}
                </button>
                <button
                  type="button"
                  onClick={() => handleSelectSubtype('spreadsheet')}
                  className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-left text-[var(--theme-text-primary)] hover:bg-[var(--theme-bg-tertiary)] transition-colors cursor-pointer"
                >
                  <span className="flex items-center gap-2">
                    <FileSpreadsheet size={14} className="text-emerald-500" />
                    <span>{t('libraryFileTypeSpreadsheet')}</span>
                  </span>
                  {fileTypeFilter === 'spreadsheet' && <Check size={14} className="text-[var(--theme-accent)]" />}
                </button>
                <button
                  type="button"
                  onClick={() => handleSelectSubtype('presentation')}
                  className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-left text-[var(--theme-text-primary)] hover:bg-[var(--theme-bg-tertiary)] transition-colors cursor-pointer"
                >
                  <span className="flex items-center gap-2">
                    <Presentation size={14} className="text-amber-500" />
                    <span>{t('libraryFileTypePresentation')}</span>
                  </span>
                  {fileTypeFilter === 'presentation' && <Check size={14} className="text-[var(--theme-accent)]" />}
                </button>

                <div className="my-1.5 border-t border-[var(--theme-border-secondary)]" />

                <div className="px-2.5 py-1 text-[11px] font-semibold text-[var(--theme-text-tertiary)] uppercase tracking-wider flex items-center gap-1.5">
                  <ArrowUpDown size={12} />
                  <span>{t('librarySort')}</span>
                </div>
                {(
                  [
                    { key: 'date_desc', labelKey: 'librarySortDateDesc' },
                    { key: 'date_asc', labelKey: 'librarySortDateAsc' },
                    { key: 'size_desc', labelKey: 'librarySortSizeDesc' },
                    { key: 'size_asc', labelKey: 'librarySortSizeAsc' },
                    { key: 'name_asc', labelKey: 'librarySortNameAsc' },
                    { key: 'name_desc', labelKey: 'librarySortNameDesc' },
                  ] as { key: LibrarySortOption; labelKey: string }[]
                ).map((sort) => (
                  <button
                    key={sort.key}
                    type="button"
                    onClick={() => {
                      setSortOption(sort.key);
                      setIsFilterMenuOpen(false);
                    }}
                    className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-left text-[var(--theme-text-primary)] hover:bg-[var(--theme-bg-tertiary)] transition-colors cursor-pointer"
                  >
                    <span>{t(sort.labelKey)}</span>
                    {sortOption === sort.key && <Check size={14} className="text-[var(--theme-accent)]" />}
                  </button>
                ))}

                {hasAdvancedFilters && (
                  <>
                    <div className="my-1.5 border-t border-[var(--theme-border-secondary)]" />
                    <button
                      type="button"
                      onClick={handleResetFilters}
                      className="w-full flex items-center justify-center gap-2 px-2.5 py-1.5 rounded-lg text-xs font-medium text-[var(--theme-text-secondary)] hover:text-red-500 hover:bg-red-500/10 transition-colors cursor-pointer"
                    >
                      <RotateCcw size={13} />
                      <span>{t('libraryResetFilters')}</span>
                    </button>
                  </>
                )}
              </PopoverContent>
            </Popover>

            <div className="flex items-center bg-[var(--theme-bg-secondary)] p-1 rounded-xl border border-[var(--theme-border-secondary)]">
              <button
                type="button"
                onClick={() => setViewMode('grid')}
                title={t('libraryViewGrid')}
                className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                  viewMode === 'grid'
                    ? 'bg-[var(--theme-bg-primary)] text-[var(--theme-text-primary)] shadow-xs'
                    : 'text-[var(--theme-text-secondary)] hover:text-[var(--theme-text-primary)]'
                }`}
              >
                <LayoutGrid size={14} />
              </button>
              <button
                type="button"
                onClick={() => setViewMode('list')}
                title={t('libraryViewList')}
                className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                  viewMode === 'list'
                    ? 'bg-[var(--theme-bg-primary)] text-[var(--theme-text-primary)] shadow-xs'
                    : 'text-[var(--theme-text-secondary)] hover:text-[var(--theme-text-primary)]'
                }`}
              >
                <List size={14} />
              </button>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar p-4 sm:p-5">
          {isLoading ? (
            <div className="h-full flex flex-col items-center justify-center py-20 text-[var(--theme-text-tertiary)] gap-3">
              <Loader2 size={32} className="animate-spin text-[var(--theme-text-primary)]" />
              <p className="text-sm">{t('loading')}</p>
            </div>
          ) : filteredItems.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center py-20 text-[var(--theme-text-tertiary)] gap-3">
              <div className="w-12 h-12 rounded-2xl bg-[var(--theme-bg-tertiary)] flex items-center justify-center text-[var(--theme-text-secondary)]">
                <FolderOpen size={24} />
              </div>
              <p className="text-sm font-medium text-[var(--theme-text-primary)]">{t('libraryEmptyTitle')}</p>
              <p className="text-xs max-w-sm text-center">{t('libraryEmptyDesc')}</p>
              {(searchQuery || categoryFilter !== 'all' || hasAdvancedFilters) && (
                <button
                  type="button"
                  onClick={() => {
                    setCategoryFilter('all');
                    handleResetFilters();
                    setSearchQuery('');
                  }}
                  className="mt-1 px-3 py-1.5 text-xs text-[var(--theme-text-link)] hover:underline cursor-pointer"
                >
                  {t('libraryResetFilters')}
                </button>
              )}
            </div>
          ) : viewMode === 'grid' ? (
            /* Grid View */
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 sm:gap-4">
              {filteredItems.map((item) => {
                const isSelected = selectedIds.has(item.id);
                const ext = item.name.includes('.') ? item.name.split('.').pop()?.toUpperCase() : '';

                return (
                  <div
                    key={item.id}
                    onClick={() => toggleSelectItem(item.id)}
                    onDoubleClick={() => handleItemDoubleClick(item)}
                    className={`group relative flex flex-col rounded-xl border transition-all duration-150 cursor-pointer overflow-hidden select-none ${
                      isSelected
                        ? 'border-blue-500 ring-2 ring-blue-500/40 bg-blue-500/5 shadow-sm'
                        : 'border-[var(--theme-border-secondary)] hover:border-[var(--theme-border-primary)] bg-[var(--theme-bg-secondary)]/50 hover:bg-[var(--theme-bg-secondary)]'
                    }`}
                  >
                    <div className="relative w-full aspect-[4/3] bg-[var(--theme-bg-tertiary)]/40 overflow-hidden flex items-center justify-center">
                      <LibraryItemThumbnail item={item} size="full" className="w-full h-full object-contain" />

                      <div
                        className={`absolute bottom-2 right-2 w-5 h-5 rounded-full flex items-center justify-center transition-all shadow-sm ${
                          isSelected
                            ? 'bg-blue-600 text-white scale-100 opacity-100'
                            : 'bg-black/30 border border-white/70 text-transparent group-hover:opacity-100 opacity-0 scale-90 group-hover:scale-100'
                        }`}
                      >
                        <Check size={12} strokeWidth={3} />
                      </div>

                      <div
                        className="absolute top-2 right-2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity bg-black/60 backdrop-blur-xs p-1 rounded-xl z-10"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            void handlePreviewItem(item);
                          }}
                          title={t('libraryPreview')}
                          aria-label={t('libraryPreview')}
                          className="p-1 rounded-lg text-white/80 hover:text-white hover:bg-white/20 transition-colors cursor-pointer"
                        >
                          <Eye size={13} strokeWidth={2} />
                        </button>
                      </div>
                    </div>

                    <div className="p-2.5 flex flex-col gap-1 flex-1 justify-between bg-[var(--theme-bg-secondary)]/40">
                      <div className="text-xs font-medium text-[var(--theme-text-primary)] truncate" title={item.name}>
                        {item.name}
                      </div>
                      <div className="flex items-center justify-between text-[11px] text-[var(--theme-text-tertiary)]">
                        {ext ? (
                          <span className="px-1.5 py-0.5 rounded bg-[var(--theme-bg-tertiary)] font-mono text-[10px] font-semibold uppercase">
                            {ext}
                          </span>
                        ) : (
                          <span>-</span>
                        )}
                        <span>{formatFileSize(item.size)}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            /* List View */
            <div className="w-full overflow-x-auto">
              <table className="w-full text-left border-collapse min-w-[540px]">
                <thead>
                  <tr className="border-b border-[var(--theme-border-secondary)] text-xs text-[var(--theme-text-tertiary)] font-medium">
                    <th className="py-2.5 px-3 w-10 text-center">
                      <input
                        type="checkbox"
                        checked={allFilteredSelected}
                        onChange={handleSelectAllToggle}
                        className="rounded border-[var(--theme-border-secondary)] text-blue-600 focus:ring-blue-500 cursor-pointer"
                        aria-label={t('librarySelectAll')}
                      />
                    </th>
                    <th className="py-2.5 px-3 font-normal">{t('libraryName')}</th>
                    <th className="py-2.5 px-3 font-normal w-28">{t('libraryModifiedTime')}</th>
                    <th className="py-2.5 px-3 font-normal w-24 text-right">{t('librarySize')}</th>
                    <th className="py-2.5 px-3 font-normal w-12 text-right"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--theme-border-secondary)]/50 text-xs">
                  {filteredItems.map((item) => {
                    const isSelected = selectedIds.has(item.id);

                    return (
                      <tr
                        key={item.id}
                        onClick={() => toggleSelectItem(item.id)}
                        onDoubleClick={() => handleItemDoubleClick(item)}
                        className={`group cursor-pointer transition-colors ${
                          isSelected ? 'bg-blue-500/10 hover:bg-blue-500/15' : 'hover:bg-[var(--theme-bg-secondary)]'
                        }`}
                      >
                        <td className="py-2.5 px-3 text-center" onClick={(e) => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleSelectItem(item.id)}
                            className="rounded border-[var(--theme-border-secondary)] text-blue-600 focus:ring-blue-500 cursor-pointer"
                          />
                        </td>
                        <td className="py-2.5 px-3">
                          <div className="flex items-center gap-3">
                            <LibraryItemThumbnail item={item} size="sm" className="w-8 h-8 rounded-lg" />
                            <div className="truncate max-w-xs sm:max-w-md">
                              <p className="font-medium text-[var(--theme-text-primary)] truncate" title={item.name}>
                                {item.name}
                              </p>
                              {item.sessionTitle && (
                                <p className="text-[11px] text-[var(--theme-text-tertiary)] truncate">
                                  {interpolate(t('libraryFromSession'), { title: item.sessionTitle })}
                                </p>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="py-2.5 px-3 text-[var(--theme-text-tertiary)] whitespace-nowrap">
                          {formatLibraryDate(item.timestamp, language)}
                        </td>
                        <td className="py-2.5 px-3 text-[var(--theme-text-tertiary)] text-right whitespace-nowrap font-mono">
                          {formatFileSize(item.size)}
                        </td>
                        <td className="py-2.5 px-3 text-right whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              void handlePreviewItem(item);
                            }}
                            title={t('libraryPreview')}
                            aria-label={t('libraryPreview')}
                            className="p-1 rounded-lg text-[var(--theme-text-tertiary)] hover:text-[var(--theme-text-primary)] hover:bg-[var(--theme-bg-tertiary)] transition-colors opacity-0 group-hover:opacity-100 cursor-pointer"
                          >
                            <Eye size={14} strokeWidth={2} />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between px-5 py-3.5 border-t border-[var(--theme-border-secondary)] bg-[var(--theme-bg-secondary)]/40 flex-shrink-0">
          <div className="flex items-center gap-3">
            <span className="text-xs text-[var(--theme-text-secondary)]">
              {interpolate(t('librarySelectedCount'), { count: selectedIds.size })}
            </span>
            {filteredItems.length > 0 && (
              <button
                type="button"
                onClick={handleSelectAllToggle}
                className="text-xs text-[var(--theme-text-link)] hover:underline font-medium cursor-pointer"
              >
                {allFilteredSelected ? t('libraryDeselectAll') : t('librarySelectAll')}
              </button>
            )}
          </div>

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={onClose}
              disabled={isImporting}
              className="px-4 py-2 text-xs font-medium text-[var(--theme-text-secondary)] hover:text-[var(--theme-text-primary)] hover:bg-[var(--theme-bg-tertiary)] rounded-xl transition-colors border border-[var(--theme-border-secondary)] cursor-pointer"
            >
              {t('cancel')}
            </button>
            <button
              type="button"
              onClick={handleConfirmSelection}
              disabled={selectedIds.size === 0 || isImporting}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl transition-colors shadow-xs cursor-pointer"
            >
              {isImporting && <Loader2 size={14} className="animate-spin" />}
              <span>
                {t('libraryAddFiles')}
                {selectedIds.size > 0 ? ` (${selectedIds.size})` : ''}
              </span>
            </button>
          </div>
        </div>

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
      </div>
    </Modal>
  );
};
