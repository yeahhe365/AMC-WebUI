import { act } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { setupProviderTestRenderer } from '@/test/render/providerRenderer';
import { AudioPlayerView } from './AudioPlayerView';

vi.mock('@/components/icons/GoogleSpinner', () => ({
  GoogleSpinner: ({ size }: { size?: number | string }) => <div data-testid="google-spinner" data-size={size} />,
}));

describe('AudioPlayerView', () => {
  const renderer = setupProviderTestRenderer({ providers: { language: 'en' } });

  it('uses custom compact controls instead of browser-native audio controls', async () => {
    const audioRef = { current: null } as React.RefObject<HTMLAudioElement>;

    await act(async () => {
      renderer.render(
        <AudioPlayerView
          audioUrl="blob:quick-tts"
          isLoading={false}
          audioRef={audioRef}
          onDragStart={vi.fn()}
          onClose={vi.fn()}
        />,
      );
    });

    const audio = renderer.container.querySelector('audio');
    expect(audio).not.toBeNull();
    expect(audio?.hasAttribute('controls')).toBe(false);
    expect(renderer.container.querySelector('button[aria-label="Play"]')).not.toBeNull();
    expect(renderer.container.querySelector('input[type="range"]')).not.toBeNull();
  });

  it('renders elapsed and duration as separate compact time readouts', async () => {
    const audioRef = { current: null } as React.RefObject<HTMLAudioElement>;

    await act(async () => {
      renderer.render(
        <AudioPlayerView
          audioUrl="blob:quick-tts"
          isLoading={false}
          audioRef={audioRef}
          onDragStart={vi.fn()}
          onClose={vi.fn()}
        />,
      );
    });

    expect(renderer.container.querySelector('[aria-label="Text selection audio player"]')).not.toBeNull();
    expect(renderer.container.querySelectorAll('[data-audio-time-readout]')).toHaveLength(2);
  });

  it('uses a layered player surface and custom progress presentation', async () => {
    const audioRef = { current: null } as React.RefObject<HTMLAudioElement>;

    await act(async () => {
      renderer.render(
        <AudioPlayerView
          audioUrl="blob:quick-tts"
          isLoading={false}
          audioRef={audioRef}
          onDragStart={vi.fn()}
          onClose={vi.fn()}
        />,
      );
    });

    expect(renderer.container.querySelector('[data-audio-player-surface]')).not.toBeNull();
    expect(renderer.container.querySelector('[data-audio-progress-shell]')).not.toBeNull();
    expect(renderer.container.querySelector('[data-audio-progress-track]')).not.toBeNull();
    expect(renderer.container.querySelector('[data-audio-progress-fill]')).not.toBeNull();
    expect(renderer.container.querySelector('[data-audio-progress-thumb]')).not.toBeNull();
    expect(renderer.container.querySelector('[data-audio-progress-shell]')?.className).not.toContain('border');
    expect(renderer.container.querySelector('[data-audio-progress-track]')?.className).not.toContain('shadow');
    expect(renderer.container.querySelector('[data-audio-progress-thumb]')?.className).not.toContain('border');
    expect(renderer.container.querySelector('[data-audio-progress-thumb]')?.className).not.toContain('shadow');
    expect(renderer.container.querySelector('[data-audio-time-group]')?.className).not.toContain('border');
  });

  it('explicitly starts playback when metadata loads after async TTS', async () => {
    const audioRef = { current: null } as React.RefObject<HTMLAudioElement>;
    const play = vi.fn().mockResolvedValue(undefined);

    await act(async () => {
      renderer.render(
        <AudioPlayerView
          audioUrl="blob:quick-tts"
          isLoading={false}
          audioRef={audioRef}
          onDragStart={vi.fn()}
          onClose={vi.fn()}
        />,
      );
    });

    const audio = renderer.container.querySelector('audio');
    expect(audio).not.toBeNull();
    Object.defineProperty(audio, 'play', { configurable: true, value: play });
    Object.defineProperty(audio, 'duration', { configurable: true, value: 12 });
    Object.defineProperty(audio, 'paused', { configurable: true, value: true });

    await act(async () => {
      audio?.dispatchEvent(new Event('loadedmetadata'));
    });

    expect(play).toHaveBeenCalled();
  });

  it('uses the same Google spinner as the thinking module while generating audio', async () => {
    const audioRef = { current: null } as React.RefObject<HTMLAudioElement>;

    await act(async () => {
      renderer.render(
        <AudioPlayerView
          audioUrl={null}
          isLoading={true}
          audioRef={audioRef}
          onDragStart={vi.fn()}
          onClose={vi.fn()}
        />,
      );
    });

    expect(renderer.container.querySelector('[data-testid="google-spinner"]')).not.toBeNull();
    expect(renderer.container.querySelector('[data-testid="google-spinner"]')?.getAttribute('data-size')).toBe('20');
    expect(renderer.container.querySelector('[data-audio-loading-spinner]')).not.toBeNull();
    expect(renderer.container.querySelector('[data-audio-loading-spinner]')?.className).not.toContain('bg-');
    expect(renderer.container.querySelector('[data-audio-loading-spinner]')?.className).not.toContain('border');
    expect(renderer.container.querySelector('[data-audio-loading-spinner]')?.className).not.toContain('shadow');
    expect(renderer.container.querySelector('.animate-spin')).toBeNull();
    expect(renderer.container.textContent).toContain('Generating Audio');
  });
});
