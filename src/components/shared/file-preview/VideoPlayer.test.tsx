import { createRef, act } from 'react';
import { setupProviderTestRenderer as setupTestRenderer } from '@/test/render/providerRenderer';
import { fireEvent } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useVideoVolumeStore, resetVideoVolumeStoreForTest } from '@/stores/videoVolumeStore';
import { VideoPlayer, type VideoPlayerHandle } from './VideoPlayer';

describe('VideoPlayer', () => {
  const renderer = setupTestRenderer({ providers: { language: 'en' } });

  it('renders video element with custom controls and testid', () => {
    renderer.render(<VideoPlayer src="blob:mock-video-url" testId="custom-video-test" />);
    const video = renderer.container.querySelector('[data-testid="custom-video-test"]');
    expect(video).not.toBeNull();
    expect(video?.getAttribute('src')).toBe('blob:mock-video-url');

    // Check custom controls exist
    expect(renderer.container.querySelector('button[aria-label="Play"]')).not.toBeNull();
    expect(renderer.container.querySelector('button[aria-label="Playback speed"]')).not.toBeNull();
    expect(renderer.container.querySelector('button[aria-label="Fullscreen"]')).not.toBeNull();
    expect(renderer.container.querySelector('button[aria-label="Previous frame (1/25s)"]')).not.toBeNull();
    expect(renderer.container.querySelector('button[aria-label="Next frame (1/25s)"]')).not.toBeNull();
  });

  it('cycles playback rates on click', () => {
    renderer.render(<VideoPlayer src="blob:mock-video-url" />);
    const rateBtn = renderer.container.querySelector('button[aria-label="Playback speed"]')!;
    expect(rateBtn).not.toBeNull();
    expect(rateBtn.textContent).toContain('1x');

    fireEvent.click(rateBtn);
    expect(rateBtn.textContent).toContain('1.5x');

    fireEvent.click(rateBtn);
    expect(rateBtn.textContent).toContain('2x');

    fireEvent.click(rateBtn);
    expect(rateBtn.textContent).toContain('0.5x');

    fireEvent.click(rateBtn);
    expect(rateBtn.textContent).toContain('1x');
  });

  it('supports frame stepping backward and forward', () => {
    renderer.render(<VideoPlayer src="blob:mock-video-url" />);
    const stepBack = renderer.container.querySelector('button[aria-label="Previous frame (1/25s)"]');
    const stepForward = renderer.container.querySelector('button[aria-label="Next frame (1/25s)"]');

    expect(stepBack).not.toBeNull();
    expect(stepForward).not.toBeNull();

    // Click without crash
    fireEvent.click(stepForward!);
    fireEvent.click(stepBack!);
  });

  it('renders and exits segment when defaultSegment is provided', () => {
    renderer.render(
      <VideoPlayer src="blob:mock-video-url" defaultSegment={{ start: 10, end: 20 }} showSegmentBar={true} />,
    );

    const loopBtn = renderer.container.querySelector('[data-testid="media-segment-loop"]');
    expect(loopBtn).not.toBeNull();

    const exitBtn = renderer.container.querySelector('[data-testid="media-segment-exit"]');
    expect(exitBtn).not.toBeNull();

    fireEvent.click(exitBtn!);
    expect(renderer.container.querySelector('[data-testid="media-segment-loop"]')).toBeNull();
  });

  it('exposes imperative handle methods for programmatic control', () => {
    const playerRef = createRef<VideoPlayerHandle>();
    renderer.render(<VideoPlayer ref={playerRef} src="blob:mock-video-url" />);

    expect(playerRef.current).not.toBeNull();
    expect(typeof playerRef.current?.seekTo).toBe('function');
    expect(typeof playerRef.current?.stepFrame).toBe('function');
    expect(typeof playerRef.current?.togglePlay).toBe('function');
    expect(typeof playerRef.current?.toggleMute).toBe('function');
    expect(typeof playerRef.current?.toggleFullscreen).toBe('function');
    expect(playerRef.current?.getVideoElement()).not.toBeNull();

    act(() => {
      playerRef.current?.seekTo(15);
      playerRef.current?.stepFrame('forward');
      playerRef.current?.stepFrame('back');
      playerRef.current?.toggleMute();
      playerRef.current?.togglePlay();
    });
  });

  it('handles keyboard shortcuts when targeted', () => {
    renderer.render(<VideoPlayer src="blob:mock-video-url" allowHotkeys={true} />);
    const container = renderer.container.querySelector('[tabindex="0"]') as HTMLElement;
    expect(container).not.toBeNull();

    // Focus container to activate hotkeys
    container.focus();

    // Space to toggle play
    fireEvent.keyDown(window, { key: ' ', code: 'Space' });

    // Arrow keys
    fireEvent.keyDown(window, { key: 'ArrowRight', shiftKey: false });
    fireEvent.keyDown(window, { key: 'ArrowLeft', shiftKey: false });
    fireEvent.keyDown(window, { key: 'ArrowRight', shiftKey: true });
    fireEvent.keyDown(window, { key: 'ArrowLeft', shiftKey: true });

    // Mute key
    fireEvent.keyDown(window, { key: 'm' });

    // Fullscreen key
    fireEvent.keyDown(window, { key: 'f' });

    // Geek keys: j, k, l
    fireEvent.keyDown(window, { key: 'k' });
    fireEvent.keyDown(window, { key: 'j' });
    fireEvent.keyDown(window, { key: 'l' });

    // Frame stepping keys: , and .
    fireEvent.keyDown(window, { key: ',' });
    fireEvent.keyDown(window, { key: '.' });

    // Volume arrow keys
    fireEvent.keyDown(window, { key: 'ArrowUp' });
    fireEvent.keyDown(window, { key: 'ArrowDown' });

    // PiP key
    fireEvent.keyDown(window, { key: 'p' });
  });

  it('supports Picture-in-Picture toggle and controls button', () => {
    const playerRef = createRef<VideoPlayerHandle>();
    renderer.render(<VideoPlayer ref={playerRef} src="blob:mock-video-url" />);

    expect(typeof playerRef.current?.togglePictureInPicture).toBe('function');
    const pipBtn = renderer.container.querySelector('button[aria-label="画中画"]');
    expect(pipBtn).not.toBeNull();

    act(() => {
      playerRef.current?.togglePictureInPicture?.();
    });
  });

  it('initializes video element with persisted volume and muted state from store', () => {
    localStorage.clear();
    resetVideoVolumeStoreForTest();
    useVideoVolumeStore.getState().setVolume(0.42);
    useVideoVolumeStore.getState().setMuted(true);

    renderer.render(<VideoPlayer src="blob:mock-video-url" testId="custom-video-test" />);
    const video = renderer.container.querySelector('[data-testid="custom-video-test"]') as HTMLVideoElement;
    expect(video).not.toBeNull();
    expect(video.volume).toBe(0.42);
    expect(video.muted).toBe(true);
  });

  it('updates persisted store when volume or mute is modified via handle or controls', () => {
    localStorage.clear();
    resetVideoVolumeStoreForTest();
    const playerRef = createRef<VideoPlayerHandle>();
    renderer.render(<VideoPlayer ref={playerRef} src="blob:mock-video-url" />);

    act(() => {
      playerRef.current?.toggleMute();
    });
    expect(useVideoVolumeStore.getState().isMuted).toBe(true);

    act(() => {
      playerRef.current?.toggleMute();
    });
    expect(useVideoVolumeStore.getState().isMuted).toBe(false);
  });
});
