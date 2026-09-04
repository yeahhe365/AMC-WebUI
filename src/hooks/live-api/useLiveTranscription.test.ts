import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act } from 'react';
import { renderHook } from '@/test/render/renderer';
import { useLiveTranscription } from './useLiveTranscription';
import { DEFAULT_APP_SETTINGS } from '@/constants/settingsDefaults';

const mockLiveConnect = vi.fn();
vi.mock('@/services/api/liveApiAuth', () => ({
  getLiveApiClient: vi.fn(() =>
    Promise.resolve({
      live: {
        connect: mockLiveConnect,
      },
    }),
  ),
}));

describe('useLiveTranscription', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('initializes with default idle state', () => {
    const { result, unmount } = renderHook(() =>
      useLiveTranscription({
        appSettings: DEFAULT_APP_SETTINGS,
        apiKey: 'test-api-key',
      }),
    );

    expect(result.current.isListening).toBe(false);
    expect(result.current.interimText).toBe('');
    expect(result.current.finalText).toBe('');
    expect(result.current.volume).toBe(0);
    expect(result.current.error).toBeNull();
    unmount();
  });

  it('connects to Live Transcription with SMART mode and custom vocabulary', async () => {
    let capturedCallbacks: {
      onopen?: () => void;
      onmessage?: (msg: {
        serverContent?: { interimInputTranscription?: { text: string }; inputTranscription?: { text: string } };
      }) => void;
    } = {};

    mockLiveConnect.mockImplementation(({ callbacks }: { callbacks: typeof capturedCallbacks }) => {
      capturedCallbacks = callbacks;
      return Promise.resolve({
        sendRealtimeInput: vi.fn(),
        close: vi.fn(),
      });
    });

    const mockGetUserMedia = vi.fn().mockResolvedValue({
      getTracks: () => [{ stop: vi.fn() }],
    });
    vi.stubGlobal('navigator', {
      mediaDevices: {
        getUserMedia: mockGetUserMedia,
      },
    });

    class MockAudioContext {
      state = 'running';
      resume = vi.fn().mockResolvedValue(undefined);
      createMediaStreamSource = vi.fn().mockReturnValue({ connect: vi.fn(), disconnect: vi.fn() });
      audioWorklet = { addModule: vi.fn().mockResolvedValue(undefined) };
      destination = {};
      close = vi.fn().mockResolvedValue(undefined);
    }
    vi.stubGlobal('AudioContext', MockAudioContext);

    class MockAudioWorkletNode {
      port = { onmessage: null, close: vi.fn() };
      connect = vi.fn();
      disconnect = vi.fn();
    }
    vi.stubGlobal('AudioWorkletNode', MockAudioWorkletNode);

    const onInterim = vi.fn();
    const onFinal = vi.fn();

    const { result, unmount } = renderHook(() =>
      useLiveTranscription({
        appSettings: DEFAULT_APP_SETTINGS,
        apiKey: 'test-api-key',
        options: {
          mode: 'SMART',
          customVocabulary: ['AMC', 'Gemini'],
          onInterimTranscript: onInterim,
          onFinalTranscript: onFinal,
        },
      }),
    );

    await act(async () => {
      await result.current.startListening();
    });

    expect(mockLiveConnect).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'gemini-3.5-transcribe-live',
        config: expect.objectContaining({
          responseModalities: ['TEXT'],
          inputAudioTranscription: {
            mode: 'SMART',
            languageCodes: [],
            customVocabulary: ['AMC', 'Gemini'],
          },
        }),
      }),
    );

    // Simulate onopen
    act(() => {
      capturedCallbacks.onopen?.();
    });
    expect(result.current.isListening).toBe(true);

    // Simulate interim text
    act(() => {
      capturedCallbacks.onmessage?.({
        serverContent: {
          interimInputTranscription: { text: 'Hello wor' },
        },
      });
    });
    expect(result.current.interimText).toBe('Hello wor');
    expect(onInterim).toHaveBeenCalledWith('Hello wor');

    // Simulate final committed text
    act(() => {
      capturedCallbacks.onmessage?.({
        serverContent: {
          inputTranscription: { text: 'Hello world.' },
        },
      });
    });
    expect(result.current.interimText).toBe('');
    expect(result.current.finalText).toBe('Hello world.');
    expect(onFinal).toHaveBeenCalledWith('Hello world.');

    unmount();
    vi.unstubAllGlobals();
  });
});
