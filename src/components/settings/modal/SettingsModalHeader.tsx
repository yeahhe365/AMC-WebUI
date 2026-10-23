import React from 'react';
import { useI18n } from '@/contexts/I18nContext';
import { interpolate } from '@/i18n/interpolate';
import { X } from 'lucide-react';
import { MODAL_CLOSE_BUTTON_CLASS } from '@/constants/buttonClasses';
import type { SettingsTab } from '@/stores/settingsUiStore';

interface SettingsModalHeaderProps {
  activeTab: SettingsTab;
  activeTabLabelKey?: string;
  isSearching: boolean;
  searchResultsCount: number;
  onClose: () => void;
}

export const SettingsModalHeader: React.FC<SettingsModalHeaderProps> = ({
  activeTab: _activeTab,
  activeTabLabelKey,
  isSearching,
  searchResultsCount,
  onClose,
}) => {
  const { t } = useI18n();

  return (
    <div
      className={`${isSearching ? 'flex' : 'hidden md:flex'} w-full shrink-0 items-center border-b border-[var(--theme-border-secondary)]/40 px-4 py-3 md:h-16 md:px-8 bg-[var(--theme-bg-primary)]`}
    >
      <div className="flex items-center justify-between gap-3 w-full">
        <h2
          className={`${isSearching ? 'block' : 'hidden md:block'} text-xl font-semibold text-[var(--theme-text-primary)] min-w-0 truncate`}
        >
          {isSearching ? t('settingsSearchResultsTitle') : activeTabLabelKey ? t(activeTabLabelKey) : ''}
        </h2>
        {isSearching && (
          <span
            data-settings-search-count
            className="md:hidden flex-shrink-0 text-xs font-medium text-[var(--theme-text-secondary)]"
          >
            {interpolate(t('settingsSearchResultsCount'), { count: searchResultsCount })}
          </span>
        )}
        <div className="flex items-center gap-2 sm:gap-3 ml-auto">
          <button
            type="button"
            onClick={onClose}
            className={`${MODAL_CLOSE_BUTTON_CLASS} hidden md:inline-flex`}
            aria-label={t('close')}
          >
            <X size={18} strokeWidth={2} />
          </button>
        </div>
      </div>
    </div>
  );
};
