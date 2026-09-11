import { useChatStore } from '@/stores/chatStore';
import { useMediaNavStore } from '@/stores/mediaNavStore';
import { collectSessionMediaFiles, isNavigableVideoFile, resolveNamedFile } from './sessionMediaFiles';
import { parseLocateMarkers } from './locateMarker';
import { seekSessionAudio } from './seekAudio';
import { applyMediaNavKindToSettings } from './mediaNavSettings';

export interface SeekSessionVideoParams {
  startSeconds: number;
  endSeconds?: number;
  videoName?: string;
  kind?: 'video' | 'audio';
  messageId?: string;
  annotation?: {
    box2d?: [number, number, number, number];
    point?: [number, number];
    snippet?: string;
  };
}

/**
 * Seek the active session's video to a specific timestamp/segment.
 * Automatically resolves the video file and any associated spatial annotations.
 * Seamlessly delegates to seekSessionAudio when navigating audio or in audio-only sessions.
 */
export const seekSessionVideo = (params: SeekSessionVideoParams): boolean => {
  const { selectedFiles, activeMessages } = useChatStore.getState();
  const { videos, audios } = collectSessionMediaFiles(selectedFiles, activeMessages);
  const store = useMediaNavStore.getState();

  // If active media in panel is audio and videoName is either absent or matches an audio file, seek audio
  const isAudioActive = store.isOpen && store.openKind === 'audio';
  const matchesAudio =
    params.videoName &&
    audios.some((a) => a.name === params.videoName || a.name.toLowerCase().includes(params.videoName!.toLowerCase()));

  if (
    params.kind === 'audio' ||
    (isAudioActive &&
      !params.annotation?.box2d &&
      !params.annotation?.point &&
      !videos.some((v) => v.name === params.videoName)) ||
    matchesAudio ||
    (videos.length === 0 && audios.length > 0)
  ) {
    return seekSessionAudio({
      startSeconds: params.startSeconds,
      endSeconds: params.endSeconds,
      audioName: params.videoName,
      messageId: params.messageId,
      snippet: params.annotation?.snippet,
    });
  }

  if (videos.length === 0) return false;

  let { videoName, annotation } = params;

  // If annotation or videoName is missing and a messageId was provided, look up the message context
  if (params.messageId) {
    const msg = activeMessages.find((m) => m.id === params.messageId);
    if (msg) {
      if (!videoName && msg.files) {
        const msgVideo = msg.files.find(isNavigableVideoFile);
        if (msgVideo) {
          videoName = msgVideo.name;
        }
      }

      if (!annotation && msg.content) {
        const { videoLocates } = parseLocateMarkers(msg.content);
        const candidates = videoLocates.filter((loc) => {
          if (params.endSeconds !== undefined) {
            return loc.startSeconds >= params.startSeconds - 1 && loc.startSeconds <= params.endSeconds + 1;
          }
          return Math.abs(loc.startSeconds - params.startSeconds) <= 2;
        });
        const matched =
          candidates.length > 0
            ? candidates.reduce((best, cur) =>
                Math.abs(cur.startSeconds - params.startSeconds) < Math.abs(best.startSeconds - params.startSeconds)
                  ? cur
                  : best,
              )
            : undefined;

        if (matched) {
          videoName = videoName || matched.videoName;
          if (matched.box2d || matched.point) {
            annotation = {
              box2d: matched.box2d,
              point: matched.point,
              snippet: matched.snippet,
            };
          }
        }
      }
    }
  }

  const target = resolveNamedFile(videos, videoName, store.activeFileId);
  if (!target) return false;

  store.openAs('video');
  store.setActiveFile(target.id);
  store.jumpToTime(params.startSeconds, params.endSeconds, annotation);

  const chatStore = useChatStore.getState();
  if (typeof chatStore.setCurrentChatSettings === 'function') {
    chatStore.setCurrentChatSettings((prev) => applyMediaNavKindToSettings(prev, 'video'));
  }

  return true;
};
