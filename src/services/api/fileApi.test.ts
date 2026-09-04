import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakeResumableUploadXhr } from '@/test/api/fakeResumableUpload';

const { fetchMock, getConfiguredApiClientMock, getConfiguredApiClientContextMock } = vi.hoisted(() => ({
  fetchMock: vi.fn(),
  getConfiguredApiClientMock: vi.fn(),
  getConfiguredApiClientContextMock: vi.fn(),
}));

vi.mock('./apiClient', () => ({
  getConfiguredApiClient: getConfiguredApiClientMock,
  getConfiguredApiClientContext: getConfiguredApiClientContextMock,
}));

import { uploadFileApi } from './fileApi';

const uploadXhr = createFakeResumableUploadXhr({
  defaultProgressFractions: [0.5, 1],
  defaultResponseText: ({ isFinalChunk }) =>
    isFinalChunk
      ? JSON.stringify({
          file: {
            name: 'files/test-file',
            uri: 'https://generativelanguage.googleapis.com/v1beta/files/test-file',
          },
        })
      : JSON.stringify({}),
});

const createInternalApiClient = () => ({
  request: async (request: {
    path: string;
    body?: string | Blob;
    httpMethod: 'POST';
    httpOptions?: {
      apiVersion?: string;
      baseUrl?: string;
      headers?: Record<string, string>;
    };
    abortSignal?: AbortSignal;
  }) => {
    const baseUrl = request.httpOptions?.baseUrl ?? '';
    const normalizedBaseUrl = baseUrl.replace(/\/+$/, '');
    const url = request.path ? `${normalizedBaseUrl}/${request.path.replace(/^\/+/, '')}` : normalizedBaseUrl;
    const headers = {
      ...(request.httpOptions?.headers ?? {}),
      'x-goog-api-key': (request.httpOptions?.headers ?? {})['x-goog-api-key'] ?? 'api-key',
    };

    const response = await fetchMock(url, {
      method: request.httpMethod,
      headers,
      body: request.body as BodyInit | undefined,
      signal: request.abortSignal,
    });

    return {
      headers: Object.fromEntries(response.headers.entries()),
      json: () => response.json(),
    };
  },
});

describe('uploadFileApi', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    uploadXhr.reset();
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('XMLHttpRequest', uploadXhr.XMLHttpRequest);
    const client = {
      apiClient: createInternalApiClient(),
    };
    getConfiguredApiClientContextMock.mockResolvedValue({
      client,
      uploadApiClient: client.apiClient,
      apiBaseUrl: 'https://generativelanguage.googleapis.com',
      proxyBaseUrl: null,
    });

    fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);

      if (url.includes('/upload/v1beta/files')) {
        return new Response(null, {
          status: 200,
          headers: {
            'X-Goog-Upload-URL': 'https://upload.example.com/resumable/session-1',
          },
        });
      }

      return new Response(JSON.stringify({}), { status: 500 });
    });
  });

  it('starts a resumable upload session and forwards upload progress events', async () => {
    const file = new File(['hello'], 'sample.txt', { type: 'text/plain' });
    const controller = new AbortController();
    const onProgress = vi.fn();

    const uploadedFile = await uploadFileApi(
      'api-key',
      file,
      'text/plain',
      'sample.txt',
      controller.signal,
      onProgress,
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe('https://generativelanguage.googleapis.com/upload/v1beta/files');
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      headers: expect.objectContaining({
        'x-goog-api-key': 'api-key',
      }),
    });
    expect(onProgress).toHaveBeenCalledWith(3, 5);
    expect(onProgress).toHaveBeenCalledWith(5, 5);
    expect(uploadXhr.requests).toHaveLength(1);
    expect(uploadXhr.requests[0].url).toBe('https://upload.example.com/resumable/session-1');
    expect(uploadXhr.requests[0].headers['x-goog-api-key']).toBe('api-key');
    expect(uploadedFile).toMatchObject({
      name: 'files/test-file',
      uri: 'https://generativelanguage.googleapis.com/v1beta/files/test-file',
    });
  });

  it('rewrites the upload session through the configured proxy base path', async () => {
    const client = {
      apiClient: createInternalApiClient(),
    };
    getConfiguredApiClientContextMock.mockResolvedValue({
      client,
      uploadApiClient: client.apiClient,
      apiBaseUrl: 'https://proxy.example.com/gemini',
      proxyBaseUrl: 'https://proxy.example.com/gemini',
    });

    const file = new File(['hello'], 'sample.txt', { type: 'text/plain' });

    await uploadFileApi('api-key', file, 'text/plain', 'sample.txt', new AbortController().signal, vi.fn());

    expect(uploadXhr.requests).toHaveLength(1);
    expect(uploadXhr.requests[0].url).toBe('https://proxy.example.com/gemini/resumable/session-1');
  });

  it('uploads large files in multiple resumable chunks', async () => {
    const chunkSize = 8 * 1024 * 1024;
    const file = new File([new Uint8Array(chunkSize * 2 + 1024)], 'large.mp4', { type: 'video/mp4' });

    await uploadFileApi('api-key', file, 'video/mp4', 'large.mp4', new AbortController().signal, vi.fn());

    expect(uploadXhr.requests).toHaveLength(3);
    expect(uploadXhr.requests[0].headers['X-Goog-Upload-Offset']).toBe('0');
    expect(uploadXhr.requests[0].headers['X-Goog-Upload-Command']).toBe('upload');
    expect(uploadXhr.requests[0].bodySize).toBe(chunkSize);
    expect(uploadXhr.requests[1].headers['X-Goog-Upload-Offset']).toBe(String(chunkSize));
    expect(uploadXhr.requests[1].headers['X-Goog-Upload-Command']).toBe('upload');
    expect(uploadXhr.requests[1].bodySize).toBe(chunkSize);
    expect(uploadXhr.requests[2].headers['X-Goog-Upload-Offset']).toBe(String(chunkSize * 2));
    expect(uploadXhr.requests[2].headers['X-Goog-Upload-Command']).toBe('upload, finalize');
    expect(uploadXhr.requests[2].bodySize).toBe(1024);
  });

  it('retries transient byte upload failures before giving up on the chunk', async () => {
    uploadXhr.scenarios.push(
      {
        status: 503,
        responseText: JSON.stringify({ error: { message: 'try again' } }),
        responseHeaders: { 'content-type': 'application/json' },
      },
      {
        status: 200,
        responseHeaders: {
          'content-type': 'application/json',
          'x-goog-upload-status': 'final',
        },
        responseText: JSON.stringify({
          file: {
            name: 'files/test-file',
            uri: 'https://generativelanguage.googleapis.com/v1beta/files/test-file',
          },
        }),
      },
    );
    const file = new File(['hello'], 'sample.txt', { type: 'text/plain' });

    const uploadedFile = await uploadFileApi(
      'api-key',
      file,
      'text/plain',
      'sample.txt',
      new AbortController().signal,
      vi.fn(),
    );

    expect(uploadXhr.requests).toHaveLength(2);
    expect(uploadXhr.requests[0].headers['X-Goog-Upload-Offset']).toBe('0');
    expect(uploadXhr.requests[1].headers['X-Goog-Upload-Offset']).toBe('0');
    expect(uploadedFile.name).toBe('files/test-file');
  });
});
