import { act } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useLiveFrameCapture } from './useLiveFrameCapture';
import { createLiveSessionRef, createLiveSessionStub } from '@/test/live-api/fixtures';
import { renderHook } from '@/test/render/renderer';

describe('useLiveFrameCapture', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it('sends frames through the video field at most once per second', async () => {
    const sendRealtimeInput = vi.fn();
    const sessionRef = createLiveSessionRef(createLiveSessionStub({ sendRealtimeInput }));

    const videoStream = {} as MediaStream;

    const { unmount } = renderHook(() =>
      useLiveFrameCapture({
        isConnected: true,
        videoStream,
        videoSource: 'camera',
        volume: 0.2,
        isMuted: false,
        captureFrame: () => 'jpeg-base64',
        sessionRef,
      }),
    );

    await act(async () => {
      vi.advanceTimersByTime(999);
    });
    expect(sendRealtimeInput).not.toHaveBeenCalled();

    await act(async () => {
      vi.advanceTimersByTime(1);
      await Promise.resolve();
    });

    expect(sendRealtimeInput).toHaveBeenCalledTimes(1);
    expect(sendRealtimeInput).toHaveBeenCalledWith({
      video: {
        mimeType: 'image/jpeg',
        data: 'jpeg-base64',
      },
    });

    unmount();
    vi.useRealTimers();
  });

  it('does not send frames while the user is silent', async () => {
    const sendRealtimeInput = vi.fn();
    const sessionRef = createLiveSessionRef(createLiveSessionStub({ sendRealtimeInput }));

    const videoStream = {} as MediaStream;

    const { unmount } = renderHook(() =>
      useLiveFrameCapture({
        isConnected: true,
        videoStream,
        videoSource: 'camera',
        volume: 0,
        isMuted: false,
        captureFrame: () => 'jpeg-base64',
        sessionRef,
      }),
    );

    await act(async () => {
      vi.advanceTimersByTime(1000);
      await Promise.resolve();
    });

    expect(sendRealtimeInput).not.toHaveBeenCalled();

    unmount();
    vi.useRealTimers();
  });

  it('continues sending screen-share frames while the user is silent', async () => {
    const sendRealtimeInput = vi.fn();
    const sessionRef = createLiveSessionRef(createLiveSessionStub({ sendRealtimeInput }));

    const videoStream = {} as MediaStream;

    const { unmount } = renderHook(() =>
      useLiveFrameCapture({
        isConnected: true,
        videoStream,
        videoSource: 'screen',
        volume: 0,
        isMuted: false,
        captureFrame: () => 'screen-jpeg-base64',
        sessionRef,
      }),
    );

    await act(async () => {
      vi.advanceTimersByTime(1000);
      await Promise.resolve();
    });

    expect(sendRealtimeInput).toHaveBeenCalledWith({
      video: {
        mimeType: 'image/jpeg',
        data: 'screen-jpeg-base64',
      },
    });

    unmount();
    vi.useRealTimers();
  });

  it('skips duplicate identical frames when screen sharing, but sends a heartbeat after 10s', async () => {
    const sendRealtimeInput = vi.fn();
    const sessionRef = createLiveSessionRef(createLiveSessionStub({ sendRealtimeInput }));

    const videoStream = {} as MediaStream;

    const { unmount } = renderHook(() =>
      useLiveFrameCapture({
        isConnected: true,
        videoStream,
        videoSource: 'screen',
        volume: 0,
        isMuted: false,
        captureFrame: () => 'static-screen-frame',
        sessionRef,
      }),
    );

    // First second: first frame sent
    await act(async () => {
      vi.advanceTimersByTime(1000);
      await Promise.resolve();
    });
    expect(sendRealtimeInput).toHaveBeenCalledTimes(1);

    // Second second: identical frame skipped
    await act(async () => {
      vi.advanceTimersByTime(1000);
      await Promise.resolve();
    });
    expect(sendRealtimeInput).toHaveBeenCalledTimes(1);

    // 10 seconds later: heartbeat triggers a send even if identical
    await act(async () => {
      vi.advanceTimersByTime(9000);
      await Promise.resolve();
    });
    expect(sendRealtimeInput).toHaveBeenCalledTimes(2);

    unmount();
    vi.useRealTimers();
  });
});
