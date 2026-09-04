import { useState, useRef, useEffect } from 'react';
import { releaseManagedObjectUrl } from '@/services/objectUrlManager';

// Tiny silent WAV used to unlock a media element during the TTS click gesture
// so playback can start later, after the async speech request returns.
const SILENT_WAV = 'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA';

export const useSelectionAudio = () => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoadingState] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const isAudioActiveRef = useRef(false);

  useEffect(() => {
    return () => {
      releaseManagedObjectUrl(audioUrl);
    };
  }, [audioUrl]);

  const setIsLoading = (loading: boolean) => {
    if (loading) {
      isAudioActiveRef.current = true;
      setErrorMessage(null);
    }
    setIsLoadingState(loading);
  };

  const armFromUserGesture = () => {
    isAudioActiveRef.current = true;
    const audio = audioRef.current;
    if (!audio) return;

    try {
      audio.muted = true;
      audio.src = SILENT_WAV;
      void audio.play().catch(() => {});
    } catch {
      // Unlock is best-effort; explicit play() after generation still runs.
    }
  };

  const play = (url: string) => {
    isAudioActiveRef.current = true;
    setAudioUrl(url);
    setIsPlaying(true);
    setErrorMessage(null);
    const audio = audioRef.current;
    if (audio) {
      try {
        audio.muted = false;
        audio.src = url;
        void audio.play().catch(() => {});
      } catch {
        // jsdom and autoplay policies may reject; the player still mounts.
      }
    }
  };

  const stop = () => {
    isAudioActiveRef.current = false;
    setIsPlaying(false);
    setAudioUrl(null);
  };

  const fail = (message: string) => {
    isAudioActiveRef.current = false;
    setIsPlaying(false);
    setIsLoadingState(false);
    setErrorMessage(message);
  };

  return {
    isPlaying,
    isLoading,
    audioUrl,
    errorMessage,
    setIsLoading,
    armFromUserGesture,
    play,
    stop,
    fail,
    audioRef,
    isAudioActiveRef,
  };
};
