import React from 'react';
import { Loader2, PencilLine } from 'lucide-react';
import { type ChatMessage } from '@/types';
import { PerformanceMetrics } from '@/components/message/PerformanceMetrics';
import { AudioPlayer } from '@/components/shared/AudioPlayer';
import { useI18n } from '@/contexts/I18nContext';
import { useSettingsStore } from '@/stores/settingsStore';

interface MessageFooterProps {
  message: ChatMessage;
  onSuggestionClick?: (suggestion: string) => void;
  onSuggestionFill?: (suggestion: string) => void;
}

export const MessageFooter: React.FC<MessageFooterProps> = ({ message, onSuggestionClick, onSuggestionFill }) => {
  const { t } = useI18n();
  const showTokenStats = useSettingsStore((state) => state.appSettings.showMessageTokenStats ?? true);
  const { audioSrc, audioAutoplay, suggestions, isGeneratingSuggestions, role, generationStartTime } = message;

  return (
    <>
      {audioSrc && (
        <div className="mt-2 animate-in fade-in slide-in-from-bottom-1 duration-300">
          <AudioPlayer src={audioSrc} autoPlay={audioAutoplay ?? false} />
        </div>
      )}

      {showTokenStats &&
        (role === 'model' ||
          (role === 'error' && generationStartTime) ||
          (role === 'user' && Boolean(message.promptTokens || message.totalTokens))) && (
          <PerformanceMetrics message={message} hideTimer={message.isLoading} />
        )}

      {suggestions && suggestions.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2 animate-in fade-in slide-in-from-bottom-1 duration-300">
          {suggestions.map((suggestion, index) => (
            <div key={index} className="group/suggestion relative -mt-3 pt-3">
              {onSuggestionFill && (
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    onSuggestionFill(suggestion);
                  }}
                  className="
                                    absolute right-1 top-0 z-10 p-1 rounded-full
                                    border border-[var(--theme-border-secondary)]
                                    bg-[var(--theme-bg-primary)]/95
                                    text-[var(--theme-text-secondary)] hover:text-[var(--theme-text-link)]
                                    shadow-md
                                    opacity-0 pointer-events-none
                                    transition-all duration-200 ease-out
                                    group-hover/suggestion:opacity-100 group-hover/suggestion:pointer-events-auto
                                    group-focus-within/suggestion:opacity-100 group-focus-within/suggestion:pointer-events-auto
                                    focus:opacity-100 focus:pointer-events-auto focus:outline-none focus:ring-2 focus:ring-[var(--theme-border-focus)]
                                "
                  aria-label={t('suggestionFillInput')}
                  title={t('suggestionFillInput')}
                >
                  <PencilLine size={12} strokeWidth={2} />
                </button>
              )}

              <button
                type="button"
                onClick={() => onSuggestionClick && onSuggestionClick(suggestion)}
                className="
                                    relative
                                    text-xs sm:text-sm font-medium
                                    px-3 py-2 sm:px-3.5 sm:py-2 rounded-xl
                                    border border-[var(--theme-border-secondary)]
                                    bg-[var(--theme-bg-tertiary)]/20
                                    hover:bg-[var(--theme-bg-tertiary)]
                                    hover:border-[var(--theme-border-focus)]
                                    text-[var(--theme-text-secondary)] hover:text-[var(--theme-text-link)]
                                    transition-all duration-200 ease-out
                                    text-left shadow-sm hover:shadow-md
                                "
              >
                <span className="line-clamp-2">{suggestion}</span>
              </button>
            </div>
          ))}
        </div>
      )}

      {isGeneratingSuggestions && (
        <div className="mt-3 flex items-center gap-2 text-xs text-[var(--theme-text-tertiary)] animate-pulse opacity-70 px-1">
          <Loader2 size={12} className="animate-spin" strokeWidth={1.5} />
          <span>{t('generatingSuggestions')}</span>
        </div>
      )}
    </>
  );
};
