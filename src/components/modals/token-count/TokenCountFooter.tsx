import React from 'react';
import { useI18n } from '@/contexts/I18nContext';
import { Loader2, Trash2, RefreshCw } from 'lucide-react';
import { SETTINGS_PRIMARY_ACTION_BUTTON_CLASS } from '@/constants/buttonClasses';

interface TokenCountFooterProps {
  tokenCount: number | null;
  videoTokenEstimate?: number | null;
  isLoading: boolean;
  hasContent: boolean;
  onClear: () => void;
  onCalculate: () => void;
}

export const TokenCountFooter: React.FC<TokenCountFooterProps> = ({
  tokenCount,
  videoTokenEstimate,
  isLoading,
  hasContent,
  onClear,
  onCalculate,
}) => {
  const { t } = useI18n();
  return (
    <div className="p-4 border-t border-[var(--theme-border-secondary)] bg-[var(--theme-bg-secondary)]/30 flex items-center justify-between">
      <div className="flex items-center gap-2">
        {tokenCount !== null ? (
          <div className="flex flex-col animate-in fade-in slide-in-from-bottom-2">
            <span className="text-xs text-[var(--theme-text-tertiary)] font-medium uppercase tracking-wide">
              {t('tokenModalEstimatedTokens')}
            </span>
            <span className="text-lg font-semibold text-[var(--theme-text-primary)] font-mono tabular-nums">
              {tokenCount.toLocaleString()}{' '}
              <span className="text-sm font-sans font-normal text-[var(--theme-text-secondary)]">
                {t('tokensUnit')}
              </span>
            </span>
            {videoTokenEstimate ? (
              <span className="text-xs text-[var(--theme-text-tertiary)] mt-0.5">
                {t('tokenModalVideoEstimate')}: {videoTokenEstimate.toLocaleString()}
              </span>
            ) : null}
          </div>
        ) : videoTokenEstimate ? (
          <div className="flex flex-col animate-in fade-in slide-in-from-bottom-2">
            <span className="text-xs text-[var(--theme-text-tertiary)] font-medium uppercase tracking-wide">
              {t('tokenModalVideoEstimate')}
            </span>
            <span className="text-lg font-semibold text-[var(--theme-text-primary)] font-mono tabular-nums">
              {videoTokenEstimate.toLocaleString()}{' '}
              <span className="text-sm font-sans font-normal text-[var(--theme-text-secondary)]">
                {t('tokensUnit')}
              </span>
            </span>
          </div>
        ) : (
          <span className="text-sm text-[var(--theme-text-tertiary)] italic">{t('tokenModalReady')}</span>
        )}
      </div>

      <div className="flex gap-3">
        <button
          onClick={onClear}
          className="px-4 py-2 text-sm font-medium text-[var(--theme-text-secondary)] hover:text-[var(--theme-text-primary)] hover:bg-[var(--theme-bg-tertiary)] rounded-lg transition-colors flex items-center gap-2"
          title={t('tokenModalClearAll')}
        >
          <Trash2 size={16} /> <span className="hidden sm:inline">{t('tokenModalClear')}</span>
        </button>
        <button
          onClick={onCalculate}
          disabled={isLoading || !hasContent}
          className={SETTINGS_PRIMARY_ACTION_BUTTON_CLASS}
        >
          {isLoading ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
          {t('tokenModalCount')}
        </button>
      </div>
    </div>
  );
};
