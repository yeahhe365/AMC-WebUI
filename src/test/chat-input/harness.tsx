import { cloneElement, isValidElement, type ReactNode } from 'react';
import { vi } from 'vitest';

import {
  ChatRuntimeTestProvider,
  applyChatAreaProviderValue,
  createChatAreaProviderValue,
  type ChatAreaProviderValue,
} from '@/test/layout/fixtures';
import { type ChatSettings, type InputCommand, type UploadedFile } from '@/types';

export type { ChatAreaProviderValue };

const mockChatStoreState = vi.hoisted(() => ({
  activeSessionId: 'session-1' as string | null,
  savedSessions: [] as Array<{
    id: string;
    title: string;
    timestamp: number;
    messages: unknown[];
    settings: ChatSettings;
  }>,
  activeMessages: [] as unknown[],
  selectedFiles: [] as unknown[],
  commandedInput: null as InputCommand | null,
  editingMessageId: null as string | null,
  editMode: 'resend' as 'update' | 'resend',
  isAppProcessingFile: false,
  appFileError: null as string | null,
  aspectRatio: '1:1',
  imageSize: '1K',
  imageOutputMode: 'IMAGE_TEXT',
  loadingSessionIds: new Set<string>(),
  setSelectedFiles: vi.fn((value: unknown[] | ((previous: unknown[]) => unknown[])) => {
    mockChatStoreState.selectedFiles =
      typeof value === 'function'
        ? (value as (previous: unknown[]) => unknown[])(mockChatStoreState.selectedFiles)
        : value;
  }),
  setAppFileError: vi.fn((value: string | null) => {
    mockChatStoreState.appFileError = value;
  }),
  setEditingMessageId: vi.fn((value: string | null) => {
    mockChatStoreState.editingMessageId = value;
  }),
  setCommandedInput: vi.fn((value: InputCommand | null) => {
    mockChatStoreState.commandedInput = value;
  }),
  setAspectRatio: vi.fn((value: string) => {
    mockChatStoreState.aspectRatio = value;
  }),
  setImageSize: vi.fn((value: string) => {
    mockChatStoreState.imageSize = value;
  }),
  setImageOutputMode: vi.fn((value: string) => {
    mockChatStoreState.imageOutputMode = value;
  }),
  setCurrentChatSettings: vi.fn(),
}));

const mockModelCapabilities = vi.hoisted(() => ({
  value: {
    isImageGenerationModel: false,
    isGemini3ImageModel: false,
    isTtsModel: false,
    isNativeAudioModel: false,
    isGemini3: false,
    permissions: {
      canAcceptAttachments: true,
      canUseTools: true,
      canUseGoogleSearch: true,
      canUseDeepSearch: true,
      canUseCodeExecution: true,
      canUseLocalPython: true,
      canUseUrlContext: true,
      canUseTokenCount: true,
      canUseYouTubeUrl: true,
      canGenerateSuggestions: true,
      canUseVoiceInput: true,
      canUseLiveControls: false,
      requiresTextPrompt: false,
    },
    supportedAspectRatios: [] as string[],
    supportedImageSizes: [] as string[],
  },
}));

const mockLiveApiState = vi.hoisted(() => ({
  connect: vi.fn(async () => true),
  disconnect: vi.fn(),
  toggleMute: vi.fn(),
  sendText: vi.fn(async () => true),
  sendContent: vi.fn(async () => true),
  startCamera: vi.fn(async () => true),
  startScreenShare: vi.fn(async () => true),
  stopVideo: vi.fn(),
  isConnected: false,
  isReconnecting: false,
  isMuted: false,
  isSpeaking: false,
  volume: 0,
  error: null as string | null,
  videoSource: null as 'camera' | 'screen' | null,
}));

const mockChatInputUiSettings = vi.hoisted(() => ({
  showInputTranslationButton: undefined as boolean | undefined,
  showInputPasteButton: undefined as boolean | undefined,
  showInputClearButton: undefined as boolean | undefined,
  showVoiceInputButton: undefined as boolean | undefined,
}));

const mockApiUtils = vi.hoisted(() => ({
  getKeyForRequest: vi.fn(() => ({ key: 'api-key', isNewKey: false })),
}));

const mockTextApi = vi.hoisted(() => ({
  translateTextApi: vi.fn(async () => 'Translated text'),
}));

const mockChatStoreSubscribers = vi.hoisted(
  () =>
    new Set<(state: Partial<typeof mockChatStoreState>, previousState: Partial<typeof mockChatStoreState>) => void>(),
);

vi.mock('@/hooks/useDevice', () => ({
  useIsDesktop: () => true,
  useIsMobile: () => false,
}));

vi.mock('@/contexts/WindowContext', () => ({
  WindowProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
  useWindowContext: () => ({
    document,
  }),
}));

vi.mock('@/hooks/chat-input/useVoiceInput', () => ({
  useVoiceInput: () => ({
    isRecording: false,
    isMicInitializing: false,
    isTranscribing: false,
    handleVoiceInputClick: vi.fn(),
    handleCancelRecording: vi.fn(),
  }),
}));

vi.mock('@/hooks/live-api/useLiveApi', () => ({
  useLiveApi: () => mockLiveApiState,
}));

vi.mock('@/utils/apiKeySelection', () => ({
  getKeyForRequest: mockApiUtils.getKeyForRequest,
  getGeminiKeyForRequest: mockApiUtils.getKeyForRequest,
  formatApiKeyErrorMessage: (error: string, translate: (translationKey: string) => string) => {
    if (error === 'API Key not configured.') return translate('apiRuntimeKeyNotConfigured');
    if (error === 'No valid API keys found.') return translate('apiRuntimeNoValidKeysFound');
    return error;
  },
}));

vi.mock('@/services/api/generation/textApi', () => ({
  translateTextApi: mockTextApi.translateTextApi,
}));

vi.mock('@/hooks/ui/useFileModalState', () => ({
  useFileModalState: () => ({
    previewFile: null,
    closePreview: vi.fn(),
    allImages: [],
    currentImageIndex: 0,
    handlePrevImage: vi.fn(),
    handleNextImage: vi.fn(),
    configuringFile: null,
    setConfiguringFile: vi.fn(),
    openPreview: vi.fn(),
    openConfiguration: vi.fn(),
    isPreviewEditable: false,
  }),
}));

vi.mock('@/utils/model/modelCapabilities', () => ({
  getModelCapabilities: () => mockModelCapabilities.value,
  isGemini3Model: (modelId: string) => modelId.includes('gemini-3'),
}));

vi.mock('@/stores/chatStore', () => {
  const useChatStore = Object.assign(
    (selector?: (state: typeof mockChatStoreState) => unknown) =>
      selector ? selector(mockChatStoreState) : mockChatStoreState,
    {
      getState: () => mockChatStoreState,
      setState: (partial: Partial<typeof mockChatStoreState>) => {
        const previousState = { ...mockChatStoreState };
        Object.assign(mockChatStoreState, partial);
        mockChatStoreSubscribers.forEach((subscriber) => subscriber(mockChatStoreState, previousState));
      },
      subscribe: (
        listener: (
          state: Partial<typeof mockChatStoreState>,
          previousState: Partial<typeof mockChatStoreState>,
        ) => void,
      ) => {
        mockChatStoreSubscribers.add(listener);
        return () => mockChatStoreSubscribers.delete(listener);
      },
    },
  );

  return { useChatStore };
});

vi.mock('@/components/chat/input/ChatInputCoreModals', () => ({
  ChatInputCoreModals: () => null,
}));

vi.mock('@/components/chat/input/ChatInputFileModals', () => ({
  ChatInputFileModals: () => null,
}));

vi.mock('@/components/chat/input/ChatInputArea', async () => {
  const { useChatInputContext } = await vi.importActual<typeof import('@/components/chat/input/ChatInputContext')>(
    '@/components/chat/input/ChatInputContext',
  );

  const ChatInputArea = () => {
    const {
      chatInput,
      inputState,
      handlers,
      liveApi,
      localFileState,
      inputDisabled,
      canQueueMessage,
      queuedSubmissionsView,
      handleStartLiveCamera,
      handleStartLiveScreenShare,
    } = useChatInputContext();

    return (
      <form
        onSubmit={(event) => {
          event.preventDefault();
          handlers.handleSubmit();
        }}
      >
        <div data-testid="chat-input-value">{inputState.inputText}</div>
        {queuedSubmissionsView ? (
          <div data-testid="queued-card">
            <div data-testid="queued-title">{queuedSubmissionsView.title}</div>
            {queuedSubmissionsView.items.map((item) => (
              <div data-testid="queued-preview" key={item.id}>
                {item.previewText}
              </div>
            ))}
            <button
              type="button"
              data-testid="queued-edit"
              onClick={() => queuedSubmissionsView?.onEditItem(queuedSubmissionsView.items[0]?.id ?? '')}
            >
              edit
            </button>
            <button
              type="button"
              data-testid="queued-remove"
              onClick={() => queuedSubmissionsView?.onRemoveItem(queuedSubmissionsView.items[0]?.id ?? '')}
            >
              remove
            </button>
            <button type="button" data-testid="queued-clear" onClick={queuedSubmissionsView.onClearAll}>
              clear
            </button>
          </div>
        ) : null}
        <div data-testid="live-status">
          <span data-testid="live-connected">{String(liveApi.isConnected)}</span>
          <span data-testid="live-reconnecting">{String(liveApi.isReconnecting)}</span>
          <span data-testid="live-error">{liveApi.error ?? ''}</span>
        </div>
        <textarea
          data-testid="chat-input-textarea"
          ref={inputState.textareaRef}
          value={inputState.inputText}
          onChange={handlers.handleInputChange}
          onKeyDown={handlers.handleKeyDown}
          onPaste={handlers.handlePaste}
          onCompositionStart={handlers.onCompositionStart}
          onCompositionEnd={(event) => handlers.onCompositionEnd(event.currentTarget.value)}
          disabled={inputDisabled}
        />
        <button
          type="button"
          data-testid="queue-button"
          onClick={() => handlers.queueCurrentSubmission()}
          disabled={!canQueueMessage}
        >
          queue
        </button>
        <button type="button" data-testid="cancel-pending-upload-send" onClick={handlers.cancelPendingUploadSend}>
          cancel pending upload send
        </button>
        {mockChatInputUiSettings.showInputTranslationButton === true && (
          <button type="button" data-testid="translate-button" onClick={handlers.handleTranslate}>
            translate
          </button>
        )}
        {mockChatInputUiSettings.showInputPasteButton !== false && (
          <button type="button" data-testid="paste-button" onClick={handlers.handlePasteFromClipboard}>
            paste
          </button>
        )}
        {mockChatInputUiSettings.showInputClearButton === true && (
          <button type="button" data-testid="clear-input-button" onClick={handlers.handleClearInput}>
            clear
          </button>
        )}
        <button type="button" data-testid="live-camera-button" onClick={handleStartLiveCamera}>
          camera
        </button>
        <button type="button" data-testid="live-screen-button" onClick={handleStartLiveScreenShare}>
          screen
        </button>
        {chatInput.selectedFiles.map((file: UploadedFile) => (
          <button
            key={file.id}
            type="button"
            data-testid={`move-file-${file.id}`}
            onClick={() => localFileState.handleMoveTextFileToInput(file)}
          >
            move {file.name}
          </button>
        ))}
      </form>
    );
  };

  return { ChatInputArea };
});

const ChatInputTestProvider = ({ value, children }: { value: ChatAreaProviderValue; children: ReactNode }) => {
  applyChatAreaProviderValue(value);
  mockChatInputUiSettings.showInputTranslationButton = value.input.appSettings.showInputTranslationButton ?? false;
  mockChatInputUiSettings.showInputPasteButton = value.input.appSettings.showInputPasteButton ?? true;
  mockChatInputUiSettings.showInputClearButton = value.input.appSettings.showInputClearButton ?? true;
  mockChatInputUiSettings.showVoiceInputButton = value.input.appSettings.showVoiceInputButton ?? false;
  mockChatStoreState.setSelectedFiles = value.input.setSelectedFiles as typeof mockChatStoreState.setSelectedFiles;
  mockChatStoreState.setAppFileError = value.input.setAppFileError as typeof mockChatStoreState.setAppFileError;
  mockChatStoreState.setEditingMessageId = value.input
    .setEditingMessageId as typeof mockChatStoreState.setEditingMessageId;
  const versionedChildren = isValidElement(children)
    ? cloneElement(children, {
        'data-provider-version': `${value.input.activeSessionId}-${value.input.isLoading}-${value.input.selectedFiles.length}`,
      })
    : children;

  return <ChatRuntimeTestProvider value={value}>{versionedChildren}</ChatRuntimeTestProvider>;
};

export const createChatInputRenderer =
  (renderer: { root: { render: (ui: ReactNode) => void } }, children: ReactNode) =>
  (providerValue: ChatAreaProviderValue) => {
    renderer.root.render(<ChatInputTestProvider value={providerValue}>{children}</ChatInputTestProvider>);
  };

export const createProviderValue = (commandedInput: InputCommand | null) =>
  createChatAreaProviderValue({
    messageList: {
      sessionTitle: 'Session',
    },
    input: {
      appSettings: {
        isAudioCompressionEnabled: false,
        isSystemAudioRecordingEnabled: false,
        isPasteRichTextAsMarkdownEnabled: true,
      },
      commandedInput,
      isEditing: true,
      editingMessageId: 'message-1',
    },
  });

export const resetChatInputHarnessState = () => {
  mockChatStoreState.activeSessionId = 'session-1';
  mockChatStoreState.savedSessions = [];
  mockChatStoreState.activeMessages = [];
  mockChatStoreState.selectedFiles = [];
  mockChatStoreState.commandedInput = null;
  mockChatStoreState.editingMessageId = null;
  mockChatStoreState.editMode = 'resend';
  mockChatStoreState.isAppProcessingFile = false;
  mockChatStoreState.appFileError = null;
  mockChatStoreState.loadingSessionIds = new Set();
  mockChatStoreSubscribers.clear();
  mockModelCapabilities.value = {
    isImageGenerationModel: false,
    isGemini3ImageModel: false,
    isTtsModel: false,
    isNativeAudioModel: false,
    isGemini3: false,
    permissions: {
      canAcceptAttachments: true,
      canUseTools: true,
      canUseGoogleSearch: true,
      canUseDeepSearch: true,
      canUseCodeExecution: true,
      canUseLocalPython: true,
      canUseUrlContext: true,
      canUseTokenCount: true,
      canUseYouTubeUrl: true,
      canGenerateSuggestions: true,
      canUseVoiceInput: true,
      canUseLiveControls: false,
      requiresTextPrompt: false,
    },
    supportedAspectRatios: [],
    supportedImageSizes: [],
  };
  Object.assign(mockLiveApiState, {
    connect: vi.fn(async () => true),
    disconnect: vi.fn(),
    toggleMute: vi.fn(),
    sendText: vi.fn(async () => true),
    sendContent: vi.fn(async () => true),
    startCamera: vi.fn(async () => true),
    startScreenShare: vi.fn(async () => true),
    stopVideo: vi.fn(),
    isConnected: false,
    isReconnecting: false,
    isMuted: false,
    isSpeaking: false,
    volume: 0,
    error: null,
    videoSource: null,
  });
};

export const setTextareaValue = (textarea: HTMLTextAreaElement, value: string) => {
  const descriptor = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value');

  descriptor?.set?.call(textarea, value);
  textarea.dispatchEvent(new Event('input', { bubbles: true }));
  textarea.dispatchEvent(new Event('change', { bubbles: true }));
};

export const dispatchKeyDown = (element: HTMLTextAreaElement, key: string, init: KeyboardEventInit = {}) => {
  element.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init }));
};

export const getChatInputHarnessMocks = () => ({
  mockApiUtils,
  mockChatStoreState,
  mockChatStoreSubscribers,
  mockLiveApiState,
  mockModelCapabilities,
  mockTextApi,
});
