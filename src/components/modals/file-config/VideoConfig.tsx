import React from 'react';
import { useI18n } from '@/contexts/I18nContext';
import { Clock, MonitorPlay, Info } from 'lucide-react';

interface VideoConfigProps {
  startOffset: string;
  setStartOffset: (startOffset: string) => void;
  /** Normalizes the raw input back into the field on blur (e.g. "01:15" → "75s"). */
  setStartOffsetBlur?: (startOffset: string) => void;
  startOffsetError?: string;
  endOffset: string;
  setEndOffset: (endOffset: string) => void;
  setEndOffsetBlur?: (endOffset: string) => void;
  endOffsetError?: string;
  fps: string;
  setFps: (fps: string) => void;
  setFpsBlur?: (fps: string) => void;
  fpsError?: string;
}

const FIELD_INPUT_CLASS =
  'w-full bg-[var(--theme-bg-input)] border border-[var(--theme-border-secondary)] rounded-lg pl-9 pr-3 py-2 text-sm text-[var(--theme-text-primary)] focus:ring-2 focus:ring-[var(--theme-border-focus)] outline-none';

export const VideoConfig: React.FC<VideoConfigProps> = ({
  startOffset,
  setStartOffset,
  setStartOffsetBlur,
  startOffsetError,
  endOffset,
  setEndOffset,
  setEndOffsetBlur,
  endOffsetError,
  fps,
  setFps,
  setFpsBlur,
  fpsError,
}) => {
  const { t } = useI18n();
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <label className="text-xs font-bold uppercase text-[var(--theme-text-tertiary)]">
            {t('videoSettingsStart')}
          </label>
          <div className="relative">
            <Clock size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--theme-text-tertiary)]" />
            <input
              type="text"
              value={startOffset}
              onChange={(event) => setStartOffset(event.target.value)}
              onBlur={(event) => setStartOffsetBlur?.(event.target.value)}
              aria-invalid={Boolean(startOffsetError)}
              placeholder={t('videoSettingsPlaceholder')}
              className={`${FIELD_INPUT_CLASS} ${startOffsetError ? 'border-[var(--theme-text-danger)]' : ''}`}
            />
          </div>
          {startOffsetError && (
            <p role="alert" className="text-xs text-[var(--theme-text-danger)]">
              {startOffsetError}
            </p>
          )}
        </div>
        <div className="space-y-2">
          <label className="text-xs font-bold uppercase text-[var(--theme-text-tertiary)]">
            {t('videoSettingsEnd')}
          </label>
          <div className="relative">
            <Clock size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--theme-text-tertiary)]" />
            <input
              type="text"
              value={endOffset}
              onChange={(event) => setEndOffset(event.target.value)}
              onBlur={(event) => setEndOffsetBlur?.(event.target.value)}
              aria-invalid={Boolean(endOffsetError)}
              placeholder={t('videoSettingsPlaceholder')}
              className={`${FIELD_INPUT_CLASS} ${endOffsetError ? 'border-[var(--theme-text-danger)]' : ''}`}
            />
          </div>
          {endOffsetError && (
            <p role="alert" className="text-xs text-[var(--theme-text-danger)]">
              {endOffsetError}
            </p>
          )}
        </div>
      </div>

      <div className="space-y-2">
        <label className="text-xs font-bold uppercase text-[var(--theme-text-tertiary)]">{t('videoSettingsFps')}</label>
        <div className="relative">
          <MonitorPlay
            size={14}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--theme-text-tertiary)]"
          />
          <input
            type="number"
            min="0"
            max="24"
            step="0.1"
            value={fps}
            onChange={(event) => setFps(event.target.value)}
            onBlur={(event) => setFpsBlur?.(event.target.value)}
            aria-invalid={Boolean(fpsError)}
            placeholder={t('videoSettingsFpsPlaceholder')}
            className={`${FIELD_INPUT_CLASS} ${fpsError ? 'border-[var(--theme-text-danger)]' : ''}`}
          />
        </div>
        {fpsError && (
          <p role="alert" className="text-xs text-[var(--theme-text-danger)]">
            {fpsError}
          </p>
        )}
      </div>

      <div className="space-y-3 bg-[var(--theme-bg-tertiary)]/30 p-4 rounded-lg border border-[var(--theme-border-secondary)]/30">
        <div className="flex items-start gap-2.5 text-xs text-[var(--theme-text-secondary)]">
          <Info size={14} className="flex-shrink-0 mt-0.5 text-[var(--theme-text-link)]" />
          <div className="space-y-2">
            <p className="leading-relaxed">{t('videoSettingsTipFps')}</p>
            <p className="leading-relaxed opacity-90">{t('videoSettingsTipTimestamp')}</p>
          </div>
        </div>
      </div>
    </div>
  );
};
