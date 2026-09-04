import { act } from 'react';
import { setupProviderTestRenderer } from '@/test/render/providerRenderer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createChatInputRenderer,
  createProviderValue,
  dispatchKeyDown,
  getChatInputHarnessMocks,
  type ChatAreaProviderValue,
  resetChatInputHarnessState,
  setTextareaValue,
} from '@/test/chat-input/harness';
import { type UploadedFile } from '@/types';
import { ChatInput } from './ChatInput';

const { mockChatStoreState, mockLiveApiState, mockModelCapabilities } = getChatInputHarnessMocks();

describe('ChatInput', () => {
  const renderer = setupProviderTestRenderer({ providers: { language: 'en' } });
  const renderChatInput = createChatInputRenderer(renderer, <ChatInput />);

  beforeEach(() => {
    localStorage.clear();
    resetChatInputHarnessState();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('preserves user edits after commanded input pre-fills edit mode text', async () => {
    const providerValue = createProviderValue({
      id: 1,
      mode: 'replace',
      text: 'Original message',
    });

    await act(async () => {
      renderChatInput(providerValue);
    });

    const textarea = renderer.container.querySelector<HTMLTextAreaElement>('[data-testid="chat-input-textarea"]');
    const valueProbe = renderer.container.querySelector<HTMLElement>('[data-testid="chat-input-value"]');
    expect(textarea).not.toBeNull();
    expect(textarea?.value).toBe('Original message');
    expect(valueProbe?.textContent).toBe('Original message');

    await act(async () => {
      if (!textarea) {
        return;
      }

      setTextareaValue(textarea, 'Original message updated');
    });

    expect(textarea?.value).toBe('Original message updated');
    expect(valueProbe?.textContent).toBe('Original message updated');
  });

  it('does not re-apply a commanded replace after the user continues editing', async () => {
    const providerValue = createProviderValue({
      id: 1,
      mode: 'replace',
      text: 'Original message',
    });

    await act(async () => {
      renderChatInput(providerValue);
    });

    const textarea = renderer.container.querySelector<HTMLTextAreaElement>('[data-testid="chat-input-textarea"]');
    expect(textarea).not.toBeNull();

    await act(async () => {
      if (!textarea) {
        return;
      }

      setTextareaValue(textarea, 'Original message updated');
    });

    const providerValueAgain = createProviderValue({
      id: 1,
      mode: 'replace',
      text: 'Original message',
    });

    await act(async () => {
      renderChatInput(providerValueAgain);
    });

    expect(textarea?.value).toBe('Original message updated');
  });

  it('focuses replacement commands at the bottom of the filled input', async () => {
    vi.useFakeTimers();
    try {
      const replacementText = 'Use Live Artifacts to organize this:\n\n';
      const providerValue = createProviderValue({
        id: 1,
        mode: 'replace',
        text: replacementText,
      });

      await act(async () => {
        renderChatInput(providerValue);
      });

      const textarea = renderer.container.querySelector<HTMLTextAreaElement>('[data-testid="chat-input-textarea"]');
      expect(textarea).not.toBeNull();

      if (!textarea) {
        return;
      }

      Object.defineProperty(textarea, 'scrollHeight', { configurable: true, value: 480 });

      await act(async () => {
        vi.runOnlyPendingTimers();
      });

      expect(textarea.value).toBe(replacementText);
      expect(document.activeElement).toBe(textarea);
      expect(textarea.selectionStart).toBe(replacementText.length);
      expect(textarea.selectionEnd).toBe(replacementText.length);
      expect(textarea.scrollTop).toBe(480);
    } finally {
      vi.useRealTimers();
    }
  });

  it('sends slash-prefixed text when it does not match an executable command', async () => {
    const onSendMessage = vi.fn();
    const providerValue = createProviderValue(null);
    providerValue.input.isLoading = false;
    providerValue.input.isEditing = false;
    providerValue.input.editMode = 'resend';
    providerValue.input.editingMessageId = null;
    providerValue.input.onSendMessage = onSendMessage;

    await act(async () => {
      renderChatInput(providerValue);
    });

    const textarea = renderer.container.querySelector<HTMLTextAreaElement>('[data-testid="chat-input-textarea"]');
    expect(textarea).not.toBeNull();

    await act(async () => {
      if (!textarea) {
        return;
      }

      setTextareaValue(textarea, '/api/v1 docs');
      dispatchKeyDown(textarea, 'Enter');
    });

    expect(onSendMessage).toHaveBeenCalledWith('/api/v1 docs', { isFastMode: false, files: undefined });
  });

  it('sends exact command text with trailing whitespace instead of auto-executing it', async () => {
    const onSendMessage = vi.fn();
    const providerValue = createProviderValue(null);
    providerValue.input.isLoading = false;
    providerValue.input.isEditing = false;
    providerValue.input.editMode = 'resend';
    providerValue.input.editingMessageId = null;
    providerValue.input.onSendMessage = onSendMessage;

    await act(async () => {
      renderChatInput(providerValue);
    });

    const textarea = renderer.container.querySelector<HTMLTextAreaElement>('[data-testid="chat-input-textarea"]');
    expect(textarea).not.toBeNull();

    await act(async () => {
      if (!textarea) {
        return;
      }

      setTextareaValue(textarea, '/help ');
      dispatchKeyDown(textarea, 'Enter');
    });

    expect(onSendMessage).toHaveBeenCalledWith('/help ', { isFastMode: false, files: undefined });
    expect(providerValue.input.onClearChat).not.toHaveBeenCalled();
  });

  it('does not execute slash commands while IME composition is active', async () => {
    const providerValue = createProviderValue(null);
    providerValue.input.isLoading = false;
    providerValue.input.isEditing = false;
    providerValue.input.editMode = 'resend';
    providerValue.input.editingMessageId = null;

    await act(async () => {
      renderChatInput(providerValue);
    });

    const textarea = renderer.container.querySelector<HTMLTextAreaElement>('[data-testid="chat-input-textarea"]');
    expect(textarea).not.toBeNull();

    await act(async () => {
      if (!textarea) {
        return;
      }

      setTextareaValue(textarea, '/clear');
      textarea.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
      dispatchKeyDown(textarea, 'Enter');
    });

    expect(providerValue.input.onClearChat).not.toHaveBeenCalled();
    expect(textarea?.value).toBe('/clear');
  });

  it('does not submit while IME key events use process key code', async () => {
    const onSendMessage = vi.fn();
    const providerValue = createProviderValue(null);
    providerValue.input.isLoading = false;
    providerValue.input.isEditing = false;
    providerValue.input.editMode = 'resend';
    providerValue.input.editingMessageId = null;
    providerValue.input.onSendMessage = onSendMessage;

    await act(async () => {
      renderChatInput(providerValue);
    });

    const textarea = renderer.container.querySelector<HTMLTextAreaElement>('[data-testid="chat-input-textarea"]');
    expect(textarea).not.toBeNull();

    await act(async () => {
      if (!textarea) {
        return;
      }

      setTextareaValue(textarea, 'ni');
      dispatchKeyDown(textarea, 'Enter', { keyCode: 229, which: 229 });
    });

    expect(onSendMessage).not.toHaveBeenCalled();
    expect(textarea?.value).toBe('ni');
  });

  it('does not submit the IME confirmation Enter, then sends on the next Enter', async () => {
    const onSendMessage = vi.fn();
    const providerValue = createProviderValue(null);
    providerValue.input.isLoading = false;
    providerValue.input.isEditing = false;
    providerValue.input.editMode = 'resend';
    providerValue.input.editingMessageId = null;
    providerValue.input.onSendMessage = onSendMessage;

    await act(async () => {
      renderChatInput(providerValue);
    });

    const textarea = renderer.container.querySelector<HTMLTextAreaElement>('[data-testid="chat-input-textarea"]');
    expect(textarea).not.toBeNull();

    await act(async () => {
      if (!textarea) {
        return;
      }

      setTextareaValue(textarea, '你好');
      textarea.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
      textarea.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true }));
      dispatchKeyDown(textarea, 'Enter');
    });

    expect(onSendMessage).not.toHaveBeenCalled();
    expect(textarea?.value).toBe('你好');

    await act(async () => {
      if (!textarea) {
        return;
      }

      dispatchKeyDown(textarea, 'Enter');
    });

    expect(onSendMessage).toHaveBeenCalledWith('你好', { isFastMode: false, files: undefined });
  });

  it('sends Live text turns with selected attachments through client content', async () => {
    const onAddUserMessage = vi.fn();
    const selectedFiles: UploadedFile[] = [
      {
        id: 'image-file',
        name: 'diagram.png',
        type: 'image/png',
        size: 128,
        uploadState: 'active',
        fileUri: 'files/diagram',
        fileApiName: 'files/diagram',
        fileApiExpirationTime: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      },
    ];
    const providerValue = createProviderValue(null);
    providerValue.input.isLoading = false;
    providerValue.input.isEditing = false;
    providerValue.input.editMode = 'resend';
    providerValue.input.editingMessageId = null;
    providerValue.input.selectedFiles = selectedFiles;
    providerValue.input.onAddUserMessage = onAddUserMessage;
    providerValue.input.currentChatSettings.modelId = 'gemini-3.1-flash-live-preview';
    mockModelCapabilities.value = {
      ...mockModelCapabilities.value,
      isNativeAudioModel: true,
      isGemini3: true,
    };

    await act(async () => {
      renderChatInput(providerValue);
    });

    const textarea = renderer.container.querySelector<HTMLTextAreaElement>('[data-testid="chat-input-textarea"]');
    expect(textarea).not.toBeNull();

    await act(async () => {
      if (!textarea) {
        return;
      }

      setTextareaValue(textarea, 'Describe this');
      dispatchKeyDown(textarea, 'Enter');
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mockLiveApiState.connect).toHaveBeenCalled();
    expect(mockLiveApiState.sendContent).toHaveBeenCalledWith([
      {
        fileData: { mimeType: 'image/png', fileUri: 'files/diagram' },
        mediaResolution: { level: 'MEDIA_RESOLUTION_MEDIUM' },
      },
      { text: 'Describe this' },
    ]);
    expect(mockLiveApiState.sendText).not.toHaveBeenCalled();
    expect(onAddUserMessage).toHaveBeenCalledWith('Describe this', selectedFiles);
  });

  it('starts screen sharing and connects Live when the session is not connected', async () => {
    const providerValue = createProviderValue(null);
    providerValue.input.currentChatSettings.modelId = 'gemini-3.1-flash-live-preview';
    mockModelCapabilities.value = {
      ...mockModelCapabilities.value,
      isNativeAudioModel: true,
      isGemini3: true,
    };

    await act(async () => {
      renderChatInput(providerValue);
    });

    await act(async () => {
      renderer.container.querySelector<HTMLButtonElement>('[data-testid="live-screen-button"]')?.click();
      await Promise.resolve();
    });

    expect(mockLiveApiState.startScreenShare).toHaveBeenCalledTimes(1);
    expect(mockLiveApiState.connect).toHaveBeenCalledTimes(1);
  });

  it('starts the camera without reconnecting when Live is already connected', async () => {
    const providerValue = createProviderValue(null);
    providerValue.input.currentChatSettings.modelId = 'gemini-3.1-flash-live-preview';
    mockLiveApiState.isConnected = true;
    mockModelCapabilities.value = {
      ...mockModelCapabilities.value,
      isNativeAudioModel: true,
      isGemini3: true,
    };

    await act(async () => {
      renderChatInput(providerValue);
    });

    await act(async () => {
      renderer.container.querySelector<HTMLButtonElement>('[data-testid="live-camera-button"]')?.click();
      await Promise.resolve();
    });

    expect(mockLiveApiState.startCamera).toHaveBeenCalledTimes(1);
    expect(mockLiveApiState.connect).not.toHaveBeenCalled();
  });

  it('passes Live status through the focused status view hook', async () => {
    const providerValue = createProviderValue(null);
    mockLiveApiState.isConnected = true;
    mockLiveApiState.isReconnecting = true;
    mockLiveApiState.error = 'Live reconnecting';

    await act(async () => {
      renderChatInput(providerValue);
    });

    expect(renderer.container.querySelector('[data-testid="live-connected"]')?.textContent).toBe('true');
    expect(renderer.container.querySelector('[data-testid="live-reconnecting"]')?.textContent).toBe('true');
    expect(renderer.container.querySelector('[data-testid="live-error"]')?.textContent).toBe('Live reconnecting');
  });

  it('queues the next draft while loading and auto-sends it after loading finishes', async () => {
    const onSendMessage = vi.fn();
    const providerValue = createProviderValue(null);
    providerValue.input.isLoading = true;
    providerValue.input.isEditing = false;
    providerValue.input.editMode = 'resend';
    providerValue.input.editingMessageId = null;
    providerValue.input.onSendMessage = onSendMessage;

    await act(async () => {
      renderChatInput(providerValue);
    });

    const textarea = renderer.container.querySelector<HTMLTextAreaElement>('[data-testid="chat-input-textarea"]');
    const queueButton = renderer.container.querySelector<HTMLButtonElement>('[data-testid="queue-button"]');
    expect(textarea).not.toBeNull();
    expect(queueButton).not.toBeNull();

    await act(async () => {
      if (!textarea) {
        return;
      }

      setTextareaValue(textarea, 'Queue this next');
    });

    expect(queueButton?.disabled).toBe(false);

    await act(async () => {
      queueButton?.click();
    });

    expect(renderer.container.querySelector('[data-testid="queued-card"]')?.textContent).toContain('Queue this next');
    expect(renderer.container.querySelector('[data-testid="queued-title"]')?.textContent).toBe('Next up');
    expect(textarea?.value).toBe('');

    const completedProviderValue = {
      ...providerValue,
      input: {
        ...providerValue.input,
        isLoading: false,
      },
    } satisfies ChatAreaProviderValue;

    await act(async () => {
      renderChatInput(completedProviderValue);
    });

    expect(onSendMessage).toHaveBeenCalledWith('Queue this next', { isFastMode: false, files: undefined });
  });

  it('queues the next draft when pressing Enter while loading and auto-sends it after loading finishes', async () => {
    const onSendMessage = vi.fn();
    const providerValue = createProviderValue(null);
    providerValue.input.isLoading = true;
    providerValue.input.isEditing = false;
    providerValue.input.editMode = 'resend';
    providerValue.input.editingMessageId = null;
    providerValue.input.onSendMessage = onSendMessage;

    await act(async () => {
      renderChatInput(providerValue);
    });

    const textarea = renderer.container.querySelector<HTMLTextAreaElement>('[data-testid="chat-input-textarea"]');
    expect(textarea).not.toBeNull();

    await act(async () => {
      if (!textarea) {
        return;
      }

      setTextareaValue(textarea, 'Queue this via Enter');
      dispatchKeyDown(textarea, 'Enter');
    });

    expect(renderer.container.querySelector('[data-testid="queued-card"]')?.textContent).toContain(
      'Queue this via Enter',
    );
    expect(textarea?.value).toBe('');

    const completedProviderValue = {
      ...providerValue,
      input: {
        ...providerValue.input,
        isLoading: false,
      },
    } satisfies ChatAreaProviderValue;

    await act(async () => {
      renderChatInput(completedProviderValue);
    });

    expect(onSendMessage).toHaveBeenCalledWith('Queue this via Enter', { isFastMode: false, files: undefined });
  });

  it('preserves a newer draft when a queued message auto-sends', async () => {
    const onSendMessage = vi.fn();
    const providerValue = createProviderValue(null);
    providerValue.input.isLoading = true;
    providerValue.input.isEditing = false;
    providerValue.input.editMode = 'resend';
    providerValue.input.editingMessageId = null;
    providerValue.input.onSendMessage = onSendMessage;

    await act(async () => {
      renderChatInput(providerValue);
    });

    const textarea = renderer.container.querySelector<HTMLTextAreaElement>('[data-testid="chat-input-textarea"]');
    const queueButton = renderer.container.querySelector<HTMLButtonElement>('[data-testid="queue-button"]');
    expect(textarea).not.toBeNull();
    expect(queueButton).not.toBeNull();

    await act(async () => {
      if (!textarea) {
        return;
      }

      setTextareaValue(textarea, 'Queue this next');
      queueButton?.click();
    });

    await act(async () => {
      if (!textarea) {
        return;
      }

      setTextareaValue(textarea, 'Draft after queueing');
    });

    const completedProviderValue = {
      ...providerValue,
      input: {
        ...providerValue.input,
        isLoading: false,
      },
    } satisfies ChatAreaProviderValue;

    await act(async () => {
      renderChatInput(completedProviderValue);
    });

    expect(onSendMessage).toHaveBeenCalledWith('Queue this next', { isFastMode: false, files: undefined });
    expect(textarea?.value).toBe('Draft after queueing');
  });

  it('keeps a queued message bound to its original session before auto-sending', async () => {
    const sessionOneSend = vi.fn();
    const sessionTwoSend = vi.fn();
    const providerValue = createProviderValue(null);
    providerValue.input.isLoading = true;
    providerValue.input.isEditing = false;
    providerValue.input.editMode = 'resend';
    providerValue.input.editingMessageId = null;
    providerValue.input.onSendMessage = sessionOneSend;

    await act(async () => {
      renderChatInput(providerValue);
    });

    const textarea = renderer.container.querySelector<HTMLTextAreaElement>('[data-testid="chat-input-textarea"]');
    const queueButton = renderer.container.querySelector<HTMLButtonElement>('[data-testid="queue-button"]');
    expect(textarea).not.toBeNull();
    expect(queueButton).not.toBeNull();

    await act(async () => {
      if (!textarea) {
        return;
      }

      setTextareaValue(textarea, 'Queue for session one');
      queueButton?.click();
    });

    const sessionTwoProviderValue = {
      ...providerValue,
      messageList: {
        ...providerValue.messageList,
        activeSessionId: 'session-2',
      },
      input: {
        ...providerValue.input,
        activeSessionId: 'session-2',
        isLoading: false,
        onSendMessage: sessionTwoSend,
      },
    } satisfies ChatAreaProviderValue;

    await act(async () => {
      renderChatInput(sessionTwoProviderValue);
    });

    expect(sessionTwoSend).not.toHaveBeenCalled();
    expect(renderer.container.querySelector('[data-testid="queued-card"]')).toBeNull();

    const completedOriginalSession = {
      ...providerValue,
      input: {
        ...providerValue.input,
        isLoading: false,
        onSendMessage: sessionOneSend,
      },
    } satisfies ChatAreaProviderValue;

    await act(async () => {
      renderChatInput(completedOriginalSession);
    });

    expect(sessionOneSend).toHaveBeenCalledWith('Queue for session one', {
      isFastMode: false,
      files: undefined,
    });
  });

  it('restores queued draft text back into the composer when editing the queued card', async () => {
    const providerValue = createProviderValue(null);
    providerValue.input.isLoading = true;
    providerValue.input.isEditing = false;
    providerValue.input.editMode = 'resend';
    providerValue.input.editingMessageId = null;

    await act(async () => {
      renderChatInput(providerValue);
    });

    const textarea = renderer.container.querySelector<HTMLTextAreaElement>('[data-testid="chat-input-textarea"]');
    const queueButton = renderer.container.querySelector<HTMLButtonElement>('[data-testid="queue-button"]');
    expect(textarea).not.toBeNull();
    expect(queueButton).not.toBeNull();

    await act(async () => {
      if (!textarea) {
        return;
      }

      setTextareaValue(textarea, 'Bring this back');
      queueButton?.click();
    });

    expect(renderer.container.querySelector('[data-testid="queued-card"]')).not.toBeNull();

    await act(async () => {
      renderer.container.querySelector<HTMLButtonElement>('[data-testid="queued-edit"]')?.click();
    });

    expect(renderer.container.querySelector('[data-testid="queued-card"]')).toBeNull();
    expect(textarea?.value).toBe('Bring this back');
  });

  it('moves text file content into the composer and removes only that file from the selection', async () => {
    const setSelectedFiles = vi.fn();
    const providerValue = createProviderValue(null);
    const selectedFiles: UploadedFile[] = [
      {
        id: 'text-file',
        name: 'prompt.txt',
        type: 'text/plain',
        size: 24,
        uploadState: 'active',
        textContent: 'Prompt from attachment',
      },
      {
        id: 'image-file',
        name: 'diagram.png',
        type: 'image/png',
        size: 128,
        uploadState: 'active',
      },
    ];
    providerValue.input.selectedFiles = selectedFiles;
    providerValue.input.setSelectedFiles = setSelectedFiles;

    await act(async () => {
      renderChatInput(providerValue);
    });

    const textarea = renderer.container.querySelector<HTMLTextAreaElement>('[data-testid="chat-input-textarea"]');
    const moveButton = renderer.container.querySelector<HTMLButtonElement>('[data-testid="move-file-text-file"]');

    expect(textarea).not.toBeNull();
    expect(moveButton).not.toBeNull();

    await act(async () => {
      moveButton?.click();
    });

    expect(textarea?.value).toBe('Prompt from attachment');
    expect(setSelectedFiles).toHaveBeenCalledTimes(1);

    const removeConvertedFile = setSelectedFiles.mock.calls[0]?.[0] as
      ((files: Array<{ id: string }>) => Array<{ id: string }>) | undefined;

    expect(removeConvertedFile).toBeTypeOf('function');
    expect(removeConvertedFile?.([{ id: 'text-file' }, { id: 'image-file' }])).toEqual([{ id: 'image-file' }]);
  });

  it('blocks send if an attachment has already failed before sending', async () => {
    const onSendMessage = vi.fn();
    const setAppFileError = vi.fn();
    const failedFile: UploadedFile = {
      id: 'failed-file',
      name: 'large.pdf',
      type: 'application/pdf',
      size: 4096,
      uploadState: 'failed',
      isProcessing: false,
      error: 'Backend processing failed.',
    };
    const providerValue = createProviderValue(null);
    providerValue.input.isLoading = false;
    providerValue.input.isEditing = false;
    providerValue.input.editMode = 'resend';
    providerValue.input.editingMessageId = null;
    providerValue.input.selectedFiles = [failedFile];
    providerValue.input.onSendMessage = onSendMessage;
    providerValue.input.setAppFileError = setAppFileError;
    mockChatStoreState.selectedFiles = [failedFile];

    await act(async () => {
      renderChatInput(providerValue);
    });

    const textarea = renderer.container.querySelector<HTMLTextAreaElement>('[data-testid="chat-input-textarea"]');
    expect(textarea).not.toBeNull();

    await act(async () => {
      if (!textarea) {
        return;
      }

      setTextareaValue(textarea, 'Summarize this file');
      dispatchKeyDown(textarea, 'Enter');
    });

    expect(onSendMessage).not.toHaveBeenCalled();
    expect(setAppFileError).toHaveBeenCalledWith(
      'Attachment upload failed. Remove the failed file or upload it again before sending.',
    );
  });

  it('sends optimistically immediately when pressing Enter even if an attachment is still uploading', async () => {
    const onSendMessage = vi.fn();
    const processingFile: UploadedFile = {
      id: 'processing-file',
      name: 'large.pdf',
      type: 'application/pdf',
      size: 4096,
      uploadState: 'uploading',
      isProcessing: true,
    };
    const providerValue = createProviderValue(null);
    providerValue.input.isLoading = false;
    providerValue.input.isEditing = false;
    providerValue.input.editMode = 'resend';
    providerValue.input.editingMessageId = null;
    providerValue.input.selectedFiles = [processingFile];
    providerValue.input.onSendMessage = onSendMessage;
    mockChatStoreState.selectedFiles = [processingFile];

    await act(async () => {
      renderChatInput(providerValue);
    });

    const textarea = renderer.container.querySelector<HTMLTextAreaElement>('[data-testid="chat-input-textarea"]');
    expect(textarea).not.toBeNull();

    await act(async () => {
      if (!textarea) {
        return;
      }

      setTextareaValue(textarea, 'Summarize this file');
      dispatchKeyDown(textarea, 'Enter');
    });

    expect(onSendMessage).toHaveBeenCalledWith('Summarize this file', expect.objectContaining({ isFastMode: false }));
    expect(textarea?.value).toBe('');
  });
});
