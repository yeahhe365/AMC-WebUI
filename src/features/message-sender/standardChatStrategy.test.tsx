import { act } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { sendStandardMessage } from './standardChatStrategy';
import { createStandardChatProps, type StandardChatPropsOverrides } from '@/test/hooks/factories';
import { MediaResolution } from '@/types';
import { createThirdPartyConnection } from '@/test/data/factories';
import { createMessage } from '@/utils/chat/session';
import type { PreparedModelRequest } from './useModelRequestRunner';

const {
  mockBuildContentParts,
  mockCreateChatHistoryForApi,
  mockGetKeyForRequest,
  mockBuildGenerationConfig,
  mockAppendFunctionDeclarationsToTools,
  mockRunStandardToolLoop,
  mockCreateStandardClientFunctions,
  mockCreateMcpClientFunctions,
  mockSendMessageStream,
  mockSendMessageNonStream,
  mockSendOpenAICompatibleMessageStream,
  mockSendOpenAICompatibleMessageNonStream,
  mockModelCapabilities,
} = vi.hoisted(() => ({
  mockBuildContentParts: vi.fn(),
  mockCreateChatHistoryForApi: vi.fn(),
  mockGetKeyForRequest: vi.fn(),
  mockBuildGenerationConfig: vi.fn(),
  mockAppendFunctionDeclarationsToTools: vi.fn(),
  mockRunStandardToolLoop: vi.fn(),
  mockCreateStandardClientFunctions: vi.fn(),
  mockCreateMcpClientFunctions: vi.fn(),
  mockSendMessageStream: vi.fn(),
  mockSendMessageNonStream: vi.fn(),
  mockSendOpenAICompatibleMessageStream: vi.fn(),
  mockSendOpenAICompatibleMessageNonStream: vi.fn(),
  mockModelCapabilities: vi.fn((id: string) => ({
    isGemini3: id.includes('gemini-3'),
    supportsRawReasoningPrefill: false,
  })),
}));

vi.mock('@/utils/apiKeySelection', () => ({
  getKeyForRequest: mockGetKeyForRequest,
}));

vi.mock('@/utils/chat/builder', () => ({
  buildContentParts: mockBuildContentParts,
  createChatHistoryForApi: mockCreateChatHistoryForApi,
}));

vi.mock('@/utils/chat/ids', () => ({
  generateUniqueId: vi.fn(() => 'generated-id'),
}));

vi.mock('@/utils/chat/session', () => ({
  performOptimisticSessionUpdate: vi.fn((prev) => prev),
  generateSessionTitle: vi.fn(() => 'New Chat'),
  createMessage: vi.fn((role: string, content: string, options?: Record<string, unknown>) => ({
    id: options?.id ?? `${role}-message`,
    role,
    content,
    ...options,
    timestamp: new Date(),
  })),
  rehydrateSessionFiles: vi.fn((session) => session),
}));

vi.mock('@/utils/model/modelCapabilities', () => ({
  isGemini3Model: vi.fn((id: string) => id.includes('gemini-3')),
  isImageGenerationModel: vi.fn((id: string) => id.includes('image')),
  shouldStripThinkingFromContext: vi.fn(() => false),
  getModelCapabilities: mockModelCapabilities,
}));

vi.mock('@/constants/settingsDefaults', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/constants/settingsDefaults')>();

  return {
    ...actual,
    DEFAULT_CHAT_SETTINGS: {},
  };
});

vi.mock('@/services/api/generationConfig', () => ({
  buildGenerationConfig: mockBuildGenerationConfig,
  appendFunctionDeclarationsToTools: mockAppendFunctionDeclarationsToTools,
}));

vi.mock('@/services/api/chatApi', () => ({
  generateContentTurnApi: vi.fn(),
  sendStatelessMessageStreamApi: mockSendMessageStream,
  sendStatelessMessageNonStreamApi: mockSendMessageNonStream,
}));

vi.mock('@/services/api/openaiCompatibleApi', () => ({
  sendOpenAICompatibleMessageStream: mockSendOpenAICompatibleMessageStream,
  sendOpenAICompatibleMessageNonStream: mockSendOpenAICompatibleMessageNonStream,
}));

vi.mock('@/features/standard-chat/standardClientFunctions', () => ({
  createStandardClientFunctions: mockCreateStandardClientFunctions,
}));

vi.mock('@/features/mcp/mcpClientFunctions', () => ({
  createMcpClientFunctions: mockCreateMcpClientFunctions,
}));

vi.mock('@/features/standard-chat/standardToolLoop', () => ({
  runStandardToolLoop: mockRunStandardToolLoop,
}));

vi.mock('@/features/local-python/executionFiles', () => ({
  collectLocalPythonInputFiles: vi.fn(() => []),
}));

vi.mock('@/features/local-python/loadPyodideService', () => ({
  getPyodideService: vi.fn(),
}));

describe('standardChatStrategy', () => {
  const createBaseStandardChatOverrides = (overrides: StandardChatPropsOverrides = {}): StandardChatPropsOverrides => ({
    ...overrides,
    appSettings: {
      hideThinkingInContext: false,
      isRawModeEnabled: false,
      isStreamingEnabled: true,
      ...overrides.appSettings,
    },
    currentChatSettings: {
      modelId: 'gemini-3-flash-preview',
      systemInstruction: 'Custom system instruction',
      temperature: 1,
      topP: 0.95,
      topK: 64,
      showThoughts: true,
      thinkingBudget: 0,
      thinkingLevel: 'LOW',
      isGoogleSearchEnabled: false,
      isCodeExecutionEnabled: false,
      isLocalPythonEnabled: false,
      isUrlContextEnabled: false,
      isDeepSearchEnabled: false,
      safetySettings: [],
      mediaResolution: MediaResolution.MEDIA_RESOLUTION_UNSPECIFIED,
      hideThinkingInContext: false,
      lockedApiKey: null,
      ...overrides.currentChatSettings,
    },
  });

  const renderStandardChat = (overrides: StandardChatPropsOverrides = {}) => {
    const props = createStandardChatProps(createBaseStandardChatOverrides(overrides));
    const runMessageLifecycle = vi.fn(async ({ execute }) => execute());

    return {
      result: {
        current: {
          sendStandardMessage: (
            input: Omit<
              Parameters<typeof sendStandardMessage>[0],
              'props' | 'getStreamHandlers' | 'runMessageLifecycle'
            >,
          ) =>
            sendStandardMessage({
              props,
              getStreamHandlers: props.getStreamHandlers,
              runMessageLifecycle,
              ...input,
            }),
        },
      },
      unmount: () => undefined,
      runMessageLifecycle,
    };
  };

  beforeEach(() => {
    vi.clearAllMocks();

    mockGetKeyForRequest.mockReturnValue({ key: 'api-key', isNewKey: false });
    mockBuildContentParts.mockResolvedValue({
      contentParts: [{ text: 'analyze the csv' }],
      enrichedFiles: [],
    });
    mockCreateChatHistoryForApi.mockResolvedValue([]);
    mockBuildGenerationConfig.mockResolvedValue({ systemInstruction: 'base config' });
    mockAppendFunctionDeclarationsToTools.mockImplementation((_modelId, config) => config);
    mockCreateStandardClientFunctions.mockImplementation(({ isLocalPythonEnabled }) =>
      isLocalPythonEnabled
        ? {
            run_local_python: {
              declaration: {
                name: 'run_local_python',
                description: 'Run Python locally.',
              },
              handler: vi.fn(),
            },
          }
        : {},
    );
    mockCreateMcpClientFunctions.mockResolvedValue({});
    mockRunStandardToolLoop.mockResolvedValue({
      finalTurn: {
        parts: [{ text: 'done' }],
        thoughts: undefined,
        usage: undefined,
        grounding: undefined,
        urlContext: undefined,
      },
      toolMessages: [],
      generatedFiles: [],
    });
    mockSendMessageStream.mockResolvedValue(undefined);
    mockSendMessageNonStream.mockResolvedValue(undefined);
    mockSendOpenAICompatibleMessageStream.mockResolvedValue(undefined);
    mockSendOpenAICompatibleMessageNonStream.mockResolvedValue(undefined);
    mockModelCapabilities.mockImplementation((id: string) => ({
      isGemini3: id.includes('gemini-3'),
      supportsRawReasoningPrefill: false,
    }));
  });

  const createPreparedRequest = (overrides: Partial<PreparedModelRequest> = {}): PreparedModelRequest => ({
    ok: true,
    keyToUse: 'api-key',
    isNewKey: false,
    shouldLockKey: false,
    generationId: 'prepared-generation-id',
    generationStartTime: new Date('2026-05-04T09:00:00.000Z'),
    abortController: new AbortController(),
    ...overrides,
  });

  it('uses a prepared request context without looking up the API key again', async () => {
    const getStreamHandlers = vi.fn(() => ({
      streamOnError: vi.fn(),
      streamOnComplete: vi.fn(),
      streamOnPart: vi.fn(),
      onThoughtChunk: vi.fn(),
    }));

    const { result, unmount } = renderStandardChat({ getStreamHandlers });

    await act(async () => {
      await result.current.sendStandardMessage({
        text: 'analyze the csv',
        files: [],
        editingMessageId: null,
        activeModelId: 'gemini-3-flash-preview',
        request: createPreparedRequest({ keyToUse: 'prepared-key' }),
      });
    });

    expect(mockGetKeyForRequest).not.toHaveBeenCalled();
    expect(mockSendMessageStream).toHaveBeenCalledWith(
      'prepared-key',
      'gemini-3-flash-preview',
      [],
      [{ text: 'analyze the csv' }],
      expect.any(Object),
      expect.any(AbortSignal),
      expect.any(Function),
      expect.any(Function),
      expect.any(Function),
      expect.any(Function),
      'user',
      undefined,
      undefined,
    );

    unmount();
  });

  it('stores the sent protocol parts on the user message', async () => {
    const promptParts = [{ fileData: { mimeType: 'image/png', fileUri: 'files/abc' } }, { text: 'analyze the csv' }];
    mockBuildContentParts.mockResolvedValue({
      contentParts: promptParts,
      enrichedFiles: [],
    });

    const { result, unmount } = renderStandardChat();

    await act(async () => {
      await result.current.sendStandardMessage({
        text: 'analyze the csv',
        files: [],
        editingMessageId: null,
        activeModelId: 'gemini-3-flash-preview',
        request: createPreparedRequest(),
      });
    });

    expect(createMessage).toHaveBeenCalledWith(
      'user',
      'analyze the csv',
      expect.objectContaining({
        apiParts: promptParts,
      }),
    );

    unmount();
  });

  it('does not register an auto Live Artifacts completion callback for standard chat', async () => {
    const getStreamHandlers = vi.fn(
      (...args: Parameters<Parameters<typeof sendStandardMessage>[0]['getStreamHandlers']>) => {
        const onSuccess = args[6];
        expect(onSuccess).toBeUndefined();

        return {
          streamOnError: vi.fn(),
          streamOnComplete: vi.fn(),
          streamOnPart: vi.fn(),
          onThoughtChunk: vi.fn(),
        };
      },
    );

    const { result, unmount } = renderStandardChat({
      getStreamHandlers,
    });

    await act(async () => {
      await result.current.sendStandardMessage({
        text: 'summarize this report',
        files: [],
        editingMessageId: null,
        activeModelId: 'gemini-3-flash-preview',
        request: createPreparedRequest(),
      });
    });

    expect(getStreamHandlers).toHaveBeenCalledOnce();

    unmount();
  });

  it('passes the local-python flag into generation config when the client tool is enabled', async () => {
    const getStreamHandlers = vi.fn(() => ({
      streamOnError: vi.fn(),
      streamOnComplete: vi.fn(),
      streamOnPart: vi.fn(),
      onThoughtChunk: vi.fn(),
    }));

    const { result, unmount } = renderStandardChat({
      currentChatSettings: {
        isLocalPythonEnabled: true,
      },
      getStreamHandlers,
    });

    await act(async () => {
      await result.current.sendStandardMessage({
        text: 'analyze the csv',
        files: [],
        editingMessageId: null,
        activeModelId: 'gemini-3-flash-preview',
        request: createPreparedRequest(),
      });
    });

    expect(mockBuildGenerationConfig).toHaveBeenCalledWith(
      expect.objectContaining({
        modelId: 'gemini-3-flash-preview',
        settings: expect.objectContaining({
          modelId: 'gemini-3-flash-preview',
          systemInstruction: 'Custom system instruction',
          showThoughts: true,
          thinkingBudget: 0,
          isGoogleSearchEnabled: false,
          isCodeExecutionEnabled: false,
          isUrlContextEnabled: false,
          thinkingLevel: 'LOW',
          isDeepSearchEnabled: false,
          safetySettings: [],
          mediaResolution: 'MEDIA_RESOLUTION_UNSPECIFIED',
          isLocalPythonEnabled: true,
        }),
        aspectRatio: '1:1',
        imageSize: '1K',
        isLocalPythonEnabled: true,
        imageOutputMode: 'IMAGE_TEXT',
      }),
    );

    unmount();
  });

  it('routes standard chat through OpenAI-compatible streaming when third-party openai provider is selected', async () => {
    const streamOnError = vi.fn();
    const streamOnComplete = vi.fn();
    const streamOnPart = vi.fn();
    const onThoughtChunk = vi.fn();
    const getStreamHandlers = vi.fn(() => ({
      streamOnError,
      streamOnComplete,
      streamOnPart,
      onThoughtChunk,
    }));

    const { result, unmount } = renderStandardChat({
      appSettings: {
        apiKey: 'gemini-key',
        thirdPartyApi: {
          connections: [
            createThirdPartyConnection({
              id: 'openai',
              apiKey: 'openai-key',
              baseUrl: 'https://api.openai.com/v1',
              modelId: 'gpt-5.6-sol',
              models: [{ id: 'gpt-5.6-sol', name: 'GPT-5.6 Sol', isPinned: true }],
            }),
          ],
        },
      },
      currentChatSettings: {
        modelId: 'gpt-5.6-sol',
        providerId: 'openai',
        isGoogleSearchEnabled: true,
        isCodeExecutionEnabled: true,
        isLocalPythonEnabled: true,
        isUrlContextEnabled: true,
        isDeepSearchEnabled: true,
      },
      getStreamHandlers,
    });

    await act(async () => {
      await result.current.sendStandardMessage({
        text: 'hello through compat',
        files: [],
        editingMessageId: null,
        activeModelId: 'gpt-5.6-sol',
        request: createPreparedRequest(),
      });
    });

    expect(mockBuildGenerationConfig).not.toHaveBeenCalled();
    expect(mockCreateStandardClientFunctions).not.toHaveBeenCalled();
    expect(mockCreateMcpClientFunctions).not.toHaveBeenCalled();
    expect(mockSendMessageStream).not.toHaveBeenCalled();
    expect(mockSendOpenAICompatibleMessageStream).toHaveBeenCalledWith(
      'api-key',
      'gpt-5.6-sol',
      [],
      [{ text: 'analyze the csv' }],
      expect.objectContaining({
        baseUrl: 'https://api.openai.com/v1',
        systemInstruction: 'Custom system instruction',
        temperature: 1,
        topP: 0.95,
        thinkingLevel: 'LOW',
      }),
      expect.any(AbortSignal),
      expect.any(Function),
      expect.any(Function),
      streamOnError,
      streamOnComplete,
      'user',
      'openai',
    );

    // The streaming callbacks are wrapped so every chunk stamps thinking
    // provenance: the first part/thought forces the flat strip for third-party.
    const [wrappedOnPart, wrappedOnThoughtChunk] = mockSendOpenAICompatibleMessageStream.mock.calls[0].slice(6, 8) as [
      (part: object) => void,
      (chunk: string) => void,
    ];
    wrappedOnPart({ text: '**Step**\nreasoning' });
    expect(streamOnPart).toHaveBeenCalledWith({ text: '**Step**\nreasoning' }, { source: 'third-party' });
    wrappedOnThoughtChunk('reasoning');
    expect(onThoughtChunk).toHaveBeenCalledWith('reasoning', { source: 'third-party' });

    unmount();
  });

  it('routes a third-party session through its own provider when the global mode is Gemini', async () => {
    const getStreamHandlers = vi.fn(() => ({
      streamOnError: vi.fn(),
      streamOnComplete: vi.fn(),
      streamOnPart: vi.fn(),
      onThoughtChunk: vi.fn(),
    }));

    const { result, unmount } = renderStandardChat({
      appSettings: {
        thirdPartyApi: {
          connections: [
            createThirdPartyConnection({ id: 'openai', apiKey: 'openai-key', enabled: true }),
            createThirdPartyConnection({
              id: 'kimi',
              templateId: 'kimi',
              apiKey: 'kimi-key',
              enabled: true,
              modelId: 'kimi-k3-turbo',
              models: [{ id: 'kimi-k3-turbo', name: 'Kimi K3 Turbo', isPinned: true }],
            }),
          ],
        },
      },
      currentChatSettings: {
        modelId: 'kimi-k3-turbo',
        providerId: 'kimi',
      },
      getStreamHandlers,
    });

    await act(async () => {
      await result.current.sendStandardMessage({
        text: 'hello through kimi',
        files: [],
        editingMessageId: null,
        activeModelId: 'kimi-k3-turbo',
        request: createPreparedRequest(),
      });
    });

    expect(mockSendMessageStream).not.toHaveBeenCalled();
    expect(mockSendOpenAICompatibleMessageStream).toHaveBeenCalledWith(
      'api-key',
      'kimi-k3-turbo',
      [],
      [{ text: 'analyze the csv' }],
      expect.objectContaining({ baseUrl: 'https://api.moonshot.ai/v1' }),
      expect.any(AbortSignal),
      expect.any(Function),
      expect.any(Function),
      expect.any(Function),
      expect.any(Function),
      'user',
      'kimi',
    );

    unmount();
  });

  it('routes non-stream OpenAI-compatible chat with the active provider model id', async () => {
    const streamOnError = vi.fn();
    const streamOnComplete = vi.fn();
    const streamOnPart = vi.fn();
    const onThoughtChunk = vi.fn();
    const getStreamHandlers = vi.fn(() => ({
      streamOnError,
      streamOnComplete,
      streamOnPart,
      onThoughtChunk,
    }));

    const { result, unmount } = renderStandardChat({
      appSettings: {
        apiKey: 'gemini-key',
        isStreamingEnabled: false,
        thirdPartyApi: {
          connections: [
            createThirdPartyConnection({
              id: 'openai',
              apiKey: 'openai-key',
              baseUrl: 'https://api.openai.com/v1',
              modelId: 'gpt-4.1-custom',
              models: [{ id: 'gpt-4.1-custom', name: 'GPT-4.1 Custom', isPinned: true }],
            }),
          ],
        },
      },
      currentChatSettings: {
        modelId: 'gpt-5.6-sol',
        providerId: 'openai',
        isGoogleSearchEnabled: true,
        isCodeExecutionEnabled: true,
        isLocalPythonEnabled: true,
        isUrlContextEnabled: true,
        isDeepSearchEnabled: true,
      },
      getStreamHandlers,
    });

    await act(async () => {
      await result.current.sendStandardMessage({
        text: 'hello through compat',
        files: [],
        editingMessageId: null,
        activeModelId: 'gpt-5.6-sol',
        request: createPreparedRequest(),
      });
    });

    expect(mockBuildGenerationConfig).not.toHaveBeenCalled();
    expect(mockSendMessageNonStream).not.toHaveBeenCalled();
    expect(mockSendOpenAICompatibleMessageNonStream).toHaveBeenCalledWith(
      'api-key',
      'gpt-5.6-sol',
      [],
      [{ text: 'analyze the csv' }],
      expect.objectContaining({
        baseUrl: 'https://api.openai.com/v1',
        systemInstruction: 'Custom system instruction',
        temperature: 1,
        topP: 0.95,
        thinkingLevel: 'LOW',
      }),
      expect.any(AbortSignal),
      streamOnError,
      expect.any(Function),
      'user',
      'openai',
    );

    unmount();
  });

  it('uses Gemini chat routing when OpenAI-compatible mode is stored but the provider switch is off', async () => {
    const { result, unmount } = renderStandardChat({
      appSettings: {
        apiKey: 'gemini-key',
        thirdPartyApi: {
          connections: [
            createThirdPartyConnection({
              id: 'openai',
              apiKey: 'openai-key',
              enabled: false,
            }),
          ],
        },
      },
    });

    await act(async () => {
      await result.current.sendStandardMessage({
        text: 'hello through gemini',
        files: [],
        editingMessageId: null,
        activeModelId: 'gemini-3-flash-preview',
        request: createPreparedRequest(),
      });
    });

    expect(mockSendOpenAICompatibleMessageStream).not.toHaveBeenCalled();
    expect(mockSendMessageStream).toHaveBeenCalled();
    expect(mockBuildGenerationConfig).toHaveBeenCalledWith(
      expect.objectContaining({
        modelId: 'gemini-3-flash-preview',
      }),
    );

    unmount();
  });

  it('does not expose local python tools on image-generation models', async () => {
    const getStreamHandlers = vi.fn(() => ({
      streamOnError: vi.fn(),
      streamOnComplete: vi.fn(),
      streamOnPart: vi.fn(),
      onThoughtChunk: vi.fn(),
    }));

    const { result, unmount } = renderStandardChat({
      currentChatSettings: {
        modelId: 'gemini-3-pro-image-preview',
        isLocalPythonEnabled: true,
      },
      getStreamHandlers,
    });

    await act(async () => {
      await result.current.sendStandardMessage({
        text: 'make it cinematic',
        files: [],
        editingMessageId: null,
        activeModelId: 'gemini-3-pro-image-preview',
        request: createPreparedRequest(),
      });
    });

    expect(mockCreateStandardClientFunctions).toHaveBeenCalledWith(
      expect.objectContaining({
        isLocalPythonEnabled: false,
      }),
    );
    expect(mockAppendFunctionDeclarationsToTools).toHaveBeenCalledWith(
      'gemini-3-pro-image-preview',
      expect.any(Object),
      [],
    );

    unmount();
  });

  it('falls back to the normal send path when custom declarations were stripped from the final request', async () => {
    const streamOnError = vi.fn();
    const streamOnComplete = vi.fn();
    const streamOnPart = vi.fn();
    const onThoughtChunk = vi.fn();
    const getStreamHandlers = vi.fn(() => ({
      streamOnError,
      streamOnComplete,
      streamOnPart,
      onThoughtChunk,
    }));

    mockBuildGenerationConfig.mockResolvedValue({
      systemInstruction: 'base config',
      tools: [{ googleSearch: {} }],
    });
    mockAppendFunctionDeclarationsToTools.mockReturnValue({
      systemInstruction: 'base config',
      tools: [{ googleSearch: {} }],
    });

    const { result, unmount } = renderStandardChat({
      currentChatSettings: {
        modelId: 'gemini-2.5-flash',
        isGoogleSearchEnabled: true,
        isLocalPythonEnabled: true,
      },
      getStreamHandlers,
    });

    await act(async () => {
      await result.current.sendStandardMessage({
        text: 'analyze the csv',
        files: [],
        editingMessageId: null,
        activeModelId: 'gemini-2.5-flash',
        request: createPreparedRequest(),
      });
    });

    expect(mockBuildGenerationConfig).toHaveBeenCalledWith(
      expect.objectContaining({
        modelId: 'gemini-2.5-flash',
        settings: expect.objectContaining({
          modelId: 'gemini-2.5-flash',
          systemInstruction: 'Custom system instruction',
          showThoughts: true,
          thinkingBudget: 0,
          isGoogleSearchEnabled: true,
          isCodeExecutionEnabled: false,
          isUrlContextEnabled: false,
          thinkingLevel: 'LOW',
          isDeepSearchEnabled: false,
          safetySettings: [],
          mediaResolution: 'MEDIA_RESOLUTION_UNSPECIFIED',
          isLocalPythonEnabled: true,
        }),
        aspectRatio: '1:1',
        imageSize: '1K',
        isLocalPythonEnabled: false,
        imageOutputMode: 'IMAGE_TEXT',
      }),
    );
    expect(mockRunStandardToolLoop).not.toHaveBeenCalled();
    expect(mockSendMessageStream).toHaveBeenCalledOnce();

    unmount();
  });

  it('forwards url context metadata to the completion handler on non-stream standard requests', async () => {
    const streamOnError = vi.fn();
    const streamOnComplete = vi.fn();
    const streamOnPart = vi.fn();
    const onThoughtChunk = vi.fn();
    const getStreamHandlers = vi.fn(() => ({
      streamOnError,
      streamOnComplete,
      streamOnPart,
      onThoughtChunk,
    }));

    mockCreateStandardClientFunctions.mockReturnValue({});
    mockSendMessageNonStream.mockImplementation(
      async (_apiKey, _modelId, _history, _parts, _config, _signal, _onError, onComplete) => {
        onComplete(
          [{ text: 'done' }],
          undefined,
          { totalTokenCount: 7 },
          { citations: [{ uri: 'https://example.com/grounding' }] },
          { visitedUrls: ['https://example.com/article'] },
        );
      },
    );

    const { result, unmount } = renderStandardChat({
      appSettings: {
        isStreamingEnabled: false,
      },
      currentChatSettings: {
        modelId: 'gemini-2.5-flash',
        isUrlContextEnabled: true,
      },
      getStreamHandlers,
    });

    await act(async () => {
      await result.current.sendStandardMessage({
        text: 'summarize this url',
        files: [],
        editingMessageId: null,
        activeModelId: 'gemini-2.5-flash',
        request: createPreparedRequest(),
      });
    });

    expect(streamOnComplete).toHaveBeenCalledWith(
      { totalTokenCount: 7 },
      { citations: [{ uri: 'https://example.com/grounding' }] },
      { visitedUrls: ['https://example.com/article'] },
    );

    unmount();
  });

  it('sends raw reasoning non-stream turns as model-prefill continuations', async () => {
    const streamOnError = vi.fn();
    const streamOnComplete = vi.fn();
    const streamOnPart = vi.fn();
    const onThoughtChunk = vi.fn();
    const getStreamHandlers = vi.fn(() => ({
      streamOnError,
      streamOnComplete,
      streamOnPart,
      onThoughtChunk,
    }));

    mockModelCapabilities.mockImplementation((id: string) => ({
      isGemini3: id.includes('gemini-3'),
      supportsRawReasoningPrefill: id === 'gemini-3-flash-preview',
    }));
    mockCreateStandardClientFunctions.mockReturnValue({});
    mockSendMessageNonStream.mockImplementation(
      async (_apiKey, _modelId, _history, _parts, _config, _signal, _onError, onComplete) => {
        onComplete([{ text: 'raw answer' }]);
      },
    );

    const { result, unmount } = renderStandardChat({
      appSettings: {
        isRawModeEnabled: true,
        isStreamingEnabled: false,
      },
      currentChatSettings: {
        isRawModeEnabled: true,
      },
      getStreamHandlers,
    });

    await act(async () => {
      await result.current.sendStandardMessage({
        text: 'show raw reasoning',
        files: [],
        editingMessageId: null,
        activeModelId: 'gemini-3-flash-preview',
        request: createPreparedRequest(),
      });
    });

    expect(mockCreateChatHistoryForApi).toHaveBeenCalledWith(
      [
        expect.objectContaining({
          id: 'temp-raw-user',
          role: 'user',
          content: 'show raw reasoning',
        }),
      ],
      false,
      'gemini-3-flash-preview',
      false,
      false,
    );
    expect(mockSendMessageNonStream).toHaveBeenCalledWith(
      'api-key',
      'gemini-3-flash-preview',
      [],
      [{ text: '<thinking>' }],
      expect.any(Object),
      expect.any(AbortSignal),
      expect.any(Function),
      expect.any(Function),
      'model',
    );

    unmount();
  });

  it('keeps local python generated files on the final visible message when the tool loop completes', async () => {
    const streamOnError = vi.fn();
    const streamOnComplete = vi.fn();
    const streamOnPart = vi.fn();
    const onThoughtChunk = vi.fn();
    const updateAndPersistSessions = vi.fn();
    const generatedFile = {
      id: 'plot-file',
      name: 'generated-plot.png',
      type: 'image/png',
      size: 12,
      dataUrl: 'blob:plot',
      uploadState: 'active' as const,
    };
    const getStreamHandlers = vi.fn(() => ({
      streamOnError,
      streamOnComplete,
      streamOnPart,
      onThoughtChunk,
    }));

    mockBuildGenerationConfig.mockResolvedValue({ systemInstruction: 'base config' });
    mockAppendFunctionDeclarationsToTools.mockImplementation((_modelId, config, declarations) => ({
      ...config,
      tools: [{ functionDeclarations: declarations }],
    }));
    mockRunStandardToolLoop.mockResolvedValue({
      finalTurn: {
        parts: [{ text: '已生成图片。' }],
        thoughts: undefined,
        usage: undefined,
        grounding: undefined,
        urlContext: undefined,
      },
      toolMessages: [],
      generatedFiles: [generatedFile],
    });

    const { result, unmount } = renderStandardChat({
      currentChatSettings: {
        isLocalPythonEnabled: true,
      },
      updateAndPersistSessions,
      getStreamHandlers,
    });

    await act(async () => {
      await result.current.sendStandardMessage({
        text: '用 Python 画图',
        files: [],
        editingMessageId: null,
        activeModelId: 'gemini-3-flash-preview',
        request: createPreparedRequest(),
      });
    });

    expect(streamOnComplete).toHaveBeenCalledWith(undefined, undefined, undefined, [generatedFile]);

    unmount();
  });

  it('adds enabled MCP server tools to the standard Gemini tool loop', async () => {
    const getStreamHandlers = vi.fn(() => ({
      streamOnError: vi.fn(),
      streamOnComplete: vi.fn(),
      streamOnPart: vi.fn(),
      onThoughtChunk: vi.fn(),
    }));
    const mcpServer = {
      id: 'filesystem',
      name: 'Filesystem',
      enabled: true,
      transport: 'stdio' as const,
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-filesystem', '/tmp'],
    };
    const mcpHandler = vi.fn();
    const mcpFunction = {
      declaration: {
        name: 'mcp_filesystem_read_file',
        description: 'Read a file.',
      },
      handler: mcpHandler,
    };

    mockCreateMcpClientFunctions.mockResolvedValue({
      mcp_filesystem_read_file: mcpFunction,
    });
    mockAppendFunctionDeclarationsToTools.mockImplementation((_modelId, config, declarations) => ({
      ...config,
      tools: [{ functionDeclarations: declarations }],
    }));

    const { result, unmount } = renderStandardChat({
      appSettings: {
        mcpServers: [mcpServer],
      },
      getStreamHandlers,
    });

    await act(async () => {
      await result.current.sendStandardMessage({
        text: 'read a file through MCP',
        files: [],
        editingMessageId: null,
        activeModelId: 'gemini-3-flash-preview',
        request: createPreparedRequest(),
      });
    });

    expect(mockCreateMcpClientFunctions).toHaveBeenCalledWith({
      servers: [mcpServer],
      abortSignal: expect.any(AbortSignal),
      requestApproval: expect.any(Function),
      resolveLatestServers: expect.any(Function),
    });
    expect(mockAppendFunctionDeclarationsToTools).toHaveBeenCalledWith('gemini-3-flash-preview', expect.any(Object), [
      mcpFunction.declaration,
    ]);
    expect(mockRunStandardToolLoop).toHaveBeenCalledWith(
      expect.objectContaining({
        clientFunctions: {
          mcp_filesystem_read_file: mcpFunction,
        },
      }),
    );

    unmount();
  });

  it('passes the prepared abort signal into the standard tool loop', async () => {
    const getStreamHandlers = vi.fn(() => ({
      streamOnError: vi.fn(),
      streamOnComplete: vi.fn(),
      streamOnPart: vi.fn(),
      onThoughtChunk: vi.fn(),
    }));
    const preparedRequest = createPreparedRequest();

    mockBuildGenerationConfig.mockResolvedValue({ systemInstruction: 'base config' });
    mockAppendFunctionDeclarationsToTools.mockImplementation((_modelId, config, declarations) => ({
      ...config,
      tools: [{ functionDeclarations: declarations }],
    }));

    const { result, unmount } = renderStandardChat({
      currentChatSettings: {
        isLocalPythonEnabled: true,
      },
      getStreamHandlers,
    });

    await act(async () => {
      await result.current.sendStandardMessage({
        text: '用 Python 算一下',
        files: [],
        editingMessageId: null,
        activeModelId: 'gemini-3-flash-preview',
        request: preparedRequest,
      });
    });

    expect(mockRunStandardToolLoop).toHaveBeenCalledWith(
      expect.objectContaining({
        abortSignal: preparedRequest.abortController.signal,
      }),
    );

    unmount();
  });

  it('routes thrown standard stream errors through the stream error handler', async () => {
    const streamOnError = vi.fn();
    const streamOnComplete = vi.fn();
    const streamOnPart = vi.fn();
    const onThoughtChunk = vi.fn();
    const thrownError = new Error('network broke');
    const getStreamHandlers = vi.fn(() => ({
      streamOnError,
      streamOnComplete,
      streamOnPart,
      onThoughtChunk,
    }));

    mockSendMessageStream.mockRejectedValue(thrownError);

    const { result, unmount } = renderStandardChat({
      getStreamHandlers,
    });

    await act(async () => {
      await result.current.sendStandardMessage({
        text: 'hello',
        files: [],
        editingMessageId: null,
        activeModelId: 'gemini-3-flash-preview',
        request: createPreparedRequest(),
      });
    });

    expect(streamOnError).toHaveBeenCalledWith(thrownError);
    expect(streamOnComplete).not.toHaveBeenCalled();

    unmount();
  });
});
