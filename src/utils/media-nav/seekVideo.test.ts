import { beforeEach, describe, expect, it } from 'vitest';
import { seekSessionVideo } from './seekVideo';
import { useChatStore } from '@/stores/chatStore';
import { useMediaNavStore } from '@/stores/mediaNavStore';
import type { ChatMessage, UploadedFile } from '@/types';

const mockVideoFile: UploadedFile = {
  id: 'v1',
  name: 'sample.mp4',
  type: 'video/mp4',
  size: 1024,
};

describe('seekSessionVideo', () => {
  beforeEach(() => {
    useMediaNavStore.setState({
      isOpen: false,
      activeFileId: null,
      videoTarget: null,
    });
    useChatStore.setState({
      selectedFiles: [mockVideoFile],
      activeMessages: [],
    });
  });

  it('returns false when no videos exist in session', () => {
    useChatStore.setState({ selectedFiles: [], activeMessages: [] });
    const result = seekSessionVideo({ startSeconds: 10 });
    expect(result).toBe(false);
  });

  it('seeks to timestamp on session video', () => {
    const result = seekSessionVideo({ startSeconds: 15, endSeconds: 25 });
    expect(result).toBe(true);

    const state = useMediaNavStore.getState();
    expect(state.isOpen).toBe(true);
    expect(state.activeFileId).toBe('v1');
    expect(state.videoTarget).toMatchObject({ seconds: 15, end: 25 });
  });

  it('picks the closest matching videoLocate marker when multiple markers are within 2 seconds', () => {
    const msg: ChatMessage = {
      id: 'm1',
      role: 'model',
      content: [
        '<video-locate start="00:10" point="100,200">病变A</video-locate>',
        '<video-locate start="00:12" point="300,400">病变B</video-locate>',
      ].join('\n'),
      timestamp: new Date(),
    };

    useChatStore.setState({
      selectedFiles: [mockVideoFile],
      activeMessages: [msg],
    });

    seekSessionVideo({
      startSeconds: 12,
      messageId: 'm1',
    });

    const target = useMediaNavStore.getState().videoTarget;
    expect(target?.snippet).toBe('病变B');
    expect(target?.point).toEqual([300, 400]);
  });

  it('delegates to audio navigation when only audio exists in session', () => {
    const mockAudio: UploadedFile = {
      id: 'a1',
      name: 'recording.mp3',
      type: 'audio/mpeg',
      size: 1024,
    };
    useChatStore.setState({
      selectedFiles: [mockAudio],
      activeMessages: [],
    });

    const result = seekSessionVideo({ startSeconds: 30, endSeconds: 60 });
    expect(result).toBe(true);

    const state = useMediaNavStore.getState();
    expect(state.isOpen).toBe(true);
    expect(state.openKind).toBe('audio');
    expect(state.activeFileId).toBe('a1');
    expect(state.videoTarget).toMatchObject({ seconds: 30, end: 60 });
  });

  it('delegates to audio when audio navigation panel is already open', () => {
    const mockAudio: UploadedFile = {
      id: 'a1',
      name: 'recording.mp3',
      type: 'audio/mpeg',
      size: 1024,
    };
    useMediaNavStore.setState({
      isOpen: true,
      openKind: 'audio',
      activeFileId: 'a1',
      videoTarget: null,
    });
    useChatStore.setState({
      selectedFiles: [mockVideoFile, mockAudio],
      activeMessages: [],
    });

    const result = seekSessionVideo({ startSeconds: 40 });
    expect(result).toBe(true);

    const state = useMediaNavStore.getState();
    expect(state.openKind).toBe('audio');
    expect(state.activeFileId).toBe('a1');
    expect(state.videoTarget?.seconds).toBe(40);
  });

  it('seeks to timestamp on YouTube video in session', () => {
    const mockYoutube: UploadedFile = {
      id: 'yt1',
      name: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      type: 'video/youtube-link',
      fileUri: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      size: 0,
    };
    useChatStore.setState({
      selectedFiles: [mockYoutube],
      activeMessages: [],
    });

    const result = seekSessionVideo({ startSeconds: 88, endSeconds: 120 });
    expect(result).toBe(true);

    const state = useMediaNavStore.getState();
    expect(state.isOpen).toBe(true);
    expect(state.openKind).toBe('video');
    expect(state.activeFileId).toBe('yt1');
    expect(state.videoTarget).toMatchObject({ seconds: 88, end: 120 });
  });
});
