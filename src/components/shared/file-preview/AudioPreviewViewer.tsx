import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Play, Pause, RotateCcw, RotateCw, Volume2, VolumeX, Repeat, Download, FileAudio } from 'lucide-react';
import type { UploadedFile } from '@/types';
import { useI18n } from '@/contexts/I18nContext';
import { formatFileSize } from '@/utils/file/fileSize';
import { formatClockTime } from '@/utils/formatClockTime';
import { triggerDownload } from '@/utils/export/core';
import { useAudioPlayback } from '@/features/audio/useAudioPlayback';
import {
  decodeAudioWaveform,
  generateDeterministicWaveform,
  readAudioWaveformCache,
  writeAudioWaveformCache,
} from '@/utils/media/audioWaveform';

interface AudioPreviewViewerProps {
  file: UploadedFile;
}

const WAVEFORM_BAR_COUNT = 48;

export const AudioPreviewViewer: React.FC<AudioPreviewViewerProps> = ({ file }) => {
  const { t } = useI18n();
  const audioRef = useRef<HTMLAudioElement>(null);
  const waveformRef = useRef<HTMLDivElement>(null);

  const [waveformBars, setWaveformBars] = useState<number[]>(() => {
    return (
      readAudioWaveformCache(file.id) ?? generateDeterministicWaveform(`${file.id}:${file.name}`, WAVEFORM_BAR_COUNT)
    );
  });

  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [isLooping, setIsLooping] = useState(false);
  const [isDraggingSeek, setIsDraggingSeek] = useState(false);
  const [hoverProgress, setHoverProgress] = useState<number | null>(null);

  const { isPlaying, duration, currentTime, playbackRate, togglePlay, seekTo, toggleSpeed, audioProps } =
    useAudioPlayback({
      src: file.dataUrl,
      audioRef,
    });

  // Decode audio peaks from file dataUrl or rawFile
  useEffect(() => {
    let cancelled = false;

    const loadPeaks = async () => {
      const cached = readAudioWaveformCache(file.id);
      if (cached) {
        setWaveformBars(cached);
        return;
      }

      try {
        let blob: Blob | null = null;
        if (file.rawFile) {
          blob = file.rawFile;
        } else if (file.dataUrl) {
          const res = await fetch(file.dataUrl);
          blob = await res.blob();
        }

        if (blob && !cancelled) {
          const peaks = await decodeAudioWaveform(blob, WAVEFORM_BAR_COUNT);
          if (peaks && !cancelled) {
            writeAudioWaveformCache(file.id, peaks);
            setWaveformBars(peaks);
          }
        }
      } catch {
        // Fallback to deterministic waveform
      }
    };

    void loadPeaks();
    return () => {
      cancelled = true;
    };
  }, [file.dataUrl, file.id, file.name, file.rawFile]);

  // Handle seeking on waveform click/drag
  const calculateSeekTime = useCallback(
    (clientX: number): number => {
      if (!waveformRef.current || duration <= 0) return 0;
      const rect = waveformRef.current.getBoundingClientRect();
      const x = Math.max(0, Math.min(clientX - rect.left, rect.width));
      const ratio = x / rect.width;
      return ratio * duration;
    },
    [duration],
  );

  const handleWaveformClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const targetTime = calculateSeekTime(e.clientX);
    seekTo(targetTime);
  };

  const handleWaveformMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!waveformRef.current || duration <= 0) return;
    const rect = waveformRef.current.getBoundingClientRect();
    const ratio = Math.max(0, Math.min((e.clientX - rect.left) / rect.width, 1));
    setHoverProgress(ratio);

    if (isDraggingSeek) {
      seekTo(ratio * duration);
    }
  };

  const handleWaveformMouseLeave = () => {
    setHoverProgress(null);
    if (isDraggingSeek) {
      setIsDraggingSeek(false);
    }
  };

  const handleSkip = (seconds: number) => {
    const nextTime = Math.max(0, Math.min(duration, currentTime + seconds));
    seekTo(nextTime);
  };

  const handleToggleMute = () => {
    if (audioRef.current) {
      const nextMuted = !isMuted;
      setIsMuted(nextMuted);
      audioRef.current.muted = nextMuted;
      if (!nextMuted && volume === 0) {
        setVolume(1);
        audioRef.current.volume = 1;
      }
    }
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newVol = parseFloat(e.target.value);
    setVolume(newVol);
    const muted = newVol === 0;
    setIsMuted(muted);
    if (audioRef.current) {
      audioRef.current.volume = newVol;
      audioRef.current.muted = muted;
    }
  };

  const handleToggleLoop = () => {
    const nextLoop = !isLooping;
    setIsLooping(nextLoop);
    if (audioRef.current) {
      audioRef.current.loop = nextLoop;
    }
  };

  const handleDownload = () => {
    if (file.dataUrl) {
      triggerDownload(file.dataUrl, file.name);
    }
  };

  const fileExt = useMemo(() => {
    const parts = file.name.split('.');
    return parts.length > 1 ? parts.pop()?.toUpperCase() : 'AUDIO';
  }, [file.name]);

  const currentPlayRatio = duration > 0 ? currentTime / duration : 0;

  return (
    <div className="w-full h-full flex items-center justify-center p-4 sm:p-6 lg:p-8 select-none">
      <div
        className="relative w-full max-w-xl max-w-[calc(100vw-2rem)] rounded-2xl bg-[var(--theme-bg-primary)] border border-[var(--theme-border-secondary)] shadow-2xl overflow-hidden p-5 sm:p-6 flex flex-col gap-5"
        data-testid="audio-preview-shell"
      >
        <audio ref={audioRef} src={file.dataUrl} className="max-w-full hidden" {...audioProps} />

        <div className="flex items-center gap-3.5 min-w-0">
          <div className="w-10 h-10 rounded-xl bg-neutral-100 dark:bg-neutral-800/80 border border-neutral-200/80 dark:border-neutral-700/60 flex items-center justify-center text-neutral-600 dark:text-neutral-300 shadow-xs shrink-0">
            <FileAudio size={20} strokeWidth={1.8} />
          </div>

          <div className="flex-1 min-w-0">
            <h3
              className="text-sm sm:text-base font-semibold text-[var(--theme-text-primary)] truncate tracking-tight"
              title={file.name}
            >
              {file.name}
            </h3>

            <div className="flex items-center gap-2 text-[11px] text-[var(--theme-text-tertiary)] font-mono mt-0.5">
              <span className="font-semibold uppercase text-neutral-700 dark:text-neutral-300">{fileExt}</span>
              {file.size > 0 && (
                <>
                  <span>·</span>
                  <span>{formatFileSize(file.size)}</span>
                </>
              )}
              {file.type && (
                <>
                  <span>·</span>
                  <span className="truncate max-w-[160px]">{file.type}</span>
                </>
              )}
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <div
            ref={waveformRef}
            onClick={handleWaveformClick}
            onMouseMove={handleWaveformMouseMove}
            onMouseLeave={handleWaveformMouseLeave}
            onMouseDown={() => setIsDraggingSeek(true)}
            onMouseUp={() => setIsDraggingSeek(false)}
            className="relative h-24 sm:h-28 w-full bg-neutral-100/50 dark:bg-neutral-900/50 hover:bg-neutral-100/80 dark:hover:bg-neutral-900/70 rounded-xl p-3 sm:p-4 flex items-center justify-between gap-[2.5px] sm:gap-[3px] cursor-pointer transition-colors overflow-hidden border border-[var(--theme-border-secondary)]/80"
            title="Click or drag to seek"
          >
            <div className="absolute inset-x-4 top-1/2 -translate-y-1/2 h-px bg-neutral-200/70 dark:bg-neutral-800/80 pointer-events-none" />

            {waveformBars.map((height, i) => {
              const barRatio = i / (waveformBars.length - 1);
              const isPlayed = barRatio <= currentPlayRatio;
              const isHovered = hoverProgress !== null && barRatio <= hoverProgress;

              return (
                <div key={i} className="flex-1 h-full flex items-center justify-center relative z-10">
                  <span
                    className={`w-full max-w-[3.5px] rounded-full transition-all duration-150 ${
                      isPlayed
                        ? 'bg-neutral-900 dark:bg-neutral-100 shadow-xs'
                        : isHovered
                          ? 'bg-neutral-400 dark:bg-neutral-500'
                          : 'bg-neutral-300/80 dark:bg-neutral-700/80'
                    }`}
                    style={{
                      height: `${Math.max(12, Math.round(height * 100))}%`,
                      minHeight: '4px',
                    }}
                  />
                </div>
              );
            })}

            {hoverProgress !== null && duration > 0 && (
              <div
                className="absolute top-1.5 -translate-x-1/2 px-1.5 py-0.5 rounded text-[10px] font-mono font-medium bg-neutral-900/90 dark:bg-neutral-100/95 text-white dark:text-neutral-950 pointer-events-none backdrop-blur-xs shadow-xs z-20"
                style={{ left: `${hoverProgress * 100}%` }}
              >
                {formatClockTime(hoverProgress * duration)}
              </div>
            )}
          </div>

          <div className="flex items-center justify-between text-xs font-mono text-[var(--theme-text-secondary)] px-1">
            <span>{formatClockTime(currentTime)}</span>
            <span>{formatClockTime(duration)}</span>
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 pt-1 border-t border-[var(--theme-border-secondary)]/50">
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={toggleSpeed}
              className="px-2 py-1 rounded-lg text-xs font-mono font-semibold text-[var(--theme-text-secondary)] hover:text-[var(--theme-text-primary)] hover:bg-[var(--theme-bg-tertiary)] transition-colors border border-[var(--theme-border-secondary)]/60"
              title={t('audioPlayerPlaybackSpeed') || 'Speed'}
              aria-label={t('audioPlayerPlaybackSpeed') || 'Speed'}
            >
              {playbackRate}x
            </button>

            <button
              type="button"
              onClick={handleToggleLoop}
              className={`p-1.5 rounded-lg transition-colors ${
                isLooping
                  ? 'text-[var(--theme-text-primary)] bg-[var(--theme-bg-tertiary)] border border-[var(--theme-border-secondary)]'
                  : 'text-[var(--theme-text-tertiary)] hover:text-[var(--theme-text-primary)] hover:bg-[var(--theme-bg-tertiary)]'
              }`}
              title={isLooping ? 'Loop: On' : 'Loop: Off'}
              aria-label="Loop playback"
            >
              <Repeat size={16} />
            </button>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => handleSkip(-5)}
              className="p-2 rounded-full text-[var(--theme-text-secondary)] hover:text-[var(--theme-text-primary)] hover:bg-[var(--theme-bg-tertiary)] transition-colors active:scale-90"
              title="Rewind 5s"
              aria-label="Rewind 5 seconds"
            >
              <RotateCcw size={18} />
            </button>

            <button
              type="button"
              onClick={togglePlay}
              className="w-12 h-12 rounded-full bg-neutral-900 hover:bg-black dark:bg-white dark:hover:bg-neutral-100 text-white dark:text-neutral-950 flex items-center justify-center shadow-md hover:scale-105 active:scale-95 transition-all cursor-pointer"
              title={isPlaying ? t('audioPlayerPause') || 'Pause' : t('audioPlayerPlay') || 'Play'}
              aria-label={isPlaying ? t('audioPlayerPause') || 'Pause' : t('audioPlayerPlay') || 'Play'}
            >
              {isPlaying ? (
                <Pause size={20} fill="currentColor" />
              ) : (
                <Play size={20} fill="currentColor" className="ml-0.5" />
              )}
            </button>

            <button
              type="button"
              onClick={() => handleSkip(5)}
              className="p-2 rounded-full text-[var(--theme-text-secondary)] hover:text-[var(--theme-text-primary)] hover:bg-[var(--theme-bg-tertiary)] transition-colors active:scale-90"
              title="Forward 5s"
              aria-label="Forward 5 seconds"
            >
              <RotateCw size={18} />
            </button>
          </div>

          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 group/vol">
              <button
                type="button"
                onClick={handleToggleMute}
                className="p-1.5 rounded-lg text-[var(--theme-text-secondary)] hover:text-[var(--theme-text-primary)] hover:bg-[var(--theme-bg-tertiary)] transition-colors"
                title={isMuted ? 'Unmute' : 'Mute'}
                aria-label={isMuted ? 'Unmute' : 'Mute'}
              >
                {isMuted || volume === 0 ? <VolumeX size={17} /> : <Volume2 size={17} />}
              </button>

              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={isMuted ? 0 : volume}
                onChange={handleVolumeChange}
                className="w-16 h-1.5 bg-[var(--theme-border-secondary)] rounded-lg appearance-none cursor-pointer accent-neutral-900 dark:accent-neutral-100 focus:outline-none"
                title={`Volume: ${Math.round((isMuted ? 0 : volume) * 100)}%`}
                aria-label="Volume slider"
              />
            </div>

            <button
              type="button"
              onClick={handleDownload}
              className="p-1.5 rounded-lg text-[var(--theme-text-secondary)] hover:text-[var(--theme-text-primary)] hover:bg-[var(--theme-bg-tertiary)] transition-colors"
              title={t('audioPlayerDownload') || 'Download'}
              aria-label={t('audioPlayerDownload') || 'Download'}
            >
              <Download size={17} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
