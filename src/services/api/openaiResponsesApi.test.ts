import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import {
  fetchOpenAIResponsesModels,
  sendOpenAIResponsesNonStream,
  sendOpenAIResponsesStream,
} from './openaiResponsesApi';

const mockResponse = (body: BodyInit, init?: ResponseInit) =>
  new Response(body, { status: 200, headers: { 'content-type': 'application/json' }, ...init });

const mockSseResponse = (chunks: string[]) => {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }
      controller.close();
    },
  });
  return new Response(stream, {
    status: 200,
    headers: { 'content-type': 'text/event-stream' },
  });
};

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn());
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('sendOpenAIResponsesNonStream', () => {
  it('sends POST with Bearer authorization and extracts message text and usage', async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockResponse(
        JSON.stringify({
          status: 'completed',
          output: [
            {
              type: 'message',
              role: 'assistant',
              content: [{ type: 'text', text: 'Hello from Responses API!' }],
            },
          ],
          usage: { input_tokens: 12, output_tokens: 8, total_tokens: 20 },
        }),
      ),
    );

    const onComplete = vi.fn();
    await sendOpenAIResponsesNonStream(
      'sk-test-key',
      'gpt-4o',
      [],
      [{ text: 'Hello' }],
      { baseUrl: 'https://api.openai.com/v1' },
      new AbortController().signal,
      vi.fn(),
      onComplete,
      'user',
    );

    expect(onComplete).toHaveBeenCalled();
    const [parts, thoughts, usage] = onComplete.mock.calls[0];
    expect(parts).toEqual([{ text: 'Hello from Responses API!' }]);
    expect(thoughts).toBeUndefined();
    expect(usage).toEqual({
      promptTokenCount: 12,
      candidatesTokenCount: 8,
      totalTokenCount: 20,
    });

    const callInit = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0][1] as RequestInit;
    expect((callInit.headers as Record<string, string>)['authorization']).toBe('Bearer sk-test-key');
    const callUrl = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(callUrl).toBe('https://api.openai.com/v1/responses');
  });

  it('extracts reasoning thoughts from output', async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockResponse(
        JSON.stringify({
          status: 'completed',
          output: [
            {
              type: 'reasoning',
              content: [{ type: 'text', text: 'Step 1: thinking...' }],
            },
            {
              type: 'message',
              role: 'assistant',
              content: [{ type: 'text', text: 'Final Answer' }],
            },
          ],
        }),
      ),
    );

    const onComplete = vi.fn();
    await sendOpenAIResponsesNonStream(
      'sk-key',
      'o4-mini',
      [],
      [{ text: 'Solve x' }],
      {},
      new AbortController().signal,
      vi.fn(),
      onComplete,
    );

    expect(onComplete).toHaveBeenCalled();
    const [parts, thoughts] = onComplete.mock.calls[0];
    expect(parts).toEqual([{ text: 'Final Answer' }]);
    expect(thoughts).toBe('Step 1: thinking...');
  });

  it('appends truncation notice on max_output_tokens finish reason', async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockResponse(
        JSON.stringify({
          status: 'incomplete',
          incomplete_details: { reason: 'max_output_tokens' },
          output: [
            {
              type: 'message',
              role: 'assistant',
              content: [{ type: 'text', text: 'Partial output' }],
            },
          ],
        }),
      ),
    );

    const onComplete = vi.fn();
    await sendOpenAIResponsesNonStream(
      'sk-key',
      'gpt-4o',
      [],
      [{ text: 'long prompt' }],
      {},
      new AbortController().signal,
      vi.fn(),
      onComplete,
    );

    expect(onComplete).toHaveBeenCalled();
    const [parts] = onComplete.mock.calls[0];
    expect(parts[0].text).toContain('[Output truncated: the response hit max_output_tokens.]');
  });

  it('calls onError on non-ok HTTP response', async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockResponse(JSON.stringify({ error: { message: 'Invalid API key' } }), { status: 401 }),
    );

    const onError = vi.fn();
    await sendOpenAIResponsesNonStream(
      'bad-key',
      'gpt-4o',
      [],
      [{ text: 'hi' }],
      {},
      new AbortController().signal,
      onError,
      vi.fn(),
    );

    expect(onError).toHaveBeenCalled();
    expect((onError.mock.calls[0][0] as Error).message).toContain('Invalid API key');
  });
});

describe('sendOpenAIResponsesStream', () => {
  it('streams text deltas and completes with usage', async () => {
    const sseBody = [
      'event: response.created\n',
      'data: {"type":"response.created"}\n\n',
      'event: response.text.delta\n',
      'data: {"type":"response.text.delta","delta":"Hello "}\n\n',
      'event: response.text.delta\n',
      'data: {"type":"response.text.delta","delta":"world!"}\n\n',
      'event: response.completed\n',
      'data: {"type":"response.completed","response":{"status":"completed","usage":{"input_tokens":5,"output_tokens":4,"total_tokens":9}}}\n\n',
    ];

    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(mockSseResponse(sseBody));

    const onPart = vi.fn();
    const onThoughtChunk = vi.fn();
    const onComplete = vi.fn();

    await sendOpenAIResponsesStream(
      'sk-key',
      'gpt-4o',
      [],
      [{ text: 'hi' }],
      { baseUrl: 'https://api.openai.com/v1' },
      new AbortController().signal,
      onPart,
      onThoughtChunk,
      vi.fn(),
      onComplete,
    );

    expect(onPart).toHaveBeenCalledTimes(2);
    expect(onPart).toHaveBeenNthCalledWith(1, { text: 'Hello ' });
    expect(onPart).toHaveBeenNthCalledWith(2, { text: 'world!' });

    expect(onComplete).toHaveBeenCalledWith(
      {
        promptTokenCount: 5,
        candidatesTokenCount: 4,
        totalTokenCount: 9,
      },
      undefined,
      undefined,
    );
  });

  it('streams reasoning deltas via onThoughtChunk', async () => {
    const sseBody = [
      'event: response.reasoning_text.delta\n',
      'data: {"type":"response.reasoning_text.delta","delta":"Analyzing problem..."}\n\n',
      'event: response.text.delta\n',
      'data: {"type":"response.text.delta","delta":"Solution is 42"}\n\n',
      'event: response.completed\n',
      'data: {"type":"response.completed","response":{"status":"completed"}}\n\n',
    ];

    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(mockSseResponse(sseBody));

    const onPart = vi.fn();
    const onThoughtChunk = vi.fn();

    await sendOpenAIResponsesStream(
      'sk-key',
      'o4-mini',
      [],
      [{ text: 'calculate' }],
      {},
      new AbortController().signal,
      onPart,
      onThoughtChunk,
      vi.fn(),
      vi.fn(),
    );

    expect(onThoughtChunk).toHaveBeenCalledWith('Analyzing problem...');
    expect(onPart).toHaveBeenCalledWith({ text: 'Solution is 42' });
  });

  it('captures in-stream failure and reports via onError', async () => {
    const sseBody = [
      'event: response.failed\n',
      'data: {"type":"response.failed","response":{"error":{"message":"Rate limit exceeded"}}}\n\n',
    ];

    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(mockSseResponse(sseBody));

    const onError = vi.fn();
    await sendOpenAIResponsesStream(
      'sk-key',
      'gpt-4o',
      [],
      [{ text: 'hi' }],
      {},
      new AbortController().signal,
      vi.fn(),
      vi.fn(),
      onError,
      vi.fn(),
    );

    expect(onError).toHaveBeenCalled();
    expect((onError.mock.calls[0][0] as Error).message).toBe('Rate limit exceeded');
  });
});

describe('fetchOpenAIResponsesModels', () => {
  it('fetches model options from the /models endpoint', async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockResponse(
        JSON.stringify({
          data: [{ id: 'gpt-4o' }, { id: 'o4-mini' }],
        }),
      ),
    );

    const models = await fetchOpenAIResponsesModels(
      'sk-key',
      'https://api.openai.com/v1',
      new AbortController().signal,
    );

    expect(models).toEqual([
      { id: 'gpt-4o', name: 'gpt-4o' },
      { id: 'o4-mini', name: 'o4-mini' },
    ]);
  });
});
