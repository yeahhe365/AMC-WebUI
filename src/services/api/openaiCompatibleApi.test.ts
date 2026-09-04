import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  fetchOpenAICompatibleModels,
  sendOpenAICompatibleMessageNonStream,
  sendOpenAICompatibleMessageStream,
} from './openaiCompatibleApi';

describe('openaiCompatibleApi', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('sends a non-streaming chat completion request and maps the response text plus usage', async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => {
      return new Response(
        JSON.stringify({
          choices: [{ message: { content: 'hello from openai compatible' } }],
          usage: {
            prompt_tokens: 11,
            completion_tokens: 7,
            total_tokens: 18,
          },
        }),
        {
          status: 200,
          headers: { 'content-type': 'application/json' },
        },
      );
    });
    vi.stubGlobal('fetch', fetchMock);

    const onComplete = vi.fn();
    const onError = vi.fn();

    await sendOpenAICompatibleMessageNonStream(
      'api-key',
      'gemini-3-flash-preview',
      [{ role: 'user', parts: [{ text: 'previous question' }] }],
      [{ text: 'current question' }],
      {
        baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai/',
        systemInstruction: 'Be concise.',
        temperature: 0.4,
        topP: 0.9,
      },
      new AbortController().signal,
      onError,
      onComplete,
    );

    expect(fetchMock).toHaveBeenCalledWith(
      'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          authorization: 'Bearer api-key',
          'content-type': 'application/json',
        }),
      }),
    );
    const requestInit = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(JSON.parse(String(requestInit.body))).toEqual({
      model: 'gemini-3-flash-preview',
      messages: [
        { role: 'system', content: 'Be concise.' },
        { role: 'user', content: 'previous question' },
        { role: 'user', content: 'current question' },
      ],
      temperature: 0.4,
      top_p: 0.9,
      stream: false,
    });
    expect(onError).not.toHaveBeenCalled();
    expect(onComplete).toHaveBeenCalledWith(
      [{ text: 'hello from openai compatible' }],
      undefined,
      {
        promptTokenCount: 11,
        candidatesTokenCount: 7,
        totalTokenCount: 18,
      },
      undefined,
      undefined,
    );
  });

  it('merges allowlisted extra headers and the proxy JSON envelope onto the request', async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => {
      return new Response(JSON.stringify({ choices: [{ message: { content: 'ok' } }] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    await sendOpenAICompatibleMessageNonStream(
      'api-key',
      'gpt-5.6-sol',
      [],
      [{ text: 'hi' }],
      {
        baseUrl: 'https://openrouter.ai/api/v1',
        extraHeaders: { 'HTTP-Referer': 'https://example.com', 'X-Title': 'AMC', Cookie: 'secret' },
      },
      new AbortController().signal,
      vi.fn(),
      vi.fn(),
      'user',
      'openrouter',
    );

    const headers = (fetchMock.mock.calls[0]?.[1] as RequestInit).headers as Record<string, string>;
    expect(headers['x-third-party-provider']).toBe('openrouter');
    expect(headers['HTTP-Referer']).toBe('https://example.com');
    expect(headers['X-Title']).toBe('AMC');
    expect(headers.Cookie).toBeUndefined();
    expect(JSON.parse(headers['x-third-party-extra-headers'])).toEqual({
      'HTTP-Referer': 'https://example.com',
      'X-Title': 'AMC',
    });
  });

  it('reports Gemini fileData parts instead of silently dropping them', async () => {
    const fetchMock = vi.fn<typeof fetch>();
    vi.stubGlobal('fetch', fetchMock);

    const onComplete = vi.fn();
    const onError = vi.fn();

    await sendOpenAICompatibleMessageNonStream(
      'api-key',
      'gpt-5.6-sol',
      [],
      [{ fileData: { mimeType: 'image/png', fileUri: 'files/abc' } }],
      {
        baseUrl: 'https://api.openai.com/v1',
      },
      new AbortController().signal,
      onError,
      onComplete,
    );

    expect(fetchMock).not.toHaveBeenCalled();
    expect(onComplete).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'OpenAI-compatible mode cannot send Gemini Files API file references.',
      }),
    );
  });

  it('fetches OpenAI-compatible model IDs from the models endpoint', async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => {
      return new Response(
        JSON.stringify({
          data: [{ id: 'gpt-4.1' }, { id: 'deepseek-chat' }, { id: 'gpt-4.1' }, { id: '' }, { object: 'model' }],
        }),
        {
          status: 200,
          headers: { 'content-type': 'application/json' },
        },
      );
    });
    vi.stubGlobal('fetch', fetchMock);

    const models = await fetchOpenAICompatibleModels(
      'openai-key',
      'https://generativelanguage.googleapis.com/v1beta/openai/',
      new AbortController().signal,
    );

    expect(fetchMock).toHaveBeenCalledWith(
      'https://generativelanguage.googleapis.com/v1beta/openai/models',
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({
          authorization: 'Bearer openai-key',
        }),
      }),
    );
    expect(models).toEqual([
      { id: 'gpt-4.1', name: 'gpt-4.1' },
      { id: 'deepseek-chat', name: 'deepseek-chat' },
    ]);
  });

  it('reports model list fetch errors from OpenAI-compatible error payloads', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>(async () => {
        return new Response(JSON.stringify({ error: { message: 'invalid key' } }), {
          status: 401,
          headers: { 'content-type': 'application/json' },
        });
      }),
    );

    await expect(
      fetchOpenAICompatibleModels('bad-key', 'https://api.openai.com/v1', new AbortController().signal),
    ).rejects.toThrow('invalid key');
  });

  it('maps non-streaming reasoning_content into thoughts', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>(async () => {
        return new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  reasoning_content: 'I need to compare the options.',
                  content: 'Final answer.',
                },
              },
            ],
          }),
          {
            status: 200,
            headers: { 'content-type': 'application/json' },
          },
        );
      }),
    );

    const onComplete = vi.fn();
    const onError = vi.fn();

    await sendOpenAICompatibleMessageNonStream(
      'api-key',
      'deepseek-v4-pro',
      [],
      [{ text: 'think then answer' }],
      { baseUrl: 'https://api.deepseek.com' },
      new AbortController().signal,
      onError,
      onComplete,
    );

    expect(onError).not.toHaveBeenCalled();
    expect(onComplete).toHaveBeenCalledWith(
      [{ text: 'Final answer.' }],
      'I need to compare the options.',
      undefined,
      undefined,
      undefined,
    );
  });

  it('streams SSE chat completion chunks as text parts and reports final usage', async () => {
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(
          encoder.encode(
            [
              'data: {"choices":[{"delta":{"content":"hel"}}]}',
              '',
              'data: {"choices":[{"delta":{"content":"lo"}}],"usage":{"prompt_tokens":3,"completion_tokens":2,"total_tokens":5}}',
              '',
              'data: [DONE]',
              '',
            ].join('\n'),
          ),
        );
        controller.close();
      },
    });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(stream, { status: 200, headers: { 'content-type': 'text/event-stream' } })),
    );

    const onPart = vi.fn();
    const onComplete = vi.fn();
    const onError = vi.fn();

    await sendOpenAICompatibleMessageStream(
      'api-key',
      'gpt-4o-mini',
      [],
      [{ text: 'say hello' }],
      {
        baseUrl: 'https://api.openai.com/v1',
        temperature: 0.2,
      },
      new AbortController().signal,
      onPart,
      vi.fn(),
      onError,
      onComplete,
    );

    expect(onPart).toHaveBeenNthCalledWith(1, { text: 'hel' });
    expect(onPart).toHaveBeenNthCalledWith(2, { text: 'lo' });
    expect(onError).not.toHaveBeenCalled();
    expect(onComplete).toHaveBeenCalledWith(
      {
        promptTokenCount: 3,
        candidatesTokenCount: 2,
        totalTokenCount: 5,
      },
      undefined,
      undefined,
    );
  });

  it('streams reasoning_content chunks through the thought handler', async () => {
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(
          encoder.encode(
            [
              'data: {"choices":[{"delta":{"reasoning_content":"First, inspect the input. "}}]}',
              '',
              'data: {"choices":[{"delta":{"reasoning_content":"Then answer."}}]}',
              '',
              'data: {"choices":[{"delta":{"content":"Final answer."}}]}',
              '',
              'data: [DONE]',
              '',
            ].join('\n'),
          ),
        );
        controller.close();
      },
    });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(stream, { status: 200, headers: { 'content-type': 'text/event-stream' } })),
    );

    const onPart = vi.fn();
    const onThoughtChunk = vi.fn();
    const onComplete = vi.fn();
    const onError = vi.fn();

    await sendOpenAICompatibleMessageStream(
      'api-key',
      'glm-5.2',
      [],
      [{ text: 'think then answer' }],
      { baseUrl: 'https://open.bigmodel.cn/api/paas/v4' },
      new AbortController().signal,
      onPart,
      onThoughtChunk,
      onError,
      onComplete,
    );

    expect(onThoughtChunk).toHaveBeenNthCalledWith(1, 'First, inspect the input. ');
    expect(onThoughtChunk).toHaveBeenNthCalledWith(2, 'Then answer.');
    expect(onPart).toHaveBeenCalledWith({ text: 'Final answer.' });
    expect(onError).not.toHaveBeenCalled();
  });

  it('maps non-streaming OpenRouter `reasoning` into thoughts', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>(async () => {
        return new Response(
          JSON.stringify({
            choices: [{ message: { reasoning: 'Compare vendors.', content: 'OpenRouter answer.' } }],
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }),
    );

    const onComplete = vi.fn();
    const onError = vi.fn();

    await sendOpenAICompatibleMessageNonStream(
      'api-key',
      'openrouter-auto',
      [],
      [{ text: 'which vendor' }],
      { baseUrl: 'https://openrouter.ai/api/v1' },
      new AbortController().signal,
      onError,
      onComplete,
    );

    expect(onError).not.toHaveBeenCalled();
    expect(onComplete).toHaveBeenCalledWith(
      [{ text: 'OpenRouter answer.' }],
      'Compare vendors.',
      undefined,
      undefined,
      undefined,
    );
  });

  it('joins non-streaming reasoning_details segments into thoughts', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>(async () => {
        return new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: 'Answer.',
                  reasoning_details: [{ text: 'Step 1. ' }, { text: 'Step 2.' }],
                },
              },
            ],
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }),
    );

    const onComplete = vi.fn();
    const onError = vi.fn();

    await sendOpenAICompatibleMessageNonStream(
      'api-key',
      'some-reasoning-provider',
      [],
      [{ text: 'think' }],
      { baseUrl: 'https://api.provider.com/v1' },
      new AbortController().signal,
      onError,
      onComplete,
    );

    expect(onComplete).toHaveBeenCalledWith([{ text: 'Answer.' }], 'Step 1. Step 2.', undefined, undefined, undefined);
  });

  it('streams OpenRouter `reasoning` delta through the thought handler', async () => {
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(
          encoder.encode(
            [
              'data: {"choices":[{"delta":{"reasoning":"Assess the options. "}}]}',
              '',
              'data: {"choices":[{"delta":{"reasoning":"Pick the best."}}]}',
              '',
              'data: {"choices":[{"delta":{"content":"Decision made."}}]}',
              '',
              'data: [DONE]',
              '',
            ].join('\n'),
          ),
        );
        controller.close();
      },
    });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(stream, { status: 200, headers: { 'content-type': 'text/event-stream' } })),
    );

    const onPart = vi.fn();
    const onThoughtChunk = vi.fn();
    const onComplete = vi.fn();
    const onError = vi.fn();

    await sendOpenAICompatibleMessageStream(
      'api-key',
      'openrouter-auto',
      [],
      [{ text: 'decide' }],
      { baseUrl: 'https://openrouter.ai/api/v1' },
      new AbortController().signal,
      onPart,
      onThoughtChunk,
      onError,
      onComplete,
    );

    expect(onThoughtChunk).toHaveBeenNthCalledWith(1, 'Assess the options. ');
    expect(onThoughtChunk).toHaveBeenNthCalledWith(2, 'Pick the best.');
    expect(onPart).toHaveBeenCalledWith({ text: 'Decision made.' });
    expect(onError).not.toHaveBeenCalled();
  });

  it('surfaces a non-streaming content_filter finish_reason as an error instead of an empty answer', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              choices: [{ finish_reason: 'content_filter', message: { content: null } }],
            }),
            { status: 200, headers: { 'content-type': 'application/json' } },
          ),
      ),
    );

    const onComplete = vi.fn();
    const onError = vi.fn();

    await sendOpenAICompatibleMessageNonStream(
      'api-key',
      'gpt-4o-mini',
      [],
      [{ text: 'say hello' }],
      { baseUrl: 'https://api.openai.com/v1' },
      new AbortController().signal,
      onError,
      onComplete,
    );

    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.stringContaining('content_filter') }),
    );
    expect(onComplete).not.toHaveBeenCalled();
  });

  it('appends a truncation notice to a non-streaming response that ended with finish_reason length', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              choices: [{ finish_reason: 'length', message: { content: 'partial answer' } }],
            }),
            { status: 200, headers: { 'content-type': 'application/json' } },
          ),
      ),
    );

    const onComplete = vi.fn();
    const onError = vi.fn();

    await sendOpenAICompatibleMessageNonStream(
      'api-key',
      'gpt-4o-mini',
      [],
      [{ text: 'write an essay' }],
      { baseUrl: 'https://api.openai.com/v1' },
      new AbortController().signal,
      onError,
      onComplete,
    );

    expect(onError).not.toHaveBeenCalled();
    expect(onComplete).toHaveBeenCalledWith(
      [{ text: expect.stringContaining('partial answer\n\n[Output truncated') }],
      undefined,
      undefined,
      undefined,
      undefined,
    );
  });

  it('emits a truncation notice part when a streamed response ends with finish_reason length', async () => {
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(
          encoder.encode(
            [
              'data: {"choices":[{"delta":{"content":"partial"}}]}',
              '',
              'data: {"choices":[{"delta":{},"finish_reason":"length"}]}',
              '',
              'data: [DONE]',
              '',
            ].join('\n'),
          ),
        );
        controller.close();
      },
    });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(stream, { status: 200, headers: { 'content-type': 'text/event-stream' } })),
    );

    const onPart = vi.fn();
    const onComplete = vi.fn();
    const onError = vi.fn();

    await sendOpenAICompatibleMessageStream(
      'api-key',
      'gpt-4o-mini',
      [],
      [{ text: 'write an essay' }],
      { baseUrl: 'https://api.openai.com/v1' },
      new AbortController().signal,
      onPart,
      vi.fn(),
      onError,
      onComplete,
    );

    expect(onPart).toHaveBeenCalledWith({ text: expect.stringContaining('[Output truncated') });
    expect(onError).not.toHaveBeenCalled();
    expect(onComplete).toHaveBeenCalled();
  });

  it('surfaces a streamed content_filter finish_reason as an error instead of completing', async () => {
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(
          encoder.encode(
            [
              'data: {"choices":[{"delta":{"content":"partial"}}]}',
              '',
              'data: {"choices":[{"delta":{},"finish_reason":"content_filter"}]}',
              '',
              'data: [DONE]',
              '',
            ].join('\n'),
          ),
        );
        controller.close();
      },
    });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(stream, { status: 200, headers: { 'content-type': 'text/event-stream' } })),
    );

    const onPart = vi.fn();
    const onComplete = vi.fn();
    const onError = vi.fn();

    await sendOpenAICompatibleMessageStream(
      'api-key',
      'gpt-4o-mini',
      [],
      [{ text: 'say hello' }],
      { baseUrl: 'https://api.openai.com/v1' },
      new AbortController().signal,
      onPart,
      vi.fn(),
      onError,
      onComplete,
    );

    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.stringContaining('content_filter') }),
    );
    expect(onComplete).not.toHaveBeenCalled();
  });

  it('surfaces in-stream error payloads via onError instead of completing silently', async () => {
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(
          encoder.encode(
            [
              'data: {"choices":[{"delta":{"content":"partial "}}]}',
              '',
              'data: {"error":{"message":"upstream exploded","type":"server_error"}}',
              '',
              'data: [DONE]',
              '',
            ].join('\n'),
          ),
        );
        controller.close();
      },
    });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(stream, { status: 200, headers: { 'content-type': 'text/event-stream' } })),
    );

    const onPart = vi.fn();
    const onComplete = vi.fn();
    const onError = vi.fn();

    await sendOpenAICompatibleMessageStream(
      'api-key',
      'gpt-4o-mini',
      [],
      [{ text: 'say hello' }],
      { baseUrl: 'https://api.openai.com/v1' },
      new AbortController().signal,
      onPart,
      vi.fn(),
      onError,
      onComplete,
    );

    expect(onError).toHaveBeenCalledTimes(1);
    expect((onError.mock.calls[0][0] as Error).message).toBe('upstream exploded');
    expect(onComplete).not.toHaveBeenCalled();
  });
});
