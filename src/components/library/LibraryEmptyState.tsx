import React from 'react';
import { Search, Upload } from 'lucide-react';
import { useI18n } from '@/contexts/I18nContext';

interface LibraryEmptyStateProps {
  isFiltered: boolean;
  onClearFilters: () => void;
  onUploadClick: () => void;
}

export const LibraryEmptyState: React.FC<LibraryEmptyStateProps> = ({ isFiltered, onClearFilters, onUploadClick }) => {
  const { t } = useI18n();

  return (
    <div className="flex-1 flex items-center justify-center p-6 sm:p-12">
      <div className="w-full max-w-xl flex flex-col items-center justify-center text-center p-10 sm:p-14 border border-dashed border-[var(--theme-border-secondary)] rounded-3xl bg-[var(--theme-bg-secondary)]/50">
        <div className="w-14 h-14 rounded-2xl bg-[var(--theme-bg-tertiary)] flex items-center justify-center text-[var(--theme-text-tertiary)] mb-4">
          <Search size={28} strokeWidth={1.8} />
        </div>
        <h3 className="text-base sm:text-lg font-semibold text-[var(--theme-text-primary)] mb-2">
          {t('libraryEmptyTitle')}
        </h3>
        <p className="text-xs sm:text-sm text-[var(--theme-text-tertiary)] max-w-sm mb-6 leading-relaxed">
          {t('libraryEmptyDesc')}
        </p>
        <div className="flex items-center gap-3">
          {isFiltered ? (
            <button
              onClick={onClearFilters}
              className="px-4 py-2 text-xs sm:text-sm font-medium rounded-full border border-[var(--theme-border-primary)] text-[var(--theme-text-primary)] hover:bg-[var(--theme-bg-tertiary)] transition-colors"
            >
              {t('libraryShowAllFileTypes')}
            </button>
          ) : null}
          <button
            onClick={onUploadClick}
            className="flex items-center gap-2 px-4 py-2 text-xs sm:text-sm font-medium rounded-full bg-[var(--theme-text-primary)] text-[var(--theme-bg-primary)] hover:opacity-90 transition-opacity"
          >
            <Upload size={15} strokeWidth={2} />
            <span>{t('libraryUpload')}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
