import { act } from 'react';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { renderHookWithProviders } from '@/test/render/providerRenderer';
import { createAppSettings, createChatSettings, createUploadedFile } from '@/test/data/factories';
import { flushPromises } from '@/test/render/renderer';
import { useFilePolling } from './useFilePolling';
import { useChatStore } from '@/stores/chatStore';

const { getFileMetadataApiMock, getGeminiKeyForRequestMock } = vi.hoisted(() => ({
  getFileMetadataApiMock: vi.fn(),
  getGeminiKeyForRequestMock: vi.fn(),
}));

vi.mock('@/services/api/fileApi', () => ({
  getFileMetadataApi: getFileMetadataApiMock,
}));

vi.mock('@/utils/apiKeySelection', () => ({
  formatApiKeyErrorMessage: vi.fn((error: string) => error),
  getGeminiKeyForRequest: getGeminiKeyForRequestMock,
}));

describe('useFilePolling', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    getGeminiKeyForRequestMock.mockReturnValue({ key: 'api-key', isNewKey: false });
    getFileMetadataApiMock.mockResolvedValue({ state: 'PROCESSING' });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('restarts polling for processing files after selected files change', async () => {
    const processingFile = createUploadedFile({
      id: 'file-processing',
      name: 'video.mp4',
      type: 'video/mp4',
      uploadState: 'processing_api',
      isProcessing: true,
      fileApiName: 'files/video-123',
    });
    const setSelectedFiles = vi.fn();

    const { rerender, unmount } = renderHookWithProviders(
      () =>
        useFilePolling({
          appSettings: createAppSettings(),
          selectedFiles: [processingFile],
          setSelectedFiles,
          currentChatSettings: createChatSettings(),
        }),
      { language: 'en' },
    );

    await act(async () => {
      await flushPromises();
    });

    expect(getFileMetadataApiMock).toHaveBeenCalledTimes(1);

    rerender(() =>
      useFilePolling({
        appSettings: createAppSettings(),
        selectedFiles: [
          processingFile,
          createUploadedFile({
            id: 'file-processing-2',
            name: 'video-2.mp4',
            type: 'video/mp4',
            uploadState: 'processing_api',
            isProcessing: true,
            fileApiName: 'files/video-456',
          }),
        ],
        setSelectedFiles,
        currentChatSettings: createChatSettings(),
      }),
    );

    await act(async () => {
      await flushPromises();
    });

    expect(getFileMetadataApiMock).toHaveBeenCalledTimes(2);
    unmount();
  });

  it('surfaces File.error.message when polling reaches FAILED', async () => {
    getFileMetadataApiMock.mockResolvedValue({
      state: 'FAILED',
      error: { code: 3, message: 'Video codec is not supported.' },
    });

    const processingFile = createUploadedFile({
      id: 'file-processing',
      name: 'video.mp4',
      type: 'video/mp4',
      uploadState: 'processing_api',
      isProcessing: true,
      fileApiName: 'files/video-123',
    });
    const setSelectedFiles = vi.fn();

    const { unmount } = renderHookWithProviders(
      () =>
        useFilePolling({
          appSettings: createAppSettings(),
          selectedFiles: [processingFile],
          setSelectedFiles,
          currentChatSettings: createChatSettings(),
        }),
      { language: 'en' },
    );

    await act(async () => {
      await flushPromises();
    });

    expect(setSelectedFiles).toHaveBeenCalled();
    const updater = setSelectedFiles.mock.calls.at(-1)?.[0] as (
      files: Array<typeof processingFile>,
    ) => Array<typeof processingFile>;
    expect(updater([processingFile])[0]).toEqual(
      expect.objectContaining({
        uploadState: 'failed',
        isProcessing: false,
        error: 'Backend processing failed: Video codec is not supported.',
      }),
    );

    unmount();
  });

  it('polls processing files that exist in savedSessions messages after optimistic send', async () => {
    getFileMetadataApiMock.mockResolvedValue({ state: 'ACTIVE' });
    const processingFile = createUploadedFile({
      id: 'file-in-message',
      name: 'recording.mp4',
      type: 'video/mp4',
      uploadState: 'processing_api',
      isProcessing: true,
      fileApiName: 'files/rec-123',
    });

    const updateUploadedFileSpy = vi.fn();
    useChatStore.setState({
      savedSessions: [
        {
          id: 'session-1',
          title: 'Test',
          settings: createChatSettings(),
          messages: [
            {
              id: 'msg-1',
              role: 'user',
              content: 'Check this video',
              files: [processingFile],
              timestamp: new Date(),
            },
          ],
          timestamp: Date.now(),
        },
      ],
      updateUploadedFile: updateUploadedFileSpy,
    });

    const { unmount } = renderHookWithProviders(
      () =>
        useFilePolling({
          appSettings: createAppSettings(),
          selectedFiles: [],
          setSelectedFiles: vi.fn(),
          currentChatSettings: createChatSettings(),
        }),
      { language: 'en' },
    );

    await act(async () => {
      await flushPromises();
    });

    expect(getFileMetadataApiMock).toHaveBeenCalledWith('api-key', 'files/rec-123');
    expect(updateUploadedFileSpy).toHaveBeenCalledWith('file-in-message', {
      uploadState: 'active',
      isProcessing: false,
    });

    unmount();
  });
});
