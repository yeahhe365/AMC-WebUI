import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import type { UploadedFile } from '@/types';
import { VideoHighlightOverlay, type VideoAnnotation } from '@/components/media-nav/VideoHighlightOverlay';
import { VideoSegmentBar } from './video/VideoSegmentBar';
import { VideoControls } from './video/VideoControls';
import { useVideoGeometry } from './video/useVideoGeometry';
import { useVideoHotkeys } from './video/useVideoHotkeys';
import type { TimelineMarker } from '@/utils/media-nav/timelineMarkers';
import { useVideoVolumeStore } from '@/stores/videoVolumeStore';

export interface VideoPlayerHandle {
  seekTo: (seconds: number, autoplay?: boolean, manual?: boolean) => void;
  stepFrame: (direction: 'back' | 'forward') => void;
  togglePlay: () => void;
  toggleFullscreen: () => Promise<void>;
  togglePictureInPicture?: () => Promise<void>;
  toggleMute: () => void;
  getVideoElement: () => HTMLVideoElement | null;
  getCurrentTime: () => number;
  getDuration: () => number;
  wakeControls?: () => void;
}

export interface VideoPlayerProps {
  src: string;
  file?: UploadedFile;
  className?: string;
  videoClassName?: string;
  testId?: string;
  autoPlay?: boolean;
  loop?: boolean;
  allowHotkeys?: boolean;
  showControls?: boolean;
  showSegmentBar?: boolean;
  defaultSegment?: { start: number; end: number } | null;
  segment?: { start: number; end: number } | null;
  onSegmentChange?: (segment: { start: number; end: number } | null) => void;
  isSegmentLoopEnabled?: boolean;
  onSegmentLoopChange?: (enabled: boolean) => void;
  onControlsVisibilityChange?: (visible: boolean) => void;
  annotation?: VideoAnnotation | null;
  annotationTargetTime?: number | null;
  isAnnotationVisible?: boolean;
  onAnnotationVisibilityChange?: (visible: boolean) => void;
  onAnnotationDismiss?: () => void;
  timelineMarkers?: TimelineMarker[];
  onLoadedMetadata?: (e: React.SyntheticEvent<HTMLVideoElement, Event>) => void;
  onTimeUpdate?: (currentTime: number) => void;
  onSeeking?: (e: React.SyntheticEvent<HTMLVideoElement, Event>) => void;
  onPlay?: () => void;
  onPause?: () => void;
  onEnded?: () => void;
}

const PLAYBACK_RATES = [0.5, 1, 1.5, 2] as const;
const FRAME_STEP_SECONDS = 0.04;

export const VideoPlayer = forwardRef<VideoPlayerHandle, VideoPlayerProps>(function VideoPlayer(
  {
    src,
    file: _file,
    className = 'relative w-full h-full max-w-full max-h-full flex items-center justify-center bg-black focus:outline-none group overflow-hidden',
    videoClassName = 'w-full h-full max-w-full max-h-full object-contain outline-none block cursor-pointer',
    testId = 'media-nav-video',
    autoPlay = false,
    loop = false,
    allowHotkeys = true,
    showControls = true,
    showSegmentBar = true,
    defaultSegment = null,
    segment: controlledSegment,
    onSegmentChange,
    isSegmentLoopEnabled: controlledIsSegmentLoopEnabled,
    onSegmentLoopChange,
    onControlsVisibilityChange,
    annotation = null,
    annotationTargetTime = null,
    isAnnotationVisible: controlledIsAnnotationVisible,
    onAnnotationVisibilityChange,
    onAnnotationDismiss: _onAnnotationDismiss,
    timelineMarkers,
    onLoadedMetadata,
    onTimeUpdate,
    onSeeking,
    onPlay,
    onPause,
    onEnded,
  },
  ref,
) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playbackRate, setPlaybackRate] = useState<number>(1);
  const volume = useVideoVolumeStore((state) => state.volume);
  const isMuted = useVideoVolumeStore((state) => state.isMuted);
  const setStoreVolume = useVideoVolumeStore((state) => state.setVolume);
  const toggleStoreMute = useVideoVolumeStore((state) => state.toggleMute);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isPictureInPicture, setIsPictureInPicture] = useState(false);
  const [controlsVisible, setControlsVisible] = useState(true);

  useEffect(() => {
    const video = videoRef.current;
    if (video) {
      try {
        video.volume = volume;
        video.muted = isMuted;
      } catch {
        // Fallback for environments where volume assignment is restricted
      }
    }
  }, [volume, isMuted]);

  // Segment state
  const isControlledSegment = controlledSegment !== undefined;
  const [internalSegment, setInternalSegment] = useState<{ start: number; end: number } | null>(defaultSegment);
  const activeSegment = isControlledSegment ? controlledSegment : internalSegment;
  const activeSegmentRef = useRef(activeSegment);
  activeSegmentRef.current = activeSegment;

  const updateSegment = useCallback(
    (newSegment: { start: number; end: number } | null) => {
      if (!isControlledSegment) {
        setInternalSegment(newSegment);
      }
      onSegmentChange?.(newSegment);
    },
    [isControlledSegment, onSegmentChange],
  );

  // Segment loop state
  const isControlledLoop = controlledIsSegmentLoopEnabled !== undefined;
  const [internalLoop, setInternalLoop] = useState(true);
  const isSegmentLoopEnabled = isControlledLoop ? controlledIsSegmentLoopEnabled : internalLoop;
  const isSegmentLoopEnabledRef = useRef(isSegmentLoopEnabled);
  isSegmentLoopEnabledRef.current = isSegmentLoopEnabled;

  const toggleSegmentLoop = useCallback(() => {
    const nextVal = !isSegmentLoopEnabled;
    if (!isControlledLoop) {
      setInternalLoop(nextVal);
    }
    onSegmentLoopChange?.(nextVal);
  }, [isControlledLoop, isSegmentLoopEnabled, onSegmentLoopChange]);

  // Annotation visibility state
  const isControlledAnnotationVis = controlledIsAnnotationVisible !== undefined;
  const [internalAnnotationVisible, setInternalAnnotationVisible] = useState(false);
  const [isAnnotationDismissed, setIsAnnotationDismissed] = useState(false);

  const effectiveAnnotationVisible = isControlledAnnotationVis
    ? controlledIsAnnotationVisible
    : !isAnnotationDismissed && internalAnnotationVisible;

  const isProgrammaticSeekRef = useRef(false);
  const controlsTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Modular Video Geometry Hook
  const { displayRect, updateDisplayRect } = useVideoGeometry({
    containerRef,
    videoRef,
    onFullscreenChange: setIsFullscreen,
  });

  const seekTo = useCallback(
    (seconds: number, autoplay = true, manual = false) => {
      const video = videoRef.current;
      if (!video) return;

      const targetSeconds =
        Number.isFinite(video.duration) && video.duration > 0
          ? Math.max(0, Math.min(seconds, video.duration - 0.05))
          : Math.max(0, seconds);
      isProgrammaticSeekRef.current = true;

      if (manual && activeSegmentRef.current) {
        const seg = activeSegmentRef.current;
        if (targetSeconds < seg.start - 0.5 || targetSeconds > seg.end + 0.5) {
          updateSegment(null);
        }
      }

      video.currentTime = targetSeconds;
      setCurrentTime(targetSeconds);

      if (autoplay) {
        try {
          const playPromise = video.play();
          if (playPromise && typeof playPromise.catch === 'function') {
            playPromise.catch(() => {});
          }
        } catch {
          // Fallback for mock environments
        }
      } else {
        try {
          video.pause();
        } catch {
          // Fallback for mock environments
        }
      }
    },
    [updateSegment],
  );

  const prevSrcRef = useRef(src);
  useEffect(() => {
    if (prevSrcRef.current !== src) {
      prevSrcRef.current = src;
      if (!isControlledSegment) {
        setInternalSegment(defaultSegment ?? null);
      }
      setIsAnnotationDismissed(false);
      setInternalAnnotationVisible(false);
      setCurrentTime(0);
      setDuration(0);
      setIsPlaying(false);
    }
  }, [src, defaultSegment, isControlledSegment]);

  const stepFrame = useCallback((direction: 'back' | 'forward') => {
    const video = videoRef.current;
    if (!video) return;
    try {
      video.pause();
    } catch {
      // Fallback for mock environments
    }
    const delta = direction === 'forward' ? FRAME_STEP_SECONDS : -FRAME_STEP_SECONDS;
    const target = Math.max(0, Math.min(video.duration || 0, video.currentTime + delta));
    isProgrammaticSeekRef.current = true;
    video.currentTime = target;
    setCurrentTime(target);
  }, []);

  const togglePlay = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      try {
        const playPromise = video.play();
        if (playPromise && typeof playPromise.catch === 'function') {
          playPromise.catch(() => {});
        }
      } catch {
        // Fallback for mock environments
      }
    } else {
      try {
        video.pause();
      } catch {
        // Fallback for mock environments
      }
    }
  }, []);

  const cyclePlaybackRate = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    const currentIndex = PLAYBACK_RATES.indexOf(playbackRate as (typeof PLAYBACK_RATES)[number]);
    const nextRate = PLAYBACK_RATES[(currentIndex + 1) % PLAYBACK_RATES.length];
    video.playbackRate = nextRate;
    setPlaybackRate(nextRate);
  }, [playbackRate]);

  const toggleMute = useCallback(() => {
    toggleStoreMute();
    const video = videoRef.current;
    if (video) {
      const nextMuted = useVideoVolumeStore.getState().isMuted;
      const nextVol = useVideoVolumeStore.getState().volume;
      try {
        video.muted = nextMuted;
        video.volume = nextVol;
      } catch {
        // Fallback for environments where volume assignment is restricted
      }
    }
  }, [toggleStoreMute]);

  const handleVolumeChange = useCallback(
    (newVolume: number) => {
      setStoreVolume(newVolume);
      const video = videoRef.current;
      if (video) {
        try {
          video.volume = newVolume;
          video.muted = newVolume === 0;
        } catch {
          // Fallback for environments where volume assignment is restricted
        }
      }
    },
    [setStoreVolume],
  );

  const toggleFullscreen = useCallback(async () => {
    const container = containerRef.current;
    if (!container) return;
    if (!document.fullscreenElement) {
      try {
        await container.requestFullscreen();
      } catch {
        // Fallback gracefully
      }
    } else if (document.exitFullscreen) {
      try {
        await document.exitFullscreen();
      } catch {
        // Fallback for mock environments
      }
    }
  }, []);

  const togglePictureInPicture = useCallback(async () => {
    const video = videoRef.current;
    if (!video) return;
    try {
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture();
        setIsPictureInPicture(false);
      } else if (document.pictureInPictureEnabled && typeof video.requestPictureInPicture === 'function') {
        await video.requestPictureInPicture();
        setIsPictureInPicture(true);
      }
    } catch {
      // Fallback gracefully
    }
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const onEnter = () => setIsPictureInPicture(true);
    const onLeave = () => setIsPictureInPicture(false);
    video.addEventListener('enterpictureinpicture', onEnter);
    video.addEventListener('leavepictureinpicture', onLeave);
    return () => {
      video.removeEventListener('enterpictureinpicture', onEnter);
      video.removeEventListener('leavepictureinpicture', onLeave);
    };
  }, []);

  const wakeControls = useCallback(() => {
    setControlsVisible(true);
    if (controlsTimeoutRef.current) {
      clearTimeout(controlsTimeoutRef.current);
    }
    if (isPlaying) {
      controlsTimeoutRef.current = setTimeout(() => {
        setControlsVisible(false);
      }, 2500);
    }
  }, [isPlaying]);

  useEffect(() => {
    if (!isPlaying) {
      setControlsVisible(true);
      if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
    }
  }, [isPlaying]);

  useEffect(() => {
    onControlsVisibilityChange?.(controlsVisible);
  }, [controlsVisible, onControlsVisibilityChange]);

  useImperativeHandle(
    ref,
    () => ({
      seekTo,
      stepFrame,
      togglePlay,
      toggleFullscreen,
      togglePictureInPicture,
      toggleMute,
      getVideoElement: () => videoRef.current,
      getCurrentTime: () => videoRef.current?.currentTime ?? currentTime,
      getDuration: () => videoRef.current?.duration ?? duration,
      wakeControls,
    }),
    [
      currentTime,
      duration,
      seekTo,
      stepFrame,
      toggleFullscreen,
      togglePictureInPicture,
      toggleMute,
      togglePlay,
      wakeControls,
    ],
  );

  const handleLoadedMetadata = (e: React.SyntheticEvent<HTMLVideoElement, Event>) => {
    const video = videoRef.current;
    if (video) {
      try {
        video.volume = volume;
        video.muted = isMuted;
      } catch {
        // Fallback for environments where volume assignment is restricted
      }
      if (Number.isFinite(video.duration)) {
        setDuration(video.duration);
      }
    }
    updateDisplayRect();
    onLoadedMetadata?.(e);
  };

  const handleSeeking = (e: React.SyntheticEvent<HTMLVideoElement, Event>) => {
    onSeeking?.(e);
    if (isProgrammaticSeekRef.current) {
      isProgrammaticSeekRef.current = false;
      return;
    }
    const video = videoRef.current;
    const seg = activeSegmentRef.current;
    if (!video || !seg) return;

    const isOutsideSegment = video.currentTime < seg.start - 0.5 || video.currentTime > seg.end + 0.5;
    if (isOutsideSegment) {
      updateSegment(null);
    }
  };

  const handleTimeUpdateInternal = () => {
    const video = videoRef.current;
    if (!video) return;

    setCurrentTime(video.currentTime);

    const seg = activeSegmentRef.current;
    if (seg) {
      if (isSegmentLoopEnabledRef.current) {
        if (video.currentTime >= seg.end - 0.05) {
          isProgrammaticSeekRef.current = true;
          video.currentTime = seg.start;
        }
      } else if (video.currentTime >= seg.end) {
        try {
          video.pause();
          setIsPlaying(false);
          onPause?.();
        } catch {
          // Fallback for mock environments
        }
      }
    }

    if (annotation && (annotation.box2d || annotation.point)) {
      let isVisibleNow = true;
      if (annotationTargetTime !== null && annotationTargetTime !== undefined) {
        const timeDiff = Math.abs(video.currentTime - annotationTargetTime);
        isVisibleNow = timeDiff <= 1.5;
      }
      setInternalAnnotationVisible(isVisibleNow);
      if (isControlledAnnotationVis) {
        onAnnotationVisibilityChange?.(isVisibleNow);
      }
    }

    onTimeUpdate?.(video.currentTime);
  };

  const handleCloseAnnotation = useCallback(() => {
    setIsAnnotationDismissed(true);
    setInternalAnnotationVisible(false);
    if (isControlledAnnotationVis) {
      onAnnotationVisibilityChange?.(false);
    }
  }, [isControlledAnnotationVis, onAnnotationVisibilityChange]);

  // Modular Video Hotkeys Hook (Space, J/K/L, Frame Step, Volume, Fullscreen, Mute, PiP)
  useVideoHotkeys({
    enabled: allowHotkeys,
    containerRef,
    videoRef,
    currentTime,
    duration,
    isPlaying,
    volume,
    isMuted,
    onTogglePlay: togglePlay,
    onSeek: seekTo,
    onStepFrame: stepFrame,
    onToggleFullscreen: toggleFullscreen,
    onToggleMute: toggleMute,
    onVolumeChange: handleVolumeChange,
    onTogglePictureInPicture: togglePictureInPicture,
    wakeControls,
  });

  const clickTimerRef = useRef<number | null>(null);

  const handleVideoClick = useCallback(() => {
    if (clickTimerRef.current !== null) {
      window.clearTimeout(clickTimerRef.current);
      clickTimerRef.current = null;
      void toggleFullscreen();
    } else {
      clickTimerRef.current = window.setTimeout(() => {
        clickTimerRef.current = null;
        togglePlay();
      }, 220);
    }
  }, [toggleFullscreen, togglePlay]);

  useEffect(() => {
    return () => {
      if (clickTimerRef.current !== null) {
        window.clearTimeout(clickTimerRef.current);
      }
    };
  }, []);

  const controlsStyle = useMemo<React.CSSProperties>(() => {
    if (!displayRect || displayRect.width <= 0) {
      return {};
    }
    const containerHeight = containerRef.current?.clientHeight ?? 0;
    const bottomOffset = Math.max(0, containerHeight - (displayRect.top + displayRect.height));
    return {
      left: `${displayRect.left}px`,
      width: `${displayRect.width}px`,
      bottom: `${bottomOffset}px`,
    };
  }, [displayRect]);

  return (
    <div className="h-full w-full flex flex-col bg-black select-none relative">
      {showSegmentBar && activeSegment && (
        <VideoSegmentBar
          segment={activeSegment}
          isLoopEnabled={isSegmentLoopEnabled}
          onToggleLoop={toggleSegmentLoop}
          onExit={() => updateSegment(null)}
        />
      )}

      <div className="flex-grow min-h-0 flex items-center justify-center relative overflow-hidden">
        <div
          ref={containerRef}
          tabIndex={0}
          onMouseMove={wakeControls}
          onMouseLeave={() => isPlaying && setControlsVisible(false)}
          className={`${className} ${isPlaying && !controlsVisible ? '!cursor-none' : ''}`}
          style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        >
          <video
            ref={(el) => {
              videoRef.current = el;
              if (el) {
                try {
                  el.volume = volume;
                  el.muted = isMuted;
                } catch {
                  // Fallback for environments where volume assignment is restricted
                }
              }
            }}
            src={src}
            autoPlay={autoPlay}
            loop={loop}
            muted={isMuted}
            playsInline
            onClick={handleVideoClick}
            onSeeking={handleSeeking}
            onTimeUpdate={handleTimeUpdateInternal}
            onLoadedMetadata={handleLoadedMetadata}
            onPlay={() => {
              setIsPlaying(true);
              onPlay?.();
            }}
            onPause={() => {
              setIsPlaying(false);
              onPause?.();
            }}
            onEnded={() => {
              setIsPlaying(false);
              onEnded?.();
            }}
            className={`${videoClassName} ${isPlaying && !controlsVisible ? '!cursor-none' : ''}`}
            data-testid={testId}
          />

          <VideoHighlightOverlay
            annotation={annotation}
            visible={effectiveAnnotationVisible}
            displayRect={displayRect}
            isPlaying={isPlaying}
            onClose={handleCloseAnnotation}
          />

          {showControls && (
            <VideoControls
              visible={controlsVisible}
              style={controlsStyle}
              currentTime={currentTime}
              duration={duration}
              isPlaying={isPlaying}
              playbackRate={playbackRate}
              volume={volume}
              isMuted={isMuted}
              isFullscreen={isFullscreen}
              isPictureInPicture={isPictureInPicture}
              activeSegment={activeSegment}
              timelineMarkers={timelineMarkers}
              onTogglePlay={togglePlay}
              onStepFrame={stepFrame}
              onCyclePlaybackRate={cyclePlaybackRate}
              onToggleMute={toggleMute}
              onVolumeChange={handleVolumeChange}
              onToggleFullscreen={toggleFullscreen}
              onTogglePictureInPicture={togglePictureInPicture}
              onSeek={(seconds) => seekTo(seconds, false, true)}
            />
          )}
        </div>
      </div>
    </div>
  );
});
