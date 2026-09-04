import React from 'react';
import { useI18n } from '@/contexts/I18nContext';
import { ChevronDown } from 'lucide-react';
import { GoogleSpinner } from '@/components/icons/GoogleSpinner';
import { ThinkingTimer } from '@/components/message/ThinkingTimer';
import { formatDuration } from '@/utils/durationFormat';
import { interpolate } from '@/i18n/interpolate';

interface ThinkingHeaderProps {
  isLoading: boolean;
  thinkingTimeMs?: number;
  generationStartTime?: Date;
  firstTokenTimeMs?: number;
  isExpanded: boolean;
}

export const ThinkingHeader: React.FC<ThinkingHeaderProps> = ({
  isLoading,
  thinkingTimeMs,
  generationStartTime,
  firstTokenTimeMs,
  isExpanded,
}) => {
  const { t } = useI18n();
  const timeToFirstTokenMs = firstTokenTimeMs ?? 0;
  const effectiveTimerStartMs = generationStartTime
    ? new Date(generationStartTime).getTime() + timeToFirstTokenMs
    : null;

  const finalThinkingDurationMs = thinkingTimeMs !== undefined ? Math.max(0, thinkingTimeMs - timeToFirstTokenMs) : 0;
  const hasSettledThinking = thinkingTimeMs !== undefined;

  return (
    <div className="flex items-center gap-2 min-w-0 overflow-hidden flex-grow">
      {isLoading && (
        <div className="flex items-center justify-center flex-shrink-0">
          <GoogleSpinner size={14} />
        </div>
      )}

      <div className="flex items-center gap-2 min-w-0">
        <div className="flex flex-col min-w-0 justify-center min-h-[1.75rem] sm:min-h-[2rem]">
          {hasSettledThinking ? (
            <div className="flex items-baseline gap-2 min-w-0">
              <span className="flex items-center gap-1.5 text-base text-[var(--theme-text-secondary)] font-medium truncate opacity-90">
                {interpolate(t('thinkingTookTime'), {
                  duration: formatDuration(Math.round(finalThinkingDurationMs / 1000)),
                })}
              </span>
              {firstTokenTimeMs !== undefined && firstTokenTimeMs > 0 && (
                <span className="text-xs text-[var(--theme-text-tertiary)] font-mono opacity-70 whitespace-nowrap">
                  {t('metricsTtft')}: {(firstTokenTimeMs / 1000).toFixed(2)}s
                </span>
              )}
            </div>
          ) : isLoading ? (
            <div className="flex items-baseline gap-2 min-w-0">
              <span className="text-base font-bold uppercase tracking-wider text-[var(--theme-text-secondary)] truncate opacity-90">
                {t('thinkingText')}
              </span>
              {effectiveTimerStartMs !== null && (
                <span className="text-sm text-[var(--theme-text-tertiary)] truncate font-mono">
                  <ThinkingTimer startTimeMs={effectiveTimerStartMs} />
                </span>
              )}
            </div>
          ) : (
            <div className="flex items-baseline gap-2 min-w-0">
              <span className="flex items-center gap-1.5 text-base text-[var(--theme-text-secondary)] font-medium truncate opacity-90">
                {t('thinkingProcess')}
              </span>
            </div>
          )}
        </div>

        <div className="flex items-center justify-center w-5 h-5 rounded-full hover:bg-[var(--theme-bg-input)] transition-colors flex-shrink-0">
          <ChevronDown
            size={14}
            className={`text-[var(--theme-text-tertiary)] transition-transform duration-300 ${isExpanded ? 'rotate-180' : ''}`}
            strokeWidth={2.5}
          />
        </div>
      </div>
    </div>
  );
};
