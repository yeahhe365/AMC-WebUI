import React from 'react';
import { Square, Trash2, Check, Loader2, X, Pause, Play, RotateCcw } from 'lucide-react';
import { type RecorderState } from '@/features/audio/useAudioRecorder';
import { useI18n } from '@/contexts/I18nContext';

interface RecorderControlsProps {
  viewState: RecorderState;
  isSaving: boolean;
  isPaused: boolean;
  onStop: () => void;
  onCancel: () => void;
  onDiscard: () => void;
  onSave: () => void;
  onPause: () => void;
  onResume: () => void;
  onRerecord: () => void;
}

const ICON_BUTTON_CLASS =
  'w-11 h-11 flex items-center justify-center rounded-lg bg-[var(--theme-bg-tertiary)]/45 text-[var(--theme-text-secondary)] hover:bg-[var(--theme-bg-tertiary)] hover:text-[var(--theme-text-primary)] transition-colors';

export const RecorderControls: React.FC<RecorderControlsProps> = ({
  viewState,
  isSaving,
  isPaused,
  onStop,
  onCancel,
  onDiscard,
  onSave,
  onPause,
  onResume,
  onRerecord,
}) => {
  const { t } = useI18n();

  // The idle state restarts recording from the source list above, so it needs
  // no footer actions of its own.
  if (viewState === 'idle') {
    return null;
  }

  return (
    <div className="px-5 py-4 bg-[var(--theme-bg-primary)] flex justify-center gap-3">
      {viewState === 'recording' && (
        <>
          <button
            onClick={onCancel}
            className={ICON_BUTTON_CLASS}
            title={t('audioRecorderCancelRecording')}
            aria-label={t('audioRecorderCancelRecording')}
          >
            <X size={20} />
          </button>

          <button
            onClick={isPaused ? onResume : onPause}
            className={ICON_BUTTON_CLASS}
            title={isPaused ? t('audioRecorderResume') : t('audioRecorderPause')}
            aria-label={isPaused ? t('audioRecorderResume') : t('audioRecorderPause')}
          >
            {isPaused ? <Play size={18} fill="currentColor" /> : <Pause size={18} fill="currentColor" />}
          </button>

          <button
            onClick={onStop}
            className="h-11 px-5 flex items-center justify-center gap-2 rounded-lg bg-red-500 hover:bg-red-600 text-white shadow-sm transition-colors"
            title={t('audioRecorderStopRecording')}
            aria-label={t('audioRecorderStopRecording')}
          >
            <Square size={18} fill="currentColor" />
            <span className="text-sm font-medium">{t('audioRecorderStopRecording')}</span>
          </button>
        </>
      )}

      {viewState === 'review' && (
        <>
          <button
            onClick={onDiscard}
            disabled={isSaving}
            className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-[var(--theme-bg-tertiary)]/45 text-[var(--theme-text-danger)] hover:bg-red-50 dark:hover:bg-red-900/10 transition-colors disabled:opacity-50"
          >
            <Trash2 size={18} />
            {t('audioRecorderDiscard')}
          </button>
          <button
            onClick={onRerecord}
            disabled={isSaving}
            className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-[var(--theme-bg-tertiary)]/45 text-[var(--theme-text-secondary)] hover:bg-[var(--theme-bg-tertiary)] hover:text-[var(--theme-text-primary)] transition-colors disabled:opacity-50"
          >
            <RotateCcw size={18} />
            {t('audioRecorderRerecord')}
          </button>
          <button
            onClick={onSave}
            disabled={isSaving}
            className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-[var(--theme-bg-accent)] text-[var(--theme-text-accent)] hover:bg-[var(--theme-bg-accent-hover)] font-medium shadow-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSaving ? <Loader2 size={18} className="animate-spin" /> : <Check size={18} />}
            {isSaving ? t('audioRecorderSaving') : t('audioRecorderSaveRecording')}
          </button>
        </>
      )}
    </div>
  );
};
