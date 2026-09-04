import React from 'react';
import { Mic, Activity, X } from 'lucide-react';
import { useI18n } from '@/contexts/I18nContext';

interface LiveStatusBannerProps {
  isConnected: boolean;
  isSpeaking: boolean;
  isReconnecting: boolean;
  volume: number;
  onDisconnect: () => void;
  error: string | null;
}

const LiveStatusBannerComponent: React.FC<LiveStatusBannerProps> = ({
  isConnected,
  isSpeaking,
  isReconnecting,
  volume,
  onDisconnect,
  error,
}) => {
  const { t } = useI18n();

  if (isReconnecting) {
    return (
      <div className="flex items-center justify-between p-2 mb-2 bg-[var(--theme-bg-accent)]/10 border border-[var(--theme-bg-accent)]/20 rounded-xl animate-in fade-in slide-in-from-bottom-2">
        <div className="flex items-center gap-3 pl-2 min-w-0">
          <div className="relative flex items-center justify-center w-8 h-8 rounded-full bg-[var(--theme-bg-secondary)] text-[var(--theme-text-link)]">
            <Activity size={16} className="animate-pulse" />
          </div>

          <div className="flex flex-col min-w-0">
            <span className="text-xs font-bold text-[var(--theme-text-primary)]">
              {error || t('liveStatusRefreshing')}
            </span>
            <span className="text-xs text-[var(--theme-text-secondary)] truncate">
              {t('liveStatusReconnectingAutomatically')}
            </span>
          </div>
        </div>

        <button
          onClick={onDisconnect}
          className="px-3 py-1.5 text-xs font-medium bg-[var(--theme-bg-input)] hover:bg-[var(--theme-bg-danger)]/10 text-[var(--theme-text-secondary)] hover:text-[var(--theme-text-danger)] border border-[var(--theme-border-secondary)] rounded-lg transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--theme-border-focus)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--theme-bg-accent)]/10"
        >
          {t('liveStatusEndCall')}
        </button>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-between p-3 mb-2 bg-[var(--theme-bg-danger)]/10 border border-[var(--theme-bg-danger)]/20 rounded-xl text-[var(--theme-text-danger)] animate-in fade-in slide-in-from-bottom-2">
        <span className="text-xs font-medium truncate">{error}</span>
        <button
          onClick={onDisconnect}
          className="p-1 hover:bg-[var(--theme-bg-danger)]/20 rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--theme-border-focus)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--theme-bg-danger)]/10"
        >
          <X size={14} />
        </button>
      </div>
    );
  }

  if (!isConnected) return null;

  return (
    <div className="flex items-center justify-between p-2 mb-2 bg-[var(--theme-bg-accent)]/10 border border-[var(--theme-bg-accent)]/20 rounded-xl animate-in fade-in slide-in-from-bottom-2">
      <div className="flex items-center gap-3 pl-2 min-w-0">
        <div
          className={`relative flex items-center justify-center w-8 h-8 rounded-full ${isSpeaking ? 'bg-[var(--theme-bg-accent)] text-[var(--theme-text-accent)]' : 'bg-[var(--theme-bg-secondary)] text-[var(--theme-text-primary)]'}`}
        >
          {isSpeaking ? (
            <Activity size={16} className="animate-pulse" />
          ) : (
            <Mic size={16} className={volume > 0.05 ? 'animate-pulse' : ''} />
          )}
          <div
            className="absolute inset-0 rounded-full border-2 border-current opacity-30 transition-transform duration-75"
            style={{ transform: `scale(${1 + Math.min(volume * 2, 0.5)})` }}
          />
        </div>

        <div className="flex flex-col min-w-0">
          <span className="text-xs font-bold text-[var(--theme-text-primary)]">
            {isSpeaking ? t('liveStatusSpeaking') : t('liveStatusListening')}
          </span>
          <span className="text-xs text-[var(--theme-text-secondary)] truncate">{t('liveStatusActiveHint')}</span>
        </div>
      </div>

      <button
        onClick={onDisconnect}
        className="px-3 py-1.5 text-xs font-medium bg-[var(--theme-bg-input)] hover:bg-[var(--theme-bg-danger)]/10 text-[var(--theme-text-secondary)] hover:text-[var(--theme-text-danger)] border border-[var(--theme-border-secondary)] rounded-lg transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--theme-border-focus)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--theme-bg-accent)]/10"
      >
        {t('liveStatusEndCall')}
      </button>
    </div>
  );
};

export const LiveStatusBanner = React.memo(LiveStatusBannerComponent);
