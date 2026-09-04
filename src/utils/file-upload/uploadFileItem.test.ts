import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_APP_SETTINGS } from '@/constants/settingsDefaults';
import type { UploadedFile } from '@/types';

const { uploadFileMock, generateUniqueIdMock, fileToBlobUrlMock } = vi.hoisted(() => ({
  uploadFileMock: vi.fn(),
  generateUniqueIdMock: vi.fn(),
  fileToBlobUrlMock: vi.fn(),
}));

vi.mock('@/services/api/fileApi', () => ({
  uploadFileApi: uploadFileMock,
}));

vi.mock('@/utils/chat/ids', () => ({
  generateUniqueId: generateUniqueIdMock,
}));

vi.mock('@/utils/file/filePreviewUrls', () => {
  return {
    fileToBlobUrl: fileToBlobUrlMock,
  };
});

import { uploadFileItem } from './uploadFileItem';

describe('uploadFileItem', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    generateUniqueIdMock.mockReturnValue('file-1');
    fileToBlobUrlMock.mockReturnValue('blob:preview-file-1');
    uploadFileMock.mockResolvedValue({
      name: 'files/test-file',
      uri: 'https://generativelanguage.googleapis.com/v1beta/files/test-file',
      expirationTime: '2026-08-16T09:00:00.000Z',
    });
  });

  it('keeps uploads with an unspecified backend state in pollable processing', async () => {
    const file = new File(['video'], 'clip.mp4', { type: 'video/mp4' });
    let selectedFiles: UploadedFile[] = [];
    const setSelectedFiles = (updater: UploadedFile[] | ((prev: UploadedFile[]) => UploadedFile[])) => {
      selectedFiles = typeof updater === 'function' ? updater(selectedFiles) : updater;
    };

    await uploadFileItem({
      file,
      keyToUse: 'api-key',
      forceFileApi: true,
      defaultResolution: undefined,
      appSettings: DEFAULT_APP_SETTINGS,
      setSelectedFiles,
      uploadStatsRef: {
        current: new Map<string, { lastLoaded: number; lastTime: number }>(),
      },
    });

    expect(selectedFiles).toEqual([
      expect.objectContaining({
        id: 'file-1',
        name: 'clip.mp4',
        fileApiName: 'files/test-file',
        fileUri: 'https://generativelanguage.googleapis.com/v1beta/files/test-file',
        fileApiExpirationTime: '2026-08-16T09:00:00.000Z',
        uploadState: 'processing_api',
        isProcessing: true,
        error: undefined,
      }),
    ]);
  });

  it('surfaces File.error.message when upload processing fails immediately', async () => {
    uploadFileMock.mockResolvedValue({
      name: 'files/test-file',
      uri: 'https://generativelanguage.googleapis.com/v1beta/files/test-file',
      state: 'FAILED',
      error: { code: 3, message: 'Video codec is not supported.' },
    });

    const file = new File(['video'], 'clip.mp4', { type: 'video/mp4' });
    let selectedFiles: UploadedFile[] = [];
    const setSelectedFiles = (updater: UploadedFile[] | ((prev: UploadedFile[]) => UploadedFile[])) => {
      selectedFiles = typeof updater === 'function' ? updater(selectedFiles) : updater;
    };

    await uploadFileItem({
      file,
      keyToUse: 'api-key',
      forceFileApi: true,
      defaultResolution: undefined,
      appSettings: DEFAULT_APP_SETTINGS,
      setSelectedFiles,
      uploadStatsRef: {
        current: new Map<string, { lastLoaded: number; lastTime: number }>(),
      },
    });

    expect(selectedFiles[0]).toEqual(
      expect.objectContaining({
        uploadState: 'failed',
        isProcessing: false,
        error: 'File API processing failed: Video codec is not supported.',
      }),
    );
  });

  it('inlines extensionless files as text instead of rejecting them as unsupported', async () => {
    const file = new File(['FROM node:24'], 'Dockerfile', { type: '' });
    let selectedFiles: UploadedFile[] = [];
    const setSelectedFiles = (updater: UploadedFile[] | ((prev: UploadedFile[]) => UploadedFile[])) => {
      selectedFiles = typeof updater === 'function' ? updater(selectedFiles) : updater;
    };

    await uploadFileItem({
      file,
      keyToUse: null,
      defaultResolution: undefined,
      appSettings: DEFAULT_APP_SETTINGS,
      setSelectedFiles,
      uploadStatsRef: {
        current: new Map<string, { lastLoaded: number; lastTime: number }>(),
      },
    });

    expect(uploadFileMock).not.toHaveBeenCalled();
    expect(selectedFiles[0]).toEqual(
      expect.objectContaining({
        name: 'Dockerfile',
        type: 'text/plain',
        uploadState: 'active',
        transferStrategy: 'inline',
      }),
    );
    expect(selectedFiles[0].error).toBeUndefined();
  });
});
