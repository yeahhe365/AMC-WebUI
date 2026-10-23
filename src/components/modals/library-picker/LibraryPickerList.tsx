import React from 'react';
import { Eye } from 'lucide-react';
import { LibraryItemThumbnail } from '@/components/library/LibraryItemThumbnail';
import { interpolate } from '@/i18n/interpolate';
import { formatFileSize } from '@/utils/file/fileSize';
import { formatLibraryDate } from '@/utils/library/libraryFiles';
import type { LibraryItem } from '@/types';

export interface LibraryPickerListProps {
  filteredItems: LibraryItem[];
  selectedIds: Set<string>;
  allFilteredSelected: boolean;
  handleSelectAllToggle: () => void;
  toggleSelectItem: (id: string, event?: React.MouseEvent | React.KeyboardEvent) => void;
  handleItemDoubleClick: (item: LibraryItem) => void;
  handlePreviewItem: (item: LibraryItem) => void;
  language: string;
  t: (key: string) => string;
}

export const LibraryPickerList: React.FC<LibraryPickerListProps> = ({
  filteredItems,
  selectedIds,
  allFilteredSelected,
  handleSelectAllToggle,
  toggleSelectItem,
  handleItemDoubleClick,
  handlePreviewItem,
  language,
  t,
}) => {
  return (
    <div className="w-full overflow-x-auto">
      <table className="w-full text-left border-collapse min-w-[540px]">
        <thead>
          <tr className="border-b border-[var(--theme-border-secondary)] text-xs text-[var(--theme-text-tertiary)] font-medium">
            <th className="py-2.5 px-3 w-10 text-center">
              <input
                type="checkbox"
                checked={allFilteredSelected}
                onChange={handleSelectAllToggle}
                className="rounded border-[var(--theme-border-secondary)] text-[var(--theme-accent)] focus:ring-[var(--theme-accent)] cursor-pointer"
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
                tabIndex={0}
                onClick={(event) => toggleSelectItem(item.id, event)}
                onDoubleClick={() => handleItemDoubleClick(item)}
                onKeyDown={(event) => {
                  if (event.target === event.currentTarget && (event.key === ' ' || event.key === 'Enter')) {
                    event.preventDefault();
                    toggleSelectItem(item.id, event);
                  }
                }}
                className={`group cursor-pointer transition-colors focus:outline-none focus-visible:bg-[var(--theme-accent)]/10 ${
                  isSelected
                    ? 'bg-[var(--theme-accent)]/10 hover:bg-[var(--theme-accent)]/15'
                    : 'hover:bg-[var(--theme-bg-secondary)]'
                }`}
              >
                <td
                  className="py-2.5 px-3 text-center"
                  onClick={(event) => {
                    event.stopPropagation();
                    toggleSelectItem(item.id, event);
                  }}
                >
                  <input
                    type="checkbox"
                    checked={isSelected}
                    readOnly
                    aria-label={item.name}
                    onClick={(event) => {
                      event.stopPropagation();
                      toggleSelectItem(item.id, event);
                    }}
                    className="rounded border-[var(--theme-border-secondary)] text-[var(--theme-accent)] focus:ring-[var(--theme-accent)] cursor-pointer"
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
                <td className="py-2.5 px-3 text-right whitespace-nowrap" onClick={(event) => event.stopPropagation()}>
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      void handlePreviewItem(item);
                    }}
                    title={t('libraryPreview')}
                    aria-label={t('libraryPreview')}
                    className="p-1 rounded-lg text-[var(--theme-text-tertiary)] hover:text-[var(--theme-text-primary)] hover:bg-[var(--theme-bg-tertiary)] transition-colors opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 cursor-pointer"
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
  );
};
