import { act } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createAppSettings, createChatSettings, createUploadedFile } from '@/test/data/factories';
import { renderHook } from '@/test/render/renderer';
import { useChatStore } from '@/stores/chatStore';
import { useChatDraftStore } from '@/stores/chatDraftStore';
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
    isEditing: false as boolean,
    editMode: 'resend' as 'resend' | 'update',
    editingMessageId: null as string | null,
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

  it('completes edit submission in update mode by passing content and files and restoring draft', () => {
    const params = createSubmissionParams();
    const attachedFile = createUploadedFile({ id: 'file-1', name: 'photo.png' });
    params.isEditing = true;
    params.editMode = 'update';
    params.editingMessageId = 'msg-1';
    params.selectedFiles = [attachedFile];
    params.submissionState.inputText = 'Updated text content';

    const { result } = renderHook(() => useChatInputSubmission(params));

    act(() => {
      result.current.handleSubmit();
    });

    expect(params.onUpdateMessageContent).toHaveBeenCalledWith('msg-1', 'Updated text content', [attachedFile]);
    expect(params.setEditingMessageId).toHaveBeenCalledWith(null);
    expect(params.setSelectedFiles).toHaveBeenCalledWith([]);
    expect(params.submissionState.setInputText).toHaveBeenCalledWith('');
    expect(params.onSendMessage).not.toHaveBeenCalled();
  });

  it('restores draft and quotes from chatDraftStore when completing update edit', () => {
    useChatDraftStore.setState({
      drafts: {
        'session-1': {
          inputText: 'My preserved draft',
          quotes: ['saved quote'],
          ttsContext: '',
        },
      },
    });

    const params = createSubmissionParams();
    params.activeSessionId = 'session-1';
    params.isEditing = true;
    params.editMode = 'update';
    params.editingMessageId = 'msg-1';
    params.submissionState.inputText = 'Edited message';

    const { result } = renderHook(() => useChatInputSubmission(params));

    act(() => {
      result.current.handleSubmit();
    });

    expect(params.submissionState.setInputText).toHaveBeenCalledWith('My preserved draft');
    expect(params.submissionState.setQuotes).toHaveBeenCalledWith(['saved quote']);

    useChatDraftStore.setState({ drafts: {} });
  });
});
