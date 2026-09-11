import React, { useCallback } from 'react';
import { Play } from 'lucide-react';
import { useI18n } from '@/contexts/I18nContext';
import { seekSessionVideo } from '@/utils/media-nav/seekVideo';
import { seekSessionAudio } from '@/utils/media-nav/seekAudio';
import { extractTextFromNode } from '@/utils/reactNodeText';
import { formatTimestamp } from '@/utils/media-nav/timestamp';
import { Tooltip } from '@/components/shared/Tooltip';

import { useChatStore } from '@/stores/chatStore';
import { useMediaNavStore } from '@/stores/mediaNavStore';
import { collectSessionMediaFiles, resolveNamedFile } from '@/utils/media-nav/sessionMediaFiles';

interface InlineTimestampSeekButtonProps {
  startSeconds: number;
  endSeconds?: number;
  videoName?: string;
  mediaKind?: 'video' | 'audio';
  annotation?: {
    point?: [number, number];
    box2d?: [number, number, number, number];
    snippet?: string;
  };
  messageId?: string;
  children: React.ReactNode;
}

/**
 * Minimalist graphite keycap inline timestamp seek button.
 * Uses neutral warm-cool slate/zinc tones, fine micro-border and subtle
 * drop shadow to blend seamlessly into editorial text without color clashing.
 * Supports reverse grounding (synchronized playback pulse) and hover mini-preview.
 */
export const InlineTimestampSeekButton: React.FC<InlineTimestampSeekButtonProps> = ({
  startSeconds,
  endSeconds,
  videoName,
  mediaKind,
  annotation,
  messageId,
  children,
}) => {
  const { t } = useI18n();
  const isAudio = useChatStore((state) => {
    if (mediaKind === 'audio') return true;
    if (mediaKind === 'video') return false;
    const store = useMediaNavStore.getState();
    if (store.isOpen && store.openKind === 'audio') return true;
    const { videos, audios } = collectSessionMediaFiles(state.selectedFiles, state.activeMessages);
    if (
      videoName &&
      audios.some((a) => a.name === videoName || a.name.toLowerCase().includes(videoName.toLowerCase()))
    ) {
      return true;
    }
    return videos.length === 0 && audios.length > 0;
  });

  const isOpen = useMediaNavStore((state) => state.isOpen);
  const openKind = useMediaNavStore((state) => state.openKind);
  const activeFileId = useMediaNavStore((state) => state.activeFileId);
  const currentPlayTime = useMediaNavStore((state) => state.currentPlayTime);

  const activeMediaMatches = useChatStore(
    useCallback(
      (state) => {
        const { videos, audios } = collectSessionMediaFiles(state.selectedFiles, state.activeMessages);
        const list = isAudio ? audios : videos;
        if (list.length === 0) return true;
        const activeMedia = (activeFileId ? list.find((m) => m.id === activeFileId) : null) ?? list[0];
        if (!activeMedia) return true;
        if (videoName) {
          const target = resolveNamedFile(list, videoName, activeFileId);
          return target?.id === activeMedia.id;
        }
        return list.length === 1;
      },
      [isAudio, videoName, activeFileId],
    ),
  );

  const isActive = Boolean(
    isOpen &&
    (isAudio ? openKind === 'audio' : openKind === 'video') &&
    activeMediaMatches &&
    currentPlayTime !== null &&
    (endSeconds !== undefined
      ? currentPlayTime >= startSeconds - 0.5 && currentPlayTime <= endSeconds + 0.5
      : currentPlayTime >= startSeconds - 0.5 && currentPlayTime <= startSeconds + 2.5),
  );

  const handleClick = (e: React.MouseEvent) => {
    // If user is selecting text (e.g. dragging mouse or double-clicking to copy),
    // prevent accidental media seek jump.
    const selection = window.getSelection();
    if (selection && !selection.isCollapsed && selection.toString().trim().length > 0) {
      return;
    }

    e.preventDefault();
    e.stopPropagation();

    if (isAudio) {
      seekSessionAudio({
        startSeconds,
        endSeconds,
        audioName: videoName,
        messageId,
        snippet: annotation?.snippet,
      });
    } else {
      seekSessionVideo({
        startSeconds,
        endSeconds,
        videoName,
        annotation,
        messageId,
        kind: mediaKind,
      });
    }
  };

  const labelText = extractTextFromNode(children);
  const actionTitle = isAudio ? t('audioLocateButton') : t('videoLocateButton');
  const buttonTitle = labelText ? `${actionTitle}: ${labelText}` : actionTitle;

  const tooltipPreview = (
    <div className="flex flex-col gap-1 max-w-[220px] text-xs select-none">
      <div className="flex items-center gap-1.5 font-semibold text-[var(--theme-text-primary)]">
        <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${isAudio ? 'bg-amber-500' : 'bg-emerald-500'}`} />
        <span
          className={`font-mono font-semibold ${isAudio ? 'text-amber-600 dark:text-amber-400' : 'text-emerald-600 dark:text-emerald-400'}`}
        >
          {formatTimestamp(startSeconds)}
          {endSeconds ? ` - ${formatTimestamp(endSeconds)}` : ''}
        </span>
        <span className="text-[10px] text-[var(--theme-text-tertiary)] font-sans">({isAudio ? '音频' : '视频'})</span>
      </div>
      {annotation?.snippet && (
        <div className="text-[var(--theme-text-primary)] text-[11px] leading-tight font-normal line-clamp-2">
          {annotation.snippet}
        </div>
      )}
      <div className="text-[10px] text-[var(--theme-text-tertiary)] mt-0.5">点击跳转播放</div>
    </div>
  );

  return (
    <Tooltip text={tooltipPreview} side="top" align="center" asChild delayDuration={300}>
      <button
        type="button"
        onClick={handleClick}
        className={`inline-flex items-center gap-1 px-1.5 py-0.5 -my-0.5 mx-0.5 rounded-[5px] font-mono text-[0.82em] active:scale-[0.97] transition-all cursor-pointer align-baseline ${
          isActive
            ? 'font-semibold text-emerald-800 dark:text-emerald-200 bg-emerald-50/95 dark:bg-emerald-950/60 border border-emerald-400/90 dark:border-emerald-500/80 shadow-[0_0_8px_rgba(52,211,153,0.35)] ring-1.5 ring-emerald-500/70 scale-[1.02]'
            : 'font-medium text-zinc-700 dark:text-zinc-200 bg-zinc-100/90 dark:bg-zinc-800/80 hover:bg-zinc-200/90 dark:hover:bg-zinc-700/80 hover:text-zinc-900 dark:hover:text-white border border-zinc-200/80 dark:border-zinc-700/60 shadow-[0_1px_1px_rgba(0,0,0,0.04)] dark:shadow-none'
        }`}
        title={buttonTitle}
        data-testid="inline-timestamp-seek-btn"
        data-active={isActive ? 'true' : undefined}
      >
        <Play
          size={8.5}
          aria-hidden="true"
          className={`fill-current flex-shrink-0 select-none pointer-events-none transition-colors ${
            isActive
              ? 'text-emerald-500 dark:text-emerald-400 animate-pulse'
              : 'text-zinc-400 dark:text-zinc-400 opacity-90'
          }`}
          data-selection-copy="exclude"
        />
        <span className="select-text">{children}</span>
      </button>
    </Tooltip>
  );
};
