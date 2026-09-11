import { setupProviderTestRenderer as setupTestRenderer } from '@/test/render/providerRenderer';
import { fireEvent, act } from '@testing-library/react';
import { describe, expect, it, beforeEach, vi } from 'vitest';
import { YoutubeNavPlayer } from './YoutubeNavPlayer';
import { useMediaNavStore } from '@/stores/mediaNavStore';
import { useChatStore } from '@/stores/chatStore';
import type { UploadedFile, ChatMessage } from '@/types';

const mockYoutubeFile: UploadedFile = {
  id: 'yt-test-1',
  name: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
  type: 'video/youtube-link',
  fileUri: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
  size: 0,
};

describe('YoutubeNavPlayer', () => {
  const renderer = setupTestRenderer({ providers: { language: 'en' } });

  beforeEach(() => {
    useMediaNavStore.setState({
      isOpen: true,
      openKind: 'video',
      activeFileId: 'yt-test-1',
      videoTarget: null,
      currentPlayTime: null,
    });
    useChatStore.setState({
      activeMessages: [],
    });
  });

  it('renders iframe with embed URL and enablejsapi parameter', () => {
    renderer.render(<YoutubeNavPlayer file={mockYoutubeFile} />);
    const iframe = renderer.container.querySelector('[data-testid="youtube-nav-iframe"]');
    expect(iframe).not.toBeNull();
    const src = iframe?.getAttribute('src') || '';
    expect(src).toContain('https://www.youtube.com/embed/dQw4w9WgXcQ');
    expect(src).toContain('enablejsapi=1');
  });

  it('activates segment and loop controls upon store jumpToTime', () => {
    renderer.render(<YoutubeNavPlayer file={mockYoutubeFile} />);

    act(() => {
      useMediaNavStore.getState().jumpToTime(10, 25);
    });

    const loopBtn = renderer.container.querySelector('[data-testid="youtube-segment-loop"]');
    expect(loopBtn).not.toBeNull();
    expect(loopBtn?.getAttribute('aria-pressed')).toBe('true');

    const exitBtn = renderer.container.querySelector('[data-testid="youtube-segment-exit"]');
    expect(exitBtn).not.toBeNull();

    // Toggle loop
    fireEvent.click(loopBtn!);
    expect(loopBtn?.getAttribute('aria-pressed')).toBe('false');

    // Clicking exit removes the segment bar
    fireEvent.click(exitBtn!);
    expect(renderer.container.querySelector('[data-testid="youtube-segment-loop"]')).toBeNull();
  });

  it('sends postMessage when seekTarget is consumed', () => {
    renderer.render(<YoutubeNavPlayer file={mockYoutubeFile} />);
    const iframe = renderer.container.querySelector('iframe')!;
    const postMessageSpy = vi.fn();
    iframe.contentWindow!.postMessage = postMessageSpy;

    act(() => {
      useMediaNavStore.getState().jumpToTime(45);
    });

    expect(postMessageSpy).toHaveBeenCalledWith(
      JSON.stringify({ event: 'command', func: 'seekTo', args: [45, true] }),
      '*',
    );
    expect(postMessageSpy).toHaveBeenCalledWith(JSON.stringify({ event: 'command', func: 'playVideo', args: [] }), '*');
  });

  it('re-sends queued seek target when iframe onLoad fires', () => {
    renderer.render(<YoutubeNavPlayer file={mockYoutubeFile} />);
    const iframe = renderer.container.querySelector('iframe')!;
    const postMessageSpy = vi.fn();
    iframe.contentWindow!.postMessage = postMessageSpy;

    // Trigger seek target before iframe onLoad
    act(() => {
      useMediaNavStore.getState().jumpToTime(65);
    });

    postMessageSpy.mockClear();

    // Now iframe finishes loading
    fireEvent.load(iframe);

    expect(postMessageSpy).toHaveBeenCalledWith(JSON.stringify({ event: 'command', func: 'listening', args: [] }), '*');
    expect(postMessageSpy).toHaveBeenCalledWith(
      JSON.stringify({ event: 'command', func: 'seekTo', args: [65, true] }),
      '*',
    );
    expect(postMessageSpy).toHaveBeenCalledWith(JSON.stringify({ event: 'command', func: 'playVideo', args: [] }), '*');
  });

  it('renders timeline markers and allows clicking to seek', () => {
    const msg: ChatMessage = {
      id: 'm1',
      role: 'model',
      content:
        'Here is a key point [01:15](https://example.com) and [00:30-00:45](#video-seek?start=30&end=45&snippet=Key%20Action)',
      timestamp: new Date(),
    };
    useChatStore.setState({ activeMessages: [msg] });

    renderer.render(<YoutubeNavPlayer file={mockYoutubeFile} />);

    const markerBtn = renderer.container.querySelector('[data-testid="youtube-marker-30"]');
    expect(markerBtn).not.toBeNull();

    const iframe = renderer.container.querySelector('iframe')!;
    const postMessageSpy = vi.fn();
    iframe.contentWindow!.postMessage = postMessageSpy;

    fireEvent.click(markerBtn!);

    expect(postMessageSpy).toHaveBeenCalledWith(
      JSON.stringify({ event: 'command', func: 'seekTo', args: [30, true] }),
      '*',
    );

    // Segment bar should now be visible for the range 30-45
    expect(renderer.container.querySelector('[data-testid="youtube-segment-loop"]')).not.toBeNull();
  });

  it('displays fallback error message for invalid YouTube URL', () => {
    const invalidFile: UploadedFile = {
      id: 'bad-1',
      name: 'not-a-youtube-url',
      type: 'video/youtube-link',
      size: 0,
    };
    renderer.render(<YoutubeNavPlayer file={invalidFile} />);

    expect(renderer.container.querySelector('[data-testid="youtube-nav-iframe"]')).toBeNull();
    expect(renderer.container.textContent).toContain('Invalid YouTube URL');
  });
});
