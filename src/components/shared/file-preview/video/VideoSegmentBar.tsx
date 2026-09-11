import React from 'react';
import { Repeat, X } from 'lucide-react';
import { useI18n } from '@/contexts/I18nContext';
import { formatTimestamp } from '@/utils/media-nav/timestamp';

interface VideoSegmentBarProps {
  segment: { start: number; end: number };
  isLoopEnabled: boolean;
  onToggleLoop: () => void;
  onExit: () => void;
}

export const VideoSegmentBar: React.FC<VideoSegmentBarProps> = ({ segment, isLoopEnabled, onToggleLoop, onExit }) => {
  const { t } = useI18n();

  return (
    <div className="flex items-center justify-between gap-2 px-3 py-1.5 bg-[#101113] border-b border-white/10 text-xs text-white/90 flex-shrink-0 z-30">
      <span className="font-mono">
        {t('videoLocateSegment')
          .replace('{start}', formatTimestamp(segment.start))
          .replace('{end}', formatTimestamp(segment.end))}
      </span>
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={onToggleLoop}
          className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
            isLoopEnabled ? 'bg-white/20 text-white' : 'text-white/70 hover:bg-white/10'
          }`}
          aria-pressed={isLoopEnabled}
          aria-label={t('videoSegmentLoop')}
          title={t('videoSegmentLoop')}
          data-testid="media-segment-loop"
        >
          <Repeat size={14} />
        </button>
        <button
          type="button"
          onClick={onExit}
          className="p-1.5 rounded-lg text-white/70 hover:bg-white/10 hover:text-white transition-colors cursor-pointer"
          aria-label={t('videoSegmentExit')}
          title={t('videoSegmentExit')}
          data-testid="media-segment-exit"
        >
          <X size={14} />
        </button>
      </div>
    </div>
  );
};
