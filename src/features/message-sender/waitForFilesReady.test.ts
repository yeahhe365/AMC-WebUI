import { describe, expect, it, beforeEach } from 'vitest';
import { useChatStore } from '@/stores/chatStore';
import { createUploadedFile } from '@/test/data/factories';
import { waitForFilesReady } from './waitForFilesReady';

describe('waitForFilesReady', () => {
  beforeEach(() => {
    useChatStore.setState({
      selectedFiles: [],
      savedSessions: [],
      activeMessages: [],
    });
  });

  it('returns ok immediately when fileIds is empty', async () => {
    const result = await waitForFilesReady([]);
    expect(result.ok).toBe(true);
  });

  it('returns ok immediately when all files are already active', async () => {
    const file = createUploadedFile({
      id: 'file-1',
      uploadState: 'active',
      isProcessing: false,
    });
    useChatStore.setState({ selectedFiles: [file] });

    const result = await waitForFilesReady(['file-1']);
    expect(result.ok).toBe(true);
  });

  it('returns failed immediately if a file has an error or failed state', async () => {
    const file = createUploadedFile({
      id: 'file-failed',
      uploadState: 'failed',
      error: 'Size limit exceeded',
      isProcessing: false,
    });
    useChatStore.setState({ selectedFiles: [file] });

    const result = await waitForFilesReady(['file-failed']);
    expect(result.ok).toBe(false);
    expect(result.error).toBe('Size limit exceeded');
  });

  it('resolves once store updates the file to active', async () => {
    const uploadingFile = createUploadedFile({
      id: 'file-async',
      uploadState: 'uploading',
      isProcessing: true,
      progress: 30,
    });
    useChatStore.setState({ selectedFiles: [uploadingFile] });

    const promise = waitForFilesReady(['file-async']);

    // Store update: finished upload
    useChatStore.setState({
      selectedFiles: [
        {
          ...uploadingFile,
          uploadState: 'active',
          isProcessing: false,
          progress: 100,
        },
      ],
    });

    const result = await promise;
    expect(result.ok).toBe(true);
  });

  it('resolves once activeMessages updates the file to active', async () => {
    const uploadingFile = createUploadedFile({
      id: 'file-in-active-msg',
      uploadState: 'uploading',
      isProcessing: true,
    });
    useChatStore.setState({
      selectedFiles: [],
      activeMessages: [
        {
          id: 'user-msg-1',
          role: 'user',
          content: 'Here is the file',
          timestamp: new Date(),
          files: [uploadingFile],
        },
      ],
    });

    const promise = waitForFilesReady(['file-in-active-msg']);

    // Update file in activeMessages
    useChatStore.getState().updateUploadedFile('file-in-active-msg', {
      uploadState: 'active',
      isProcessing: false,
    });

    const result = await promise;
    expect(result.ok).toBe(true);
  });

  it('resolves with error if aborted', async () => {
    const abortController = new AbortController();
    const uploadingFile = createUploadedFile({
      id: 'file-abort',
      uploadState: 'uploading',
      isProcessing: true,
    });
    useChatStore.setState({ selectedFiles: [uploadingFile] });

    const promise = waitForFilesReady(['file-abort'], abortController.signal);
    abortController.abort();

    const result = await promise;
    expect(result.ok).toBe(false);
    expect(result.error).toBe('Aborted');
  });
});
