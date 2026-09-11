import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Repeat, X } from 'lucide-react';
import { useI18n } from '@/contexts/I18nContext';
import type { UploadedFile } from '@/types';
import { useMediaNavStore } from '@/stores/mediaNavStore';
import { useChatStore } from '@/stores/chatStore';
import { formatTimestamp } from '@/utils/media-nav/timestamp';
import { extractTimelineMarkers } from '@/utils/media-nav/timelineMarkers';
import { type VideoAnnotation } from './VideoHighlightOverlay';
import { VideoPlayer, type VideoPlayerHandle } from '@/components/shared/file-preview/VideoPlayer';
import { isYoutubeVideoFile } from '@/utils/media-nav/sessionMediaFiles';
import { YoutubeNavPlayer } from './YoutubeNavPlayer';

interface MediaNavViewProps {
  file: UploadedFile;
  kind: 'video' | 'audio';
}

/**
 * Media player inside the media navigation panel (video or audio).
 * For video, delegates playback, HUD, letterbox-compensation, and frame stepping
 * to the shared VideoPlayer component while coordinating with the media navigation store.
 * For audio, coordinates playback, seeking, and segment looping with full segment banner controls.
 */
const MediaNavViewComponent: React.FC<MediaNavViewProps> = ({ file, kind }) => {
  const { t } = useI18n();
  const playerRef = useRef<VideoPlayerHandle | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const [isMetadataReady, setIsMetadataReady] = useState(false);
  const [segment, setSegment] = useState<{ start: number; end: number } | null>(null);
  const [isSegmentLoopEnabled, setIsSegmentLoopEnabled] = useState(true);

  const [annotation, setAnnotation] = useState<VideoAnnotation | null>(null);
  const [annotationTargetTime, setAnnotationTargetTime] = useState<number | null>(null);
  const [isAnnotationVisible, setIsAnnotationVisible] = useState(false);

  const seekTarget = useMediaNavStore((state) => state.videoTarget);
  const consumeTarget = useMediaNavStore((state) => state.consumeVideoTarget);

  const activeMessages = useChatStore((state) => state.activeMessages);
  const timelineMarkers = useMemo(
    () => extractTimelineMarkers(activeMessages, file, kind),
    [activeMessages, file, kind],
  );

  // Clear active playback time on unmount or file switch
  useEffect(() => {
    return () => {
      useMediaNavStore.getState().setCurrentPlayTime(null);
    };
  }, [file.id]);

  const handleSegmentChange = useCallback((newSeg: { start: number; end: number } | null) => {
    setSegment(newSeg);
    if (!newSeg) {
      setIsAnnotationVisible(false);
      useMediaNavStore.getState().consumeVideoTarget();
    }
  }, []);

  // Reset state on file switch
  useEffect(() => {
    setSegment(null);
    setIsSegmentLoopEnabled(true);
    setAnnotation(null);
    setAnnotationTargetTime(null);
    setIsAnnotationVisible(false);
    setIsMetadataReady(false);
  }, [file.id]);

  // Sync ready state if already available
  useEffect(() => {
    if (kind === 'audio' && audioRef.current && audioRef.current.readyState >= 1) {
      setIsMetadataReady(true);
    } else if (kind === 'video') {
      const videoEl = playerRef.current?.getVideoElement();
      if (videoEl && videoEl.readyState >= 1) {
        setIsMetadataReady(true);
      }
    }
  }, [kind, file.id]);

  // Handle incoming seek requests from store
  useEffect(() => {
    if (!seekTarget) return;
    if (!isMetadataReady) return;

    const hasSegment = seekTarget.end !== undefined;
    const targetSeconds = seekTarget.seconds;

    if (kind === 'video') {
      playerRef.current?.seekTo(targetSeconds, true);
    } else if (audioRef.current) {
      const media = audioRef.current;
      media.currentTime = Math.max(0, targetSeconds);
      try {
        const p = media.play();
        if (p && typeof p.catch === 'function') {
          p.catch(() => {
            // Autoplay may be blocked by browser policy
          });
        }
      } catch {
        // Fallback for mock environments
      }
    }

    setSegment(hasSegment ? { start: targetSeconds, end: seekTarget.end! } : null);
    setIsSegmentLoopEnabled(true);

    if (seekTarget.box2d || seekTarget.point) {
      setAnnotation({
        box2d: seekTarget.box2d,
        point: seekTarget.point,
        snippet: seekTarget.snippet,
      });
      setAnnotationTargetTime(targetSeconds);
      setIsAnnotationVisible(true);
    } else {
      setAnnotation(null);
      setAnnotationTargetTime(null);
      setIsAnnotationVisible(false);
    }

    consumeTarget();
  }, [seekTarget, isMetadataReady, consumeTarget, kind]);

  // Audio loadedmetadata handler
  const handleAudioLoadedMetadata = () => {
    setIsMetadataReady(true);
  };

  const isHandlingSegmentLoopRef = useRef(false);
  const handleAudioTimeUpdate = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const currentTime = audio.currentTime;
    useMediaNavStore.getState().setCurrentPlayTime(currentTime);

    if (!segment) return;

    // If user manually scrubbed outside active segment bounds, exit segment
    if (currentTime < segment.start - 0.5 || currentTime > segment.end + 0.5) {
      if (!isHandlingSegmentLoopRef.current) {
        setSegment(null);
      }
      return;
    }

    // If audio reached or passed segment end
    if (currentTime >= segment.end) {
      if (isSegmentLoopEnabled) {
        isHandlingSegmentLoopRef.current = true;
        audio.currentTime = segment.start;
        const p = audio.play();
        if (p && typeof p.catch === 'function') {
          p.catch(() => {});
        }
        setTimeout(() => {
          isHandlingSegmentLoopRef.current = false;
        }, 100);
      } else {
        audio.pause();
      }
    }
  }, [segment, isSegmentLoopEnabled]);

  const isYoutube = useMemo(() => isYoutubeVideoFile(file), [file]);

  return (
    <div className="h-full w-full flex flex-col bg-black select-none relative">
      {kind === 'video' ? (
        isYoutube ? (
          <YoutubeNavPlayer key={file.id} file={file} />
        ) : (
          <VideoPlayer
            key={file.id}
            ref={playerRef}
            src={file.dataUrl || ''}
            file={file}
            testId="media-nav-video"
            segment={segment}
            onSegmentChange={handleSegmentChange}
            isSegmentLoopEnabled={isSegmentLoopEnabled}
            onSegmentLoopChange={setIsSegmentLoopEnabled}
            annotation={annotation}
            annotationTargetTime={annotationTargetTime}
            isAnnotationVisible={isAnnotationVisible}
            onAnnotationVisibilityChange={setIsAnnotationVisible}
            onAnnotationDismiss={() => setIsAnnotationVisible(false)}
            timelineMarkers={timelineMarkers}
            onTimeUpdate={(t) => useMediaNavStore.getState().setCurrentPlayTime(t)}
            onLoadedMetadata={() => setIsMetadataReady(true)}
          />
        )
      ) : (
        <div className="h-full w-full flex flex-col select-none relative">
          {segment && (
            <div className="flex items-center justify-between gap-2 px-3 py-1.5 bg-[#101113] border-b border-white/10 text-xs text-white/90 flex-shrink-0 z-30">
              <span className="font-mono">
                {t('videoLocateSegment')
                  .replace('{start}', formatTimestamp(segment.start))
                  .replace('{end}', formatTimestamp(segment.end))}
              </span>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setIsSegmentLoopEnabled((prev) => !prev)}
                  className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                    isSegmentLoopEnabled ? 'bg-white/20 text-white' : 'text-white/70 hover:bg-white/10'
                  }`}
                  aria-pressed={isSegmentLoopEnabled}
                  aria-label={t('videoSegmentLoop')}
                  title={t('videoSegmentLoop')}
                  data-testid="media-segment-loop"
                >
                  <Repeat size={14} />
                </button>
                <button
                  type="button"
                  onClick={() => handleSegmentChange(null)}
                  className="p-1.5 rounded-lg text-white/70 hover:bg-white/10 hover:text-white transition-colors cursor-pointer"
                  aria-label={t('videoSegmentExit')}
                  title={t('videoSegmentExit')}
                  data-testid="media-segment-exit"
                >
                  <X size={14} />
                </button>
              </div>
            </div>
          )}

          <div className="flex-grow min-h-0 flex items-center justify-center p-2 sm:p-3 relative overflow-hidden">
            <div className="w-full max-w-md flex flex-col items-center gap-4 rounded-xl bg-[var(--theme-bg-secondary)] border border-[var(--theme-border-secondary)] p-6 shadow-xl">
              <span className="truncate text-sm font-medium text-[var(--theme-text-primary)]" title={file.name}>
                {file.name}
              </span>
              <audio
                key={file.id}
                ref={audioRef}
                src={file.dataUrl}
                controls
                onLoadedMetadata={handleAudioLoadedMetadata}
                onTimeUpdate={handleAudioTimeUpdate}
                className="w-full outline-none"
                data-testid="media-nav-audio"
              />

              {timelineMarkers.length > 0 && (
                <div className="w-full flex flex-col gap-2 pt-3 mt-1 border-t border-[var(--theme-border-secondary)]/60">
                  <div className="flex items-center justify-between text-xs text-[var(--theme-text-secondary)]">
                    <span className="font-medium flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                      时间轴标记点
                    </span>
                    <span className="font-mono text-[11px] opacity-75">{timelineMarkers.length} 处</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5 max-h-36 overflow-y-auto pr-1">
                    {timelineMarkers.map((marker) => (
                      <button
                        key={marker.id}
                        type="button"
                        onClick={() => {
                          if (audioRef.current) {
                            audioRef.current.currentTime = Math.max(0, marker.time);
                            try {
                              const p = audioRef.current.play();
                              if (p && typeof p.catch === 'function') {
                                p.catch(() => {});
                              }
                            } catch {
                              // Fallback for mock environments
                            }
                          }
                        }}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-mono bg-[var(--theme-bg-tertiary)] hover:bg-[var(--theme-bg-accent)] hover:text-white transition-all cursor-pointer border border-[var(--theme-border-secondary)] shadow-sm"
                        title={marker.snippet}
                      >
                        <span className="font-semibold text-amber-500 dark:text-amber-400">
                          {formatTimestamp(marker.time)}
                        </span>
                        {marker.snippet && (
                          <span className="max-w-[140px] truncate font-sans text-[var(--theme-text-secondary)] hover:text-inherit">
                            {marker.snippet}
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export const MediaNavView = React.memo(MediaNavViewComponent);
