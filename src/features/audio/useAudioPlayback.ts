import { logService } from '@/services/logService';
import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';

export interface UseAudioPlaybackOptions {
  src?: string | null;
  autoPlay?: boolean;
  audioRef?: RefObject<HTMLAudioElement | null>;
  onAutoPlayPrevented?: (error: unknown) => void;
}

export interface UseAudioPlaybackReturn {
  audioRef: RefObject<HTMLAudioElement>;
  isPlaying: boolean;
  duration: number;
  currentTime: number;
  progressPercent: number;
  playbackRate: number;
  isLoaded: boolean;
  togglePlay: () => void;
  togglePlayback: () => void;
  seekTo: (time: number) => void;
  handleSeek: (event: React.ChangeEvent<HTMLInputElement>) => void;
  setPlaybackSpeed: (rate: number) => void;
  toggleSpeed: () => void;
  audioProps: {
    onTimeUpdate: () => void;
    onLoadedMetadata: () => void;
    onEnded: () => void;
    onPlay: () => void;
    onPause: () => void;
  };
}

const PLAYBACK_SPEEDS = [1, 1.25, 1.5, 2];

export const useAudioPlayback = (options: UseAudioPlaybackOptions = {}): UseAudioPlaybackReturn => {
  const { src, autoPlay = false, audioRef: externalAudioRef, onAutoPlayPrevented } = options;
  const internalAudioRef = useRef<HTMLAudioElement>(null);
  const audioRef = (externalAudioRef ?? internalAudioRef) as RefObject<HTMLAudioElement>;

  const [isPlaying, setIsPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [isLoaded, setIsLoaded] = useState(false);

  // Reset state when audio source changes
  useEffect(() => {
    setIsPlaying(false);
    setCurrentTime(0);
    setDuration(0);
    setIsLoaded(false);
  }, [src]);

  // Handle autoPlay when audioRef and src are present
  useEffect(() => {
    if (autoPlay && src && audioRef.current) {
      const playPromise = audioRef.current.play();
      if (playPromise !== undefined) {
        playPromise.catch((error) => {
          logService.warn('Auto-play prevented:', error);
          setIsPlaying(false);
          onAutoPlayPrevented?.(error);
        });
      }
    }
  }, [autoPlay, src, audioRef, onAutoPlayPrevented]);

  const togglePlay = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;

    if (isPlaying || !audio.paused) {
      audio.pause();
    } else {
      const playPromise = audio.play();
      if (playPromise !== undefined) {
        playPromise.catch((error) => {
          logService.warn('Audio playback failed:', error);
        });
      }
    }
  }, [audioRef, isPlaying]);

  const seekTo = useCallback(
    (time: number) => {
      const audio = audioRef.current;
      const targetTime = Number.isFinite(time) ? Math.max(0, time) : 0;
      if (audio) {
        audio.currentTime = targetTime;
      }
      setCurrentTime(targetTime);
    },
    [audioRef],
  );

  const handleSeek = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const targetTime = Number(e.target.value);
      seekTo(targetTime);
    },
    [seekTo],
  );

  const setPlaybackSpeed = useCallback(
    (rate: number) => {
      setPlaybackRate(rate);
      if (audioRef.current) {
        audioRef.current.playbackRate = rate;
      }
    },
    [audioRef],
  );

  const toggleSpeed = useCallback(() => {
    const nextIndex = (PLAYBACK_SPEEDS.indexOf(playbackRate) + 1) % PLAYBACK_SPEEDS.length;
    const nextRate = PLAYBACK_SPEEDS[nextIndex];
    setPlaybackSpeed(nextRate);
  }, [playbackRate, setPlaybackSpeed]);

  const handleTimeUpdate = useCallback(() => {
    if (audioRef.current) {
      setCurrentTime(audioRef.current.currentTime || 0);
    }
  }, [audioRef]);

  const handleLoadedMetadata = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const nextDuration = audio.duration;
    setDuration(Number.isFinite(nextDuration) ? nextDuration : 0);
    setIsLoaded(true);

    if (autoPlay && src) {
      try {
        const playPromise = audio.play();
        if (playPromise !== undefined) {
          playPromise.catch((error) => {
            onAutoPlayPrevented?.(error);
          });
        }
      } catch (error) {
        onAutoPlayPrevented?.(error);
      }
    }
  }, [audioRef, autoPlay, src, onAutoPlayPrevented]);

  const handleEnded = useCallback(() => {
    setIsPlaying(false);
    setCurrentTime(0);
    if (audioRef.current) {
      audioRef.current.currentTime = 0;
    }
  }, [audioRef]);

  const handlePlay = useCallback(() => setIsPlaying(true), []);
  const handlePause = useCallback(() => setIsPlaying(false), []);

  const progressPercent =
    duration > 0 && Number.isFinite(duration) ? Math.min(100, Math.max(0, (currentTime / duration) * 100)) : 0;

  return {
    audioRef,
    isPlaying,
    duration,
    currentTime,
    progressPercent,
    playbackRate,
    isLoaded,
    togglePlay,
    togglePlayback: togglePlay,
    seekTo,
    handleSeek,
    setPlaybackSpeed,
    toggleSpeed,
    audioProps: {
      onTimeUpdate: handleTimeUpdate,
      onLoadedMetadata: handleLoadedMetadata,
      onEnded: handleEnded,
      onPlay: handlePlay,
      onPause: handlePause,
    },
  };
};
