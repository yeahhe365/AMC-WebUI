import { useEffect, type RefObject } from 'react';

interface UseVideoHotkeysProps {
  enabled: boolean;
  containerRef: RefObject<HTMLDivElement | null>;
  videoRef: RefObject<HTMLVideoElement | null>;
  currentTime: number;
  duration: number;
  isPlaying: boolean;
  volume: number;
  isMuted: boolean;
  onTogglePlay: () => void;
  onSeek: (seconds: number, autoplay?: boolean, manual?: boolean) => void;
  onStepFrame: (direction: 'back' | 'forward') => void;
  onToggleFullscreen: () => void;
  onToggleMute: () => void;
  onVolumeChange: (volume: number) => void;
  onTogglePictureInPicture?: () => void;
  wakeControls: () => void;
}

export function useVideoHotkeys({
  enabled,
  containerRef,
  videoRef,
  currentTime,
  duration,
  isPlaying,
  volume,
  isMuted,
  onTogglePlay,
  onSeek,
  onStepFrame,
  onToggleFullscreen,
  onToggleMute,
  onVolumeChange,
  onTogglePictureInPicture,
  wakeControls,
}: UseVideoHotkeysProps) {
  useEffect(() => {
    if (!enabled) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      const activeEl = document.activeElement;
      const isInputFocused =
        activeEl instanceof HTMLInputElement ||
        activeEl instanceof HTMLTextAreaElement ||
        (activeEl instanceof HTMLElement && activeEl.isContentEditable);

      if (isInputFocused) return;

      const isContainerFocused =
        containerRef.current === activeEl || (containerRef.current && containerRef.current.contains(activeEl));
      if (!isContainerFocused) return;

      const key = e.key.toLowerCase();

      if (e.key === ' ' || e.code === 'Space' || key === 'k') {
        e.preventDefault();
        wakeControls();
        onTogglePlay();
      } else if (e.key === 'ArrowLeft' || key === 'j') {
        e.preventDefault();
        wakeControls();
        if (e.shiftKey) {
          onStepFrame('back');
        } else {
          const delta = key === 'j' ? 10 : 5;
          const video = videoRef.current;
          const cur = video?.currentTime ?? currentTime;
          onSeek(Math.max(0, cur - delta), isPlaying, true);
        }
      } else if (e.key === 'ArrowRight' || key === 'l') {
        e.preventDefault();
        wakeControls();
        if (e.shiftKey) {
          onStepFrame('forward');
        } else {
          const delta = key === 'l' ? 10 : 5;
          const video = videoRef.current;
          const cur = video?.currentTime ?? currentTime;
          const dur = Number.isFinite(video?.duration) && video!.duration > 0 ? video!.duration : duration;
          onSeek(Math.min(dur, cur + delta), isPlaying, true);
        }
      } else if (e.key === ',' || e.key === '<') {
        e.preventDefault();
        wakeControls();
        onStepFrame('back');
      } else if (e.key === '.' || e.key === '>') {
        e.preventDefault();
        wakeControls();
        onStepFrame('forward');
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        wakeControls();
        const nextVol = Math.min(1, Math.round((volume + 0.1) * 10) / 10);
        onVolumeChange(nextVol);
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        wakeControls();
        const nextVol = Math.max(0, Math.round((volume - 0.1) * 10) / 10);
        onVolumeChange(nextVol);
      } else if (key === 'f') {
        e.preventDefault();
        onToggleFullscreen();
      } else if (key === 'm') {
        e.preventDefault();
        onToggleMute();
      } else if (key === 'p' && onTogglePictureInPicture) {
        e.preventDefault();
        onTogglePictureInPicture();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    enabled,
    containerRef,
    videoRef,
    currentTime,
    duration,
    isPlaying,
    volume,
    isMuted,
    onTogglePlay,
    onSeek,
    onStepFrame,
    onToggleFullscreen,
    onToggleMute,
    onVolumeChange,
    onTogglePictureInPicture,
    wakeControls,
  ]);
}
