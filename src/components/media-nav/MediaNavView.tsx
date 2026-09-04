import React, { useEffect, useRef, useState } from 'react';
import { Repeat, X } from 'lucide-react';
import { useI18n } from '@/contexts/I18nContext';
import type { UploadedFile } from '@/types';
import { useMediaNavStore } from '@/stores/mediaNavStore';
import { formatTimestamp } from '@/utils/media-nav/timestamp';

interface MediaNavViewProps {
  file: UploadedFile;
  kind: 'video' | 'audio';
}

/**
 * Media player inside the media navigation panel (video or audio). Honors
 * store-driven seeks (locate chips) and keeps a segment looping until the user
 * exits the segment.
 */
const MediaNavViewComponent: React.FC<MediaNavViewProps> = ({ file, kind }) => {
  const { t } = useI18n();
  const mediaRef = useRef<HTMLMediaElement | null>(null);
  const [isMetadataReady, setIsMetadataReady] = useState(false);
  const [isSegmentLoopEnabled, setIsSegmentLoopEnabled] = useState(true);

  const seekTarget = useMediaNavStore((state) => state.videoTarget);
  const consumeTarget = useMediaNavStore((state) => state.consumeVideoTarget);

  // Segment state mirrors seekTarget for as long as the segment is playing.
  const [segment, setSegment] = useState<{ start: number; end: number } | null>(null);
  const segmentRef = useRef<{ start: number; end: number } | null>(null);
  segmentRef.current = segment;
  const isSegmentLoopEnabledRef = useRef(isSegmentLoopEnabled);
  isSegmentLoopEnabledRef.current = isSegmentLoopEnabled;

  const seekTo = (seconds: number, autoplay = true) => {
    const media = mediaRef.current;
    if (!media) return;
    media.currentTime = seconds;
    if (autoplay) {
      void media.play().catch(() => {
        // Autoplay can be rejected; the user can press play manually.
      });
    }
  };

  // Apply incoming seek requests; keep the target queued until metadata exists.
  useEffect(() => {
    if (!seekTarget) return;
    if (!isMetadataReady) return;

    seekTo(seekTarget.seconds);
    setSegment(seekTarget.end !== undefined ? { start: seekTarget.seconds, end: seekTarget.end } : null);
    setIsSegmentLoopEnabled(true);
    consumeTarget();
  }, [seekTarget, isMetadataReady, consumeTarget]);

  // A seek may arrive before the media metadata is available; retry on load.
  useEffect(() => {
    const media = mediaRef.current;
    if (!media) return;
    const handleLoadedMetadata = () => {
      setIsMetadataReady(true);
    };
    if (media.readyState >= 1) {
      setIsMetadataReady(true);
    }
    media.addEventListener('loadedmetadata', handleLoadedMetadata);
    return () => media.removeEventListener('loadedmetadata', handleLoadedMetadata);
  }, [file.id]);

  const handleTimeUpdate = () => {
    const media = mediaRef.current;
    const activeSegment = segmentRef.current;
    if (!media || !activeSegment || !isSegmentLoopEnabledRef.current) return;
    if (media.currentTime >= activeSegment.end - 0.05) {
      media.currentTime = activeSegment.start;
    }
  };

  const exitSegment = () => {
    setSegment(null);
    useMediaNavStore.getState().consumeVideoTarget();
  };

  return (
    <div className="h-full w-full flex flex-col bg-black">
      {segment && (
        <div className="flex items-center justify-between gap-2 px-3 py-1.5 bg-[#101113] border-b border-white/10 text-xs text-white/90 flex-shrink-0">
          <span className="font-mono">
            {t('videoLocateSegment')
              .replace('{start}', formatTimestamp(segment.start))
              .replace('{end}', formatTimestamp(segment.end))}
          </span>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setIsSegmentLoopEnabled((enabled) => !enabled)}
              className={`p-1.5 rounded-lg transition-colors ${
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
              onClick={exitSegment}
              className="p-1.5 rounded-lg text-white/70 hover:bg-white/10 hover:text-white transition-colors"
              aria-label={t('videoSegmentExit')}
              title={t('videoSegmentExit')}
              data-testid="media-segment-exit"
            >
              <X size={14} />
            </button>
          </div>
        </div>
      )}

      <div className="flex-grow min-h-0 flex items-center justify-center p-4">
        {kind === 'video' ? (
          <video
            key={file.id}
            ref={(el) => {
              mediaRef.current = el;
            }}
            src={file.dataUrl}
            controls
            playsInline
            onTimeUpdate={handleTimeUpdate}
            className="max-w-full max-h-full outline-none"
            data-testid="media-nav-video"
          />
        ) : (
          <div className="w-full max-w-md flex flex-col items-center gap-4 rounded-xl bg-[#141518] border border-white/10 p-6">
            <span className="truncate text-sm font-medium text-white/90" title={file.name}>
              {file.name}
            </span>
            <audio
              key={file.id}
              ref={(el) => {
                mediaRef.current = el;
              }}
              src={file.dataUrl}
              controls
              onTimeUpdate={handleTimeUpdate}
              className="w-full outline-none"
              data-testid="media-nav-audio"
            />
          </div>
        )}
      </div>
    </div>
  );
};

export const MediaNavView = React.memo(MediaNavViewComponent);
