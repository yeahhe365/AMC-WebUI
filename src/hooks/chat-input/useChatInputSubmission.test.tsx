import { act } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createAppSettings, createChatSettings, createUploadedFile } from '@/test/data/factories';
import { renderHook } from '@/test/render/renderer';
import { useChatStore } from '@/stores/chatStore';
import type { UploadedFile } from '@/types';
import { useChatInputSubmission } from './useChatInputSubmission';

const createSubmissionParams = () => {
  const textarea = document.createElement('textarea');

  return {
    activeSessionId: 'session-1',
    appSettings: createAppSettings(),
    currentChatSettings: createChatSettings(),
    selectedFiles: [] as UploadedFile[],
    setSelectedFiles: vi.fn(),
    setAppFileError: vi.fn(),
    uploadFailureMessage: 'Attachment upload failed.',
    isLoading: false,
    isEditing: false,
    editMode: 'resend',
    editingMessageId: null,
    canSend: true,
    canQueueMessageBase: true,
    submissionState: {
      inputText: 'Hello',
      quotes: [],
      ttsContext: '',
      isFullscreen: false,
      clearCurrentDraft: vi.fn(),
      setInputText: vi.fn(),
      setQuotes: vi.fn(),
      setWaitingForUpload: vi.fn(),
      startSendAnimation: vi.fn(),
      stopSendAnimation: vi.fn(),
      exitFullscreen: vi.fn(),
      textareaRef: { current: textarea },
    },
    isNativeAudioModel: false,
    liveApi: {
      isConnected: false,
      connect: vi.fn(async () => true),
      sendText: vi.fn(async () => true),
      sendContent: vi.fn(async () => true),
    },
    onUpdateMessageContent: vi.fn(),
    setEditingMessageId: vi.fn(),
    onMessageSent: vi.fn(),
    onAddUserMessage: vi.fn(),
    onSendMessage: vi.fn(),
  } satisfies Parameters<typeof useChatInputSubmission>[0];
};

describe('useChatInputSubmission', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('clears the send animation timer when the composer unmounts', () => {
    vi.useFakeTimers();
    const params = createSubmissionParams();
    const { result, unmount } = renderHook(() => useChatInputSubmission(params));

    act(() => {
      result.current.handleSubmit();
    });

    expect(params.submissionState.startSendAnimation).toHaveBeenCalledTimes(1);

    unmount();

    act(() => {
      vi.advanceTimersByTime(400);
    });

    expect(params.submissionState.stopSendAnimation).not.toHaveBeenCalled();
  });

  it('sends the submission optimistically immediately even while files are uploading', () => {
    const processingFile = createUploadedFile({
      id: 'file-uploading',
      isProcessing: true,
      uploadState: 'uploading',
    });

    const params = createSubmissionParams();
    params.selectedFiles = [processingFile];
    useChatStore.setState({ selectedFiles: [processingFile] });

    const { result } = renderHook(() => useChatInputSubmission(params));

    act(() => {
      result.current.handleSubmit();
    });

    // The send is dispatched immediately for optimistic display in chat timeline.
    expect(params.onSendMessage).toHaveBeenCalledWith('Hello', expect.objectContaining({ isFastMode: false }));
    expect(params.submissionState.clearCurrentDraft).toHaveBeenCalled();
    expect(params.submissionState.setInputText).toHaveBeenCalledWith('');

    useChatStore.setState({ selectedFiles: [] });
  });
});
