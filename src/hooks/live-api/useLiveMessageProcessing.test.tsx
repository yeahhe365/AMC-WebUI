import { act } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Outcome } from '@google/genai';

const { mockHandleToolCall, mockCancelToolCalls, mockCreateWavBlobFromPCMChunks } = vi.hoisted(() => ({
  mockHandleToolCall: vi.fn(),
  mockCancelToolCalls: vi.fn(),
  mockCreateWavBlobFromPCMChunks: vi.fn(() => 'blob:audio'),
}));

vi.mock('./useLiveTools', () => ({
  useLiveTools: () => ({
    handleToolCall: mockHandleToolCall,
    cancelToolCalls: mockCancelToolCalls,
  }),
}));

vi.mock('@/features/audio/audioProcessing', () => ({
  createWavBlobFromPCMChunks: mockCreateWavBlobFromPCMChunks,
}));

import { useLiveMessageProcessing } from './useLiveMessageProcessing';
import { createLiveServerMessage } from '@/test/live-api/fixtures';
import { renderHook } from '@/test/render/renderer';

describe('useLiveMessageProcessing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('plays every audio part in a Gemini 3.1 live model turn', async () => {
    const playAudioChunk = vi.fn();
    const onTranscript = vi.fn();

    const { result, unmount } = renderHook(() =>
      useLiveMessageProcessing({
        playAudioChunk,
        stopAudioPlayback: vi.fn(),
        onTranscript,
        sessionRef: { current: null },
        setSessionHandle: vi.fn(),
        sessionHandleRef: { current: null },
      }),
    );

    await act(async () => {
      await result.current.handleMessage(
        createLiveServerMessage({
          serverContent: {
            modelTurn: {
              parts: [
                { text: 'preface' },
                { inlineData: { data: 'audio-1' } },
                { inlineData: { data: 'audio-2' } },
                { text: 'suffix' },
              ],
            },
            turnComplete: true,
          },
        }),
      );
    });

    expect(playAudioChunk).toHaveBeenCalledTimes(2);
    expect(playAudioChunk).toHaveBeenNthCalledWith(1, 'audio-1');
    expect(playAudioChunk).toHaveBeenNthCalledWith(2, 'audio-2');
    expect(mockCreateWavBlobFromPCMChunks).toHaveBeenCalledWith(['audio-1', 'audio-2']);
    expect(onTranscript).toHaveBeenCalledWith('preface', 'model', false, 'content', undefined, undefined, {
      text: 'preface',
    });
    expect(onTranscript).toHaveBeenCalledWith('suffix', 'model', false, 'content', undefined, undefined, {
      text: 'suffix',
    });
    expect(onTranscript).toHaveBeenCalledWith('', 'model', true, 'content', 'blob:audio');

    unmount();
  });

  it('drops buffered audio chunks when the connection layer requests a reset', async () => {
    const playAudioChunk = vi.fn();
    const onTranscript = vi.fn();

    const { result, unmount } = renderHook(() =>
      useLiveMessageProcessing({
        playAudioChunk,
        stopAudioPlayback: vi.fn(),
        onTranscript,
        sessionRef: { current: null },
        setSessionHandle: vi.fn(),
        sessionHandleRef: { current: null },
      }),
    );

    await act(async () => {
      await result.current.handleMessage(
        createLiveServerMessage({
          serverContent: {
            modelTurn: {
              parts: [{ inlineData: { data: 'stale-audio' } }],
            },
          },
        }),
      );
    });

    act(() => {
      result.current.clearBufferedAudio();
    });

    await act(async () => {
      await result.current.handleMessage(
        createLiveServerMessage({
          serverContent: {
            turnComplete: true,
          },
        }),
      );
    });

    expect(mockCreateWavBlobFromPCMChunks).not.toHaveBeenCalled();
    expect(onTranscript).toHaveBeenCalledWith('', 'user', true, 'content');
    expect(onTranscript).toHaveBeenCalledWith('', 'model', true, 'content');

    unmount();
  });

  it('includes code execution output in live transcripts', async () => {
    const playAudioChunk = vi.fn();
    const onTranscript = vi.fn();

    const { result, unmount } = renderHook(() =>
      useLiveMessageProcessing({
        playAudioChunk,
        stopAudioPlayback: vi.fn(),
        onTranscript,
        sessionRef: { current: null },
        setSessionHandle: vi.fn(),
        sessionHandleRef: { current: null },
      }),
    );

    await act(async () => {
      await result.current.handleMessage(
        createLiveServerMessage({
          serverContent: {
            modelTurn: {
              parts: [
                {
                  codeExecutionResult: {
                    outcome: Outcome.OUTCOME_OK,
                    output: '42\n',
                  },
                },
              ],
            },
          },
        }),
      );
    });

    expect(onTranscript).toHaveBeenCalledWith(
      '\n\n<div class="tool-result outcome-ok"><pre><code class="language-text">42&#10;&#10;</code></pre></div>\n\n',
      'model',
      false,
      'content',
      undefined,
      undefined,
      {
        codeExecutionResult: {
          outcome: Outcome.OUTCOME_OK,
          output: '42\n',
        },
      },
    );

    unmount();
  });

  it('forwards live text model parts as api parts for state replay', async () => {
    const onTranscript = vi.fn();

    const { result, unmount } = renderHook(() =>
      useLiveMessageProcessing({
        playAudioChunk: vi.fn(),
        stopAudioPlayback: vi.fn(),
        onTranscript,
        sessionRef: { current: null },
        setSessionHandle: vi.fn(),
        sessionHandleRef: { current: null },
      }),
    );

    await act(async () => {
      await result.current.handleMessage(
        createLiveServerMessage({
          serverContent: {
            modelTurn: {
              parts: [{ text: 'Hello live.' }],
            },
          },
        }),
      );
    });

    expect(onTranscript).toHaveBeenCalledWith('Hello live.', 'model', false, 'content', undefined, undefined, {
      text: 'Hello live.',
    });

    unmount();
  });

  it('surfaces goAway messages to the connection layer', async () => {
    const onGoAway = vi.fn();

    const { result, unmount } = renderHook(() =>
      useLiveMessageProcessing({
        playAudioChunk: vi.fn(),
        stopAudioPlayback: vi.fn(),
        onGoAway,
        sessionRef: { current: null },
        setSessionHandle: vi.fn(),
        sessionHandleRef: { current: null },
      }),
    );

    await act(async () => {
      await result.current.handleMessage(
        createLiveServerMessage({
          goAway: {
            timeLeft: '5s',
          },
        }),
      );
    });

    expect(onGoAway).toHaveBeenCalledWith({ timeLeft: '5s' });

    unmount();
  });

  it('forwards tool call cancellations to the live tools layer', async () => {
    const { result, unmount } = renderHook(() =>
      useLiveMessageProcessing({
        playAudioChunk: vi.fn(),
        stopAudioPlayback: vi.fn(),
        sessionRef: { current: null },
        setSessionHandle: vi.fn(),
        sessionHandleRef: { current: null },
      }),
    );

    await act(async () => {
      await result.current.handleMessage(
        createLiveServerMessage({
          toolCallCancellation: {
            ids: ['call-1', 'call-2'],
          },
        }),
      );
    });

    expect(mockCancelToolCalls).toHaveBeenCalledWith(['call-1', 'call-2']);

    unmount();
  });
});
