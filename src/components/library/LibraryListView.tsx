import React, { useRef, useEffect, useState } from 'react';
import { MessageSquarePlus, Eye, Download, Trash2, Copy, Check } from 'lucide-react';
import { useI18n } from '@/contexts/I18nContext';
import { useLibraryStore } from '@/stores/libraryStore';
import type { LibraryItem } from '@/types';
import { formatLibraryDate } from '@/utils/library/libraryFiles';
import { formatFileSize } from '@/utils/file/fileSize';
import { copyTextToClipboard } from '@/utils/clipboard';
import { LibraryItemThumbnail } from './LibraryItemThumbnail';
import { interpolate } from '@/i18n/interpolate';

interface LibraryListViewProps {
  items: LibraryItem[];
  onPreviewItem: (item: LibraryItem) => void;
  onStartChatWithItem: (item: LibraryItem) => void;
  onDownloadItem: (item: LibraryItem) => void;
  onDeleteItem: (item: LibraryItem) => void;
  onJumpToSession?: (sessionId: string) => void;
}

interface LibraryListRowProps {
  item: LibraryItem;
  isSelected: boolean;
  language: string;
  isCopied: boolean;
  onPreviewItem: (item: LibraryItem) => void;
  onStartChatWithItem: (item: LibraryItem) => void;
  onDownloadItem: (item: LibraryItem) => void;
  onDeleteItem: (item: LibraryItem) => void;
  onToggleSelect: (id: string) => void;
  onJumpToSession?: (sessionId: string) => void;
  onCopyApiName: (name: string, id: string) => void;
  t: (key: any) => string;
}

const LibraryListRow = React.memo<LibraryListRowProps>(
  ({
    item,
    isSelected,
    language,
    isCopied,
    onPreviewItem,
    onStartChatWithItem,
    onDownloadItem,
    onDeleteItem,
    onToggleSelect,
    onJumpToSession,
    onCopyApiName,
    t,
  }) => {
    return (
      <tr
        tabIndex={0}
        onClick={() => onPreviewItem(item)}
        onKeyDown={(e) => {
          if (
            e.key === 'Enter' &&
            (e.target as HTMLElement).tagName !== 'BUTTON' &&
            (e.target as HTMLElement).tagName !== 'INPUT'
          ) {
            e.preventDefault();
            onPreviewItem(item);
          }
        }}
        className={`group cursor-pointer transition-colors focus:outline-none focus-visible:bg-[var(--theme-bg-tertiary)]/80 ${
          isSelected ? 'bg-[var(--theme-bg-tertiary)]/70' : 'hover:bg-[var(--theme-bg-tertiary)]/40'
        }`}
      >
        <td
          className="py-3.5 px-4 sm:px-8 w-12 text-center"
          onClick={(e) => {
            e.stopPropagation();
            onToggleSelect(item.id);
          }}
        >
          <input
            type="checkbox"
            checked={isSelected}
            onClick={(e) => e.stopPropagation()}
            onChange={() => onToggleSelect(item.id)}
            aria-label={`Select ${item.name}`}
            className="w-4 h-4 rounded border-[var(--theme-border-secondary)] text-[var(--theme-accent)] focus:ring-[var(--theme-border-focus)] cursor-pointer"
          />
        </td>

        <td className="py-3.5 px-4">
          <div className="flex items-center gap-3 min-w-0">
            <LibraryItemThumbnail item={item} size="sm" />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5 min-w-0">
                <span className="text-sm font-medium text-[var(--theme-text-primary)] truncate" title={item.name}>
                  {item.name}
                </span>
                {item.fileApiName && (
                  <span
                    className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-mono bg-[var(--theme-text-link)]/10 text-[var(--theme-text-link)] border border-[var(--theme-text-link)]/20 shrink-0"
                    title={`Files API: ${item.fileApiName}`}
                  >
                    Files API
                  </span>
                )}
              </div>
              {item.sessionTitle && (
                <div
                  role={onJumpToSession && item.sessionId ? 'button' : undefined}
                  tabIndex={onJumpToSession && item.sessionId ? 0 : undefined}
                  className={`text-xs text-[var(--theme-text-tertiary)] truncate mt-0.5 ${
                    onJumpToSession && item.sessionId
                      ? 'hover:text-[var(--theme-accent)] hover:underline cursor-pointer focus:outline-none focus-visible:underline'
                      : ''
                  }`}
                  title={item.sessionTitle}
                  onClick={(e) => {
                    if (onJumpToSession && item.sessionId) {
                      e.stopPropagation();
                      onJumpToSession(item.sessionId);
                    }
                  }}
                  onKeyDown={(e) => {
                    if ((e.key === 'Enter' || e.key === ' ') && onJumpToSession && item.sessionId) {
                      e.stopPropagation();
                      e.preventDefault();
                      onJumpToSession(item.sessionId);
                    }
                  }}
                >
                  {interpolate(t('libraryFromSession'), { title: item.sessionTitle })}
                </div>
              )}
            </div>
          </div>
        </td>

        <td className="py-3.5 px-4 text-sm text-[var(--theme-text-secondary)] whitespace-nowrap">
          {formatLibraryDate(item.timestamp, language)}
        </td>

        <td className="py-3.5 px-4 text-sm text-[var(--theme-text-secondary)] whitespace-nowrap">
          {formatFileSize(item.size)}
        </td>

        <td className="py-3.5 pr-4 sm:pr-8 text-right whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
          <div className="inline-flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            {item.fileApiName && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onCopyApiName(item.fileApiName!, item.id);
                }}
                title={isCopied ? t('selectedFileIdCopied') : t('selectedFileCopyFileId')}
                aria-label={isCopied ? t('selectedFileIdCopied') : t('selectedFileCopyFileId')}
                className={`p-1.5 rounded-lg transition-colors ${
                  isCopied
                    ? 'text-[var(--theme-text-success)]'
                    : 'text-[var(--theme-text-secondary)] hover:text-[var(--theme-text-primary)] hover:bg-[var(--theme-bg-tertiary)]'
                }`}
              >
                {isCopied ? <Check size={16} strokeWidth={2} /> : <Copy size={16} strokeWidth={2} />}
              </button>
            )}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onStartChatWithItem(item);
              }}
              title={t('libraryStartChat')}
              aria-label={t('libraryStartChat')}
              className="p-1.5 rounded-lg text-[var(--theme-text-secondary)] hover:text-[var(--theme-text-primary)] hover:bg-[var(--theme-bg-tertiary)] transition-colors"
            >
              <MessageSquarePlus size={16} strokeWidth={2} />
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onPreviewItem(item);
              }}
              title={t('libraryPreview')}
              aria-label={t('libraryPreview')}
              className="p-1.5 rounded-lg text-[var(--theme-text-secondary)] hover:text-[var(--theme-text-primary)] hover:bg-[var(--theme-bg-tertiary)] transition-colors"
            >
              <Eye size={16} strokeWidth={2} />
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onDownloadItem(item);
              }}
              title={t('libraryDownload')}
              aria-label={t('libraryDownload')}
              className="p-1.5 rounded-lg text-[var(--theme-text-secondary)] hover:text-[var(--theme-text-primary)] hover:bg-[var(--theme-bg-tertiary)] transition-colors"
            >
              <Download size={16} strokeWidth={2} />
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onDeleteItem(item);
              }}
              title={t('libraryDelete')}
              aria-label={t('libraryDelete')}
              className="p-1.5 rounded-lg text-red-500 hover:text-red-600 hover:bg-red-500/10 transition-colors"
            >
              <Trash2 size={16} strokeWidth={2} />
            </button>
          </div>
        </td>
      </tr>
    );
  },
);

LibraryListRow.displayName = 'LibraryListRow';

export const LibraryListView: React.FC<LibraryListViewProps> = ({
  items,
  onPreviewItem,
  onStartChatWithItem,
  onDownloadItem,
  onDeleteItem,
  onJumpToSession,
}) => {
  const { t, language } = useI18n();
  const selectedFileIds = useLibraryStore((state) => state.selectedFileIds);
  const toggleSelectFile = useLibraryStore((state) => state.toggleSelectFile);
  const selectAllFiles = useLibraryStore((state) => state.selectAllFiles);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const headerCheckboxRef = useRef<HTMLInputElement>(null);

  const allSelected = items.length > 0 && items.every((item) => selectedFileIds.has(item.id));
  const someSelected = items.some((item) => selectedFileIds.has(item.id)) && !allSelected;

  useEffect(() => {
    if (headerCheckboxRef.current) {
      headerCheckboxRef.current.indeterminate = someSelected;
    }
  }, [someSelected]);

  const handleMasterCheckboxChange = () => {
    selectAllFiles(items.map((i) => i.id));
  };

  const handleCopyApiName = React.useCallback((name: string, id: string) => {
    void copyTextToClipboard(name).then((ok) => {
      if (ok) {
        setCopiedId(id);
        setTimeout(() => setCopiedId(null), 2000);
      }
    });
  }, []);

  return (
    <div className="w-full overflow-x-auto">
      <table className="w-full text-left border-collapse min-w-[550px]">
        <thead>
          <tr className="border-b border-[var(--theme-border-primary)] text-xs text-[var(--theme-text-tertiary)] font-medium">
            <th className="py-3 px-4 sm:px-8 w-12 text-center">
              <input
                ref={headerCheckboxRef}
                type="checkbox"
                checked={allSelected}
                onChange={handleMasterCheckboxChange}
                aria-label="Select all"
                className="w-4 h-4 rounded border-[var(--theme-border-secondary)] text-[var(--theme-accent)] focus:ring-[var(--theme-border-focus)] cursor-pointer"
              />
            </th>
            <th className="py-3 px-4 font-normal text-[var(--theme-text-secondary)]">{t('libraryName')}</th>
            <th className="py-3 px-4 font-normal text-[var(--theme-text-secondary)] w-36 sm:w-44">
              {t('libraryModifiedTime')}
            </th>
            <th className="py-3 px-4 font-normal text-[var(--theme-text-secondary)] w-28 sm:w-32">
              {t('librarySize')}
            </th>
            <th className="py-3 pr-4 sm:pr-8 w-32 text-right font-normal text-[var(--theme-text-secondary)]"></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--theme-border-secondary)]/50">
          {items.map((item) => (
            <LibraryListRow
              key={item.id}
              item={item}
              isSelected={selectedFileIds.has(item.id)}
              language={language}
              isCopied={copiedId === item.id}
              onPreviewItem={onPreviewItem}
              onStartChatWithItem={onStartChatWithItem}
              onDownloadItem={onDownloadItem}
              onDeleteItem={onDeleteItem}
              onToggleSelect={toggleSelectFile}
              onJumpToSession={onJumpToSession}
              onCopyApiName={handleCopyApiName}
              t={t}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
};
