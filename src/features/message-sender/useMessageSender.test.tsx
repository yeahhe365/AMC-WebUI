import { act } from 'react';
import { renderHookWithProviders } from '@/test/render/providerRenderer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockSendStandardMessage,
  mockSendTtsMessage,
  mockSendImageEditMessage,
  mockGetModelCapabilities,
  mockCreateMessage,
  mockCreateNewSession,
  mockSenderStoreActions,
  mockGetFileMetadataApi,
  mockUploadFileApi,
} = vi.hoisted(() => ({
  mockSendStandardMessage: vi.fn(),
  mockSendTtsMessage: vi.fn(),
  mockSendImageEditMessage: vi.fn(),
  mockGetModelCapabilities: vi.fn(),
  mockCreateMessage: vi.fn((role: string, content: string, options?: Record<string, unknown>) => ({
    id: 'error-message-id',
    role,
    content,
    timestamp: new Date('2026-05-04T09:30:00.000Z'),
    ...options,
  })),
  mockCreateNewSession: vi.fn(),
  mockSenderStoreActions: {
    updateAndPersistSessions: vi.fn((updater) => updater([])),
    setActiveSessionId: vi.fn(),
    setSessionLoading: vi.fn(),
    activeJobs: { current: new Map() },
  },
  mockGetFileMetadataApi: vi.fn(),
  mockUploadFileApi: vi.fn(),
}));

vi.mock('./useChatStreamHandler', () => ({
  useChatStreamHandler: () => ({
    getStreamHandlers: vi.fn(),
  }),
}));

vi.mock('./standardChatStrategy', () => ({
  sendStandardMessage: mockSendStandardMessage,
}));

vi.mock('./ttsStrategy', () => ({
  sendTtsMessage: mockSendTtsMessage,
}));

vi.mock('./imageEditStrategy', () => ({
  sendImageEditMessage: mockSendImageEditMessage,
}));

vi.mock('./senderStoreActions', () => ({
  createSenderStoreActions: () => mockSenderStoreActions,
}));

vi.mock('@/utils/model/modelCapabilities', () => ({
  getModelCapabilities: mockGetModelCapabilities,
}));

vi.mock('@/utils/chat/ids', () => ({
  generateUniqueId: vi.fn(() => 'generation-id'),
}));

vi.mock('@/utils/apiKeySelection', () => ({
  getKeyForRequest: vi.fn(() => ({ key: 'api-key', isNewKey: false })),
  formatApiKeyErrorMessage: vi.fn((error: string, translate: (translationKey: string) => string) => {
    if (error === 'API Key not configured.') return translate('apiRuntimeKeyNotConfigured');
    if (error === 'No valid API keys found.') return translate('apiRuntimeNoValidKeysFound');
    return error;
  }),
}));

vi.mock('@/utils/chat/session', () => ({
  createMessage: mockCreateMessage,
  createNewSession: mockCreateNewSession,
  rehydrateSessionFiles: vi.fn((session) => session),
}));

vi.mock('@/services/api/fileApi', () => ({
  getFileMetadataApi: mockGetFileMetadataApi,
  uploadFileApi: mockUploadFileApi,
}));

import { useMessageSender } from './useMessageSender';
import { createMessageSenderProps, type MessageSenderPropsOverrides } from '@/test/hooks/factories';
import {
  createChatMessage,
  createChatSettings,
  createThirdPartyConnection,
  createUploadedFile,
} from '@/test/data/factories';
import { useChatStore } from '@/stores/chatStore';
import { CODE_EXECUTION_TEXT_FILE_LIMIT_BYTES } from '@/utils/codeExecution';

describe('useMessageSender', () => {
  const renderMessageSender = (overrides: MessageSenderPropsOverrides = {}) => {
    const props = createMessageSenderProps({ language: 'zh', ...overrides });
    // handleSendMessage reads the live store selectedFiles when the closure's
    // value has gone stale, so the store must mirror the prop (the production
    // invariant: prop === store reference). Tests that want to exercise the
    // stale-closure path update the store separately, after rendering.
    useChatStore.setState({ selectedFiles: props.selectedFiles });
    return renderHookWithProviders(() => useMessageSender(props), {
      language: 'zh',
    });
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockCreateNewSession.mockReturnValue({ id: 'new-session' });
    mockSenderStoreActions.updateAndPersistSessions.mockImplementation((updater) => updater([]));
    mockGetFileMetadataApi.mockResolvedValue({ state: 'ACTIVE', name: 'files/current', uri: 'https://files/current' });
    mockUploadFileApi.mockResolvedValue({ state: 'ACTIVE', name: 'files/refreshed', uri: 'https://files/refreshed' });
    mockGetModelCapabilities.mockReturnValue({
      isTtsModel: false,
      isGemini3ImageModel: false,
      isNativeAudioModel: false,
      permissions: {
        canAcceptAttachments: true,
        requiresTextPrompt: false,
      },
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    useChatStore.setState({ selectedFiles: [] });
  });

  it('blocks attachments for models that cannot accept files', async () => {
    mockGetModelCapabilities.mockReturnValue({
      isTtsModel: true,
      isGemini3ImageModel: false,
      isNativeAudioModel: false,
      permissions: {
        canAcceptAttachments: false,
        requiresTextPrompt: true,
      },
    });

    const setAppFileError = vi.fn();

    const { result, unmount } = renderMessageSender({
      currentChatSettings: {
        modelId: 'gemini-3.1-flash-tts-preview',
      },
      selectedFiles: [
        createUploadedFile({
          name: 'reference.png',
          type: 'image/png',
        }),
      ],
      setAppFileError,
    });

    await act(async () => {
      await result.current.handleSendMessage({
        text: 'say hello',
      });
    });

    expect(setAppFileError).toHaveBeenCalledWith('当前模型不支持文件附件。');
    expect(mockSendTtsMessage).not.toHaveBeenCalled();
    expect(mockSendStandardMessage).not.toHaveBeenCalled();
    expect(mockSendImageEditMessage).not.toHaveBeenCalled();
    unmount();
  });

  it('blocks Gemini 3 image requests with more than 14 reference images', async () => {
    mockGetModelCapabilities.mockReturnValue({
      isTtsModel: false,
      isGemini3ImageModel: true,
    });

    const setAppFileError = vi.fn();
    const selectedFiles = Array.from({ length: 15 }, (_, index) =>
      createUploadedFile({
        id: `file-${index + 1}`,
        name: `reference-${index + 1}.png`,
        type: 'image/png',
      }),
    );

    const { result, unmount } = renderMessageSender({
      currentChatSettings: {
        modelId: 'gemini-3.1-flash-image-preview',
      },
      selectedFiles,
      setAppFileError,
    });

    await act(async () => {
      await result.current.handleSendMessage({
        text: 'make a group portrait',
      });
    });

    expect(setAppFileError).toHaveBeenCalledWith('Gemini 3 图片模型每次请求最多支持 14 张参考图。');
    expect(mockSendTtsMessage).not.toHaveBeenCalled();
    expect(mockSendStandardMessage).not.toHaveBeenCalled();
    expect(mockSendImageEditMessage).not.toHaveBeenCalled();
    unmount();
  });

  it('blocks oversized text files when server-side code execution is enabled', async () => {
    mockGetModelCapabilities.mockReturnValue({
      isTtsModel: false,
      isGemini3ImageModel: false,
    });

    const setAppFileError = vi.fn();

    const { result, unmount } = renderMessageSender({
      appSettings: {
        isCodeExecutionEnabled: true,
        isLocalPythonEnabled: false,
      },
      currentChatSettings: {
        modelId: 'gemini-3-flash-preview',
        isCodeExecutionEnabled: true,
        isLocalPythonEnabled: false,
      },
      selectedFiles: [
        createUploadedFile({
          name: 'large.csv',
          type: 'text/csv',
          size: CODE_EXECUTION_TEXT_FILE_LIMIT_BYTES + 1,
        }),
      ],
      setAppFileError,
    });

    await act(async () => {
      await result.current.handleSendMessage({ text: 'analyze this file' });
    });

    expect(setAppFileError).toHaveBeenCalledWith('代码执行文本/CSV 文件建议不超过 2MB。请拆分文件或关闭代码执行。');
    expect(mockSendStandardMessage).not.toHaveBeenCalled();
    unmount();
  });

  it('blocks audio attachments for hosted Gemma 4 large models', async () => {
    mockGetModelCapabilities.mockReturnValue({
      isTtsModel: false,
      isGemini3ImageModel: false,
      isGemmaModel: true,
    });

    const setAppFileError = vi.fn();

    const { result, unmount } = renderMessageSender({
      currentChatSettings: {
        modelId: 'gemma-4-31b-it',
      },
      selectedFiles: [
        createUploadedFile({
          name: 'voice-note.mp3',
          type: 'audio/mpeg',
        }),
      ],
      setAppFileError,
    });

    await act(async () => {
      await result.current.handleSendMessage({ text: 'transcribe this' });
    });

    expect(setAppFileError).toHaveBeenCalledWith('Gemma 4 31B/26B 模型仅支持文本和图片附件。');
    expect(mockSendStandardMessage).not.toHaveBeenCalled();
    unmount();
  });

  it('blocks manual sends while failed attachments are still selected', async () => {
    mockGetModelCapabilities.mockReturnValue({
      isTtsModel: false,
      isGemini3ImageModel: false,
    });

    const setAppFileError = vi.fn();

    const { result, unmount } = renderMessageSender({
      currentChatSettings: {
        modelId: 'gemini-3-flash-preview',
      },
      selectedFiles: [
        createUploadedFile({
          name: 'failed.pdf',
          type: 'application/pdf',
          uploadState: 'failed',
          error: 'Backend processing failed.',
        }),
      ],
      setAppFileError,
    });

    await act(async () => {
      await result.current.handleSendMessage({ text: 'summarize this' });
    });

    expect(setAppFileError).toHaveBeenCalledWith('附件上传失败。请移除失败文件或重新上传后再发送。');
    expect(mockSendStandardMessage).not.toHaveBeenCalled();
    unmount();
  });

  it('blocks PDF attachments for Gemini 3 Pro image', async () => {
    mockGetModelCapabilities.mockReturnValue({
      isTtsModel: false,
      isGemini3ImageModel: true,
    });

    const setAppFileError = vi.fn();

    const { result, unmount } = renderMessageSender({
      currentChatSettings: {
        modelId: 'gpt-5.6-sol',
        providerId: 'openai',
      },
      selectedFiles: [
        createUploadedFile({
          name: 'reference.pdf',
          type: 'application/pdf',
        }),
      ],
      setAppFileError,
    });

    await act(async () => {
      await result.current.handleSendMessage({
        text: 'turn this into a poster',
      });
    });

    expect(setAppFileError).toHaveBeenCalledWith('这个图片模型仅支持图片附件。');
    expect(mockSendStandardMessage).not.toHaveBeenCalled();
    expect(mockSendImageEditMessage).not.toHaveBeenCalled();
    unmount();
  });

  it('allows PDF attachments for Gemini 3.1 Flash image', async () => {
    mockGetModelCapabilities.mockReturnValue({
      isTtsModel: false,
      isGemini3ImageModel: true,
    });

    const setAppFileError = vi.fn();

    const { result, unmount } = renderMessageSender({
      currentChatSettings: {
        modelId: 'gemini-3.1-flash-image-preview',
      },
      selectedFiles: [
        createUploadedFile({
          name: 'reference.pdf',
          type: 'application/pdf',
        }),
      ],
      setAppFileError,
    });

    await act(async () => {
      await result.current.handleSendMessage({
        text: 'turn this into a cover',
      });
    });

    expect(setAppFileError).toHaveBeenCalledWith(null);
    expect(mockSendStandardMessage).toHaveBeenCalled();
    unmount();
  });

  it('passes per-send settings overrides into the standard message route', async () => {
    mockGetModelCapabilities.mockReturnValue({
      isTtsModel: false,
      isGemini3ImageModel: false,
    });

    const settingsOverride = createChatSettings({
      modelId: 'gemini-3-flash-preview',
      systemInstruction: '[Live Artifacts Protocol - zh]\nLive prompt',
    });

    const { result, unmount } = renderMessageSender({
      currentChatSettings: {
        modelId: 'gemini-3-flash-preview',
        systemInstruction: '',
      },
    });

    await act(async () => {
      await result.current.handleSendMessage({
        text: 'Create interactive HTML board.',
        settingsOverride,
      });
    });

    expect(mockSendStandardMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        props: expect.objectContaining({
          currentChatSettings: expect.objectContaining({
            systemInstruction: '[Live Artifacts Protocol - zh]\nLive prompt',
          }),
        }),
      }),
    );
    unmount();
  });

  it('converts local Files API references to inline files before sending in OpenAI-compatible mode', async () => {
    mockGetModelCapabilities.mockImplementation((modelId: string) => ({
      isTtsModel: false,
      isGemini3ImageModel: modelId === 'gemini-3-pro-image-preview',
    }));

    const setAppFileError = vi.fn();
    const rawFile = new File(['image-bytes'], 'reference.png', { type: 'image/png' });
    const selectedFiles = [
      createUploadedFile({
        name: 'reference.png',
        type: 'image/png',
        size: rawFile.size,
        rawFile,
        fileApiName: 'files/gemini-reference',
        fileUri: 'https://files/gemini-reference',
        transferStrategy: 'files-api',
      }),
    ];

    const { result, unmount } = renderMessageSender({
      appSettings: {
        thirdPartyApi: {
          connections: [createThirdPartyConnection({ id: 'openai', modelId: 'gpt-5.6-sol' })],
        },
      },
      currentChatSettings: {
        modelId: 'gpt-5.6-sol',
        providerId: 'openai',
      },
      selectedFiles,
      setAppFileError,
    });

    await act(async () => {
      await result.current.handleSendMessage({ text: 'summarize this image' });
    });

    expect(mockGetModelCapabilities).toHaveBeenCalledWith('gpt-5.6-sol');
    expect(mockGetFileMetadataApi).not.toHaveBeenCalled();
    expect(setAppFileError).toHaveBeenCalledWith(null);
    expect(mockSendImageEditMessage).not.toHaveBeenCalled();
    expect(mockSendStandardMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        text: 'summarize this image',
        files: [
          expect.objectContaining({
            name: 'reference.png',
            rawFile,
            fileApiName: undefined,
            fileUri: undefined,
            transferStrategy: 'inline',
          }),
        ],
        editingMessageId: null,
        activeModelId: 'gpt-5.6-sol',
        isContinueMode: false,
        isFastMode: false,
        request: expect.objectContaining({
          ok: true,
          keyToUse: 'api-key',
          generationId: 'generation-id',
          abortController: expect.any(AbortController),
        }),
      }),
    );
    unmount();
  });

  it('blocks remote-only Files API references in OpenAI-compatible mode', async () => {
    mockGetModelCapabilities.mockImplementation((modelId: string) => ({
      isTtsModel: false,
      isGemini3ImageModel: modelId === 'gemini-3-pro-image-preview',
    }));

    const setAppFileError = vi.fn();
    const selectedFiles = [
      createUploadedFile({
        name: 'remote-reference.png',
        type: 'image/png',
        rawFile: undefined,
        fileApiName: 'files/remote-reference',
        fileUri: 'https://files/remote-reference',
        transferStrategy: 'remote-file-id',
      }),
    ];

    const { result, unmount } = renderMessageSender({
      appSettings: {
        thirdPartyApi: {
          connections: [createThirdPartyConnection({ id: 'openai', modelId: 'gpt-5.6-sol' })],
        },
      },
      currentChatSettings: {
        modelId: 'gpt-5.6-sol',
        providerId: 'openai',
      },
      selectedFiles,
      setAppFileError,
    });

    await act(async () => {
      await result.current.handleSendMessage({ text: 'describe this image' });
    });

    expect(mockGetModelCapabilities).toHaveBeenCalledWith('gpt-5.6-sol');
    expect(mockGetFileMetadataApi).not.toHaveBeenCalled();
    expect(setAppFileError).toHaveBeenCalledWith(
      'OpenAI 兼容模式不能发送 Gemini Files API 远端引用。请重新附加 remote-reference.png 作为本地图片、音频或文本文件，或切回 Gemini API。',
    );
    expect(mockSendStandardMessage).not.toHaveBeenCalled();
    unmount();
  });

  it('omits historical Gemini Files API ids before sending in OpenAI-compatible mode', async () => {
    mockGetModelCapabilities.mockImplementation((modelId: string) => ({
      isTtsModel: false,
      isGemini3ImageModel: modelId === 'gemini-3-pro-image-preview',
    }));

    const { result, unmount } = renderMessageSender({
      activeSessionId: 'session-1',
      appSettings: {
        thirdPartyApi: {
          connections: [createThirdPartyConnection({ id: 'openai', modelId: 'gpt-5.6-sol' })],
        },
      },
      currentChatSettings: {
        modelId: 'gpt-5.6-sol',
        providerId: 'openai',
      },
      messages: [
        createChatMessage({
          id: 'user-1',
          content: 'summarize this',
          files: [
            createUploadedFile({
              id: 'file-remote',
              name: 'remote-only.pdf',
              type: 'application/pdf',
              fileApiName: 'files/expired',
              fileUri: 'https://files/expired',
              transferStrategy: 'remote-file-id',
            }),
          ],
        }),
      ],
    });

    await act(async () => {
      await result.current.handleSendMessage({ text: 'try again' });
    });

    expect(mockGetFileMetadataApi).not.toHaveBeenCalled();
    expect(mockSendStandardMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        text: 'try again',
        props: expect.objectContaining({
          messages: [
            expect.objectContaining({
              id: 'user-1',
              content: 'summarize this',
              files: [
                expect.objectContaining({
                  id: 'file-remote',
                  omittedFromApiHistory: true,
                  fileApiName: undefined,
                  fileUri: undefined,
                }),
              ],
            }),
          ],
        }),
      }),
    );
    unmount();
  });

  it('creates a localized error session when no model is selected', async () => {
    mockGetModelCapabilities.mockReturnValue({
      isTtsModel: false,
      isGemini3ImageModel: false,
    });

    const { result, unmount } = renderMessageSender({
      currentChatSettings: {
        modelId: '',
      },
    });

    await act(async () => {
      await result.current.handleSendMessage({ text: 'hello' });
    });

    expect(mockCreateNewSession).toHaveBeenCalledWith(
      expect.anything(),
      [
        expect.objectContaining({
          role: 'error',
          content: '未选择模型。',
        }),
      ],
      '错误',
    );
    expect(mockSenderStoreActions.setActiveSessionId).toHaveBeenCalledWith('new-session');
    unmount();
  });

  it('refreshes an expired Files API reference from the local file before sending', async () => {
    mockGetModelCapabilities.mockReturnValue({
      isTtsModel: false,
      isGemini3ImageModel: false,
    });
    mockGetFileMetadataApi.mockResolvedValue(null);

    const rawFile = new File(['image-bytes'], 'reference.png', { type: 'image/png' });
    const staleFile = createUploadedFile({
      id: 'file-stale',
      name: 'reference.png',
      type: 'image/png',
      size: rawFile.size,
      rawFile,
      fileApiName: 'files/expired',
      fileUri: 'https://files/expired',
      uploadState: 'active',
      isProcessing: false,
    });
    const setSelectedFiles = vi.fn();

    const { result, unmount } = renderMessageSender({
      currentChatSettings: {
        modelId: 'gemini-3.1-pro-preview',
      },
      selectedFiles: [staleFile],
      setSelectedFiles,
    });

    await act(async () => {
      await result.current.handleSendMessage({ text: 'describe this image' });
    });

    expect(mockGetFileMetadataApi).toHaveBeenCalledWith('api-key', 'files/expired');
    expect(mockUploadFileApi).toHaveBeenCalledWith(
      'api-key',
      rawFile,
      'image/png',
      'reference.png',
      expect.any(AbortSignal),
      expect.any(Function),
    );
    expect(mockSendStandardMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        files: [
          expect.objectContaining({
            id: 'file-stale',
            fileApiName: 'files/refreshed',
            fileUri: 'https://files/refreshed',
            uploadState: 'active',
            isProcessing: false,
          }),
        ],
      }),
    );
    expect(setSelectedFiles).toHaveBeenCalledWith(expect.any(Function));
    unmount();
  });

  it('blocks an expired Files API reference when no local backup is available', async () => {
    mockGetModelCapabilities.mockReturnValue({
      isTtsModel: false,
      isGemini3ImageModel: false,
    });
    mockGetFileMetadataApi.mockResolvedValue(null);

    const setAppFileError = vi.fn();
    const { result, unmount } = renderMessageSender({
      currentChatSettings: {
        modelId: 'gemini-3.1-pro-preview',
      },
      selectedFiles: [
        createUploadedFile({
          id: 'file-remote-only',
          name: 'remote-only.pdf',
          type: 'application/pdf',
          fileApiName: 'files/expired',
          fileUri: 'https://files/expired',
          uploadState: 'active',
          isProcessing: false,
          rawFile: undefined,
        }),
      ],
      setAppFileError,
    });

    await act(async () => {
      await result.current.handleSendMessage({ text: 'summarize this PDF' });
    });

    expect(mockUploadFileApi).not.toHaveBeenCalled();
    expect(setAppFileError).toHaveBeenCalledWith(
      'remote-only.pdf 的远端文件引用已失效，且本地备份不可用。请重新附加该文件。',
    );
    expect(mockSendStandardMessage).not.toHaveBeenCalled();
    unmount();
  });

  it('starts a continue-generation turn with a fresh generationStartTime, not the target message timestamp', async () => {
    mockGetModelCapabilities.mockReturnValue({
      isTtsModel: false,
      isGemini3ImageModel: false,
    });

    const oldStart = new Date('2026-05-04T08:00:00.000Z');
    const targetMessage = {
      id: 'target-model',
      role: 'model' as const,
      content: 'continue me',
      timestamp: oldStart,
      generationStartTime: oldStart,
      firstTokenTimeMs: 500,
      thinkingTimeMs: 1200,
    };

    const { result, unmount } = renderMessageSender({
      currentChatSettings: {
        modelId: 'gemini-3.1-pro-preview',
      },
      messages: [targetMessage],
      editingMessageId: 'target-model',
    });

    await act(async () => {
      await result.current.handleSendMessage({
        text: 'keep going',
        isContinueMode: true,
        editingId: 'target-model',
      });
    });

    expect(mockSendStandardMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        request: expect.objectContaining({
          generationStartTime: expect.any(Date),
        }),
      }),
    );
    const sentRequest = mockSendStandardMessage.mock.calls[0][0].request as { generationStartTime: Date };
    expect(sentRequest.generationStartTime.getTime()).not.toBe(oldStart.getTime());
    unmount();
  });

  it('sends with the live store files when the closure selectedFiles are stale (pending-submission flush)', async () => {
    mockGetModelCapabilities.mockReturnValue({
      isTtsModel: false,
      isGemini3ImageModel: false,
    });

    const setAppFileError = vi.fn();
    const processingFile = createUploadedFile({
      id: 'file-uploading',
      name: 'report.pdf',
      type: 'application/pdf',
      isProcessing: true,
      uploadState: 'uploading',
    });
    const activeFile = createUploadedFile({
      id: 'file-uploading',
      name: 'report.pdf',
      type: 'application/pdf',
      isProcessing: false,
      uploadState: 'active',
    });

    // Render with the file still processing, then let the upload complete by
    // updating the store without re-rendering — exactly the window the
    // pending-submission flush runs in, before React commits the new files.
    const { result, unmount } = renderMessageSender({
      selectedFiles: [processingFile],
      setAppFileError,
    });

    useChatStore.setState({ selectedFiles: [activeFile] });

    await act(async () => {
      await result.current.handleSendMessage({ text: 'summarize this' });
    });

    expect(setAppFileError).toHaveBeenCalledWith(null);
    expect(mockSendStandardMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        text: 'summarize this',
        files: [
          expect.objectContaining({
            id: 'file-uploading',
            uploadState: 'active',
            isProcessing: false,
          }),
        ],
      }),
    );
    unmount();
  });

  it('refreshes an expired Files API reference in history before a text follow-up', async () => {
    mockGetFileMetadataApi.mockResolvedValue(null);
    const rawFile = new File(['image-bytes'], 'reference.png', { type: 'image/png' });
    const staleFile = createUploadedFile({
      id: 'file-history',
      name: 'reference.png',
      type: 'image/png',
      size: rawFile.size,
      rawFile,
      fileApiName: 'files/expired',
      fileUri: 'https://files/expired',
      uploadState: 'active',
      transferStrategy: 'files-api',
    });
    const historyUserMessage = createChatMessage({
      id: 'user-1',
      content: 'describe this image',
      files: [staleFile],
      apiParts: [
        { fileData: { mimeType: 'image/png', fileUri: 'https://files/expired' } },
        { text: 'describe this image' },
      ],
    });

    const { result, unmount } = renderMessageSender({
      activeSessionId: 'session-1',
      currentChatSettings: {
        modelId: 'gemini-3.1-pro-preview',
      },
      messages: [historyUserMessage, createChatMessage({ id: 'model-1', role: 'model', content: 'a cat' })],
    });

    await act(async () => {
      await result.current.handleSendMessage({ text: 'what color is it?' });
    });

    expect(mockUploadFileApi).toHaveBeenCalledWith(
      'api-key',
      rawFile,
      'image/png',
      'reference.png',
      expect.any(AbortSignal),
    );
    expect(mockSenderStoreActions.updateAndPersistSessions).toHaveBeenCalled();
    expect(mockSendStandardMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        text: 'what color is it?',
        props: expect.objectContaining({
          messages: [
            expect.objectContaining({
              id: 'user-1',
              files: [
                expect.objectContaining({
                  id: 'file-history',
                  fileApiName: 'files/refreshed',
                  fileUri: 'https://files/refreshed',
                }),
              ],
              apiParts: [
                { fileData: { mimeType: 'image/png', fileUri: 'https://files/refreshed' } },
                { text: 'describe this image' },
              ],
            }),
            expect.objectContaining({ id: 'model-1' }),
          ],
        }),
      }),
    );
    unmount();
  });

  it('continues a follow-up after dropping an expired historical Files API id that has no local backup', async () => {
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

    const { result, unmount } = renderMessageSender({
      activeSessionId: 'session-1',
      currentChatSettings: {
        modelId: 'gemini-3.1-pro-preview',
      },
      messages: [
        createChatMessage({
          id: 'user-1',
          content: 'summarize this',
          files: [staleFile],
          apiParts: [
            { fileData: { mimeType: 'application/pdf', fileUri: 'https://files/expired' } },
            { text: 'summarize this' },
          ],
        }),
      ],
    });

    await act(async () => {
      await result.current.handleSendMessage({ text: 'try again' });
    });

    expect(mockUploadFileApi).not.toHaveBeenCalled();
    expect(mockSendStandardMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        text: 'try again',
        props: expect.objectContaining({
          messages: [
            expect.objectContaining({
              id: 'user-1',
              content: 'summarize this',
              files: [
                expect.objectContaining({
                  id: 'file-remote',
                  fileApiName: undefined,
                  fileUri: undefined,
                  uploadState: 'failed',
                  omittedFromApiHistory: true,
                }),
              ],
            }),
          ],
        }),
      }),
    );
    unmount();
  });

  it('excludes the edited message and subsequent messages from history file checks when resending an edit', async () => {
    mockGetFileMetadataApi.mockRejectedValue(new Error('403 PERMISSION_DENIED: caller lacks access'));
    mockUploadFileApi.mockRejectedValue(new Error('socket hang up'));

    const brokenFile = createUploadedFile({
      id: 'file-broken',
      name: 'broken.mp4',
      type: 'video/mp4',
      fileApiName: 'files/broken',
      fileUri: 'https://files/broken',
      uploadState: 'active',
      transferStrategy: 'files-api',
      fileApiKeyFingerprint: 'outdated-key-fingerprint',
    });

    const { result, unmount } = renderMessageSender({
      currentChatSettings: {
        ...createChatSettings(),
        modelId: 'gemini-3.1-pro-preview',
      },
      messages: [
        createChatMessage({
          id: 'user-prior',
          content: 'prior question',
        }),
        createChatMessage({
          id: 'user-target-to-edit',
          content: 'analyze this broken video',
          files: [brokenFile],
          apiParts: [{ fileData: { mimeType: 'video/mp4', fileUri: 'https://files/broken' } }],
        }),
        createChatMessage({
          id: 'model-reply',
          role: 'model',
          content: 'failed or partial response',
        }),
      ],
    });

    await act(async () => {
      await result.current.handleSendMessage({
        text: 'new question without the broken file',
        files: [],
        editingId: 'user-target-to-edit',
      });
    });

    // It should not attempt to upload the broken file from the edited message
    expect(mockUploadFileApi).not.toHaveBeenCalled();
    expect(mockSendStandardMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        text: 'new question without the broken file',
        editingMessageId: 'user-target-to-edit',
        props: expect.objectContaining({
          messages: [
            expect.objectContaining({
              id: 'user-prior',
              content: 'prior question',
            }),
          ],
        }),
      }),
    );
    unmount();
  });

  it('allows standard chat sends to proceed when Files API returns PROCESSING state', async () => {
    mockGetModelCapabilities.mockReturnValue({
      isTtsModel: false,
      isGemini3ImageModel: false,
    });
    mockGetFileMetadataApi.mockResolvedValueOnce({
      name: 'files/processing-video',
      state: 'PROCESSING',
      uri: 'https://files/processing-video',
    });

    const setAppFileError = vi.fn();
    const processingFile = createUploadedFile({
      id: 'file-processing',
      name: 'video.mp4',
      type: 'video/mp4',
      fileApiName: 'files/processing-video',
      fileUri: 'https://files/processing-video',
      uploadState: 'active',
      transferStrategy: 'files-api',
      fileApiKeyFingerprint: 'outdated-fingerprint',
    });

    const { result, unmount } = renderMessageSender({
      currentChatSettings: {
        ...createChatSettings(),
        modelId: 'gemini-2.5-flash',
      },
      setAppFileError,
    });

    await act(async () => {
      await result.current.handleSendMessage({
        text: 'analyze this video',
        files: [processingFile],
        editingId: 'user-retry-id',
      });
    });

    expect(setAppFileError).not.toHaveBeenCalledWith(expect.stringContaining('请等待'));
    expect(mockSendStandardMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        text: 'analyze this video',
        editingMessageId: 'user-retry-id',
        files: [
          expect.objectContaining({
            id: 'file-processing',
            uploadState: 'processing_api',
            isProcessing: true,
          }),
        ],
      }),
    );
    unmount();
  });
});
