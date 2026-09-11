import { useChatStore } from '@/stores/chatStore';
import { useMediaNavStore } from '@/stores/mediaNavStore';
import { collectSessionAudioFiles, isAudioFile, resolveNamedFile } from './sessionMediaFiles';
import { parseLocateMarkers } from './locateMarker';
import { applyMediaNavKindToSettings } from './mediaNavSettings';

export interface SeekSessionAudioParams {
  startSeconds: number;
  endSeconds?: number;
  audioName?: string;
  messageId?: string;
  snippet?: string;
}

/**
 * Seek the active session's audio to a specific timestamp/segment.
 * Automatically resolves the audio file and updates media nav store.
 */
export const seekSessionAudio = (params: SeekSessionAudioParams): boolean => {
  const { selectedFiles, activeMessages } = useChatStore.getState();
  const audios = collectSessionAudioFiles(selectedFiles, activeMessages);
  if (audios.length === 0) return false;

  let { audioName } = params;

  if (params.messageId) {
    const msg = activeMessages.find((m) => m.id === params.messageId);
    if (msg) {
      if (!audioName && msg.files) {
        const msgAudio = msg.files.find(isAudioFile);
        if (msgAudio) {
          audioName = msgAudio.name;
        }
      }

      if (msg.content) {
        const { audioLocates } = parseLocateMarkers(msg.content);
        const candidates = audioLocates.filter((loc) => {
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
          audioName = audioName || matched.audioName;
        }
      }
    }
  }

  const store = useMediaNavStore.getState();
  const target = resolveNamedFile(audios, audioName, store.activeFileId);
  if (!target) return false;

  store.openAs('audio');
  store.setActiveFile(target.id);
  store.jumpToTime(params.startSeconds, params.endSeconds);

  // Sync settings if chatStore has setCurrentChatSettings
  const chatStore = useChatStore.getState();
  if (typeof chatStore.setCurrentChatSettings === 'function') {
    chatStore.setCurrentChatSettings((prev) => applyMediaNavKindToSettings(prev, 'audio'));
  }

  return true;
};
