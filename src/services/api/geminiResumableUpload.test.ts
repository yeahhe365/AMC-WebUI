import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakeResumableUploadXhr } from '@/test/api/fakeResumableUpload';
import { useSettingsStore } from '@/stores/settingsStore';
import { uploadGeminiFileResumable, type InternalGeminiApiClient } from './geminiResumableUpload';

type StartUploadRequestRecord = {
  body: unknown;
  headers: Record<string, string>;
};

const uploadXhr = createFakeResumableUploadXhr({
  defaultResponseText: JSON.stringify({ file: { name: 'files/test-file' } }),
});
const startUploadRequests: StartUploadRequestRecord[] = [];

describe('uploadGeminiFileResumable', () => {
  beforeEach(() => {
    uploadXhr.reset();
    startUploadRequests.length = 0;
    vi.stubGlobal('XMLHttpRequest', uploadXhr.XMLHttpRequest);
  });

  it('starts the upload session against the configured Gemini base URL and uploads through the proxy path', async () => {
    const apiClient: InternalGeminiApiClient = {
      request: async (request) => {
        startUploadRequests.push({
          body: request.body ? JSON.parse(String(request.body)) : null,
          headers: request.httpOptions?.headers ?? {},
        });

        return {
          headers: {
            'x-goog-upload-url': 'https://upload.example.com/resumable/session-1',
          },
          json: async () => ({}),
        };
      },
    };
    const onProgress = vi.fn();

    const uploadedFile = await uploadGeminiFileResumable({
      apiClient,
      apiBaseUrl: 'https://proxy.example.com/gemini',
      proxyBaseUrl: 'https://proxy.example.com/gemini',
      apiKey: 'api-key',
      file: new File(['hello'], 'sample.txt', { type: 'text/plain' }),
      mimeType: 'text/plain',
      displayName: 'sample.txt',
      signal: new AbortController().signal,
      onProgress,
    });

    expect(uploadXhr.requests).toHaveLength(1);
    expect(startUploadRequests).toEqual([
      {
        body: { file: { displayName: 'sample.txt' } },
        headers: expect.objectContaining({
          'X-Goog-Upload-Header-Content-Length': '5',
          'X-Goog-Upload-Header-Content-Type': 'text/plain',
        }),
      },
    ]);
    expect(uploadXhr.requests[0]).toMatchObject({
      url: 'https://proxy.example.com/gemini/resumable/session-1',
      headers: {
        'X-Goog-Upload-Offset': '0',
        'X-Goog-Upload-Command': 'upload, finalize',
        'x-goog-api-key': 'api-key',
      },
      bodySize: 5,
    });
    expect(onProgress).toHaveBeenCalledWith(5, 5);
    expect(uploadedFile.name).toBe('files/test-file');
  });

  // P0-9:XHR 分片上传是手写请求,SDK 的 httpOptions 带不到这里;
  // 少了口令头,只要部署设了 ACCESS_PASSWORD,所有大附件上传都会 401。
  it('carries the deployment access password on the XHR chunk upload', async () => {
    useSettingsStore.setState((state) => ({
      appSettings: { ...state.appSettings, serverAccessPassword: 'deploy-pwd' },
    }));
    const apiClient: InternalGeminiApiClient = {
      request: async () => ({
        headers: { 'x-goog-upload-url': 'https://upload.example.com/resumable/session-2' },
        json: async () => ({}),
      }),
    };

    try {
      await uploadGeminiFileResumable({
        apiClient,
        apiBaseUrl: 'https://proxy.example.com/gemini',
        proxyBaseUrl: 'https://proxy.example.com/gemini',
        apiKey: 'api-key',
        file: new File(['hello'], 'sample.txt', { type: 'text/plain' }),
        mimeType: 'text/plain',
        displayName: 'sample.txt',
        signal: new AbortController().signal,
      });
    } finally {
      useSettingsStore.setState((state) => ({
        appSettings: { ...state.appSettings, serverAccessPassword: null },
      }));
    }

    expect(uploadXhr.requests[0]?.headers['x-access-token']).toBe('deploy-pwd');
    // 口令不能顶掉 Gemini 自己的 key 通道。
    expect(uploadXhr.requests[0]?.headers['x-goog-api-key']).toBe('api-key');
    expect(uploadXhr.requests[0]?.headers.authorization).toBeUndefined();
  });
});
