import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createChatMessage, createUploadedFile } from '@/test/data/factories';

const { mockGetFileMetadataApi, mockUploadFileApi } = vi.hoisted(() => ({
  mockGetFileMetadataApi: vi.fn(),
  mockUploadFileApi: vi.fn(),
}));

vi.mock('@/services/api/fileApi', () => ({
  getFileMetadataApi: mockGetFileMetadataApi,
  uploadFileApi: mockUploadFileApi,
}));

import {
  ensureFilesApiReferences,
  ensureHistoryFilesApiReferences,
  formatHistoryFileApiUnavailablePartText,
  sessionHasGeminiFilesApiReferences,
} from './fileApiReference';
import { getApiKeyFingerprint } from '@/utils/chat/geminiFilesApi';

const translate = (key: string) => {
  if (key === 'messageSenderHistoryFileReferenceUnavailable') {
    return 'unavailable:{filename}';
  }
  return key;
};

describe('sessionHasGeminiFilesApiReferences', () => {
  it('detects Files API names on message files and fileData parts', () => {
    expect(
      sessionHasGeminiFilesApiReferences([
        createChatMessage({
          files: [createUploadedFile({ fileApiName: 'files/abc', fileUri: 'https://files/abc' })],
        }),
      ]),
    ).toBe(true);

    expect(
      sessionHasGeminiFilesApiReferences([
        createChatMessage({
          apiParts: [{ fileData: { mimeType: 'application/pdf', fileUri: 'files/from-parts' } }],
        }),
      ]),
    ).toBe(true);
  });

  it('ignores YouTube links and inline-only attachments', () => {
    expect(
      sessionHasGeminiFilesApiReferences([
        createChatMessage({
          files: [
            createUploadedFile({
              fileUri: 'https://youtube.com/watch?v=abc',
              transferStrategy: 'files-api',
            }),
            createUploadedFile({
              rawFile: new Blob(['img'], { type: 'image/png' }),
              transferStrategy: 'inline',
            }),
          ],
        }),
      ]),
    ).toBe(false);
  });
});

describe('ensureHistoryFilesApiReferences', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetFileMetadataApi.mockResolvedValue({
      state: 'ACTIVE',
      name: 'files/current',
      uri: 'https://files/current',
    });
    mockUploadFileApi.mockResolvedValue({
      state: 'ACTIVE',
      name: 'files/refreshed',
      uri: 'https://files/refreshed',
    });
  });

  it('does not call the Files API when history has no Gemini file references', async () => {
    const messages = [createChatMessage({ content: 'hello' })];

    const result = await ensureHistoryFilesApiReferences({
      messages,
      apiKey: 'api-key',
      abortSignal: new AbortController().signal,
      translate,
    });

    expect(result).toEqual({ ok: true, messages, changed: false });
    expect(mockGetFileMetadataApi).not.toHaveBeenCalled();
    expect(mockUploadFileApi).not.toHaveBeenCalled();
  });

  it('stamps the current key fingerprint on still-active historical references without re-uploading', async () => {
    const file = createUploadedFile({
      id: 'file-1',
      fileApiName: 'files/current',
      fileUri: 'https://files/current',
      uploadState: 'active',
    });
    const messages = [createChatMessage({ files: [file] })];

    const result = await ensureHistoryFilesApiReferences({
      messages,
      apiKey: 'api-key',
      abortSignal: new AbortController().signal,
      translate,
    });

    expect(result.ok).toBe(true);
    expect(mockUploadFileApi).not.toHaveBeenCalled();
    expect(mockGetFileMetadataApi).toHaveBeenCalledWith('api-key', 'files/current');
    if (!result.ok) {
      throw new Error('expected success');
    }
    expect(result.changed).toBe(true);
    expect(result.messages[0].files?.[0]).toEqual(
      expect.objectContaining({
        fileApiName: 'files/current',
        fileUri: 'https://files/current',
        uploadState: 'active',
        fileApiKeyFingerprint: getApiKeyFingerprint('api-key'),
      }),
    );
  });

  it('skips Files API GET when a historical reference is still within its expiration leeway', async () => {
    const file = createUploadedFile({
      id: 'file-1',
      fileApiName: 'files/current',
      fileUri: 'https://files/current',
      uploadState: 'active',
      fileApiExpirationTime: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    });
    const messages = [createChatMessage({ files: [file] })];

    const result = await ensureHistoryFilesApiReferences({
      messages,
      apiKey: 'api-key',
      abortSignal: new AbortController().signal,
      translate,
    });

    expect(result).toEqual({ ok: true, messages, changed: false });
    expect(mockGetFileMetadataApi).not.toHaveBeenCalled();
    expect(mockUploadFileApi).not.toHaveBeenCalled();
  });

  it('re-uploads a still-valid reference immediately when the uploading key no longer matches', async () => {
    const rawFile = new File(['video-bytes'], 'clip.mp4', { type: 'video/mp4' });
    const file = createUploadedFile({
      id: 'file-key',
      name: 'clip.mp4',
      type: 'video/mp4',
      size: rawFile.size,
      rawFile,
      fileApiName: 'files/other-key',
      fileUri: 'https://files/other-key',
      uploadState: 'active',
      transferStrategy: 'files-api',
      fileApiExpirationTime: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      fileApiKeyFingerprint: getApiKeyFingerprint('different-key'),
    });
    const messages = [
      createChatMessage({
        id: 'user-1',
        content: 'what do you see',
        files: [file],
        apiParts: [
          { fileData: { mimeType: 'video/mp4', fileUri: 'https://files/other-key' } },
          { text: 'what do you see' },
        ],
      }),
    ];

    const result = await ensureHistoryFilesApiReferences({
      messages,
      apiKey: 'api-key',
      abortSignal: new AbortController().signal,
      translate,
    });

    expect(mockGetFileMetadataApi).not.toHaveBeenCalled();
    expect(mockUploadFileApi).toHaveBeenCalledWith(
      'api-key',
      rawFile,
      'video/mp4',
      'clip.mp4',
      expect.any(AbortSignal),
    );
    if (!result.ok) {
      throw new Error('expected success');
    }
    expect(result.changed).toBe(true);
    expect(result.messages[0].files?.[0]).toEqual(
      expect.objectContaining({
        fileApiName: 'files/refreshed',
        fileUri: 'https://files/refreshed',
        uploadState: 'active',
        fileApiKeyFingerprint: getApiKeyFingerprint('api-key'),
      }),
    );
    expect(result.messages[0].apiParts?.[0]).toEqual({
      fileData: { mimeType: 'video/mp4', fileUri: 'https://files/refreshed' },
    });
  });

  it('degrades a key-mismatched history file without a local backup when metadata access is denied', async () => {
    mockGetFileMetadataApi.mockRejectedValue(new Error('403 PERMISSION_DENIED: caller lacks access'));
    const file = createUploadedFile({
      id: 'file-remote',
      name: 'remote-only.pdf',
      type: 'application/pdf',
      fileApiName: 'files/other-key',
      fileUri: 'https://files/other-key',
      uploadState: 'active',
      transferStrategy: 'remote-file-id',
      fileApiKeyFingerprint: getApiKeyFingerprint('different-key'),
    });
    const messages = [
      createChatMessage({
        id: 'user-1',
        content: 'summarize this',
        files: [file],
        apiParts: [
          { fileData: { mimeType: 'application/pdf', fileUri: 'https://files/other-key' } },
          { text: 'summarize this' },
        ],
      }),
    ];

    const result = await ensureHistoryFilesApiReferences({
      messages,
      apiKey: 'api-key',
      abortSignal: new AbortController().signal,
      translate,
    });

    expect(result.ok).toBe(true);
    expect(mockUploadFileApi).not.toHaveBeenCalled();
    if (!result.ok) {
      throw new Error('expected success');
    }
    expect(result.changed).toBe(true);
    expect(result.messages[0].files?.[0]).toEqual(
      expect.objectContaining({
        uploadState: 'failed',
        transferStrategy: 'inline',
        omittedFromApiHistory: true,
        error: 'unavailable:remote-only.pdf',
      }),
    );
    expect(result.messages[0].apiParts).toEqual([
      { text: formatHistoryFileApiUnavailablePartText('remote-only.pdf') },
      { text: 'summarize this' },
    ]);
  });

  it('fails the turn without rewriting history when metadata lookup is transiently unavailable', async () => {
    mockGetFileMetadataApi.mockRejectedValue(new Error('503 Service Unavailable'));
    const staleFile = createUploadedFile({
      id: 'file-remote',
      name: 'remote-only.pdf',
      type: 'application/pdf',
      fileApiName: 'files/live',
      fileUri: 'https://files/live',
      uploadState: 'active',
      transferStrategy: 'remote-file-id',
    });
    const messages = [
      createChatMessage({
        id: 'user-1',
        content: 'summarize this',
        files: [staleFile],
      }),
    ];

    const result = await ensureHistoryFilesApiReferences({
      messages,
      apiKey: 'api-key',
      abortSignal: new AbortController().signal,
      translate,
    });

    expect(result).toEqual(
      expect.objectContaining({
        ok: false,
        errorKey: 'messageSenderFileReferenceVerifyFailed',
        fileName: 'remote-only.pdf',
      }),
    );
    expect(mockUploadFileApi).not.toHaveBeenCalled();
    if (result.ok) {
      throw new Error('expected failure');
    }
    expect(result.messages[0].content).toBe('summarize this');
    expect(result.messages[0].files?.[0]).toEqual(
      expect.objectContaining({
        fileApiName: 'files/live',
        fileUri: 'https://files/live',
        uploadState: 'active',
      }),
    );
  });

  it('re-uploads an expired historical file and rewrites files plus apiParts URIs', async () => {
    mockGetFileMetadataApi.mockResolvedValue(null);
    const rawFile = new File(['pdf-bytes'], 'notes.pdf', { type: 'application/pdf' });
    const staleFile = createUploadedFile({
      id: 'file-stale',
      name: 'notes.pdf',
      type: 'application/pdf',
      size: rawFile.size,
      rawFile,
      fileApiName: 'files/expired',
      fileUri: 'https://files/expired',
      uploadState: 'active',
      transferStrategy: 'files-api',
    });
    const messages = [
      createChatMessage({
        id: 'user-1',
        content: 'summarize this',
        files: [staleFile],
        apiParts: [
          { fileData: { mimeType: 'application/pdf', fileUri: 'https://files/expired' } },
          { text: 'summarize this' },
        ],
      }),
      createChatMessage({ id: 'model-1', role: 'model', content: 'it is a report' }),
    ];

    const result = await ensureHistoryFilesApiReferences({
      messages,
      apiKey: 'api-key',
      abortSignal: new AbortController().signal,
      translate,
    });

    expect(result.ok).toBe(true);
    expect(mockUploadFileApi).toHaveBeenCalledWith(
      'api-key',
      rawFile,
      'application/pdf',
      'notes.pdf',
      expect.any(AbortSignal),
    );
    if (!result.ok) {
      throw new Error('expected success');
    }
    expect(result.changed).toBe(true);
    expect(result.messages[0].files?.[0]).toEqual(
      expect.objectContaining({
        id: 'file-stale',
        fileApiName: 'files/refreshed',
        fileUri: 'https://files/refreshed',
        uploadState: 'active',
      }),
    );
    expect(result.messages[0].apiParts).toEqual([
      { fileData: { mimeType: 'application/pdf', fileUri: 'https://files/refreshed' } },
      { text: 'summarize this' },
    ]);
    expect(result.messages[1]).toBe(messages[1]);
  });

  it('re-uploads a shared Files API id once and rewrites every historical occurrence', async () => {
    mockGetFileMetadataApi.mockResolvedValue(null);
    const rawFile = new File(['img'], 'shot.png', { type: 'image/png' });
    const first = createUploadedFile({
      id: 'file-a',
      name: 'shot.png',
      type: 'image/png',
      rawFile,
      fileApiName: 'files/shared',
      fileUri: 'https://files/shared',
      transferStrategy: 'files-api',
    });
    const second = createUploadedFile({
      id: 'file-b',
      name: 'shot.png',
      type: 'image/png',
      fileApiName: 'files/shared',
      fileUri: 'files/shared',
      transferStrategy: 'remote-file-id',
    });
    const messages = [
      createChatMessage({ id: 'user-1', files: [first] }),
      createChatMessage({
        id: 'user-2',
        files: [second],
        apiParts: [{ fileData: { mimeType: 'image/png', fileUri: 'files/shared' } }],
      }),
    ];

    const result = await ensureHistoryFilesApiReferences({
      messages,
      apiKey: 'api-key',
      abortSignal: new AbortController().signal,
      translate,
    });

    expect(mockGetFileMetadataApi).toHaveBeenCalledTimes(1);
    expect(mockUploadFileApi).toHaveBeenCalledTimes(1);
    if (!result.ok) {
      throw new Error('expected success');
    }
    expect(result.messages[0].files?.[0].fileUri).toBe('https://files/refreshed');
    expect(result.messages[1].files?.[0].fileUri).toBe('https://files/refreshed');
    expect(result.messages[1].apiParts?.[0]).toEqual({
      fileData: { mimeType: 'image/png', fileUri: 'https://files/refreshed' },
    });
  });

  it('degrades an expired historical file without a local backup instead of failing the turn', async () => {
    mockGetFileMetadataApi.mockResolvedValue(null);
    const staleFile = createUploadedFile({
      id: 'file-remote',
      name: 'remote-only.pdf',
      type: 'application/pdf',
      fileApiName: 'files/expired',
      fileUri: 'https://files/expired',
      uploadState: 'active',
      transferStrategy: 'remote-file-id',
    });
    const messages = [
      createChatMessage({
        id: 'user-1',
        content: 'summarize this',
        files: [staleFile],
        apiParts: [
          { fileData: { mimeType: 'application/pdf', fileUri: 'https://files/expired' } },
          { text: 'summarize this' },
        ],
      }),
    ];

    const result = await ensureHistoryFilesApiReferences({
      messages,
      apiKey: 'api-key',
      abortSignal: new AbortController().signal,
      translate,
    });

    expect(result.ok).toBe(true);
    expect(mockUploadFileApi).not.toHaveBeenCalled();
    if (!result.ok) {
      throw new Error('expected success');
    }
    expect(result.changed).toBe(true);
    expect(result.messages[0].files?.[0]).toEqual(
      expect.objectContaining({
        id: 'file-remote',
        fileApiName: undefined,
        fileUri: undefined,
        uploadState: 'failed',
        transferStrategy: 'inline',
        omittedFromApiHistory: true,
        error: 'unavailable:remote-only.pdf',
      }),
    );
    expect(result.messages[0].apiParts).toEqual([
      { text: formatHistoryFileApiUnavailablePartText('remote-only.pdf') },
      { text: 'summarize this' },
    ]);
    expect(result.messages[0].content).toBe('summarize this');
  });

  it('marks a degraded file omitted from API history without rewriting user content', async () => {
    mockGetFileMetadataApi.mockResolvedValue(null);
    const staleFile = createUploadedFile({
      id: 'file-remote',
      name: 'deck.pdf',
      type: 'application/pdf',
      fileApiName: 'files/expired',
      fileUri: 'https://files/expired',
      transferStrategy: 'remote-file-id',
    });
    const messages = [createChatMessage({ id: 'user-1', content: 'look at this', files: [staleFile] })];

    const result = await ensureHistoryFilesApiReferences({
      messages,
      apiKey: 'api-key',
      abortSignal: new AbortController().signal,
      translate,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error('expected success');
    }
    expect(result.messages[0].content).toBe('look at this');
    expect(result.messages[0].apiParts).toBeUndefined();
    expect(result.messages[0].files?.[0]).toEqual(
      expect.objectContaining({
        fileApiName: undefined,
        fileUri: undefined,
        uploadState: 'failed',
        omittedFromApiHistory: true,
        error: 'unavailable:deck.pdf',
      }),
    );
  });

  it('skips YouTube attachments when scanning history', async () => {
    const messages = [
      createChatMessage({
        files: [
          createUploadedFile({
            name: 'clip',
            fileUri: 'https://youtube.com/watch?v=abc',
            transferStrategy: 'files-api',
          }),
        ],
      }),
    ];

    const result = await ensureHistoryFilesApiReferences({
      messages,
      apiKey: 'api-key',
      abortSignal: new AbortController().signal,
      translate,
    });

    expect(result).toEqual({ ok: true, messages, changed: false });
    expect(mockGetFileMetadataApi).not.toHaveBeenCalled();
  });

  it('blocks the send when a historical file is still processing on the backend', async () => {
    mockGetFileMetadataApi.mockResolvedValue({ state: 'PROCESSING', name: 'files/busy', uri: 'https://files/busy' });
    const messages = [
      createChatMessage({
        files: [
          createUploadedFile({
            name: 'video.mp4',
            type: 'video/mp4',
            fileApiName: 'files/busy',
            fileUri: 'https://files/busy',
            transferStrategy: 'remote-file-id',
          }),
        ],
      }),
    ];

    const result = await ensureHistoryFilesApiReferences({
      messages,
      apiKey: 'api-key',
      abortSignal: new AbortController().signal,
      translate,
    });

    expect(result).toEqual(
      expect.objectContaining({
        ok: false,
        errorKey: 'messageSenderWaitForFiles',
        fileName: 'video.mp4',
      }),
    );
    expect(mockUploadFileApi).not.toHaveBeenCalled();
  });
});

describe('ensureFilesApiReferences', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetFileMetadataApi.mockResolvedValue({
      state: 'ACTIVE',
      name: 'files/current',
      uri: 'https://files/current',
    });
  });

  it('skips Files API GET when the current file is still within its expiration leeway', async () => {
    const file = createUploadedFile({
      fileApiName: 'files/current',
      fileUri: 'https://files/current',
      uploadState: 'active',
      transferStrategy: 'files-api',
      fileApiExpirationTime: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    });

    const result = await ensureFilesApiReferences({
      files: [file],
      apiKey: 'api-key',
      abortSignal: new AbortController().signal,
    });

    expect(result).toEqual({ ok: true, files: [file] });
    expect(mockGetFileMetadataApi).not.toHaveBeenCalled();
    expect(mockUploadFileApi).not.toHaveBeenCalled();
  });

  it('fails closed on a transient metadata error without re-uploading a local backup', async () => {
    mockGetFileMetadataApi.mockRejectedValue(new Error('timeout'));
    const rawFile = new File(['pdf-bytes'], 'notes.pdf', { type: 'application/pdf' });
    const file = createUploadedFile({
      name: 'notes.pdf',
      type: 'application/pdf',
      rawFile,
      fileApiName: 'files/current',
      fileUri: 'https://files/current',
      uploadState: 'active',
      transferStrategy: 'files-api',
    });

    const result = await ensureFilesApiReferences({
      files: [file],
      apiKey: 'api-key',
      abortSignal: new AbortController().signal,
    });

    expect(result).toEqual(
      expect.objectContaining({
        ok: false,
        errorKey: 'messageSenderFileReferenceVerifyFailed',
        fileName: 'notes.pdf',
      }),
    );
    expect(mockUploadFileApi).not.toHaveBeenCalled();
  });

  it('re-uploads the local backup when metadata lookup is denied for the current key', async () => {
    mockGetFileMetadataApi.mockRejectedValue(new Error('403 PERMISSION_DENIED: caller lacks access'));
    const rawFile = new File(['pdf-bytes'], 'notes.pdf', { type: 'application/pdf' });
    const file = createUploadedFile({
      name: 'notes.pdf',
      type: 'application/pdf',
      rawFile,
      fileApiName: 'files/current',
      fileUri: 'https://files/current',
      uploadState: 'active',
      transferStrategy: 'files-api',
    });

    const result = await ensureFilesApiReferences({
      files: [file],
      apiKey: 'api-key',
      abortSignal: new AbortController().signal,
    });

    expect(result.ok).toBe(true);
    expect(mockUploadFileApi).toHaveBeenCalledWith(
      'api-key',
      rawFile,
      'application/pdf',
      'notes.pdf',
      expect.any(AbortSignal),
    );
    if (!result.ok) {
      throw new Error('expected success');
    }
    expect(result.files[0]).toEqual(
      expect.objectContaining({
        fileApiName: 'files/refreshed',
        fileUri: 'https://files/refreshed',
        uploadState: 'active',
        fileApiKeyFingerprint: getApiKeyFingerprint('api-key'),
      }),
    );
  });

  it('fails with the no-backup error when metadata access is denied and no local backup exists', async () => {
    mockGetFileMetadataApi.mockRejectedValue(new Error('403 PERMISSION_DENIED: caller lacks access'));
    const file = createUploadedFile({
      name: 'remote-only.pdf',
      type: 'application/pdf',
      fileApiName: 'files/current',
      fileUri: 'https://files/current',
      uploadState: 'active',
      transferStrategy: 'remote-file-id',
    });

    const result = await ensureFilesApiReferences({
      files: [file],
      apiKey: 'api-key',
      abortSignal: new AbortController().signal,
    });

    expect(result).toEqual(
      expect.objectContaining({
        ok: false,
        errorKey: 'messageSenderFileReferenceExpiredNoBackup',
        fileName: 'remote-only.pdf',
      }),
    );
    expect(mockUploadFileApi).not.toHaveBeenCalled();
  });

  it('surfaces File.error.message when a refreshed upload finishes FAILED', async () => {
    mockGetFileMetadataApi.mockResolvedValue({ state: 'FAILED' });
    mockUploadFileApi.mockResolvedValue({
      state: 'FAILED',
      name: 'files/refreshed',
      uri: 'https://files/refreshed',
      error: { code: 3, message: 'Video codec is not supported.' },
    });

    const rawFile = new File(['pdf-bytes'], 'notes.pdf', { type: 'application/pdf' });
    const file = createUploadedFile({
      name: 'notes.pdf',
      type: 'application/pdf',
      rawFile,
      fileApiName: 'files/current',
      fileUri: 'https://files/current',
      uploadState: 'active',
      transferStrategy: 'files-api',
    });

    const result = await ensureFilesApiReferences({
      files: [file],
      apiKey: 'api-key',
      abortSignal: new AbortController().signal,
    });

    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error('expected failure');
    }
    expect(result.files[0]).toEqual(
      expect.objectContaining({
        uploadState: 'failed',
        error: 'Video codec is not supported.',
      }),
    );
  });
});
