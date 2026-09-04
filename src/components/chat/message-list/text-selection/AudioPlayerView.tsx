import React, { useState, type RefObject } from 'react';
import { GripVertical, X, Pause, Play } from 'lucide-react';
import { useI18n } from '@/contexts/I18nContext';
import { GoogleSpinner } from '@/components/icons/GoogleSpinner';
import { formatClockTime } from '@/utils/formatClockTime';

interface AudioPlayerViewProps {
  audioUrl: string | null;
  isLoading: boolean;
  audioRef: RefObject<HTMLAudioElement>;
  onDragStart: (e: React.MouseEvent) => void;
  onClose: (e: React.MouseEvent) => void;
}

const LOADING_SHELL_CLASS =
  'flex h-11 items-center gap-2.5 rounded-full border border-[var(--theme-border-secondary)] bg-[var(--theme-bg-primary)] px-3 py-1.5 text-xs font-medium text-[var(--theme-text-primary)] shadow-premium';

const PLAYER_SHELL_CLASS =
  'flex h-11 w-[min(24rem,calc(100vw-1rem))] items-center gap-2 rounded-full border border-[var(--theme-border-secondary)] bg-[var(--theme-bg-primary)] py-1.5 pl-1.5 pr-2 shadow-premium';

export const AudioPlayerView: React.FC<AudioPlayerViewProps> = ({
  audioUrl,
  isLoading,
  audioRef,
  onDragStart,
  onClose,
}) => {
  const { t } = useI18n();
  const [isPlaying, setIsPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const showPlayer = Boolean(audioUrl) && !isLoading;

  const progressPercent =
    duration > 0 && Number.isFinite(duration) ? Math.min(100, Math.max(0, (currentTime / duration) * 100)) : 0;

  const togglePlayback = () => {
    const audio = audioRef.current;
    if (!audio) return;

    if (audio.paused) {
      void audio.play();
    } else {
      audio.pause();
    }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const nextTime = Number(e.target.value);
    const audio = audioRef.current;
    if (!audio) return;

    audio.currentTime = nextTime;
    setCurrentTime(nextTime);
  };

  return (
    <div
      aria-label={showPlayer ? 'Text selection audio player' : undefined}
      data-audio-player-surface={showPlayer ? true : undefined}
      className={showPlayer ? PLAYER_SHELL_CLASS : LOADING_SHELL_CLASS}
    >
      <audio
        ref={audioRef}
        src={audioUrl ?? undefined}
        autoPlay={Boolean(audioUrl)}
        className="hidden"
        onLoadedMetadata={() => {
          const audio = audioRef.current;
          const nextDuration = audio?.duration ?? 0;
          setDuration(Number.isFinite(nextDuration) ? nextDuration : 0);
          if (audio && audioUrl) {
            try {
              void audio.play().catch(() => {});
            } catch {
              // Autoplay can be blocked until the user presses play.
            }
          }
        }}
        onTimeUpdate={() => setCurrentTime(audioRef.current?.currentTime || 0)}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onEnded={() => {
          setIsPlaying(false);
          setCurrentTime(0);
        }}
      />

      {isLoading ? (
        <>
          <span data-audio-loading-spinner className="flex h-8 w-8 items-center justify-center">
            <GoogleSpinner size={20} />
          </span>
          <span className="pr-1 text-[var(--theme-text-secondary)]">{t('generatingAudio')}</span>
        </>
      ) : showPlayer ? (
        <>
          <div
            onMouseDown={onDragStart}
            className="flex h-8 w-5 cursor-grab touch-none items-center justify-center rounded-full text-[var(--theme-text-tertiary)] transition-colors hover:bg-[var(--theme-bg-secondary)] hover:text-[var(--theme-text-secondary)] active:cursor-grabbing"
            title={t('dragToMove')}
          >
            <GripVertical size={13} />
          </div>

          <button
            type="button"
            onClick={togglePlayback}
            className="flex h-[34px] w-[34px] flex-shrink-0 items-center justify-center rounded-full border border-[var(--theme-border-secondary)] bg-[var(--theme-bg-secondary)] text-[var(--theme-text-primary)] shadow-sm transition-all hover:border-[var(--theme-border-focus)] hover:bg-[var(--theme-bg-tertiary)] active:scale-95 focus:outline-none focus:ring-2 focus:ring-[var(--theme-border-focus)] focus:ring-offset-2 focus:ring-offset-[var(--theme-bg-primary)]"
            aria-label={isPlaying ? t('audioPlayerPause') : t('audioPlayerPlay')}
          >
            {isPlaying ? (
              <Pause size={14} fill="currentColor" />
            ) : (
              <Play size={14} fill="currentColor" className="ml-0.5" />
            )}
          </button>

          <div
            data-audio-progress-shell
            className="flex min-w-0 flex-1 items-center gap-2.5 rounded-full bg-[var(--theme-bg-secondary)]/60 px-2.5 py-1.5"
          >
            <div className="relative h-5 min-w-24 flex-1">
              <div
                data-audio-progress-track
                className="absolute left-0 right-0 top-1/2 h-1.5 -translate-y-1/2 overflow-hidden rounded-full bg-[var(--theme-bg-tertiary)]"
              >
                <div
                  data-audio-progress-fill
                  className="h-full rounded-full bg-[var(--theme-text-link)] transition-[width] duration-100 ease-linear"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
              <div
                data-audio-progress-thumb
                className="pointer-events-none absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[var(--theme-text-link)] opacity-95 transition-[left] duration-100 ease-linear"
                style={{ left: `${progressPercent}%` }}
              />
              <input
                type="range"
                min="0"
                max={duration || 100}
                value={currentTime}
                onChange={handleSeek}
                disabled={!duration}
                className="absolute inset-0 h-full w-full cursor-pointer opacity-0 disabled:cursor-default"
                aria-label={t('audioPlayerPlaybackProgress')}
              />
            </div>

            <div
              data-audio-time-group
              className="flex w-12 flex-shrink-0 flex-col items-end gap-0.5 pl-1.5 font-mono text-xs leading-none tabular-nums"
            >
              <span data-audio-time-readout className="text-[var(--theme-text-primary)]">
                {formatClockTime(currentTime)}
              </span>
              <span data-audio-time-readout className="text-[var(--theme-text-tertiary)]">
                {formatClockTime(duration)}
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="ml-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-[var(--theme-text-tertiary)] transition-colors hover:bg-[var(--theme-bg-secondary)] hover:text-[var(--theme-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--theme-border-focus)] focus:ring-offset-2 focus:ring-offset-[var(--theme-bg-primary)]"
            aria-label={t('close')}
          >
            <X size={14} />
          </button>
        </>
      ) : null}
    </div>
  );
};
