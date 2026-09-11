import { useCallback, useEffect, useState, type RefObject } from 'react';
import { computeContainedVideoRect, type VideoDisplayRect } from '@/utils/media-nav/videoGeometry';

interface UseVideoGeometryProps {
  containerRef: RefObject<HTMLDivElement | null>;
  videoRef: RefObject<HTMLVideoElement | null>;
  onFullscreenChange?: (isFullscreen: boolean) => void;
}

export function useVideoGeometry({ containerRef, videoRef, onFullscreenChange }: UseVideoGeometryProps) {
  const [displayRect, setDisplayRect] = useState<VideoDisplayRect | null>(null);

  const updateDisplayRect = useCallback(() => {
    const container = containerRef.current;
    const video = videoRef.current;
    if (!container || !video) return;

    const cWidth = container.clientWidth;
    const cHeight = container.clientHeight;
    const vWidth = video.videoWidth;
    const vHeight = video.videoHeight;

    if (cWidth > 0 && cHeight > 0 && vWidth > 0 && vHeight > 0) {
      const rect = computeContainedVideoRect(cWidth, cHeight, vWidth, vHeight);
      setDisplayRect(rect);
    }
  }, [containerRef, videoRef]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || typeof ResizeObserver === 'undefined') return;

    const observer = new ResizeObserver(() => {
      updateDisplayRect();
    });
    observer.observe(container);

    return () => observer.disconnect();
  }, [containerRef, updateDisplayRect]);

  useEffect(() => {
    const handleFullscreenChange = () => {
      const isNowFullscreen = document.fullscreenElement === containerRef.current;
      onFullscreenChange?.(isNowFullscreen);
      setTimeout(updateDisplayRect, 50);
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, [containerRef, onFullscreenChange, updateDisplayRect]);

  return {
    displayRect,
    updateDisplayRect,
  };
}
