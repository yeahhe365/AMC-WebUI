import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Part } from '@google/genai';

const { mockGetConfiguredApiClient, mockGenerateContent, mockGenerateContentStream } = vi.hoisted(() => ({
  mockGetConfiguredApiClient: vi.fn(),
  mockGenerateContent: vi.fn(),
  mockGenerateContentStream: vi.fn(),
}));

vi.mock('./apiClient', async () => {
  const actual = await vi.importActual<typeof import('./apiClient')>('./apiClient');
  return {
    ...actual,
    getConfiguredApiClient: mockGetConfiguredApiClient,
  };
});

import { sendStatelessMessageNonStreamApi, sendStatelessMessageStreamApi, generateContentTurnApi } from './chatApi';

describe('chatApi media resolution routing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetConfiguredApiClient.mockResolvedValue({
      models: {
        generateContent: mockGenerateContent,
        generateContentStream: mockGenerateContentStream,
      },
    });
  });

  it('uses v1alpha for streaming requests with per-part media resolution', async () => {
    mockGenerateContentStream.mockResolvedValue(
      (async function* () {
        yield {
          candidates: [
            {
              content: {
                parts: [{ text: 'done' }],
              },
            },
          ],
        };
      })(),
    );

    await sendStatelessMessageStreamApi(
      'key',
      'gemini-3.1-pro-preview',
      [],
      [
        {
          text: 'describe this image',
          mediaResolution: { level: 'MEDIA_RESOLUTION_HIGH' },
        } as unknown as Part,
      ],
      {},
      new AbortController().signal,
      vi.fn(),
      vi.fn(),
      vi.fn(),
      vi.fn(),
    );

    expect(mockGetConfiguredApiClient).toHaveBeenCalledWith('key', {
      apiVersion: 'v1alpha',
    });
  });

  it('uses v1alpha for non-stream requests when history carries per-part media resolution', async () => {
    mockGenerateContent.mockResolvedValue({
      candidates: [
        {
          content: {
            parts: [{ text: 'done' }],
          },
        },
      ],
    });

    await sendStatelessMessageNonStreamApi(
      'key',
      'gemini-3.1-pro-preview',
      [
        {
          role: 'user',
          parts: [
            {
              fileData: {
                fileUri: 'files/123',
                mimeType: 'image/png',
              },
              mediaResolution: { level: 'MEDIA_RESOLUTION_HIGH' },
            } as unknown as Part,
          ],
        },
      ],
      [{ text: 'continue' }],
      {},
      new AbortController().signal,
      vi.fn(),
      vi.fn(),
    );

    expect(mockGetConfiguredApiClient).toHaveBeenCalledWith('key', {
      apiVersion: 'v1alpha',
    });
  });

  it('uses the provided role for non-stream prefilled model turns', async () => {
    mockGenerateContent.mockResolvedValue({
      candidates: [
        {
          content: {
            parts: [{ text: 'done' }],
          },
        },
      ],
    });

    await sendStatelessMessageNonStreamApi(
      'key',
      'gemini-3-flash-preview',
      [{ role: 'user', parts: [{ text: 'Question' }] }],
      [{ text: '<thinking>' }],
      {},
      new AbortController().signal,
      vi.fn(),
      vi.fn(),
      'model',
    );

    expect(mockGenerateContent).toHaveBeenCalledWith(
      expect.objectContaining({
        contents: [
          { role: 'user', parts: [{ text: 'Question' }] },
          { role: 'model', parts: [{ text: '<thinking>' }] },
        ],
      }),
    );
  });

  it('accumulates streamed grounding metadata across chunks', async () => {
    mockGenerateContentStream.mockResolvedValue(
      (async function* () {
        yield {
          candidates: [
            {
              groundingMetadata: {
                webSearchQueries: ['latest gemini release'],
                groundingChunks: [
                  {
                    web: {
                      uri: 'https://example.com/first',
                      title: 'First source',
                    },
                  },
                ],
              },
              content: {
                parts: [{ text: 'Gemini ' }],
              },
            },
          ],
        };

        yield {
          candidates: [
            {
              groundingMetadata: {
                groundingChunks: [
                  {
                    web: {
                      uri: 'https://example.com/second',
                      title: 'Second source',
                    },
                  },
                ],
                groundingSupports: [
                  {
                    segment: { endIndex: 6 },
                    groundingChunkIndices: [0, 1],
                  },
                ],
              },
              content: {
                parts: [{ text: '3.1' }],
              },
            },
          ],
        };
      })(),
    );

    const onComplete = vi.fn();

    await sendStatelessMessageStreamApi(
      'key',
      'gemini-3-flash-preview',
      [],
      [{ text: 'What is the latest Gemini release?' }],
      { tools: [{ googleSearch: {} }] },
      new AbortController().signal,
      vi.fn(),
      vi.fn(),
      vi.fn(),
      onComplete,
    );

    expect(onComplete).toHaveBeenCalledWith(
      undefined,
      expect.objectContaining({
        webSearchQueries: ['latest gemini release'],
        groundingChunks: [
          {
            web: {
              uri: 'https://example.com/first',
              title: 'First source',
            },
          },
          {
            web: {
              uri: 'https://example.com/second',
              title: 'Second source',
            },
          },
        ],
        groundingSupports: [
          {
            segment: { endIndex: 6 },
            groundingChunkIndices: [0, 1],
          },
        ],
      }),
      null,
    );
  });

  it('preserves streamed plain-text chunk boundaries when chunks start or end with newlines', async () => {
    mockGenerateContentStream.mockResolvedValue(
      (async function* () {
        yield {
          candidates: [
            {
              content: {
                parts: [{ text: 'Hello\n' }],
              },
            },
          ],
        };

        yield {
          candidates: [
            {
              content: {
                parts: [{ text: '\nworld' }],
              },
            },
          ],
        };
      })(),
    );

    const onPart = vi.fn();

    await sendStatelessMessageStreamApi(
      'key',
      'gemini-3-flash-preview',
      [],
      [{ text: 'Write two paragraphs.' }],
      {},
      new AbortController().signal,
      onPart,
      vi.fn(),
      vi.fn(),
      vi.fn(),
    );

    expect(onPart).toHaveBeenNthCalledWith(1, { text: 'Hello\n' });
    expect(onPart).toHaveBeenNthCalledWith(2, { text: '\nworld' });
  });

  it('preserves streamed thought signatures as context parts without rendering thought text', async () => {
    mockGenerateContentStream.mockResolvedValue(
      (async function* () {
        yield {
          candidates: [
            {
              content: {
                parts: [
                  {
                    text: 'Plan internally.',
                    thought: true,
                    thoughtSignature: 'sig-thought-stream',
                  },
                ],
              },
            },
          ],
        };
      })(),
    );

    const onPart = vi.fn();
    const onThoughtChunk = vi.fn();

    await sendStatelessMessageStreamApi(
      'key',
      'gemini-3-flash-preview',
      [],
      [{ text: 'Solve this.' }],
      {},
      new AbortController().signal,
      onPart,
      onThoughtChunk,
      vi.fn(),
      vi.fn(),
    );

    expect(onThoughtChunk).toHaveBeenCalledWith('Plan internally.');
    expect(onPart).toHaveBeenCalledWith({
      text: '',
      thoughtSignature: 'sig-thought-stream',
    });
  });

  it('extracts Gemma thought channels from official non-stream text responses', async () => {
    mockGenerateContent.mockResolvedValue({
      candidates: [
        {
          content: {
            parts: [
              {
                text: '<|channel>thought\nPlan carefully.\n<channel|>Final answer.',
              },
            ],
          },
        },
      ],
    });

    const onComplete = vi.fn();

    await sendStatelessMessageNonStreamApi(
      'key',
      'gemma-4-31b-it',
      [],
      [{ text: 'Solve this' }],
      {},
      new AbortController().signal,
      vi.fn(),
      onComplete,
    );

    expect(onComplete).toHaveBeenCalledWith(
      [{ text: 'Final answer.' }],
      'Plan carefully.',
      undefined,
      undefined,
      undefined,
    );
  });

  it('extracts streamed top-level text responses through the shared response parser', async () => {
    mockGenerateContentStream.mockResolvedValue(
      (async function* () {
        yield {
          text: '<|channel>thought\nSketch privately.\n<channel|>Visible stream.',
        };
      })(),
    );

    const onPart = vi.fn();
    const onThoughtChunk = vi.fn();

    await sendStatelessMessageStreamApi(
      'key',
      'gemma-4-31b-it',
      [],
      [{ text: 'Solve this.' }],
      {},
      new AbortController().signal,
      onPart,
      onThoughtChunk,
      vi.fn(),
      vi.fn(),
    );

    expect(onThoughtChunk).toHaveBeenCalledWith('Sketch privately.');
    expect(onPart).toHaveBeenCalledWith({ text: 'Visible stream.' });
  });

  it('preserves non-stream thought signatures as context parts without rendering thought text', async () => {
    mockGenerateContent.mockResolvedValue({
      candidates: [
        {
          content: {
            parts: [
              {
                text: 'Plan internally.',
                thought: true,
                thoughtSignature: 'sig-thought-nonstream',
              },
              { text: 'Final answer.' },
            ],
          },
        },
      ],
    });

    const onComplete = vi.fn();

    await sendStatelessMessageNonStreamApi(
      'key',
      'gemini-3-flash-preview',
      [],
      [{ text: 'Solve this.' }],
      {},
      new AbortController().signal,
      vi.fn(),
      onComplete,
    );

    expect(onComplete).toHaveBeenCalledWith(
      [
        {
          text: '',
          thoughtSignature: 'sig-thought-nonstream',
        },
        { text: 'Final answer.' },
      ],
      'Plan internally.',
      undefined,
      undefined,
      undefined,
    );
  });

  it('forwards abortSignal through generateContent config for non-stream requests', async () => {
    mockGenerateContent.mockResolvedValue({
      candidates: [
        {
          content: {
            parts: [{ text: 'done' }],
          },
        },
      ],
    });

    const abortController = new AbortController();

    await sendStatelessMessageNonStreamApi(
      'key',
      'gemini-3.1-flash-image-preview',
      [],
      [{ text: 'Generate an icon.' }],
      { responseModalities: ['IMAGE', 'TEXT'] },
      abortController.signal,
      vi.fn(),
      vi.fn(),
    );

    expect(mockGenerateContent).toHaveBeenCalledWith(
      expect.objectContaining({
        config: expect.objectContaining({
          abortSignal: abortController.signal,
        }),
      }),
    );
  });

  it('keeps backward compatibility for legacy Gemma thought channel formatting', async () => {
    mockGenerateContent.mockResolvedValue({
      candidates: [
        {
          content: {
            parts: [
              {
                text: '<|channel|thought>Plan carefully.<channel|>Final answer.',
              },
            ],
          },
        },
      ],
    });

    const onComplete = vi.fn();

    await sendStatelessMessageNonStreamApi(
      'key',
      'gemma-4-31b-it',
      [],
      [{ text: 'Solve this' }],
      {},
      new AbortController().signal,
      vi.fn(),
      onComplete,
    );

    expect(onComplete).toHaveBeenCalledWith(
      [{ text: 'Final answer.' }],
      'Plan carefully.',
      undefined,
      undefined,
      undefined,
    );
  });
});

describe('generateContentTurnApi finishReason handling', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetConfiguredApiClient.mockResolvedValue({
      models: {
        generateContent: mockGenerateContent,
        generateContentStream: mockGenerateContentStream,
      },
    });
  });

  it('throws when the model produced a malformed function call even with partial text', async () => {
    mockGenerateContent.mockResolvedValue({
      candidates: [
        {
          finishReason: 'MALFORMED_FUNCTION_CALL',
          content: { parts: [{ text: 'partial answer' }] },
        },
      ],
    });

    await expect(
      generateContentTurnApi('key', 'gemini-3-flash-preview', [], {}, new AbortController().signal),
    ).rejects.toThrow('malformed arguments');
  });

  it('throws when generation was stopped by a content filter with no usable parts', async () => {
    mockGenerateContent.mockResolvedValue({
      candidates: [{ finishReason: 'SAFETY', content: { parts: [] } }],
    });

    await expect(
      generateContentTurnApi('key', 'gemini-3-flash-preview', [], {}, new AbortController().signal),
    ).rejects.toThrow('SAFETY');
  });

  it('throws when the prompt itself was blocked before generation', async () => {
    mockGenerateContent.mockResolvedValue({
      promptFeedback: { blockReason: 'SAFETY' },
    });

    await expect(
      generateContentTurnApi('key', 'gemini-3-flash-preview', [], {}, new AbortController().signal),
    ).rejects.toThrow('prompt was blocked');
  });

  it('returns normally for truncation via MAX_TOKENS with usable parts', async () => {
    mockGenerateContent.mockResolvedValue({
      candidates: [
        {
          finishReason: 'MAX_TOKENS',
          content: { parts: [{ text: 'truncated answer' }] },
        },
      ],
    });

    const turn = await generateContentTurnApi('key', 'gemini-3-flash-preview', [], {}, new AbortController().signal);

    expect(turn.parts).toEqual([{ text: 'truncated answer' }]);
    expect(turn.modelContent.role).toBe('model');
  });

  it('returns normally for a blocked finish reason when usable parts exist', async () => {
    mockGenerateContent.mockResolvedValue({
      candidates: [
        {
          finishReason: 'RECITATION',
          content: { parts: [{ text: 'usable answer' }] },
        },
      ],
    });

    const turn = await generateContentTurnApi('key', 'gemini-3-flash-preview', [], {}, new AbortController().signal);

    expect(turn.parts).toEqual([{ text: 'usable answer' }]);
  });
});

describe('chatApi stream idle watchdog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    mockGetConfiguredApiClient.mockResolvedValue({
      models: {
        generateContent: mockGenerateContent,
        generateContentStream: mockGenerateContentStream,
      },
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // Simulates the real SDK: the stream generator is tied to the abort signal
  // the SDK receives in config, so aborting that signal settles a pending read.
  // (The real SDK wires config.abortSignal into the fetch; aborting it makes
  // reader.read() resolve done.) It yields one chunk to establish the stream,
  // then sits in a silent window (the deep-search server-side search gap) until
  // the abort signal fires.
  const abortableStalledStream = (args: unknown) =>
    (async function* () {
      const config = (args as { config?: { abortSignal?: AbortSignal } })?.config;
      yield { candidates: [{ content: { parts: [{ text: 'thinking…' }] } }] };
      if (config?.abortSignal) {
        await new Promise<void>((resolve) => {
          if (config.abortSignal?.aborted) {
            resolve();
            return;
          }
          config.abortSignal?.addEventListener('abort', () => resolve(), { once: true });
        });
      }
    })();

  it('surfaces a stream error when no chunk arrives within the idle budget', async () => {
    mockGenerateContentStream.mockImplementation(abortableStalledStream);

    const onError = vi.fn();
    const onComplete = vi.fn();

    const sendPromise = sendStatelessMessageStreamApi(
      'key',
      'gemini-3-flash-preview',
      [],
      [{ text: 'deep search question' }],
      { tools: [{ googleSearch: {} }] },
      new AbortController().signal,
      vi.fn(),
      vi.fn(),
      onError,
      onComplete,
    );

    // Advance past the default 60s idle budget (plus one watchdog tick).
    // advanceTimersByTimeAsync lets the abort→resolve microtasks flush so the
    // stalled generator settles and the loop reaches its timeout branch.
    await vi.advanceTimersByTimeAsync(70_000);
    await sendPromise;

    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ name: 'StreamIdleTimeoutError' }));
    expect(onComplete).not.toHaveBeenCalled();
  });

  it('does not trip the watchdog while chunks keep arriving within the budget', async () => {
    let releaseSecondChunk!: () => void;
    const secondChunkGate = new Promise<void>((resolve) => {
      releaseSecondChunk = resolve;
    });
    mockGenerateContentStream.mockResolvedValue(
      (async function* () {
        yield { candidates: [{ content: { parts: [{ text: 'first' }] } }] };
        await secondChunkGate;
        yield { candidates: [{ content: { parts: [{ text: 'second' }] } }] };
      })(),
    );

    const onPart = vi.fn();
    const onError = vi.fn();
    const onComplete = vi.fn();

    const sendPromise = sendStatelessMessageStreamApi(
      'key',
      'gemini-3-flash-preview',
      [],
      [{ text: 'question' }],
      {},
      new AbortController().signal,
      onPart,
      vi.fn(),
      onError,
      onComplete,
    );

    // A 30s gap (typical deep-search server-side search window) is within the
    // default 60s budget: the watchdog must NOT fire.
    await vi.advanceTimersByTimeAsync(30_000);
    releaseSecondChunk();
    await sendPromise;

    expect(onError).not.toHaveBeenCalled();
    expect(onComplete).toHaveBeenCalled();
    expect(onPart).toHaveBeenNthCalledWith(1, { text: 'first' });
    expect(onPart).toHaveBeenNthCalledWith(2, { text: 'second' });
  });

  it('leaves the partial stream intact and reports completion when chunks flow continuously', async () => {
    mockGenerateContentStream.mockResolvedValue(
      (async function* () {
        yield { candidates: [{ content: { parts: [{ text: 'alpha' }] } }] };
        yield { candidates: [{ content: { parts: [{ text: 'beta' }] } }] };
      })(),
    );

    const onPart = vi.fn();
    const onError = vi.fn();
    const onComplete = vi.fn();

    const sendPromise = sendStatelessMessageStreamApi(
      'key',
      'gemini-3-flash-preview',
      [],
      [{ text: 'question' }],
      {},
      new AbortController().signal,
      onPart,
      vi.fn(),
      onError,
      onComplete,
    );
    await sendPromise;

    expect(onError).not.toHaveBeenCalled();
    expect(onComplete).toHaveBeenCalled();
    expect(onPart).toHaveBeenNthCalledWith(1, { text: 'alpha' });
    expect(onPart).toHaveBeenNthCalledWith(2, { text: 'beta' });
  });

  it('does not report a timeout when the user aborts mid-stream', async () => {
    // Generator that stalls until the user abort fires (the watchdog shares the
    // same signal, but must NOT treat a user stop as an idle timeout).
    mockGenerateContentStream.mockImplementation((args: unknown) => {
      const config = (args as { config?: { abortSignal?: AbortSignal } })?.config;
      return (async function* () {
        yield { candidates: [{ content: { parts: [{ text: 'partial' }] } }] };
        await new Promise<void>((resolve) => {
          if (config?.abortSignal?.aborted) {
            resolve();
            return;
          }
          config?.abortSignal?.addEventListener('abort', () => resolve(), { once: true });
        });
      })();
    });

    const onError = vi.fn();
    const onComplete = vi.fn();
    const abortController = new AbortController();

    const sendPromise = sendStatelessMessageStreamApi(
      'key',
      'gemini-3-flash-preview',
      [],
      [{ text: 'question' }],
      {},
      abortController.signal,
      vi.fn(),
      vi.fn(),
      onError,
      onComplete,
    );

    // Let the stream establish, then the user hits Esc before the idle budget
    // elapses. The watchdog must NOT fire: the stream simply ends (onComplete),
    // and the caller's own abort signal flags the stop.
    await vi.advanceTimersByTimeAsync(1_000);
    abortController.abort();
    await sendPromise;

    expect(onError).not.toHaveBeenCalled();
    expect(onComplete).toHaveBeenCalled();
  });
});
