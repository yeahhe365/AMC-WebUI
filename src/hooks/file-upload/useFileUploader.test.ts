import { act } from 'react';
import { renderHookWithProviders } from '@/test/render/providerRenderer';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_APP_SETTINGS } from '@/constants/settingsDefaults';
import type { AppSettings, ChatSettings, UploadedFile } from '@/types';
import { useFileUploader } from './useFileUploader';

const { uploadFileApiMock, getGeminiKeyForRequestMock } = vi.hoisted(() => ({
  uploadFileApiMock: vi.fn(),
  getGeminiKeyForRequestMock: vi.fn(),
}));

vi.mock('@/services/api/fileApi', () => ({
  uploadFileApi: uploadFileApiMock,
}));

vi.mock('@/utils/apiKeySelection', () => ({
  getGeminiKeyForRequest: getGeminiKeyForRequestMock,
  formatApiKeyErrorMessage: vi.fn((error: string) => String(error)),
}));

vi.mock('@/utils/file/filePreviewUrls', () => ({
  fileToBlobUrl: vi.fn(() => 'blob:preview'),
}));

vi.mock('@/utils/chat/ids', () => ({
  generateUniqueId: vi.fn(() => 'file-1'),
}));

describe('useFileUploader — third-party sessions never hit the Gemini Files API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    uploadFileApiMock.mockResolvedValue({
      name: 'files/test-file',
      uri: 'https://generativelanguage.googleapis.com/v1beta/files/test-file',
      state: 'ACTIVE',
    });
  });

  const renderUploader = (overrides: { appSettings?: AppSettings; currentChatSettings?: ChatSettings } = {}) => {
    let selectedFiles: UploadedFile[] = [];
    const setSelectedFiles = vi.fn((updater: UploadedFile[] | ((prev: UploadedFile[]) => UploadedFile[])) => {
      selectedFiles = typeof updater === 'function' ? updater(selectedFiles) : updater;
    });
    const setAppFileError = vi.fn();

    const { result, unmount } = renderHookWithProviders(
      () =>
        useFileUploader({
          appSettings: overrides.appSettings ?? DEFAULT_APP_SETTINGS,
          selectedFiles,
          setSelectedFiles,
          setAppFileError,
          currentChatSettings: overrides.currentChatSettings ?? DEFAULT_APP_SETTINGS,
          setCurrentChatSettings: vi.fn(),
        }),
      { language: 'en' },
    );

    return { result, unmount, getSelectedFiles: () => selectedFiles, setAppFileError };
  };

  // Regression: the uploader must follow the SESSION providerId. The global
  // appSettings stays gemini-native after switching chats, so a global-mode
  // gate would still upload the TXT to Gemini here.
  it('inlines a dropped TXT without uploading or asking for a Gemini key in a third-party session', async () => {
    const sessionChatSettings: ChatSettings = { ...DEFAULT_APP_SETTINGS, providerId: 'openai' };
    const { result, unmount, getSelectedFiles } = renderUploader({ currentChatSettings: sessionChatSettings });

    await act(async () => {
      await result.current.uploadFiles([new File(['hello world'], 'notes.txt', { type: 'text/plain' })]);
    });

    expect(uploadFileApiMock).not.toHaveBeenCalled();
    expect(getGeminiKeyForRequestMock).not.toHaveBeenCalled();

    const [file] = getSelectedFiles();
    expect(file.uploadState).toBe('active');
    expect(file.transferStrategy).toBe('inline');
    expect(file.isProcessing).toBe(false);
    expect(file.error).toBeUndefined();

    unmount();
  });

  it('still uploads via the Files API in a Gemini-native session when the text preference is on', async () => {
    getGeminiKeyForRequestMock.mockReturnValue({ key: 'gemini-key', isNewKey: false });
    const geminiSettings: AppSettings = {
      ...DEFAULT_APP_SETTINGS,
      filesApiConfig: { images: false, pdfs: false, audio: false, video: false, text: true },
    };
    const { result, unmount } = renderUploader({
      appSettings: geminiSettings,
      currentChatSettings: geminiSettings,
    });

    await act(async () => {
      await result.current.uploadFiles([new File(['hello world'], 'notes.txt', { type: 'text/plain' })]);
    });

    expect(getGeminiKeyForRequestMock).toHaveBeenCalledTimes(1);
    expect(uploadFileApiMock).toHaveBeenCalledTimes(1);

    unmount();
  });
});
