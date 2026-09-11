import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { probeMediaDuration } from './mediaDuration';

describe('probeMediaDuration', () => {
  const originalCreateObjectURL = URL.createObjectURL;
  const originalRevokeObjectURL = URL.revokeObjectURL;

  beforeEach(() => {
    URL.createObjectURL = vi.fn(() => 'blob:media-test');
    URL.revokeObjectURL = vi.fn();
  });

  afterEach(() => {
    URL.createObjectURL = originalCreateObjectURL;
    URL.revokeObjectURL = originalRevokeObjectURL;
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('resolves audio duration when metadata is loaded', async () => {
    class MockAudio {
      preload = '';
      src = '';
      duration = 12.5;
      addEventListener(event: string, handler: () => void) {
        if (event === 'loadedmetadata') {
          setTimeout(() => handler(), 10);
        }
      }
      removeAttribute() {}
    }

    vi.stubGlobal('Audio', MockAudio);

    const blob = new Blob(['fake audio'], { type: 'audio/mp3' });
    const duration = await probeMediaDuration('audio', blob);

    expect(duration).toBe(12.5);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:media-test');
  });

  it('resolves video duration when metadata is loaded', async () => {
    const fakeVideo = {
      preload: '',
      src: '',
      duration: 45.0,
      addEventListener: vi.fn((event, handler) => {
        if (event === 'loadedmetadata') {
          setTimeout(() => handler(), 10);
        }
      }),
      removeAttribute: vi.fn(),
    };

    vi.spyOn(document, 'createElement').mockImplementation((tagName) => {
      if (tagName === 'video') return fakeVideo as unknown as HTMLVideoElement;
      return document.createElement(tagName);
    });

    const blob = new Blob(['fake video'], { type: 'video/mp4' });
    const duration = await probeMediaDuration('video', blob);

    expect(duration).toBe(45.0);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:media-test');
  });

  it('returns null on media error event', async () => {
    class MockAudio {
      preload = '';
      src = '';
      duration = NaN;
      addEventListener(event: string, handler: () => void) {
        if (event === 'error') {
          setTimeout(() => handler(), 10);
        }
      }
      removeAttribute() {}
    }

    vi.stubGlobal('Audio', MockAudio);

    const blob = new Blob(['corrupted'], { type: 'audio/mp3' });
    const duration = await probeMediaDuration('audio', blob);

    expect(duration).toBeNull();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:media-test');
  });

  it('returns null when duration probe times out', async () => {
    class MockAudio {
      preload = '';
      src = '';
      duration = 10;
      addEventListener() {}
      removeAttribute() {}
    }

    vi.stubGlobal('Audio', MockAudio);

    const blob = new Blob(['hanging'], { type: 'audio/mp3' });
    const duration = await probeMediaDuration('audio', blob, 20);

    expect(duration).toBeNull();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:media-test');
  });
});
