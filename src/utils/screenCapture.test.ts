import { afterEach, describe, expect, it, vi } from 'vitest';
import { useToastStore } from '@/stores/toastStore';
import { captureScreenImage } from './screenCapture';

const originalMediaDevices = navigator.mediaDevices;
const originalImageCapture = window.ImageCapture;
const messages = {
  unsupported: 'Screen capture unsupported.',
  startFailed: (message: string) => `Screen capture failed: ${message}`,
};

describe('captureScreenImage', () => {
  afterEach(() => {
    vi.useRealTimers();
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: originalMediaDevices,
    });
    Object.defineProperty(window, 'ImageCapture', {
      configurable: true,
      value: originalImageCapture,
    });
    vi.restoreAllMocks();
  });

  it('returns null instead of throwing when mediaDevices is unavailable', async () => {
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: undefined,
    });

    await expect(captureScreenImage(messages)).resolves.toBeNull();

    expect(useToastStore.getState().toasts.map((toast) => toast.message)).toContain('Screen capture unsupported.');
  });

  it('settles and stops the stream when the video fallback never becomes ready', async () => {
    vi.useFakeTimers();
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
    const stop = vi.fn();
    const track = { stop } as unknown as MediaStreamTrack;
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: {
        getDisplayMedia: vi.fn(async () => ({
          getVideoTracks: () => [track],
          getTracks: () => [track],
        })),
      },
    });

    let resolvedValue: Blob | null | 'pending' = 'pending';
    const capturePromise = captureScreenImage(messages).then((value) => {
      resolvedValue = value;
    });

    await vi.advanceTimersByTimeAsync(3000);
    await capturePromise;

    expect(resolvedValue).toBeNull();
    expect(stop).toHaveBeenCalledTimes(1);
  });
});
