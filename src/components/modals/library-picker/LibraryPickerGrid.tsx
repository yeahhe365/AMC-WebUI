import React from 'react';
import { Check, Eye } from 'lucide-react';
import { LibraryItemThumbnail } from '@/components/library/LibraryItemThumbnail';
import { formatFileSize } from '@/utils/file/fileSize';
import type { LibraryItem } from '@/types';

export interface LibraryPickerGridProps {
  filteredItems: LibraryItem[];
  selectedIds: Set<string>;
  toggleSelectItem: (id: string, event?: React.MouseEvent | React.KeyboardEvent) => void;
  handleItemDoubleClick: (item: LibraryItem) => void;
  handlePreviewItem: (item: LibraryItem) => void;
  t: (key: string) => string;
}

export const LibraryPickerGrid: React.FC<LibraryPickerGridProps> = ({
  filteredItems,
  selectedIds,
  toggleSelectItem,
  handleItemDoubleClick,
  handlePreviewItem,
  t,
}) => {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 sm:gap-4">
      {filteredItems.map((item) => {
        const isSelected = selectedIds.has(item.id);
        const ext = item.name.includes('.') ? item.name.split('.').pop()?.toUpperCase() : '';

        return (
          <div
            key={item.id}
            tabIndex={0}
            role="button"
            aria-pressed={isSelected}
            aria-label={item.name}
            onClick={(event) => toggleSelectItem(item.id, event)}
            onDoubleClick={() => handleItemDoubleClick(item)}
            onKeyDown={(event) => {
              if (event.target === event.currentTarget && (event.key === ' ' || event.key === 'Enter')) {
                event.preventDefault();
                toggleSelectItem(item.id, event);
              }
            }}
            className={`group relative flex flex-col rounded-xl border transition-all duration-150 cursor-pointer overflow-hidden select-none focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--theme-border-focus)] ${
              isSelected
                ? 'border-[var(--theme-accent)] ring-2 ring-[var(--theme-accent)]/40 bg-[var(--theme-accent)]/5 shadow-sm'
                : 'border-[var(--theme-border-secondary)] hover:border-[var(--theme-border-primary)] bg-[var(--theme-bg-secondary)]/50 hover:bg-[var(--theme-bg-secondary)]'
            }`}
          >
            <div className="relative w-full aspect-[4/3] bg-[var(--theme-bg-tertiary)]/40 overflow-hidden flex items-center justify-center">
              <LibraryItemThumbnail item={item} size="full" className="w-full h-full object-contain" />

              <div
                className={`absolute bottom-2 right-2 w-5 h-5 rounded-full flex items-center justify-center transition-all shadow-sm ${
                  isSelected
                    ? 'bg-[var(--theme-accent)] text-white scale-100 opacity-100'
                    : 'bg-black/30 border border-white/70 text-transparent group-hover:opacity-100 group-focus-within:opacity-100 opacity-0 scale-90 group-hover:scale-100'
                }`}
              >
                <Check size={12} strokeWidth={3} />
              </div>

              <div
                className="absolute top-2 right-2 flex items-center gap-1 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity bg-black/60 backdrop-blur-xs p-1 rounded-xl z-10"
                onClick={(event) => event.stopPropagation()}
              >
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
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
  );
};
