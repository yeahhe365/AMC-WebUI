import { act, type Dispatch, type SetStateAction } from 'react';
import { renderHookWithProviders } from '@/test/render/providerRenderer';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FileState } from '@google/genai';
import { DEFAULT_APP_SETTINGS } from '@/constants/settingsDefaults';
import type { UploadedFile } from '@/types';

const { generateUniqueIdMock, getKeyForRequestMock, getFileMetadataMock, registerGcsFilesMock } = vi.hoisted(() => ({
  generateUniqueIdMock: vi.fn(),
  getKeyForRequestMock: vi.fn(),
  getFileMetadataMock: vi.fn(),
  registerGcsFilesMock: vi.fn(),
}));

vi.mock('@/utils/chat/ids', () => ({
  generateUniqueId: generateUniqueIdMock,
}));

vi.mock('@/utils/apiKeySelection', () => ({
  getKeyForRequest: getKeyForRequestMock,
  getGeminiKeyForRequest: getKeyForRequestMock,
  formatApiKeyErrorMessage: vi.fn((error: string, translate: (translationKey: string) => string) =>
    error === 'API Key not configured.' ? translate('apiRuntimeKeyNotConfigured') : error,
  ),
}));

vi.mock('@/services/api/fileApi', () => ({
  getFileMetadataApi: getFileMetadataMock,
  registerGcsFilesApi: registerGcsFilesMock,
}));

import { useFileIdAdder } from './useFileIdAdder';

describe('useFileIdAdder', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    generateUniqueIdMock.mockReturnValue('temp-file-1');
    getKeyForRequestMock.mockReturnValue({ key: 'api-key', isNewKey: false });
    getFileMetadataMock.mockResolvedValue({
      name: 'files/test-file',
      uri: 'https://generativelanguage.googleapis.com/v1beta/files/test-file',
      mimeType: 'video/mp4',
      sizeBytes: '123',
      displayName: 'clip.mp4',
      expirationTime: '2026-08-16T09:00:00.000Z',
    });
  });

  it('keeps file ids with an unspecified backend state in pollable processing', async () => {
    let selectedFiles: UploadedFile[] = [];
    let appFileError: string | null = null;

    const setSelectedFiles = (updater: UploadedFile[] | ((prev: UploadedFile[]) => UploadedFile[])) => {
      selectedFiles = typeof updater === 'function' ? updater(selectedFiles) : updater;
    };
    const setAppFileErrorCalls = vi.fn();
    const setAppFileError: Dispatch<SetStateAction<string | null>> = (updater) => {
      appFileError = typeof updater === 'function' ? updater(appFileError) : updater;
      setAppFileErrorCalls(appFileError);
    };
    const setCurrentChatSettings = vi.fn();

    const { result, unmount } = renderHookWithProviders(
      () =>
        useFileIdAdder({
          appSettings: DEFAULT_APP_SETTINGS,
          setSelectedFiles,
          setAppFileError,
          currentChatSettings: DEFAULT_APP_SETTINGS,
          setCurrentChatSettings,
          selectedFiles,
        }),
      { language: 'zh' },
    );

    await act(async () => {
      await result.current.addFileById('files/test-file');
    });

    expect(appFileError).toBeNull();
    expect(selectedFiles).toEqual([
      expect.objectContaining({
        id: 'temp-file-1',
        name: 'clip.mp4',
        fileApiName: 'files/test-file',
        fileUri: 'https://generativelanguage.googleapis.com/v1beta/files/test-file',
        fileApiExpirationTime: '2026-08-16T09:00:00.000Z',
        uploadState: 'processing_api',
        isProcessing: true,
        error: undefined,
      }),
    ]);

    unmount();
  });

  it('shows a localized validation error for malformed file ids', async () => {
    let appFileError: string | null = null;

    const setAppFileError: Dispatch<SetStateAction<string | null>> = (updater) => {
      appFileError = typeof updater === 'function' ? updater(appFileError) : updater;
    };

    const { result, unmount } = renderHookWithProviders(
      () =>
        useFileIdAdder({
          appSettings: DEFAULT_APP_SETTINGS,
          setSelectedFiles: vi.fn(),
          setAppFileError,
          currentChatSettings: DEFAULT_APP_SETTINGS,
          setCurrentChatSettings: vi.fn(),
          selectedFiles: [],
        }),
      { language: 'zh' },
    );

    await act(async () => {
      await result.current.addFileById('bad-id');
    });

    expect(appFileError).toBe('无效的文件 ID 格式。');
    unmount();
  });

  it('surfaces File.error.message when the backend reports FAILED', async () => {
    getFileMetadataMock.mockResolvedValue({
      name: 'files/test-file',
      uri: 'https://generativelanguage.googleapis.com/v1beta/files/test-file',
      mimeType: 'video/mp4',
      sizeBytes: '123',
      displayName: 'clip.mp4',
      state: 'FAILED',
      error: { code: 3, message: 'Video codec is not supported.' },
    });

    let selectedFiles: UploadedFile[] = [];
    const setSelectedFiles = (updater: UploadedFile[] | ((prev: UploadedFile[]) => UploadedFile[])) => {
      selectedFiles = typeof updater === 'function' ? updater(selectedFiles) : updater;
    };

    const { result, unmount } = renderHookWithProviders(
      () =>
        useFileIdAdder({
          appSettings: DEFAULT_APP_SETTINGS,
          setSelectedFiles,
          setAppFileError: vi.fn(),
          currentChatSettings: DEFAULT_APP_SETTINGS,
          setCurrentChatSettings: vi.fn(),
          selectedFiles,
        }),
      { language: 'en' },
    );

    await act(async () => {
      await result.current.addFileById('files/test-file');
    });

    expect(selectedFiles[0]).toEqual(
      expect.objectContaining({
        uploadState: 'failed',
        isProcessing: false,
        error: 'File API processing failed: Video codec is not supported.',
      }),
    );

    unmount();
  });

  it('supports registering and adding GCS gs:// URIs', async () => {
    registerGcsFilesMock.mockResolvedValue([
      {
        name: 'files/gcs-registered-file',
        uri: 'https://generativelanguage.googleapis.com/v1beta/files/gcs-registered-file',
        mimeType: 'video/mp4',
        sizeBytes: '5000',
        displayName: 'gcs-video.mp4',
        state: 'ACTIVE',
      },
    ]);

    let selectedFiles: UploadedFile[] = [];
    const setSelectedFiles = (updater: UploadedFile[] | ((prev: UploadedFile[]) => UploadedFile[])) => {
      selectedFiles = typeof updater === 'function' ? updater(selectedFiles) : updater;
    };

    const { result, unmount } = renderHookWithProviders(
      () =>
        useFileIdAdder({
          appSettings: DEFAULT_APP_SETTINGS,
          setSelectedFiles,
          setAppFileError: vi.fn(),
          currentChatSettings: DEFAULT_APP_SETTINGS,
          setCurrentChatSettings: vi.fn(),
          selectedFiles,
        }),
      { language: 'en' },
    );

    await act(async () => {
      await result.current.addFileById('gs://my-bucket/sample.mp4');
    });

    expect(registerGcsFilesMock).toHaveBeenCalledWith('api-key', ['gs://my-bucket/sample.mp4']);
    expect(selectedFiles[0]).toEqual(
      expect.objectContaining({
        id: 'temp-file-1',
        name: 'gcs-video.mp4',
        fileApiName: 'files/gcs-registered-file',
        uploadState: 'active',
        isProcessing: false,
      }),
    );

    unmount();
  });

  it('adds multiple cloud files directly to selectedFiles via addFilesFromCloud', () => {
    let selectedFiles: UploadedFile[] = [];
    const setSelectedFiles = (updater: UploadedFile[] | ((prev: UploadedFile[]) => UploadedFile[])) => {
      selectedFiles = typeof updater === 'function' ? updater(selectedFiles) : updater;
    };

    const { result, unmount } = renderHookWithProviders(
      () =>
        useFileIdAdder({
          appSettings: DEFAULT_APP_SETTINGS,
          setSelectedFiles,
          setAppFileError: vi.fn(),
          currentChatSettings: DEFAULT_APP_SETTINGS,
          setCurrentChatSettings: vi.fn(),
          selectedFiles,
        }),
      { language: 'en' },
    );

    act(() => {
      result.current.addFilesFromCloud([
        {
          name: 'files/batch-1',
          displayName: 'batch1.png',
          mimeType: 'image/png',
          sizeBytes: '100',
          state: FileState.ACTIVE,
        },
      ]);
    });

    expect(selectedFiles).toHaveLength(1);
    expect(selectedFiles[0]).toEqual(
      expect.objectContaining({
        id: 'temp-file-1',
        name: 'batch1.png',
        fileApiName: 'files/batch-1',
        uploadState: 'active',
        isProcessing: false,
      }),
    );

    unmount();
  });
});
