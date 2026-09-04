import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { mockGetLiveApiClient, mockFloat32ToPCM16Base64 } = vi.hoisted(() => ({
  mockGetLiveApiClient: vi.fn(),
  mockFloat32ToPCM16Base64: vi.fn(() => 'pcm-base64'),
}));

vi.mock('@/services/api/liveApiAuth', () => ({
  LiveApiAuthConfigurationError: class LiveApiAuthConfigurationError extends Error {
    constructor(message: string) {
      super(message);
      this.name = 'LiveApiAuthConfigurationError';
    }
  },
  getLiveApiClient: mockGetLiveApiClient,
}));

vi.mock('@/features/audio/audioProcessing', () => ({
  float32ToPCM16Base64: mockFloat32ToPCM16Base64,
}));

import { useLiveConnection } from './useLiveConnection';
import { createAppSettings } from '@/test/data/factories';
import { createLiveSessionRef, createLiveSessionStub } from '@/test/live-api/fixtures';
import { renderHook } from '@/test/render/renderer';

const flushAsyncConnect = async () => {
  await Promise.resolve();
  await Promise.resolve();
};

describe('useLiveConnection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
    mockFloat32ToPCM16Base64.mockReturnValue('pcm-base64');
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('sends text with sendRealtimeInput for live sessions', async () => {
    const sendRealtimeInput = vi.fn();
    const sendClientContent = vi.fn();
    const sessionRef = createLiveSessionRef();

    mockGetLiveApiClient.mockResolvedValue({
      live: {
        connect: vi.fn(({ callbacks }) => {
          callbacks.onopen?.();
          callbacks.onmessage?.({ setupComplete: {} });
          return Promise.resolve({
            sendRealtimeInput,
            sendClientContent,
            close: vi.fn(),
          });
        }),
      },
    });

    const { result, unmount } = renderHook(() =>
      useLiveConnection({
        appSettings: createAppSettings(),
        modelId: 'gemini-3.1-flash-live-preview',
        liveConfig: {},
        tools: [],
        initializeAudio: vi.fn(),
        cleanupAudio: vi.fn(),
        stopVideo: vi.fn(),
        handleMessage: vi.fn(),
        setSessionHandle: vi.fn(),
        sessionHandleRef: { current: null },
        sessionRef,
      }),
    );

    let didConnect: boolean | undefined;
    let didSend: boolean | undefined;

    await act(async () => {
      didConnect = await result.current.connect();
      didSend = await result.current.sendText('Hello live');
    });

    expect(didConnect).toBe(true);
    expect(didSend).toBe(true);
    expect(sendRealtimeInput).toHaveBeenCalledWith({ text: 'Hello live' });
    expect(sendClientContent).not.toHaveBeenCalled();
    unmount();
  });

  it('sends Gemini 3.1 Flash Live inline content through realtime input', async () => {
    const sendRealtimeInput = vi.fn();
    const sendClientContent = vi.fn();
    const sessionRef = createLiveSessionRef();

    mockGetLiveApiClient.mockResolvedValue({
      live: {
        connect: vi.fn(({ callbacks }) => {
          callbacks.onopen?.();
          callbacks.onmessage?.({ setupComplete: {} });
          return Promise.resolve({
            sendRealtimeInput,
            sendClientContent,
            close: vi.fn(),
          });
        }),
      },
    });

    const { result, unmount } = renderHook(() =>
      useLiveConnection({
        appSettings: createAppSettings(),
        modelId: 'gemini-3.1-flash-live-preview',
        liveConfig: {},
        tools: [],
        initializeAudio: vi.fn(),
        cleanupAudio: vi.fn(),
        stopVideo: vi.fn(),
        handleMessage: vi.fn(),
        setSessionHandle: vi.fn(),
        sessionHandleRef: { current: null },
        sessionRef,
      }),
    );

    let didSend: boolean | undefined;
    await act(async () => {
      await result.current.connect();
      didSend = await result.current.sendContent([
        { inlineData: { mimeType: 'image/png', data: 'image-base64' } },
        { text: 'Describe this attachment' },
      ]);
    });

    expect(didSend).toBe(true);
    expect(sendRealtimeInput).toHaveBeenCalledWith({
      video: {
        mimeType: 'image/png',
        data: 'image-base64',
      },
    });
    expect(sendRealtimeInput).toHaveBeenCalledWith({ text: 'Describe this attachment' });
    expect(sendClientContent).not.toHaveBeenCalled();
    unmount();
  });

  it('does not send Gemini 3.1 Flash Live fileData content through sendClientContent', async () => {
    const sendRealtimeInput = vi.fn();
    const sendClientContent = vi.fn();
    const sessionRef = createLiveSessionRef();

    mockGetLiveApiClient.mockResolvedValue({
      live: {
        connect: vi.fn(({ callbacks }) => {
          callbacks.onopen?.();
          callbacks.onmessage?.({ setupComplete: {} });
          return Promise.resolve({
            sendRealtimeInput,
            sendClientContent,
            close: vi.fn(),
          });
        }),
      },
    });

    const { result, unmount } = renderHook(() =>
      useLiveConnection({
        appSettings: createAppSettings(),
        modelId: 'gemini-3.1-flash-live-preview',
        liveConfig: {},
        tools: [],
        initializeAudio: vi.fn(),
        cleanupAudio: vi.fn(),
        stopVideo: vi.fn(),
        handleMessage: vi.fn(),
        setSessionHandle: vi.fn(),
        sessionHandleRef: { current: null },
        sessionRef,
      }),
    );

    let didSend: boolean | undefined;
    await act(async () => {
      await result.current.connect();
      didSend = await result.current.sendContent([
        { fileData: { mimeType: 'image/png', fileUri: 'files/image-1' } },
        { text: 'Describe this attachment' },
      ]);
    });

    expect(didSend).toBe(false);
    expect(sendClientContent).not.toHaveBeenCalled();
    expect(sendRealtimeInput).not.toHaveBeenCalled();
    unmount();
  });

  it('keeps client content for older live models with multipart attachments', async () => {
    const sendRealtimeInput = vi.fn();
    const sendClientContent = vi.fn();
    const sessionRef = createLiveSessionRef();

    mockGetLiveApiClient.mockResolvedValue({
      live: {
        connect: vi.fn(({ callbacks }) => {
          callbacks.onopen?.();
          callbacks.onmessage?.({ setupComplete: {} });
          return Promise.resolve({
            sendRealtimeInput,
            sendClientContent,
            close: vi.fn(),
          });
        }),
      },
    });

    const { result, unmount } = renderHook(() =>
      useLiveConnection({
        appSettings: createAppSettings(),
        modelId: 'gemini-2.5-flash-native-audio-preview-12-2025',
        liveConfig: {},
        tools: [],
        initializeAudio: vi.fn(),
        cleanupAudio: vi.fn(),
        stopVideo: vi.fn(),
        handleMessage: vi.fn(),
        setSessionHandle: vi.fn(),
        sessionHandleRef: { current: null },
        sessionRef,
      }),
    );

    let didSend: boolean | undefined;
    await act(async () => {
      await result.current.connect();
      didSend = await result.current.sendContent([
        { fileData: { mimeType: 'image/png', fileUri: 'files/image-1' } },
        { text: 'Describe this attachment' },
      ]);
    });

    expect(didSend).toBe(true);
    expect(sendClientContent).toHaveBeenCalledWith({
      turns: {
        role: 'user',
        parts: [
          { fileData: { mimeType: 'image/png', fileUri: 'files/image-1' } },
          { text: 'Describe this attachment' },
        ],
      },
      turnComplete: true,
    });
    expect(sendRealtimeInput).not.toHaveBeenCalled();
    unmount();
  });

  it('uses the SDK default API version when connecting Live with a browser API key', async () => {
    const sendRealtimeInput = vi.fn();

    mockGetLiveApiClient.mockResolvedValue({
      live: {
        connect: vi.fn(({ callbacks }) => {
          callbacks.onopen?.();
          callbacks.onmessage?.({ setupComplete: {} });
          return Promise.resolve({
            sendRealtimeInput,
            close: vi.fn(),
          });
        }),
      },
    });

    const { result, unmount } = renderHook(() =>
      useLiveConnection({
        appSettings: createAppSettings(),
        modelId: 'gemini-3.1-flash-live-preview',
        liveConfig: {},
        liveApiKeyForConnection: 'browser-key',
        tools: [],
        initializeAudio: vi.fn(),
        cleanupAudio: vi.fn(),
        stopVideo: vi.fn(),
        handleMessage: vi.fn(),
        setSessionHandle: vi.fn(),
        sessionHandleRef: { current: null },
        sessionRef: { current: null },
      }),
    );

    await act(async () => {
      await result.current.connect();
    });

    expect(mockGetLiveApiClient).toHaveBeenCalledWith(
      expect.objectContaining({ apiKey: 'api-key' }),
      undefined,
      'browser-key',
    );
    unmount();
  });

  it('does not send text after disconnect clears the live session', async () => {
    const sendRealtimeInput = vi.fn();
    const close = vi.fn();

    const sessionRef = createLiveSessionRef(
      createLiveSessionStub({
        sendRealtimeInput,
        sendClientContent: vi.fn(),
        close,
      }),
    );

    const { result, unmount } = renderHook(() =>
      useLiveConnection({
        appSettings: createAppSettings(),
        modelId: 'gemini-3.1-flash-live-preview',
        liveConfig: {},
        tools: [],
        initializeAudio: vi.fn(),
        cleanupAudio: vi.fn(),
        stopVideo: vi.fn(),
        handleMessage: vi.fn(),
        setSessionHandle: vi.fn(),
        sessionHandleRef: { current: null },
        sessionRef,
      }),
    );

    act(() => {
      result.current.disconnect();
    });

    let didSend: boolean | undefined;
    await act(async () => {
      didSend = await result.current.sendText('should not send');
    });

    expect(didSend).toBe(false);
    expect(close).toHaveBeenCalled();
    expect(sendRealtimeInput).not.toHaveBeenCalled();
    unmount();
  });

  it('sends microphone chunks through the audio field', async () => {
    let audioCallback: ((data: Float32Array) => void) | null = null;
    const sendRealtimeInput = vi.fn();

    mockGetLiveApiClient.mockResolvedValue({
      live: {
        connect: vi.fn(({ callbacks }) => {
          callbacks.onopen?.();
          callbacks.onmessage?.({ setupComplete: {} });
          return Promise.resolve({
            sendRealtimeInput,
            close: vi.fn(),
          });
        }),
      },
    });

    const sessionRef = createLiveSessionRef();

    const { result, unmount } = renderHook(() =>
      useLiveConnection({
        appSettings: createAppSettings(),
        modelId: 'gemini-3.1-flash-live-preview',
        liveConfig: {},
        tools: [],
        initializeAudio: vi.fn(async (callback) => {
          audioCallback = callback;
        }),
        cleanupAudio: vi.fn(),
        stopVideo: vi.fn(),
        handleMessage: vi.fn(),
        setSessionHandle: vi.fn(),
        sessionHandleRef: { current: null },
        sessionRef,
      }),
    );

    await act(async () => {
      await result.current.connect();
    });

    expect(audioCallback).not.toBeNull();

    act(() => {
      audioCallback?.(new Float32Array([0.25, -0.25]));
    });

    await Promise.resolve();

    expect(sendRealtimeInput).toHaveBeenCalledWith({
      audio: {
        mimeType: 'audio/pcm;rate=16000',
        data: 'pcm-base64',
      },
    });
    unmount();
  });

  it('surfaces a configuration error when no browser API key is available for Live', async () => {
    mockGetLiveApiClient.mockRejectedValue(
      Object.assign(new Error('custom backend message'), {
        name: 'LiveApiAuthConfigurationError',
        code: 'MISSING_API_KEY',
      }),
    );

    const { result, unmount } = renderHook(() =>
      useLiveConnection({
        appSettings: createAppSettings(),
        modelId: 'gemini-3.1-flash-live-preview',
        liveConfig: {},
        tools: [],
        initializeAudio: vi.fn(),
        cleanupAudio: vi.fn(),
        stopVideo: vi.fn(),
        handleMessage: vi.fn(),
        setSessionHandle: vi.fn(),
        sessionHandleRef: { current: null },
        sessionRef: { current: null },
      }),
    );

    let didConnect: boolean | undefined;
    await act(async () => {
      didConnect = await result.current.connect();
    });

    expect(didConnect).toBe(false);
    expect(result.current.errorState).toEqual({
      kind: 'translation',
      key: 'liveStatusMissingApiKey',
      values: undefined,
    });
    expect(result.current.isReconnecting).toBe(false);
    unmount();
  });

  it('reconnects with exponential backoff after unexpected disconnects', async () => {
    vi.useFakeTimers();

    const callbacksByAttempt: Array<{
      onopen?: () => void;
      onmessage?: (message: unknown) => void;
      onclose?: (event: unknown) => void;
    }> = [];

    const connectLiveSession = vi.fn(({ callbacks }) => {
      callbacksByAttempt.push(callbacks);
      callbacks.onopen?.();
      return Promise.resolve({
        sendRealtimeInput: vi.fn(),
        close: vi.fn(),
      });
    });

    mockGetLiveApiClient
      .mockResolvedValueOnce({
        live: {
          connect: connectLiveSession,
        },
      })
      .mockRejectedValueOnce(new Error('temporary outage'))
      .mockResolvedValueOnce({
        live: {
          connect: connectLiveSession,
        },
      });

    const { result, unmount } = renderHook(() =>
      useLiveConnection({
        appSettings: createAppSettings(),
        modelId: 'gemini-3.1-flash-live-preview',
        liveConfig: {},
        tools: [],
        initializeAudio: vi.fn(),
        cleanupAudio: vi.fn(),
        stopVideo: vi.fn(),
        handleMessage: vi.fn(),
        setSessionHandle: vi.fn(),
        sessionHandleRef: { current: null },
        sessionRef: { current: null },
      }),
    );

    await act(async () => {
      const connectPromise = result.current.connect();
      await flushAsyncConnect();
      callbacksByAttempt[0]?.onmessage?.({ setupComplete: {} });
      await connectPromise;
    });

    expect(connectLiveSession).toHaveBeenCalledTimes(1);

    await act(async () => {
      callbacksByAttempt[0]?.onclose?.({ reason: 'network-blip' });
      await Promise.resolve();
    });

    expect(vi.getTimerCount()).toBe(1);

    act(() => {
      vi.advanceTimersByTime(999);
    });
    expect(connectLiveSession).toHaveBeenCalledTimes(1);

    await act(async () => {
      vi.advanceTimersByTime(1);
      await Promise.resolve();
    });
    expect(mockGetLiveApiClient).toHaveBeenCalledTimes(2);
    expect(connectLiveSession).toHaveBeenCalledTimes(1);

    expect(vi.getTimerCount()).toBe(1);

    await act(async () => {
      vi.advanceTimersByTime(1999);
      await Promise.resolve();
    });
    expect(mockGetLiveApiClient).toHaveBeenCalledTimes(2);
    expect(connectLiveSession).toHaveBeenCalledTimes(1);

    await act(async () => {
      vi.advanceTimersByTime(1);
      await Promise.resolve();
    });
    expect(mockGetLiveApiClient).toHaveBeenCalledTimes(3);
    expect(connectLiveSession).toHaveBeenCalledTimes(2);

    unmount();
  });

  it('cancels a pending reconnect when the user disconnects manually', async () => {
    vi.useFakeTimers();

    const callbacksByAttempt: Array<{
      onopen?: () => void;
      onmessage?: (message: unknown) => void;
      onclose?: (event: unknown) => void;
    }> = [];
    const close = vi.fn();
    const sessionRef = createLiveSessionRef();
    const sessionHandleRef = { current: null as string | null };

    const connectLiveSession = vi.fn(({ callbacks }) => {
      callbacksByAttempt.push(callbacks);
      callbacks.onopen?.();
      return Promise.resolve({
        sendRealtimeInput: vi.fn(),
        close,
      });
    });

    mockGetLiveApiClient.mockResolvedValue({
      live: {
        connect: connectLiveSession,
      },
    });

    const onClose = vi.fn();

    const { result, unmount } = renderHook(() =>
      useLiveConnection({
        appSettings: createAppSettings(),
        modelId: 'gemini-3.1-flash-live-preview',
        liveConfig: {},
        tools: [],
        initializeAudio: vi.fn(),
        cleanupAudio: vi.fn(),
        stopVideo: vi.fn(),
        handleMessage: vi.fn(),
        onClose,
        setSessionHandle: vi.fn(),
        sessionHandleRef,
        sessionRef,
      }),
    );

    await act(async () => {
      const connectPromise = result.current.connect();
      await flushAsyncConnect();
      callbacksByAttempt[0]?.onmessage?.({ setupComplete: {} });
      await connectPromise;
    });

    await act(async () => {
      callbacksByAttempt[0]?.onclose?.({ reason: 'unexpected-drop' });
      await Promise.resolve();
    });

    expect(vi.getTimerCount()).toBe(1);

    await act(async () => {
      result.current.disconnect();
      await Promise.resolve();
    });

    await act(async () => {
      vi.advanceTimersByTime(30_000);
      await Promise.resolve();
    });

    expect(connectLiveSession).toHaveBeenCalledTimes(1);
    expect(close).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();

    unmount();
  });

  it('does not queue duplicate reconnect timers for one disconnect event burst', async () => {
    vi.useFakeTimers();

    const callbacksByAttempt: Array<{
      onopen?: () => void;
      onmessage?: (message: unknown) => void;
      onclose?: (event: unknown) => void;
      onerror?: (error: Error) => void;
    }> = [];

    const connectLiveSession = vi.fn(({ callbacks }) => {
      callbacksByAttempt.push(callbacks);
      callbacks.onopen?.();
      return Promise.resolve({
        sendRealtimeInput: vi.fn(),
        close: vi.fn(),
      });
    });

    mockGetLiveApiClient.mockResolvedValue({
      live: {
        connect: connectLiveSession,
      },
    });

    const { result, unmount } = renderHook(() =>
      useLiveConnection({
        appSettings: createAppSettings(),
        modelId: 'gemini-3.1-flash-live-preview',
        liveConfig: {},
        tools: [],
        initializeAudio: vi.fn(),
        cleanupAudio: vi.fn(),
        stopVideo: vi.fn(),
        handleMessage: vi.fn(),
        setSessionHandle: vi.fn(),
        sessionHandleRef: { current: null },
        sessionRef: { current: null },
      }),
    );

    await act(async () => {
      const connectPromise = result.current.connect();
      await flushAsyncConnect();
      callbacksByAttempt[0]?.onmessage?.({ setupComplete: {} });
      await connectPromise;
    });

    await act(async () => {
      callbacksByAttempt[0]?.onerror?.(new Error('socket error'));
      callbacksByAttempt[0]?.onclose?.({ reason: 'socket closed' });
      await Promise.resolve();
    });

    expect(vi.getTimerCount()).toBe(1);

    await act(async () => {
      vi.advanceTimersByTime(1000);
      await Promise.resolve();
    });

    expect(connectLiveSession).toHaveBeenCalledTimes(2);

    unmount();
  });

  it('clears buffered audio and playback immediately before scheduling a reconnect', async () => {
    vi.useFakeTimers();

    const callbacksByAttempt: Array<{
      onopen?: () => void;
      onmessage?: (message: unknown) => void;
      onclose?: (event: unknown) => void;
    }> = [];
    const cleanupAudio = vi.fn();
    const clearBufferedAudio = vi.fn();

    const connectLiveSession = vi.fn(({ callbacks }) => {
      callbacksByAttempt.push(callbacks);
      callbacks.onopen?.();
      return Promise.resolve({
        sendRealtimeInput: vi.fn(),
        close: vi.fn(),
      });
    });

    mockGetLiveApiClient.mockResolvedValue({
      live: {
        connect: connectLiveSession,
      },
    });

    const { result, unmount } = renderHook(() =>
      useLiveConnection({
        appSettings: createAppSettings(),
        modelId: 'gemini-3.1-flash-live-preview',
        liveConfig: {},
        tools: [],
        initializeAudio: vi.fn(),
        cleanupAudio,
        clearBufferedAudio,
        stopVideo: vi.fn(),
        handleMessage: vi.fn(),
        setSessionHandle: vi.fn(),
        sessionHandleRef: { current: null },
        sessionRef: { current: null },
      }),
    );

    await act(async () => {
      const connectPromise = result.current.connect();
      await flushAsyncConnect();
      callbacksByAttempt[0]?.onmessage?.({ setupComplete: {} });
      await connectPromise;
    });

    await act(async () => {
      callbacksByAttempt[0]?.onclose?.({ reason: 'network-drop' });
      await Promise.resolve();
    });

    expect(cleanupAudio).toHaveBeenCalledTimes(1);
    expect(clearBufferedAudio).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(1);

    unmount();
  });

  it('does not mark the session connected until setupComplete arrives', async () => {
    const callbacksByAttempt: Array<{
      onopen?: () => void;
      onmessage?: (message: unknown) => void;
    }> = [];

    mockGetLiveApiClient.mockResolvedValue({
      live: {
        connect: vi.fn(({ callbacks }) => {
          callbacksByAttempt.push(callbacks);
          callbacks.onopen?.();
          return Promise.resolve({
            sendRealtimeInput: vi.fn(),
            close: vi.fn(),
          });
        }),
      },
    });

    const { result, unmount } = renderHook(() =>
      useLiveConnection({
        appSettings: createAppSettings(),
        modelId: 'gemini-3.1-flash-live-preview',
        liveConfig: {},
        tools: [],
        initializeAudio: vi.fn(),
        cleanupAudio: vi.fn(),
        stopVideo: vi.fn(),
        handleMessage: vi.fn(),
        setSessionHandle: vi.fn(),
        sessionHandleRef: { current: null },
        sessionRef: { current: null },
      }),
    );

    let didResolve = false;

    await act(async () => {
      const connectPromise = result.current.connect().then(() => {
        didResolve = true;
      });
      await flushAsyncConnect();

      expect(result.current.isConnected).toBe(false);
      expect(didResolve).toBe(false);

      callbacksByAttempt[0]?.onmessage?.({ setupComplete: {} });
      await connectPromise;
    });

    expect(result.current.isConnected).toBe(true);
    expect(didResolve).toBe(true);

    unmount();
  });

  it('cleans up audio and closes a pending live session when unmounted before setup completes', async () => {
    const close = vi.fn();
    const cleanupAudio = vi.fn();
    const clearBufferedAudio = vi.fn();
    const stopVideo = vi.fn();
    const sessionRef = createLiveSessionRef();

    const connectLiveSession = vi.fn(({ callbacks }) => {
      callbacks.onopen?.();
      return Promise.resolve({
        sendRealtimeInput: vi.fn(),
        close,
      });
    });

    mockGetLiveApiClient.mockResolvedValue({
      live: {
        connect: connectLiveSession,
      },
    });

    const { result, unmount } = renderHook(() =>
      useLiveConnection({
        appSettings: createAppSettings(),
        modelId: 'gemini-3.1-flash-live-preview',
        liveConfig: {},
        tools: [],
        initializeAudio: vi.fn(),
        cleanupAudio,
        clearBufferedAudio,
        stopVideo,
        handleMessage: vi.fn(),
        setSessionHandle: vi.fn(),
        sessionHandleRef: { current: null },
        sessionRef,
      }),
    );

    let connectPromise!: Promise<boolean>;
    await act(async () => {
      connectPromise = result.current.connect();
      await flushAsyncConnect();
    });

    expect(connectLiveSession).toHaveBeenCalledTimes(1);
    expect(result.current.isConnected).toBe(false);

    unmount();
    await flushAsyncConnect();

    expect(cleanupAudio).toHaveBeenCalledTimes(1);
    expect(clearBufferedAudio).toHaveBeenCalledTimes(1);
    expect(stopVideo).toHaveBeenCalledTimes(1);
    expect(close).toHaveBeenCalledTimes(1);
    expect(sessionRef.current).toBeNull();

    const connectOutcome = await Promise.race([
      connectPromise,
      new Promise<'pending'>((resolve) => {
        setTimeout(() => resolve('pending'), 0);
      }),
    ]);
    expect(connectOutcome).toBe(false);
  });

  it('reconnects immediately when the server sends goAway and a resumable handle is available', async () => {
    const callbacksByAttempt: Array<{
      onopen?: () => void;
      onmessage?: (message: unknown) => void;
      onclose?: (event: unknown) => void;
    }> = [];
    const close = vi.fn();
    const sessionRef = createLiveSessionRef();
    const sessionHandleRef = { current: 'resumable-handle' as string | null };

    const connectLiveSession = vi.fn(({ callbacks }) => {
      callbacksByAttempt.push(callbacks);
      callbacks.onopen?.();
      return Promise.resolve({
        sendRealtimeInput: vi.fn(),
        close,
      });
    });

    mockGetLiveApiClient.mockResolvedValue({
      live: {
        connect: connectLiveSession,
      },
    });

    const { result, unmount } = renderHook(() =>
      useLiveConnection({
        appSettings: createAppSettings(),
        modelId: 'gemini-3.1-flash-live-preview',
        liveConfig: {},
        tools: [],
        initializeAudio: vi.fn(),
        cleanupAudio: vi.fn(),
        stopVideo: vi.fn(),
        handleMessage: vi.fn(),
        setSessionHandle: vi.fn(),
        sessionHandleRef,
        sessionRef,
      }),
    );

    await act(async () => {
      const connectPromise = result.current.connect();
      await flushAsyncConnect();
      callbacksByAttempt[0]?.onmessage?.({ setupComplete: {} });
      await connectPromise;
    });

    await act(async () => {
      result.current.handleGoAway({ timeLeft: '5s' });
      await Promise.resolve();
    });

    expect(close).toHaveBeenCalledTimes(1);

    await act(async () => {
      callbacksByAttempt[0]?.onclose?.({ reason: 'server-rotation' });
      callbacksByAttempt[1]?.onmessage?.({ setupComplete: {} });
      await Promise.resolve();
    });

    expect(connectLiveSession).toHaveBeenCalledTimes(2);

    unmount();
  });

  // The Live Translate model runs continuous-stream translation and Google kills
  // the session with "Request contains an invalid argument" when audio resumes
  // after an audioStreamEnd signal, so the client-side hybrid VAD must stay
  // silent for it while remaining active for conversational live models.
  it.each([
    { modelId: 'gemini-3.1-flash-live-preview', shouldSignalStreamEnd: true },
    { modelId: 'gemini-3.5-live-translate-preview', shouldSignalStreamEnd: false },
  ])(
    'client speech end signals audioStreamEnd=$shouldSignalStreamEnd for $modelId',
    async ({ modelId, shouldSignalStreamEnd }) => {
      const sendRealtimeInput = vi.fn();
      const sessionRef = createLiveSessionRef();
      let onSpeechEnd: (() => void) | undefined;

      mockGetLiveApiClient.mockResolvedValue({
        live: {
          connect: vi.fn(({ callbacks }) => {
            callbacks.onopen?.();
            callbacks.onmessage?.({ setupComplete: {} });
            return Promise.resolve({ sendRealtimeInput, close: vi.fn() });
          }),
        },
      });
      const initializeAudio = vi.fn(async (_onAudioData: unknown, speechEnd?: () => void) => {
        onSpeechEnd = speechEnd;
      });

      const { result, unmount } = renderHook(() =>
        useLiveConnection({
          appSettings: createAppSettings(),
          modelId,
          liveConfig: {},
          tools: [],
          initializeAudio,
          cleanupAudio: vi.fn(),
          stopVideo: vi.fn(),
          handleMessage: vi.fn(),
          setSessionHandle: vi.fn(),
          sessionHandleRef: { current: null },
          sessionRef,
        }),
      );

      let didConnect: boolean | undefined;
      await act(async () => {
        didConnect = await result.current.connect();
      });
      expect(didConnect).toBe(true);
      expect(onSpeechEnd).toBeDefined();

      await act(async () => {
        onSpeechEnd?.();
        await flushAsyncConnect();
      });

      if (shouldSignalStreamEnd) {
        expect(sendRealtimeInput).toHaveBeenCalledWith({ audioStreamEnd: true });
      } else {
        expect(sendRealtimeInput).not.toHaveBeenCalled();
      }

      unmount();
    },
  );
});
