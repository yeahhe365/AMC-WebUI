import React from 'react';
import { useI18n } from '@/contexts/I18nContext';
import { SETTINGS_OUTLINE_BUTTON_CLASS, SETTINGS_PRIMARY_ACTION_BUTTON_CLASS } from '@/constants/buttonClasses';
import { Z_INDEX_TOAST_VIEWPORT } from '@/constants/layout';

interface PwaUpdateBannerProps {
  onRefresh: () => void;
  onDismiss: () => void;
}

export const PwaUpdateBanner: React.FC<PwaUpdateBannerProps> = ({ onRefresh, onDismiss }) => {
  const { t } = useI18n();

  return (
    <div
      role="status"
      className={`fixed bottom-4 left-4 right-4 mx-auto max-w-xl rounded-xl border border-[var(--theme-border-secondary)] bg-[var(--theme-bg-primary)] px-4 py-3 text-[var(--theme-text-primary)] ${Z_INDEX_TOAST_VIEWPORT}`}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="text-sm font-medium">{t('aboutUpdateReady')}</p>
          <p className="text-xs text-[var(--theme-text-secondary)]">{t('pwaUpdateRefreshPrompt')}</p>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={onDismiss} className={SETTINGS_OUTLINE_BUTTON_CLASS}>
            {t('pwaUpdateLater')}
          </button>
          <button type="button" onClick={onRefresh} className={SETTINGS_PRIMARY_ACTION_BUTTON_CLASS}>
            {t('refresh')}
          </button>
        </div>
      </div>
    </div>
  );
};
