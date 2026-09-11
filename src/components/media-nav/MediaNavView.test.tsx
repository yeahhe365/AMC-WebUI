import { setupProviderTestRenderer as setupTestRenderer } from '@/test/render/providerRenderer';
import { fireEvent, act } from '@testing-library/react';
import { describe, expect, it, beforeEach } from 'vitest';
import { MediaNavView } from './MediaNavView';
import { useMediaNavStore } from '@/stores/mediaNavStore';
import type { UploadedFile } from '@/types';

const mockVideoFile: UploadedFile = {
  id: 'test-video-1',
  name: 'test.mp4',
  type: 'video/mp4',
  size: 1024 * 1024,
  dataUrl: 'blob:mock-video-url',
};

const mockAudioFile: UploadedFile = {
  id: 'test-audio-1',
  name: 'test.mp3',
  type: 'audio/mp3',
  size: 512 * 1024,
  dataUrl: 'blob:mock-audio-url',
};

const mockYoutubeFile: UploadedFile = {
  id: 'test-yt-1',
  name: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
  type: 'video/youtube-link',
  fileUri: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
  size: 0,
};

describe('MediaNavView', () => {
  const renderer = setupTestRenderer({ providers: { language: 'en' } });

  beforeEach(() => {
    useMediaNavStore.setState({
      isOpen: true,
      openKind: 'video',
      activeFileId: 'test-video-1',
      videoTarget: null,
    });
  });

  it('renders video element with custom controls and testid', () => {
    renderer.render(<MediaNavView file={mockVideoFile} kind="video" />);
    const video = renderer.container.querySelector('[data-testid="media-nav-video"]');
    expect(video).not.toBeNull();
    expect(video?.getAttribute('src')).toBe('blob:mock-video-url');

    // Controls play button
    const playBtn = renderer.container.querySelector('button[aria-label="Play"]');
    expect(playBtn).not.toBeNull();
  });

  it('renders YoutubeNavPlayer when file is YouTube video', () => {
    renderer.render(<MediaNavView file={mockYoutubeFile} kind="video" />);
    const ytPlayer = renderer.container.querySelector('[data-testid="youtube-nav-player"]');
    expect(ytPlayer).not.toBeNull();
    const iframe = renderer.container.querySelector('[data-testid="youtube-nav-iframe"]');
    expect(iframe).not.toBeNull();
  });

  it('renders audio player when kind is audio', () => {
    renderer.render(<MediaNavView file={mockAudioFile} kind="audio" />);
    const audio = renderer.container.querySelector('[data-testid="media-nav-audio"]');
    expect(audio).not.toBeNull();
    expect(audio?.getAttribute('src')).toBe('blob:mock-audio-url');
  });

  it('activates segment and loop controls for audio upon jumpToTime', () => {
    renderer.render(<MediaNavView file={mockAudioFile} kind="audio" />);

    act(() => {
      useMediaNavStore.getState().jumpToTime(10, 25);
    });

    const audio = renderer.container.querySelector('audio')!;
    Object.defineProperty(audio, 'readyState', { value: 4, configurable: true });
    fireEvent.loadedMetadata(audio);

    // Audio segment bar should appear
    const loopBtn = renderer.container.querySelector('[data-testid="media-segment-loop"]');
    expect(loopBtn).not.toBeNull();

    const exitBtn = renderer.container.querySelector('[data-testid="media-segment-exit"]');
    expect(exitBtn).not.toBeNull();

    // Clicking exit removes the segment bar
    fireEvent.click(exitBtn!);
    expect(renderer.container.querySelector('[data-testid="media-segment-loop"]')).toBeNull();
  });

  it('activates segment and loop controls upon store jumpToTime', () => {
    renderer.render(<MediaNavView file={mockVideoFile} kind="video" />);

    act(() => {
      useMediaNavStore.getState().jumpToTime(10, 20, {
        box2d: [100, 200, 300, 400],
        snippet: '目标区域',
      });
    });

    // Simulate metadata ready
    const video = renderer.container.querySelector('video')!;
    Object.defineProperty(video, 'duration', { value: 60, configurable: true });
    Object.defineProperty(video, 'readyState', { value: 4, configurable: true });
    fireEvent.loadedMetadata(video);

    // Segment notification bar should appear
    const loopBtn = renderer.container.querySelector('[data-testid="media-segment-loop"]');
    expect(loopBtn).not.toBeNull();

    const exitBtn = renderer.container.querySelector('[data-testid="media-segment-exit"]');
    expect(exitBtn).not.toBeNull();

    // Clicking exit should remove the segment bar
    fireEvent.click(exitBtn!);
    expect(renderer.container.querySelector('[data-testid="media-segment-loop"]')).toBeNull();
  });

  it('handles frame stepping backward and forward without crash', () => {
    renderer.render(<MediaNavView file={mockVideoFile} kind="video" />);
    const stepBack = renderer.container.querySelector('button[aria-label="Previous frame (1/25s)"]');
    const stepForward = renderer.container.querySelector('button[aria-label="Next frame (1/25s)"]');

    expect(stepBack).not.toBeNull();
    expect(stepForward).not.toBeNull();

    fireEvent.click(stepForward!);
    fireEvent.click(stepBack!);
  });

  it('cycles playback rates on click', () => {
    renderer.render(<MediaNavView file={mockVideoFile} kind="video" />);
    const rateBtn = renderer.container.querySelector('button[aria-label="Playback speed"]')!;
    expect(rateBtn).not.toBeNull();
    expect(rateBtn.textContent).toContain('1x');

    fireEvent.click(rateBtn);
    expect(rateBtn.textContent).toContain('1.5x');

    fireEvent.click(rateBtn);
    expect(rateBtn.textContent).toContain('2x');

    fireEvent.click(rateBtn);
    expect(rateBtn.textContent).toContain('0.5x');
  });

  it('exits segment when scrubbing outside active segment bounds', () => {
    renderer.render(<MediaNavView file={mockVideoFile} kind="video" />);

    act(() => {
      useMediaNavStore.getState().jumpToTime(10, 20);
    });

    const video = renderer.container.querySelector('video')!;
    Object.defineProperty(video, 'duration', { value: 60, configurable: true });
    Object.defineProperty(video, 'readyState', { value: 4, configurable: true });
    fireEvent.loadedMetadata(video);

    expect(renderer.container.querySelector('[data-testid="media-segment-loop"]')).not.toBeNull();

    // User scrubs to 45s (outside 10-20)
    const rangeInput = renderer.container.querySelector('input[type="range"]') as HTMLInputElement;
    act(() => {
      fireEvent.change(rangeInput, { target: { value: '45' } });
    });

    // Segment notification bar should be removed because manual seek was outside segment
    expect(renderer.container.querySelector('[data-testid="media-segment-loop"]')).toBeNull();
  });
});
