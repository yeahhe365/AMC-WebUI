import React from 'react';
import { useI18n } from '@/contexts/I18nContext';
import { Clock, MonitorPlay, Info, CheckCircle2, RotateCcw, Zap } from 'lucide-react';
import { interpolate } from '@/i18n/interpolate';
import { formatTimestamp } from '@/utils/media-nav/timestamp';

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
  onResetOffsets?: () => void;
  startSeconds?: number | null;
  endSeconds?: number | null;
  perFrameTokens?: number;
}

const FIELD_INPUT_CLASS =
  'w-full bg-[var(--theme-bg-input)] border border-[var(--theme-border-secondary)] rounded-lg pl-9 pr-3 py-2 text-sm text-[var(--theme-text-primary)] focus:ring-2 focus:ring-[var(--theme-border-focus)] outline-none';

const FPS_PRESETS = [
  { value: '0.2', labelKey: 'videoSettingsFpsPresetLecture' },
  { value: '0.5', labelKey: 'videoSettingsFpsPresetMeeting' },
  { value: '1', labelKey: 'videoSettingsFpsPresetDefault' },
  { value: '2', labelKey: 'videoSettingsFpsPresetSmooth' },
  { value: '5', labelKey: 'videoSettingsFpsPresetAction' },
] as const;

const formatDisplayDuration = (seconds: number): string => formatTimestamp(Math.round(seconds));

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
  onResetOffsets,
  startSeconds = null,
  endSeconds = null,
  perFrameTokens = 70,
}) => {
  const { t } = useI18n();

  const isPresetActive = (presetValue: string) => {
    const current = Number(fps.trim());
    const target = Number(presetValue);
    return Number.isFinite(current) && current === target;
  };

  const hasClippedRange = startSeconds !== null && endSeconds !== null && endSeconds > startSeconds;
  const clippedDuration = hasClippedRange ? endSeconds - startSeconds : null;

  const effectiveFps = (() => {
    const parsed = Number(fps.trim());
    return Number.isFinite(parsed) && parsed > 0 && parsed <= 24 ? parsed : 1;
  })();

  const estimatedTokens = clippedDuration !== null ? Math.ceil(clippedDuration * effectiveFps) * perFrameTokens : null;
  const estimatedFrames = clippedDuration !== null ? Math.ceil(clippedDuration * effectiveFps) : null;
  const tokensPerSec = Math.round(effectiveFps * perFrameTokens);

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
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
          <div className="space-y-1.5">
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

        {(startOffset.trim() || endOffset.trim()) && !startOffsetError && !endOffsetError && (
          <div className="flex items-center justify-between text-xs px-2.5 py-1.5 rounded-lg bg-[var(--theme-bg-tertiary)]/60 border border-[var(--theme-border-secondary)]/50 text-[var(--theme-text-secondary)] mt-2">
            <span className="flex items-center gap-1.5 font-medium text-[var(--theme-text-primary)]">
              {hasClippedRange ? (
                <>
                  <CheckCircle2 size={13} className="text-emerald-500 flex-shrink-0" />
                  <span>
                    {interpolate(t('videoSettingsDurationClipped'), {
                      duration: formatDisplayDuration(clippedDuration!),
                      seconds: Math.round(clippedDuration!),
                    })}
                  </span>
                </>
              ) : startSeconds !== null ? (
                <>
                  <Clock size={13} className="text-[var(--theme-text-tertiary)] flex-shrink-0" />
                  <span>
                    {interpolate(t('videoSettingsDurationFromStart'), {
                      start: startOffset.trim(),
                    })}
                  </span>
                </>
              ) : (
                <>
                  <Clock size={13} className="text-[var(--theme-text-tertiary)] flex-shrink-0" />
                  <span>
                    {interpolate(t('videoSettingsDurationUntilEnd'), {
                      end: endOffset.trim(),
                    })}
                  </span>
                </>
              )}
            </span>
            {onResetOffsets && (
              <button
                type="button"
                onClick={onResetOffsets}
                className="text-xs text-[var(--theme-text-link)] hover:underline flex items-center gap-1 flex-shrink-0 ml-2 cursor-pointer"
              >
                <RotateCcw size={11} />
                {t('videoSettingsResetClip')}
              </button>
            )}
          </div>
        )}
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className="text-xs font-bold uppercase text-[var(--theme-text-tertiary)]">
            {t('videoSettingsFps')}
          </label>
          <span className="text-[11px] text-[var(--theme-text-tertiary)]">0.1 - 24.0</span>
        </div>
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

        <div className="flex flex-wrap items-center gap-1.5 pt-1">
          {FPS_PRESETS.map((preset) => {
            const active = isPresetActive(preset.value);
            return (
              <button
                key={preset.value}
                type="button"
                onClick={() => {
                  setFps(preset.value);
                  setFpsBlur?.(preset.value);
                }}
                className={`px-2 py-1 text-xs rounded-md transition-colors border cursor-pointer ${
                  active
                    ? 'bg-[var(--theme-bg-accent)] text-[var(--theme-text-accent)] border-[var(--theme-bg-accent)] font-medium shadow-xs'
                    : 'bg-[var(--theme-bg-secondary)] hover:bg-[var(--theme-bg-tertiary)] text-[var(--theme-text-secondary)] border-[var(--theme-border-secondary)]'
                }`}
              >
                {t(preset.labelKey)}
              </button>
            );
          })}
        </div>
      </div>

      {!fpsError && (
        <div className="p-3 rounded-lg bg-[var(--theme-bg-tertiary)]/40 border border-[var(--theme-border-secondary)]/50">
          <div className="flex items-center gap-2 text-xs">
            <Zap size={14} className="text-amber-500 flex-shrink-0" />
            <span className="text-[var(--theme-text-secondary)] font-medium">
              {estimatedTokens !== null && estimatedFrames !== null
                ? interpolate(t('videoSettingsTokenLiveEstimate'), {
                    tokens: estimatedTokens.toLocaleString(),
                    frames: estimatedFrames,
                    perFrame: perFrameTokens,
                  })
                : interpolate(t('videoSettingsTokenLiveEstimateUnknownDuration'), {
                    tokensPerSec,
                    fps: effectiveFps,
                    perFrame: perFrameTokens,
                  })}
            </span>
          </div>
        </div>
      )}

      <div className="bg-[var(--theme-bg-tertiary)]/30 px-3.5 py-2.5 rounded-lg border border-[var(--theme-border-secondary)]/30 text-xs text-[var(--theme-text-secondary)] flex items-start gap-2">
        <Info size={14} className="flex-shrink-0 mt-0.5 text-[var(--theme-text-link)]" />
        <p className="leading-relaxed text-[11px] opacity-90">{t('videoSettingsTipTimestamp')}</p>
      </div>
    </div>
  );
};
