import React from 'react';
import { Files, Search, Upload } from 'lucide-react';
import { useI18n } from '@/contexts/I18nContext';

interface LibraryEmptyStateProps {
  isFiltered: boolean;
  onClearFilters: () => void;
  onUploadClick: () => void;
}

export const LibraryEmptyState: React.FC<LibraryEmptyStateProps> = ({ isFiltered, onClearFilters, onUploadClick }) => {
  const { t } = useI18n();

  return (
    <div className="min-h-full flex items-center justify-center p-4 sm:p-8">
      <div className="w-full max-w-lg flex flex-col items-center justify-center text-center px-5 py-8 sm:p-12 border border-dashed border-[var(--theme-border-secondary)] rounded-2xl bg-[var(--theme-bg-secondary)]/30">
        <div className="w-14 h-14 rounded-2xl bg-[var(--theme-bg-tertiary)] flex items-center justify-center text-[var(--theme-text-tertiary)] mb-4">
          {isFiltered ? <Search size={28} strokeWidth={1.8} /> : <Files size={28} strokeWidth={1.8} />}
        </div>
        <h3 className="text-base sm:text-lg font-semibold text-[var(--theme-text-primary)] mb-2">
          {t(isFiltered ? 'libraryEmptyTitle' : 'libraryFirstFileTitle')}
        </h3>
        <p className="text-xs sm:text-sm text-[var(--theme-text-tertiary)] max-w-sm mb-6 leading-relaxed">
          {t(isFiltered ? 'libraryFilteredEmptyDesc' : 'libraryEmptyDesc')}
        </p>
        <div className="flex flex-wrap items-center justify-center gap-3">
          {isFiltered ? (
            <button
              onClick={onClearFilters}
              className="min-h-10 px-4 py-2 text-sm font-medium rounded-xl bg-[var(--theme-text-primary)] text-[var(--theme-bg-primary)] hover:opacity-90 transition-opacity focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--theme-border-focus)]"
            >
              {t('libraryClearFilters')}
            </button>
          ) : null}
          <button
            onClick={onUploadClick}
            className={`min-h-10 flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-xl transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--theme-border-focus)] ${isFiltered ? 'border border-[var(--theme-border-primary)] text-[var(--theme-text-primary)] hover:bg-[var(--theme-bg-tertiary)]' : 'bg-[var(--theme-text-primary)] text-[var(--theme-bg-primary)] hover:opacity-90'}`}
          >
            <Upload size={15} strokeWidth={2} />
            <span>{t('libraryUpload')}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
