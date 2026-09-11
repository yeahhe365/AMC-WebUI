import { act } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { renderHook } from '@/test/render/renderer';
import { useAudioPlayback } from './useAudioPlayback';

describe('useAudioPlayback', () => {
  it('initializes with default playback state', () => {
    const { result } = renderHook(() => useAudioPlayback({ src: 'test.mp3' }));

    expect(result.current.isPlaying).toBe(false);
    expect(result.current.duration).toBe(0);
    expect(result.current.currentTime).toBe(0);
    expect(result.current.progressPercent).toBe(0);
    expect(result.current.playbackRate).toBe(1);
    expect(result.current.isLoaded).toBe(false);
    expect(result.current.audioRef).toBeDefined();
  });

  it('updates duration and isLoaded on handleLoadedMetadata', () => {
    const { result } = renderHook(() => useAudioPlayback({ src: 'test.mp3' }));

    const mockAudio = {
      duration: 120,
      play: vi.fn().mockResolvedValue(undefined),
      paused: true,
    } as unknown as HTMLAudioElement;

    (result.current.audioRef as { current: HTMLAudioElement | null }).current = mockAudio;

    act(() => {
      result.current.audioProps.onLoadedMetadata();
    });

    expect(result.current.duration).toBe(120);
    expect(result.current.isLoaded).toBe(true);
  });

  it('calculates progressPercent correctly based on currentTime and duration', () => {
    const { result } = renderHook(() => useAudioPlayback({ src: 'test.mp3' }));

    const mockAudio = {
      duration: 200,
      currentTime: 50,
      play: vi.fn(),
      paused: true,
    } as unknown as HTMLAudioElement;

    (result.current.audioRef as { current: HTMLAudioElement | null }).current = mockAudio;

    act(() => {
      result.current.audioProps.onLoadedMetadata();
      result.current.audioProps.onTimeUpdate();
    });

    expect(result.current.currentTime).toBe(50);
    expect(result.current.progressPercent).toBe(25);
  });

  it('handles seekTo and handleSeek properly', () => {
    const { result } = renderHook(() => useAudioPlayback({ src: 'test.mp3' }));

    const mockAudio = {
      duration: 100,
      currentTime: 0,
      play: vi.fn(),
      paused: true,
    } as unknown as HTMLAudioElement;

    (result.current.audioRef as { current: HTMLAudioElement | null }).current = mockAudio;

    act(() => {
      result.current.audioProps.onLoadedMetadata();
    });

    act(() => {
      result.current.handleSeek({ target: { value: '45' } } as React.ChangeEvent<HTMLInputElement>);
    });

    expect(result.current.currentTime).toBe(45);
    expect(mockAudio.currentTime).toBe(45);
  });

  it('toggles playback states', () => {
    const playMock = vi.fn().mockResolvedValue(undefined);
    const pauseMock = vi.fn();

    let isPaused = true;
    const mockAudio = {
      play: playMock,
      pause: pauseMock,
      get paused() {
        return isPaused;
      },
    } as unknown as HTMLAudioElement;

    const { result } = renderHook(() => useAudioPlayback({ src: 'test.mp3' }));
    (result.current.audioRef as { current: HTMLAudioElement | null }).current = mockAudio;

    act(() => {
      result.current.togglePlay();
    });
    expect(playMock).toHaveBeenCalledTimes(1);

    act(() => {
      result.current.audioProps.onPlay();
    });
    expect(result.current.isPlaying).toBe(true);

    isPaused = false;
    act(() => {
      result.current.togglePlay();
    });
    expect(pauseMock).toHaveBeenCalledTimes(1);

    act(() => {
      result.current.audioProps.onPause();
    });
    expect(result.current.isPlaying).toBe(false);
  });

  it('resets currentTime and isPlaying when playback ends', () => {
    const mockAudio = {
      currentTime: 100,
      play: vi.fn(),
      paused: false,
    } as unknown as HTMLAudioElement;

    const { result } = renderHook(() => useAudioPlayback({ src: 'test.mp3' }));
    (result.current.audioRef as { current: HTMLAudioElement | null }).current = mockAudio;

    act(() => {
      result.current.audioProps.onPlay();
      result.current.audioProps.onEnded();
    });

    expect(result.current.isPlaying).toBe(false);
    expect(result.current.currentTime).toBe(0);
    expect(mockAudio.currentTime).toBe(0);
  });

  it('cycles through playback speeds on toggleSpeed', () => {
    const mockAudio = {
      playbackRate: 1,
    } as unknown as HTMLAudioElement;

    const { result } = renderHook(() => useAudioPlayback({ src: 'test.mp3' }));
    (result.current.audioRef as { current: HTMLAudioElement | null }).current = mockAudio;

    expect(result.current.playbackRate).toBe(1);

    act(() => result.current.toggleSpeed());
    expect(result.current.playbackRate).toBe(1.25);
    expect(mockAudio.playbackRate).toBe(1.25);

    act(() => result.current.toggleSpeed());
    expect(result.current.playbackRate).toBe(1.5);

    act(() => result.current.toggleSpeed());
    expect(result.current.playbackRate).toBe(2);

    act(() => result.current.toggleSpeed());
    expect(result.current.playbackRate).toBe(1);
  });
});
