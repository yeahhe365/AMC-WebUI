import React from 'react';
import {
  SlidersHorizontal,
  LayoutGrid,
  List,
  MessageSquarePlus,
  Download,
  Trash2,
  Upload,
  Sparkles,
  FileText,
  FileSpreadsheet,
  Presentation,
  Check,
  RotateCcw,
  ArrowUpDown,
  Layers,
  X,
  CheckSquare,
} from 'lucide-react';
import { useI18n } from '@/contexts/I18nContext';
import { useLibraryStore } from '@/stores/libraryStore';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/shared/Popover';
import { interpolate } from '@/i18n/interpolate';
import type { LibraryCategoryFilter, LibraryFileTypeFilter, LibrarySortOption } from '@/types';

interface LibraryToolbarProps {
  selectedCount: number;
  totalCount?: number;
  onStartChat: () => void;
  onDownloadSelected: () => void;
  onDeleteSelected: () => void;
  onSelectAll?: () => void;
}

export const LibraryToolbar: React.FC<LibraryToolbarProps> = ({
  selectedCount,
  totalCount,
  onStartChat,
  onDownloadSelected,
  onDeleteSelected,
  onSelectAll,
}) => {
  const { t } = useI18n();
  const viewMode = useLibraryStore((state) => state.viewMode);
  const setViewMode = useLibraryStore((state) => state.setViewMode);
  const categoryFilter = useLibraryStore((state) => state.categoryFilter);
  const setCategoryFilter = useLibraryStore((state) => state.setCategoryFilter);
  const sourceFilter = useLibraryStore((state) => state.sourceFilter);
  const setSourceFilter = useLibraryStore((state) => state.setSourceFilter);
  const fileTypeFilter = useLibraryStore((state) => state.fileTypeFilter);
  const setFileTypeFilter = useLibraryStore((state) => state.setFileTypeFilter);
  const sortOption = useLibraryStore((state) => state.sortOption);
  const setSortOption = useLibraryStore((state) => state.setSortOption);
  const clearSelection = useLibraryStore((state) => state.clearSelection);
  const isFilterMenuOpen = useLibraryStore((state) => state.isFilterMenuOpen);
  const setIsFilterMenuOpen = useLibraryStore((state) => state.setIsFilterMenuOpen);

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

  const handleResetFilters = () => {
    setSourceFilter('all');
    setFileTypeFilter('all');
    setSortOption('date_desc');
    setIsFilterMenuOpen(false);
  };

  const handleSelectSubtype = (type: LibraryFileTypeFilter) => {
    setFileTypeFilter(type);
    if (type !== 'all' && (categoryFilter === 'image' || categoryFilter === 'audio' || categoryFilter === 'video')) {
      setCategoryFilter('document');
    }
    setIsFilterMenuOpen(false);
  };

  return (
    <div className="flex items-center justify-between gap-3 px-4 sm:px-8 py-3 border-b border-[var(--theme-border-primary)] flex-shrink-0">
      {selectedCount > 0 ? (
        <div className="flex items-center gap-2 flex-wrap animate-in fade-in duration-150">
          <button
            onClick={onStartChat}
            className="flex items-center gap-2 px-4 py-1.5 text-sm font-medium rounded-full bg-[var(--theme-text-primary)] text-[var(--theme-bg-primary)] hover:opacity-90 active:scale-95 transition-all shadow-sm cursor-pointer"
          >
            <MessageSquarePlus size={16} strokeWidth={2} />
            <span>{t('libraryStartChat')}</span>
          </button>

          <button
            onClick={onDownloadSelected}
            className="flex items-center gap-2 px-3.5 py-1.5 text-sm font-medium rounded-full border border-[var(--theme-border-primary)] text-[var(--theme-text-primary)] hover:bg-[var(--theme-bg-tertiary)] active:scale-95 transition-all cursor-pointer"
          >
            <Download size={15} strokeWidth={2} />
            <span>{t('libraryDownload')}</span>
          </button>

          <button
            onClick={onDeleteSelected}
            className="flex items-center gap-2 px-3.5 py-1.5 text-sm font-medium rounded-full border border-red-500/40 text-red-500 hover:bg-red-500/10 active:scale-95 transition-all cursor-pointer"
          >
            <Trash2 size={15} strokeWidth={2} />
            <span>{t('libraryDelete')}</span>
          </button>

          <button
            onClick={clearSelection}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-full border border-[var(--theme-border-primary)] text-[var(--theme-text-secondary)] hover:text-[var(--theme-text-primary)] hover:bg-[var(--theme-bg-tertiary)] active:scale-95 transition-all cursor-pointer"
            title={t('libraryDeselectAll')}
          >
            <X size={15} strokeWidth={2} />
            <span>{t('libraryDeselectAll')}</span>
          </button>

          {onSelectAll && totalCount !== undefined && selectedCount < totalCount && (
            <button
              onClick={onSelectAll}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-full border border-[var(--theme-border-primary)] text-[var(--theme-text-secondary)] hover:text-[var(--theme-text-primary)] hover:bg-[var(--theme-bg-tertiary)] active:scale-95 transition-all cursor-pointer"
              title={t('librarySelectAll')}
            >
              <CheckSquare size={15} strokeWidth={2} />
              <span>{t('librarySelectAll')}</span>
            </button>
          )}
        </div>
      ) : (
        <div className="flex items-center gap-1 overflow-x-auto no-scrollbar scroll-smooth">
          {categories.map((cat) => {
            const isActive = categoryFilter === cat.key && fileTypeFilter === 'all';
            return (
              <button
                key={cat.key}
                onClick={() => {
                  setCategoryFilter(cat.key);
                  setFileTypeFilter('all');
                }}
                className={`px-3.5 py-1 text-sm font-medium rounded-full whitespace-nowrap flex-shrink-0 transition-colors ${
                  isActive
                    ? 'bg-[var(--theme-bg-tertiary)] text-[var(--theme-text-primary)]'
                    : 'text-[var(--theme-text-tertiary)] hover:text-[var(--theme-text-primary)]'
                }`}
              >
                {t(cat.labelKey)}
              </button>
            );
          })}
        </div>
      )}

      <div className="flex items-center gap-3">
        {selectedCount > 0 ? (
          <span className="text-sm font-medium text-[var(--theme-text-secondary)] hidden sm:inline">
            {interpolate(t('librarySelectedCount'), { count: selectedCount })}
          </span>
        ) : (
          <Popover open={isFilterMenuOpen} onOpenChange={setIsFilterMenuOpen}>
            <PopoverTrigger asChild>
              <button
                aria-label="Filter"
                className={`p-2 rounded-lg transition-colors cursor-pointer ${
                  hasAdvancedFilters || isFilterMenuOpen
                    ? 'bg-[var(--theme-bg-tertiary)] text-[var(--theme-text-primary)]'
                    : 'text-[var(--theme-text-tertiary)] hover:text-[var(--theme-text-primary)] hover:bg-[var(--theme-bg-tertiary)]'
                }`}
              >
                <SlidersHorizontal size={18} strokeWidth={2} />
              </button>
            </PopoverTrigger>

            <PopoverContent
              align="end"
              sideOffset={8}
              className="w-64 rounded-2xl p-2 text-sm max-h-[calc(100vh-180px)] overflow-y-auto"
            >
              <div className="px-2.5 py-1 text-xs font-semibold text-[var(--theme-text-tertiary)] uppercase tracking-wider">
                {t('librarySource')}
              </div>
              <button
                onClick={() => {
                  setSourceFilter('all');
                  setIsFilterMenuOpen(false);
                }}
                className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-left text-[var(--theme-text-primary)] hover:bg-[var(--theme-bg-tertiary)] transition-colors"
              >
                <span className="flex items-center gap-2">
                  <Layers size={14} className="text-[var(--theme-text-secondary)]" />
                  <span>{t('librarySourceAll')}</span>
                </span>
                {sourceFilter === 'all' && <Check size={14} className="text-[var(--theme-accent)]" />}
              </button>
              <button
                onClick={() => {
                  setSourceFilter('uploaded');
                  setIsFilterMenuOpen(false);
                }}
                className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-left text-[var(--theme-text-primary)] hover:bg-[var(--theme-bg-tertiary)] transition-colors"
              >
                <span className="flex items-center gap-2">
                  <Upload size={14} className="text-[var(--theme-text-secondary)]" />
                  <span>{t('librarySourceUploaded')}</span>
                </span>
                {sourceFilter === 'uploaded' && <Check size={14} className="text-[var(--theme-accent)]" />}
              </button>
              <button
                onClick={() => {
                  setSourceFilter('generated');
                  setIsFilterMenuOpen(false);
                }}
                className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-left text-[var(--theme-text-primary)] hover:bg-[var(--theme-bg-tertiary)] transition-colors"
              >
                <span className="flex items-center gap-2">
                  <Sparkles size={14} className="text-[var(--theme-text-secondary)]" />
                  <span>{t('librarySourceGenerated')}</span>
                </span>
                {sourceFilter === 'generated' && <Check size={14} className="text-[var(--theme-accent)]" />}
              </button>

              <div className="my-1.5 border-t border-[var(--theme-border-secondary)]" />

              <div className="px-2.5 py-1 text-xs font-semibold text-[var(--theme-text-tertiary)] uppercase tracking-wider">
                {t('libraryDocFormats')}
              </div>
              <button
                onClick={() => handleSelectSubtype('all')}
                className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-left text-[var(--theme-text-primary)] hover:bg-[var(--theme-bg-tertiary)] transition-colors"
              >
                <span className="flex items-center gap-2">
                  <FileText size={14} className="text-[var(--theme-text-secondary)]" />
                  <span>{t('libraryDocFormatAll')}</span>
                </span>
                {fileTypeFilter === 'all' && <Check size={14} className="text-[var(--theme-accent)]" />}
              </button>
              <button
                onClick={() => handleSelectSubtype('pdf')}
                className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-left text-[var(--theme-text-primary)] hover:bg-[var(--theme-bg-tertiary)] transition-colors"
              >
                <span className="flex items-center gap-2">
                  <FileText size={14} className="text-red-500" />
                  <span>PDF</span>
                </span>
                {fileTypeFilter === 'pdf' && <Check size={14} className="text-[var(--theme-accent)]" />}
              </button>
              <button
                onClick={() => handleSelectSubtype('spreadsheet')}
                className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-left text-[var(--theme-text-primary)] hover:bg-[var(--theme-bg-tertiary)] transition-colors"
              >
                <span className="flex items-center gap-2">
                  <FileSpreadsheet size={14} className="text-emerald-500" />
                  <span>{t('libraryFileTypeSpreadsheet')}</span>
                </span>
                {fileTypeFilter === 'spreadsheet' && <Check size={14} className="text-[var(--theme-accent)]" />}
              </button>
              <button
                onClick={() => handleSelectSubtype('presentation')}
                className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-left text-[var(--theme-text-primary)] hover:bg-[var(--theme-bg-tertiary)] transition-colors"
              >
                <span className="flex items-center gap-2">
                  <Presentation size={14} className="text-amber-500" />
                  <span>{t('libraryFileTypePresentation')}</span>
                </span>
                {fileTypeFilter === 'presentation' && <Check size={14} className="text-[var(--theme-accent)]" />}
              </button>

              <div className="my-1.5 border-t border-[var(--theme-border-secondary)]" />

              <div className="px-2.5 py-1 text-xs font-semibold text-[var(--theme-text-tertiary)] uppercase tracking-wider flex items-center gap-1.5">
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
                  onClick={() => {
                    setSortOption(sort.key);
                    setIsFilterMenuOpen(false);
                  }}
                  className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-left text-[var(--theme-text-primary)] hover:bg-[var(--theme-bg-tertiary)] transition-colors"
                >
                  <span>{t(sort.labelKey)}</span>
                  {sortOption === sort.key && <Check size={14} className="text-[var(--theme-accent)]" />}
                </button>
              ))}

              {hasAdvancedFilters && (
                <>
                  <div className="my-1.5 border-t border-[var(--theme-border-secondary)]" />
                  <button
                    onClick={handleResetFilters}
                    className="w-full flex items-center justify-center gap-2 px-2.5 py-1.5 rounded-lg text-xs font-medium text-[var(--theme-text-secondary)] hover:text-red-500 hover:bg-red-500/10 transition-colors"
                  >
                    <RotateCcw size={13} />
                    <span>{t('libraryResetFilters')}</span>
                  </button>
                </>
              )}
            </PopoverContent>
          </Popover>
        )}

        <div className="flex items-center gap-1 border-l border-[var(--theme-border-secondary)] pl-2">
          <button
            onClick={() => setViewMode('grid')}
            aria-label={t('libraryViewGrid')}
            title={t('libraryViewGrid')}
            className={`p-1.5 rounded-lg transition-colors ${
              viewMode === 'grid'
                ? 'bg-[var(--theme-bg-tertiary)] text-[var(--theme-text-primary)]'
                : 'text-[var(--theme-text-tertiary)] hover:text-[var(--theme-text-primary)]'
            }`}
          >
            <LayoutGrid size={18} strokeWidth={2} />
          </button>
          <button
            onClick={() => setViewMode('list')}
            aria-label={t('libraryViewList')}
            title={t('libraryViewList')}
            className={`p-1.5 rounded-lg transition-colors ${
              viewMode === 'list'
                ? 'bg-[var(--theme-bg-tertiary)] text-[var(--theme-text-primary)]'
                : 'text-[var(--theme-text-tertiary)] hover:text-[var(--theme-text-primary)]'
            }`}
          >
            <List size={18} strokeWidth={2} />
          </button>
        </div>
      </div>
    </div>
  );
};
