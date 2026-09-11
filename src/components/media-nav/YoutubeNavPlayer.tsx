import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Repeat, X } from 'lucide-react';
import { useI18n } from '@/contexts/I18nContext';
import type { UploadedFile } from '@/types';
import { useMediaNavStore } from '@/stores/mediaNavStore';
import { useChatStore } from '@/stores/chatStore';
import { formatTimestamp } from '@/utils/media-nav/timestamp';
import { extractTimelineMarkers } from '@/utils/media-nav/timelineMarkers';
import { extractYoutubeVideoId } from '@/utils/file/youtubeUrl';
import { IconYoutube } from '@/components/icons';

export interface YoutubeNavPlayerProps {
  file: UploadedFile;
}

/**
 * YouTube player inside the media navigation panel.
 * Controls playback, seeking, and segment looping via the YouTube IFrame API / postMessage.
 */
export const YoutubeNavPlayer: React.FC<YoutubeNavPlayerProps> = ({ file }) => {
  const { t } = useI18n();
  const iframeRef = useRef<HTMLIFrameElement | null>(null);

  const videoId = useMemo(() => extractYoutubeVideoId(file.fileUri || file.name), [file.fileUri, file.name]);

  const [segment, setSegment] = useState<{ start: number; end: number } | null>(null);
  const [isSegmentLoopEnabled, setIsSegmentLoopEnabled] = useState(true);
  const [isIframeLoaded, setIsIframeLoaded] = useState(false);

  const segmentRef = useRef(segment);
  segmentRef.current = segment;
  const isSegmentLoopEnabledRef = useRef(isSegmentLoopEnabled);
  isSegmentLoopEnabledRef.current = isSegmentLoopEnabled;
  const pendingSeekTargetRef = useRef<{ seconds: number; end?: number } | null>(null);

  const seekTarget = useMediaNavStore((state) => state.videoTarget);
  const consumeTarget = useMediaNavStore((state) => state.consumeVideoTarget);

  const activeMessages = useChatStore((state) => state.activeMessages);
  const timelineMarkers = useMemo(() => extractTimelineMarkers(activeMessages, file, 'video'), [activeMessages, file]);

  // Clear active playback time on unmount or file switch
  useEffect(() => {
    return () => {
      useMediaNavStore.getState().setCurrentPlayTime(null);
    };
  }, [file.id]);

  // Reset state on file switch
  useEffect(() => {
    setSegment(null);
    setIsSegmentLoopEnabled(true);
    setIsIframeLoaded(false);
    pendingSeekTargetRef.current = null;
  }, [file.id]);

  const postCommand = useCallback((func: string, args: unknown[] = []) => {
    try {
      iframeRef.current?.contentWindow?.postMessage(JSON.stringify({ event: 'command', func, args }), '*');
    } catch {
      // Ignore postMessage failure in restricted contexts
    }
  }, []);

  const seekTo = useCallback(
    (seconds: number, autoplay = true) => {
      postCommand('seekTo', [seconds, true]);
      if (autoplay) {
        postCommand('playVideo');
      }
    },
    [postCommand],
  );

  // Handle incoming seek requests from store
  useEffect(() => {
    if (!seekTarget) return;

    const targetSeconds = seekTarget.seconds;
    const hasSegment = seekTarget.end !== undefined && seekTarget.end > targetSeconds;

    seekTo(targetSeconds, true);
    setSegment(hasSegment ? { start: targetSeconds, end: seekTarget.end! } : null);
    setIsSegmentLoopEnabled(true);

    if (!isIframeLoaded) {
      pendingSeekTargetRef.current = { seconds: targetSeconds, end: seekTarget.end };
    } else {
      pendingSeekTargetRef.current = null;
    }

    consumeTarget();
  }, [seekTarget, seekTo, consumeTarget, isIframeLoaded]);

  // Listen to postMessage infoDelivery events from YouTube iframe to track progress & loop segments
  useEffect(() => {
    const handleMessage = (e: MessageEvent) => {
      if (typeof e.data !== 'string') return;
      try {
        const data = JSON.parse(e.data);
        if (data.event === 'onReady' && pendingSeekTargetRef.current) {
          const target = pendingSeekTargetRef.current;
          pendingSeekTargetRef.current = null;
          seekTo(target.seconds, true);
        }
        if (data.event === 'infoDelivery' && data.info) {
          const curTime = data.info.currentTime;
          if (typeof curTime === 'number') {
            useMediaNavStore.getState().setCurrentPlayTime(curTime);

            if (segmentRef.current) {
              const { start, end } = segmentRef.current;
              if (curTime >= end) {
                if (isSegmentLoopEnabledRef.current) {
                  seekTo(start, true);
                } else {
                  postCommand('pauseVideo');
                }
              }
            }
          }
        }
      } catch {
        // Non-JSON message from other sources
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [seekTo, postCommand]);

  // Establish listening protocol after iframe loads
  const handleIframeLoad = () => {
    setIsIframeLoaded(true);
    postCommand('listening');
    if (pendingSeekTargetRef.current) {
      const target = pendingSeekTargetRef.current;
      pendingSeekTargetRef.current = null;
      seekTo(target.seconds, true);
    }
  };

  // Poll listening status periodically to ensure continuous currentTime reporting
  useEffect(() => {
    if (!isIframeLoaded) return;
    const timer = setInterval(() => {
      postCommand('listening');
    }, 1000);
    return () => clearInterval(timer);
  }, [isIframeLoaded, postCommand]);

  const originParam = typeof window !== 'undefined' ? `&origin=${encodeURIComponent(window.location.origin)}` : '';
  const embedUrl = videoId ? `https://www.youtube.com/embed/${videoId}?enablejsapi=1&autoplay=1${originParam}` : null;

  return (
    <div className="h-full w-full flex flex-col bg-black select-none relative" data-testid="youtube-nav-player">
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
              data-testid="youtube-segment-loop"
            >
              <Repeat size={14} />
            </button>
            <button
              type="button"
              onClick={() => setSegment(null)}
              className="p-1.5 rounded-lg text-white/70 hover:bg-white/10 hover:text-white transition-colors cursor-pointer"
              aria-label={t('videoSegmentExit')}
              title={t('videoSegmentExit')}
              data-testid="youtube-segment-exit"
            >
              <X size={14} />
            </button>
          </div>
        </div>
      )}

      <div className="flex-grow min-h-0 w-full flex items-center justify-center p-2 sm:p-4 bg-black relative">
        {embedUrl ? (
          <div className="w-full max-w-5xl aspect-video rounded-xl overflow-hidden shadow-2xl ring-1 ring-white/10 bg-black relative">
            <iframe
              ref={iframeRef}
              src={embedUrl}
              title={file.name || 'YouTube Video'}
              onLoad={handleIframeLoad}
              className="w-full h-full border-0"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
              data-testid="youtube-nav-iframe"
            />
          </div>
        ) : (
          <div className="text-center text-white/50 flex flex-col items-center gap-2">
            <IconYoutube size={48} className="opacity-50" />
            <p className="text-sm">{t('filePreviewInvalidYoutubeUrl')}</p>
          </div>
        )}
      </div>

      {timelineMarkers.length > 0 && (
        <div className="flex-shrink-0 px-3 py-2 bg-[var(--theme-bg-secondary)] border-t border-[var(--theme-border-secondary)]">
          <div className="flex items-center justify-between text-xs text-[var(--theme-text-secondary)] mb-1.5">
            <span className="font-medium flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
              时间轴标记点
            </span>
            <span className="font-mono text-[11px] opacity-75">{timelineMarkers.length} 处</span>
          </div>
          <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto pr-1">
            {timelineMarkers.map((marker) => (
              <button
                key={marker.id}
                type="button"
                onClick={() => {
                  seekTo(marker.time, true);
                  if (marker.endTime && marker.endTime > marker.time) {
                    setSegment({ start: marker.time, end: marker.endTime });
                  } else {
                    setSegment(null);
                  }
                }}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-mono bg-[var(--theme-bg-tertiary)] hover:bg-[var(--theme-bg-accent)] hover:text-white transition-all cursor-pointer border border-[var(--theme-border-secondary)] shadow-sm"
                title={marker.snippet}
                data-testid={`youtube-marker-${marker.time}`}
              >
                <span className="font-semibold text-amber-500 dark:text-amber-400">{formatTimestamp(marker.time)}</span>
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
  );
};
