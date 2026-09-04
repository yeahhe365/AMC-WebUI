import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Part, UsageMetadata } from '@google/genai';
import { logService } from '@/services/logService';
import {
  appendSamplingParameters,
  createApiRequestInitFactory,
  executeNonStreamChatRequest,
  executeStreamChatRequest,
  fetchProviderModelOptions,
} from './requestFactory';

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

beforeEach(() => {
  vi.spyOn(logService, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('createApiRequestInitFactory', () => {
  it('builds POST init with auth headers first, then content-type, then third-party forward headers', () => {
    const factory = createApiRequestInitFactory((apiKey) => ({
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    }));
    const signal = new AbortController().signal;
    const init = factory.createRequestInit('sk-key', { model: 'm' }, signal, 'provider-1', 'https://base.example', {
      'X-Title': 'AMC',
    });

    expect(init.method).toBe('POST');
    expect(init.signal).toBe(signal);
    expect(init.body).toBe(JSON.stringify({ model: 'm' }));
    const headers = init.headers as Record<string, string>;
    // 头部插入顺序必须稳定:认证头 → content-type → 第三方转发头。
    expect(Object.keys(headers)).toEqual([
      'x-api-key',
      'anthropic-version',
      'content-type',
      'x-third-party-provider',
      'x-third-party-base-url',
      'X-Title',
      'x-third-party-extra-headers',
    ]);
    expect(headers['content-type']).toBe('application/json');
    expect(headers['x-api-key']).toBe('sk-key');
    expect(JSON.parse(headers['x-third-party-extra-headers'])).toEqual({ 'X-Title': 'AMC' });
  });

  it('builds GET init without content-type or body', () => {
    const factory = createApiRequestInitFactory((apiKey) => ({ authorization: `Bearer ${apiKey}` }));
    const signal = new AbortController().signal;
    const init = factory.createGetRequestInit('key', signal);

    expect(init.method).toBe('GET');
    expect(init.body).toBeUndefined();
    expect(Object.keys(init.headers as Record<string, string>)).toEqual(['authorization']);
    expect((init.headers as Record<string, string>).authorization).toBe('Bearer key');
  });
});

describe('appendSamplingParameters', () => {
  it('writes temperature before top_p only for number values', () => {
    const temperatureOnly: Record<string, unknown> = {};
    appendSamplingParameters(temperatureOnly, { temperature: 0.4 });
    expect(temperatureOnly).toEqual({ temperature: 0.4 });

    const both: Record<string, unknown> = {};
    appendSamplingParameters(both, { temperature: 0.2, topP: 0.9 });
    expect(Object.keys(both)).toEqual(['temperature', 'top_p']);
    expect(both.top_p).toBe(0.9);

    const skipped: Record<string, unknown> = {};
    appendSamplingParameters(skipped, {});
    expect(skipped).toEqual({});
  });
});

describe('fetchProviderModelOptions', () => {
  it('maps and dedupes model ids from the data payload', async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({ data: [{ id: ' a ' }, { id: 'a' }, { id: '' }, { object: 'model' }] }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const models = await fetchProviderModelOptions({
      url: 'https://example.com/models',
      requestInit: { method: 'GET' },
      errorContextLabel: 'Test',
    });

    expect(models).toEqual([{ id: 'a', name: 'a' }]);
    expect(fetchMock).toHaveBeenCalledWith('https://example.com/models', { method: 'GET' });
  });

  it('throws the provider error message on non-ok responses', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({ error: { message: 'invalid key' } }, 401)),
    );

    await expect(
      fetchProviderModelOptions({ url: 'https://example.com/models', requestInit: {}, errorContextLabel: 'Test' }),
    ).rejects.toThrow('invalid key');
  });
});

describe('executeNonStreamChatRequest', () => {
  it('completes with empty parts before any work when already aborted', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const requestUrl = vi.fn(() => 'https://example.com');
    const requestInit = vi.fn(() => ({}));
    const onComplete = vi.fn();

    await executeNonStreamChatRequest({
      requestUrl,
      requestInit,
      errorContextLabel: 'Test',
      failureLogLabel: 'test failed:',
      abortSignal: AbortSignal.abort(),
      onError: vi.fn(),
      onComplete,
      toCompletionArgs: vi.fn((): [Part[], string | undefined, UsageMetadata | undefined] => [
        [{ text: 'never' }],
        undefined,
        undefined,
      ]),
    });

    expect(requestUrl).not.toHaveBeenCalled();
    expect(requestInit).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(onComplete).toHaveBeenCalledWith([], undefined, undefined, undefined, undefined);
  });

  it('routes body-construction failures through onError without calling fetch or onComplete', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const bodyError = new Error('body builder exploded');
    const onError = vi.fn();
    const onComplete = vi.fn();

    await executeNonStreamChatRequest({
      requestUrl: () => 'https://example.com',
      requestInit: () => {
        throw bodyError;
      },
      errorContextLabel: 'Test',
      failureLogLabel: 'test failed:',
      abortSignal: new AbortController().signal,
      onError,
      onComplete,
      toCompletionArgs: () => [[], undefined, undefined],
    });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(onComplete).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0][0]).toBe(bodyError);
  });

  it('reports non-ok responses through onError using the provider error payload', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ error: { message: 'bad key' } }, 401));
    vi.stubGlobal('fetch', fetchMock);
    const onError = vi.fn();
    const onComplete = vi.fn();

    await executeNonStreamChatRequest<{ value: string }>({
      requestUrl: () => 'https://example.com/chat',
      requestInit: () => ({}),
      errorContextLabel: 'Test',
      failureLogLabel: 'test failed:',
      abortSignal: new AbortController().signal,
      onError,
      onComplete,
      toCompletionArgs: () => [[{ text: 'never' }], undefined, undefined],
    });

    expect(onComplete).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledTimes(1);
    expect((onError.mock.calls[0][0] as Error).message).toBe('bad key');
  });

  it('parses the payload once and forwards parts, thoughts, and usage to onComplete', async () => {
    const signal = new AbortController().signal;
    const fetchMock = vi.fn(async () => jsonResponse({ value: 'payload' }));
    vi.stubGlobal('fetch', fetchMock);
    const toCompletionArgs = vi.fn((): [Part[], string | undefined, UsageMetadata | undefined] => [
      [{ text: 'hello' }] as unknown as Part[],
      'thoughts',
      { totalTokenCount: 3 } as unknown as UsageMetadata,
    ]);
    const onComplete = vi.fn();

    await executeNonStreamChatRequest<{ value: string }>({
      requestUrl: () => 'https://example.com/chat',
      requestInit: () => ({ method: 'POST' }),
      errorContextLabel: 'Test',
      failureLogLabel: 'test failed:',
      abortSignal: signal,
      onError: vi.fn(),
      onComplete,
      toCompletionArgs,
    });

    expect(fetchMock).toHaveBeenCalledWith('https://example.com/chat', { method: 'POST' });
    expect(toCompletionArgs).toHaveBeenCalledWith({ value: 'payload' });
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(onComplete).toHaveBeenCalledWith(
      [{ text: 'hello' }],
      'thoughts',
      { totalTokenCount: 3 },
      undefined,
      undefined,
    );
  });

  it('re-checks abort after parsing and completes empty instead of emitting payload parts', async () => {
    const controller = new AbortController();
    const fetchMock = vi.fn(async () => {
      controller.abort();
      return jsonResponse({ value: 'payload' });
    });
    vi.stubGlobal('fetch', fetchMock);
    const onComplete = vi.fn();

    await executeNonStreamChatRequest({
      requestUrl: () => 'https://example.com/chat',
      requestInit: () => ({}),
      errorContextLabel: 'Test',
      failureLogLabel: 'test failed:',
      abortSignal: controller.signal,
      onError: vi.fn(),
      onComplete,
      toCompletionArgs: () => [[{ text: 'dropped' }], undefined, undefined],
    });

    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(onComplete).toHaveBeenCalledWith([], undefined, undefined, undefined, undefined);
  });
});

describe('executeStreamChatRequest', () => {
  it('completes with no usage when already aborted', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const readStream = vi.fn();
    const onComplete = vi.fn();

    await executeStreamChatRequest({
      requestUrl: () => 'https://example.com/chat',
      requestInit: () => ({}),
      errorContextLabel: 'Test',
      failureLogLabel: 'test failed:',
      abortSignal: AbortSignal.abort(),
      onError: vi.fn(),
      onComplete,
      readStream: readStream as never,
    });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(readStream).not.toHaveBeenCalled();
    expect(onComplete).toHaveBeenCalledWith(undefined, undefined, undefined);
  });

  it('reports non-ok responses through onError', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({ error: { message: 'stream refused' } }, 500)),
    );
    const onError = vi.fn();
    const onComplete = vi.fn();

    await executeStreamChatRequest({
      requestUrl: () => 'https://example.com/chat',
      requestInit: () => ({}),
      errorContextLabel: 'Test',
      failureLogLabel: 'test failed:',
      abortSignal: new AbortController().signal,
      onError,
      onComplete,
      readStream: vi.fn(),
    });

    expect(onComplete).not.toHaveBeenCalled();
    expect((onError.mock.calls[0][0] as Error).message).toBe('stream refused');
  });

  it('passes the response to readStream and completes with its final usage', async () => {
    const response = jsonResponse({});
    const fetchMock = vi.fn(async () => response);
    vi.stubGlobal('fetch', fetchMock);
    const readStream = vi.fn(async () => ({ totalTokenCount: 9 }) as never);
    const onComplete = vi.fn();

    await executeStreamChatRequest({
      requestUrl: () => 'https://example.com/chat',
      requestInit: () => ({ method: 'POST' }),
      errorContextLabel: 'Test',
      failureLogLabel: 'test failed:',
      abortSignal: new AbortController().signal,
      onError: vi.fn(),
      onComplete,
      readStream,
    });

    expect(readStream).toHaveBeenCalledWith(response);
    expect(onComplete).toHaveBeenCalledWith({ totalTokenCount: 9 }, undefined, undefined);
  });
});
