import { beforeEach, describe, expect, it } from 'vitest';
import { seekSessionAudio } from './seekAudio';
import { useChatStore } from '@/stores/chatStore';
import { useMediaNavStore } from '@/stores/mediaNavStore';
import type { ChatMessage, UploadedFile } from '@/types';

const mockAudioFile: UploadedFile = {
  id: 'a1',
  name: 'interview.mp3',
  type: 'audio/mpeg',
  size: 1024,
};

describe('seekSessionAudio', () => {
  beforeEach(() => {
    useMediaNavStore.setState({
      isOpen: false,
      openKind: null,
      activeFileId: null,
      videoTarget: null,
    });
    useChatStore.setState({
      selectedFiles: [mockAudioFile],
      activeMessages: [],
    });
  });

  it('returns false when no audios exist in session', () => {
    useChatStore.setState({ selectedFiles: [], activeMessages: [] });
    const result = seekSessionAudio({ startSeconds: 10 });
    expect(result).toBe(false);
  });

  it('seeks to timestamp on session audio and opens panel as audio', () => {
    const result = seekSessionAudio({ startSeconds: 25, endSeconds: 45 });
    expect(result).toBe(true);

    const navState = useMediaNavStore.getState();
    expect(navState.isOpen).toBe(true);
    expect(navState.openKind).toBe('audio');
    expect(navState.activeFileId).toBe('a1');
    expect(navState.videoTarget).toMatchObject({ seconds: 25, end: 45 });
  });

  it('picks matching audioLocate marker from message context', () => {
    const msg: ChatMessage = {
      id: 'm1',
      role: 'model',
      content: [
        '<audio-locate audio="interview.mp3" start="01:20">重点A</audio-locate>',
        '<audio-locate audio="interview.mp3" start="01:25">重点B</audio-locate>',
      ].join('\n'),
      timestamp: new Date(),
    };

    useChatStore.setState({
      selectedFiles: [mockAudioFile],
      activeMessages: [msg],
    });

    seekSessionAudio({
      startSeconds: 84, // 01:24, close to 01:25
      messageId: 'm1',
    });

    const target = useMediaNavStore.getState().videoTarget;
    expect(target?.seconds).toBe(84);
  });
});
