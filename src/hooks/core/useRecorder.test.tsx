import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createDeferred, flushPromises, renderHook } from '@/test/render/renderer';
import { useSettingsStore } from '@/stores/settingsStore';
import { useRecorder } from './useRecorder';

/** Stand-in clock so elapsed time can be moved without waiting in real time. */
const fakeClock = { now: 1_000_000 };
const RECORDER_TIMESLICE_MS = 1000;
const DURATION_TICK_MS = 1000;

class FakeTrack {
  stop = vi.fn();
}

class FakeMediaStream {
  private readonly tracks: FakeTrack[];

  constructor(tracks = [new FakeTrack()]) {
    this.tracks = tracks;
  }

  getTracks() {
    return this.tracks;
  }
}

class FakeMediaRecorder {
  static isTypeSupported = vi.fn((mimeType: string): boolean => mimeType === 'audio/webm;codecs=opus');

  ondataavailable: ((event: BlobEvent) => void) | null = null;
  onstop: (() => void) | null = null;
  state = 'inactive';
  readonly stream: MediaStream;
  readonly options?: MediaRecorderOptions;
  readonly startCalls: number[] = [];

  constructor(stream: MediaStream, options?: MediaRecorderOptions) {
    this.stream = stream;
    this.options = options;
    mediaRecorderInstances.push(this);
  }

  start(timeslice?: number) {
    this.state = 'recording';
    this.startCalls.push(timeslice ?? -1);
  }

  pause() {
    this.state = 'paused';
  }

  resume() {
    this.state = 'recording';
  }

  stop() {
    this.state = 'inactive';
    this.onstop?.();
  }
}

let mediaRecorderInstances: FakeMediaRecorder[] = [];
const getUserMediaMock = vi.fn();

/** Fires exactly one duration tick (background tabs throttle the rest away). */
const advanceSingleTick = () => {
  act(() => {
    vi.advanceTimersByTime(DURATION_TICK_MS);
  });
};

const startRecordingWithRealClock = async (result: { current: ReturnType<typeof useRecorder> }) => {
  await act(async () => {
    await result.current.startRecording();
  });
};

describe('useRecorder', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    fakeClock.now = 1_000_000;
    vi.spyOn(Date, 'now').mockImplementation(() => fakeClock.now);

    vi.clearAllMocks();
    mediaRecorderInstances = [];
    FakeMediaRecorder.isTypeSupported = vi.fn((mimeType: string): boolean => mimeType === 'audio/webm;codecs=opus');

    Object.defineProperty(globalThis, 'MediaRecorder', {
      configurable: true,
      value: FakeMediaRecorder,
    });

    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: {
        getUserMedia: getUserMediaMock,
      },
    });

    getUserMediaMock.mockResolvedValue(new FakeMediaStream());
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    useSettingsStore.setState({ language: 'en' });
  });

  it('does not create a MediaRecorder if recording is cancelled while microphone permission is pending', async () => {
    const micStream = new FakeMediaStream();
    const deferredMic = createDeferred<MediaStream>();
    getUserMediaMock.mockReturnValue(deferredMic.promise);
    const { result, unmount } = renderHook(() => useRecorder());

    await act(async () => {
      void result.current.startRecording();
      await flushPromises();
    });

    expect(result.current.isInitializing).toBe(true);

    act(() => {
      result.current.cancelRecording();
    });

    await act(async () => {
      deferredMic.resolve(micStream as unknown as MediaStream);
      await flushPromises();
    });

    expect(mediaRecorderInstances).toHaveLength(0);
    expect(micStream.getTracks()[0].stop).toHaveBeenCalled();
    expect(result.current.status).toBe('idle');
    expect(result.current.isInitializing).toBe(false);

    unmount();
  });

  it('uses the first supported recording mime type', async () => {
    FakeMediaRecorder.isTypeSupported = vi.fn((mimeType: string): boolean => mimeType === 'audio/webm');
    const { result, unmount } = renderHook(() => useRecorder());

    await startRecordingWithRealClock(result);

    expect(mediaRecorderInstances).toHaveLength(1);
    expect(mediaRecorderInstances[0].options).toEqual({ mimeType: 'audio/webm' });

    unmount();
  });

  it('requests periodic chunks so long recordings are not buffered whole', async () => {
    const { result, unmount } = renderHook(() => useRecorder());

    await startRecordingWithRealClock(result);

    expect(mediaRecorderInstances[0].startCalls).toEqual([RECORDER_TIMESLICE_MS]);

    unmount();
  });

  it('measures elapsed time from the clock rather than from tick count', async () => {
    const { result, unmount } = renderHook(() => useRecorder());

    await startRecordingWithRealClock(result);

    // A throttled background tab advances the clock by minutes but only grants
    // a single timer callback.
    fakeClock.now += 600_000;
    advanceSingleTick();

    expect(result.current.duration).toBe(600);

    unmount();
  });

  it('excludes paused time from the reported duration', async () => {
    const { result, unmount } = renderHook(() => useRecorder());

    await startRecordingWithRealClock(result);

    fakeClock.now += 5_000;
    advanceSingleTick();
    expect(result.current.duration).toBe(5);

    act(() => {
      result.current.pauseRecording();
    });
    expect(result.current.status).toBe('paused');

    fakeClock.now += 10_000;
    advanceSingleTick();
    expect(result.current.duration).toBe(5);

    act(() => {
      result.current.resumeRecording();
    });
    expect(result.current.status).toBe('recording');

    fakeClock.now += 2_000;
    advanceSingleTick();
    expect(result.current.duration).toBe(7);

    unmount();
  });

  it('stops automatically once the maximum duration is reached', async () => {
    const { result, unmount } = renderHook(() => useRecorder({ maxDurationSeconds: 3 }));

    await startRecordingWithRealClock(result);

    fakeClock.now += 3_000;
    advanceSingleTick();

    expect(result.current.hasHitDurationLimit).toBe(true);
    expect(mediaRecorderInstances[0].state).toBe('inactive');
    expect(result.current.status).toBe('idle');

    unmount();
  });

  it('classifies a denied permission separately from a busy device', async () => {
    getUserMediaMock.mockRejectedValue(new DOMException('denied', 'NotAllowedError'));
    const { result: deniedResult, unmount: unmountDenied } = renderHook(() => useRecorder());
    await startRecordingWithRealClock(deniedResult);

    expect(deniedResult.current.errorKind).toBe('permission');
    unmountDenied();

    getUserMediaMock.mockRejectedValue(new DOMException('busy', 'NotReadableError'));
    const { result: busyResult, unmount: unmountBusy } = renderHook(() => useRecorder());
    await startRecordingWithRealClock(busyResult);

    expect(busyResult.current.errorKind).toBe('device');
    expect(busyResult.current.error).not.toBe(deniedResult.current.error);
    unmountBusy();
  });

  it('reports an unsupported-browser error when MediaRecorder is missing', async () => {
    Object.defineProperty(globalThis, 'MediaRecorder', { configurable: true, value: undefined });
    const { result, unmount } = renderHook(() => useRecorder());

    await startRecordingWithRealClock(result);

    expect(result.current.errorKind).toBe('unsupported');
    expect(mediaRecorderInstances).toHaveLength(0);

    unmount();
  });

  it('localizes recorder errors instead of falling back to English', async () => {
    useSettingsStore.setState({ language: 'zh' });
    getUserMediaMock.mockRejectedValue(new DOMException('denied', 'NotAllowedError'));
    const { result, unmount } = renderHook(() => useRecorder());

    await startRecordingWithRealClock(result);

    expect(result.current.error).toBe('麦克风权限被拒绝。');

    unmount();
  });

  it('honors a caller-supplied permission message', async () => {
    useSettingsStore.setState({ language: 'zh' });
    getUserMediaMock.mockRejectedValue(new DOMException('denied', 'NotAllowedError'));
    const { result, unmount } = renderHook(() => useRecorder({ permissionErrorMessage: 'Custom denial copy' }));

    await startRecordingWithRealClock(result);

    expect(result.current.error).toBe('Custom denial copy');

    unmount();
  });

  it('routes the recording to a caller-selected audio input device', async () => {
    const { result, unmount } = renderHook(() => useRecorder());

    await act(async () => {
      await result.current.startRecording({ deviceId: 'mic-2' });
    });

    expect(getUserMediaMock).toHaveBeenCalledWith(
      expect.objectContaining({ audio: expect.objectContaining({ deviceId: { exact: 'mic-2' } }) }),
    );

    unmount();
  });
});
