import { act } from 'react';
import { setupProviderTestRenderer } from '@/test/render/providerRenderer';
import { describe, expect, it, vi } from 'vitest';
import { AudioPlayer } from './AudioPlayer';

vi.mock('@/utils/export/core', () => ({
  triggerDownload: vi.fn(),
}));

describe('AudioPlayer', () => {
  const renderer = setupProviderTestRenderer({ providers: { language: 'en' } });

  it('uses localized labels for playback controls', async () => {
    await act(async () => {
      renderer.root.render(<AudioPlayer src="https://example.com/audio.wav" />);
    });

    expect(renderer.container.querySelector('button[aria-label="Play"]')).not.toBeNull();
    expect(renderer.container.querySelector('button[title="Playback Speed"]')).not.toBeNull();
    expect(renderer.container.querySelector('button[title="Download Audio"]')).not.toBeNull();
  });

  it('toggles speed and triggers download', async () => {
    const { triggerDownload } = await import('@/utils/export/core');

    await act(async () => {
      renderer.root.render(<AudioPlayer src="https://example.com/audio.wav" />);
    });

    const speedBtn = renderer.container.querySelector('button[title="Playback Speed"]');
    expect(speedBtn?.textContent).toContain('1x');

    await act(async () => {
      speedBtn?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(speedBtn?.textContent).toContain('1.25x');

    const downloadBtn = renderer.container.querySelector('button[title="Download Audio"]');
    await act(async () => {
      downloadBtn?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(triggerDownload).toHaveBeenCalledWith(
      'https://example.com/audio.wav',
      expect.stringMatching(/^audio-\d+\.wav$/),
    );
  });
});
