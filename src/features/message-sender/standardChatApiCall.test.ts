import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_APP_SETTINGS, DEFAULT_CHAT_SETTINGS } from '@/constants/settingsDefaults';
import type { ContentPart } from '@/types';
import { performStandardChatApiCall } from './standardChatApiCall';

const mocks = vi.hoisted(() => ({
  resolveChatApiRoute: vi.fn(),
  isGeminiProxyRelativePath: vi.fn(),
  createChatHistoryForApi: vi.fn(),
  buildGenerationConfig: vi.fn(),
  appendFunctionDeclarationsToTools: vi.fn(),
  generateContentTurnApi: vi.fn(),
  sendStatelessMessageNonStreamApi: vi.fn(),
  sendStatelessMessageStreamApi: vi.fn(),
  sendOpenAICompatibleMessageNonStream: vi.fn(),
  sendOpenAICompatibleMessageStream: vi.fn(),
  sendAnthropicMessageNonStream: vi.fn(),
  sendAnthropicMessageStream: vi.fn(),
  createMcpClientFunctions: vi.fn(),
  createStandardClientFunctions: vi.fn(),
  runStandardToolLoop: vi.fn(),
  recordPendingStreamJob: vi.fn(),
  advancePendingStreamJobSeq: vi.fn(),
  clearPendingStreamJob: vi.fn(),
  ensureHistoryFilesApiReferences: vi.fn(),
  getGeminiKeyForRequest: vi.fn(),
  useChatStoreGetState: vi.fn(),
}));

vi.mock('@/stores/chatStore', () => ({
  useChatStore: {
    getState: mocks.useChatStoreGetState,
  },
}));
vi.mock('./fileApiReference', () => ({
  ensureHistoryFilesApiReferences: mocks.ensureHistoryFilesApiReferences,
}));
vi.mock('@/utils/apiKeySelection', () => ({
  getGeminiKeyForRequest: mocks.getGeminiKeyForRequest,
}));
vi.mock('@/utils/chatApiRoute', () => ({
  resolveChatApiRoute: mocks.resolveChatApiRoute,
  isUnavailableThirdPartyRoute: (route: { unavailable?: string }) => route.unavailable !== undefined,
}));
vi.mock('@/services/api/geminiApiBaseUrl', () => ({ isGeminiProxyRelativePath: mocks.isGeminiProxyRelativePath }));
vi.mock('@/utils/chat/builder', () => ({ createChatHistoryForApi: mocks.createChatHistoryForApi }));
vi.mock('@/services/api/generationConfig', () => ({
  buildGenerationConfig: mocks.buildGenerationConfig,
  appendFunctionDeclarationsToTools: mocks.appendFunctionDeclarationsToTools,
}));
vi.mock('@/services/api/chatApi', () => ({
  generateContentTurnApi: mocks.generateContentTurnApi,
  sendStatelessMessageNonStreamApi: mocks.sendStatelessMessageNonStreamApi,
  sendStatelessMessageStreamApi: mocks.sendStatelessMessageStreamApi,
}));
vi.mock('@/services/api/openaiCompatibleApi', () => ({
  sendOpenAICompatibleMessageNonStream: mocks.sendOpenAICompatibleMessageNonStream,
  sendOpenAICompatibleMessageStream: mocks.sendOpenAICompatibleMessageStream,
}));
vi.mock('@/services/api/anthropicApi', () => ({
  sendAnthropicMessageNonStream: mocks.sendAnthropicMessageNonStream,
  sendAnthropicMessageStream: mocks.sendAnthropicMessageStream,
}));
vi.mock('@/features/mcp/mcpClientFunctions', () => ({ createMcpClientFunctions: mocks.createMcpClientFunctions }));
vi.mock('@/features/standard-chat/standardClientFunctions', () => ({
  createStandardClientFunctions: mocks.createStandardClientFunctions,
}));
vi.mock('@/features/standard-chat/standardToolLoop', () => ({ runStandardToolLoop: mocks.runStandardToolLoop }));
vi.mock('@/features/stream-jobs/amcStreamJobs', () => ({
  recordPendingStreamJob: mocks.recordPendingStreamJob,
  advancePendingStreamJobSeq: mocks.advancePendingStreamJobSeq,
  clearPendingStreamJob: mocks.clearPendingStreamJob,
  generateJobSecret: () => 'mock-job-secret',
}));

describe('performStandardChatApiCall', () => {
  let handlers: {
    streamOnError: ReturnType<typeof vi.fn>;
    streamOnComplete: ReturnType<typeof vi.fn>;
    streamOnPart: ReturnType<typeof vi.fn>;
    onThoughtChunk: ReturnType<typeof vi.fn>;
  };

  const baseParams = (overrides: Record<string, unknown> = {}) => ({
    appSettings: DEFAULT_APP_SETTINGS,
    messages: [],
    updateAndPersistSessions: vi.fn(),
    getStreamHandlers: () => handlers,
    aspectRatio: '1:1',
    imageOutputMode: 'IMAGE_TEXT' as const,
    resolveTurn: () => ({
      baseMessagesForApi: [],
      finalRole: 'user' as const,
      finalParts: [{ text: 'hi' }] as ContentPart[],
      shouldSkipApiCall: false,
    }),
    finalSessionId: 'session-1',
    generationId: 'generation-1',
    generationStartTime: new Date(),
    keyToUse: 'test-key',
    activeModelId: 'gemini-2.5-flash',
    promptParts: [],
    effectiveEditingId: null,
    isContinueMode: false,
    isRawMode: false,
    sessionToUpdate: { ...DEFAULT_CHAT_SETTINGS },
    newAbortController: new AbortController(),
    textToUse: 'hi',
    enrichedFiles: [],
    ...overrides,
  });

  beforeEach(() => {
    vi.clearAllMocks();
    handlers = {
      streamOnError: vi.fn(),
      streamOnComplete: vi.fn(),
      streamOnPart: vi.fn(),
      onThoughtChunk: vi.fn(),
    };
    mocks.resolveChatApiRoute.mockReturnValue({ provider: null, modelId: '' });
    mocks.createChatHistoryForApi.mockResolvedValue([]);
    mocks.buildGenerationConfig.mockResolvedValue({});
    mocks.appendFunctionDeclarationsToTools.mockImplementation(
      (_modelId: string, config: unknown, declarations: Array<{ name: string }>) =>
        declarations.length > 0 ? { ...(config as object), tools: [{ functionDeclarations: declarations }] } : config,
    );
    mocks.createStandardClientFunctions.mockReturnValue({});
    mocks.createMcpClientFunctions.mockResolvedValue({});
    mocks.isGeminiProxyRelativePath.mockReturnValue(false);
    mocks.ensureHistoryFilesApiReferences.mockResolvedValue({
      ok: true,
      changed: false,
      messages: [],
    });
    mocks.getGeminiKeyForRequest.mockReturnValue({ key: 'test-key' });
    mocks.useChatStoreGetState.mockReturnValue({
      savedSessions: [],
    });
  });

  it('skips every API call when the resolved turn says to skip', async () => {
    await performStandardChatApiCall(
      baseParams({
        resolveTurn: () => ({
          baseMessagesForApi: [],
          finalRole: 'user' as const,
          finalParts: [],
          shouldSkipApiCall: true,
        }),
      }) as never,
    );

    expect(mocks.sendStatelessMessageStreamApi).not.toHaveBeenCalled();
    expect(mocks.sendStatelessMessageNonStreamApi).not.toHaveBeenCalled();
    expect(mocks.sendOpenAICompatibleMessageStream).not.toHaveBeenCalled();
    expect(mocks.sendAnthropicMessageStream).not.toHaveBeenCalled();
  });

  it('routes a streaming third-party turn to the provider stream and tags thought provenance', async () => {
    mocks.resolveChatApiRoute.mockReturnValue({
      provider: {
        protocol: 'anthropic',
        baseUrl: 'https://api.anthropic.com',
        templateId: 'anthropic',
        extraHeaders: {},
      },
      providerId: 'anthropic',
      modelId: 'claude-x',
    });

    await performStandardChatApiCall(baseParams() as never);

    expect(mocks.sendAnthropicMessageStream).toHaveBeenCalledTimes(1);
    expect(mocks.sendOpenAICompatibleMessageStream).not.toHaveBeenCalled();
    expect(mocks.sendStatelessMessageStreamApi).not.toHaveBeenCalled();

    // Thought/part callbacks are wrapped so chunks carry third-party provenance.
    const onThought = mocks.sendAnthropicMessageStream.mock.calls[0][7];
    onThought('thinking…');
    expect(handlers.onThoughtChunk).toHaveBeenCalledWith('thinking…', { source: 'third-party' });
  });

  it('routes a non-streaming third-party turn to the non-stream client and routes thrown errors to streamOnError', async () => {
    mocks.resolveChatApiRoute.mockReturnValue({
      provider: {
        protocol: 'openai-compatible',
        baseUrl: 'https://api.openai.com',
        templateId: 'openai',
        extraHeaders: {},
      },
      providerId: 'openai',
      modelId: 'gpt-x',
    });
    mocks.sendOpenAICompatibleMessageNonStream.mockRejectedValue(new Error('upstream down'));

    const params = baseParams({ appSettings: { ...DEFAULT_APP_SETTINGS, isStreamingEnabled: false } });
    await performStandardChatApiCall(params as never);

    expect(mocks.sendOpenAICompatibleMessageNonStream).toHaveBeenCalledTimes(1);
    expect(handlers.streamOnError).toHaveBeenCalledTimes(1);
    expect((handlers.streamOnError.mock.calls[0][0] as Error).message).toBe('upstream down');
  });

  it('runs the tool loop, injects internal tool messages, and replays the final turn', async () => {
    mocks.createMcpClientFunctions.mockResolvedValue({
      mcpTool: { declaration: { name: 'mcpTool' }, handler: vi.fn() },
    });
    const updateAndPersistSessions = vi.fn();
    // Mirror the real loop: internal messages are surfaced incrementally via
    // the live callbacks as each iteration's calls start and settle.
    mocks.runStandardToolLoop.mockImplementation(async ({ onToolCallsStarted, onToolResponsesSettled }) => {
      const modelContent = { role: 'model', parts: [{ text: 'calling tool' }] };
      const functionResponseParts = [{ functionResponse: { name: 'mcpTool', response: {} } }];
      onToolCallsStarted?.(modelContent);
      onToolResponsesSettled?.(functionResponseParts);
      return {
        toolMessages: [{ modelContent, functionResponseParts }],
        finalTurn: {
          parts: [{ text: 'final answer' }],
          thoughts: 'reasoning',
          usage: { totalTokenCount: 5 },
          grounding: undefined,
          urlContext: undefined,
        },
      };
    });

    await performStandardChatApiCall(
      baseParams({
        updateAndPersistSessions,
        appSettings: {
          ...DEFAULT_APP_SETTINGS,
          mcpServers: [{ id: 'm1', name: 'M1', enabled: true, transport: 'stdio', command: 'npx' }],
        },
      }) as never,
    );

    expect(mocks.runStandardToolLoop).toHaveBeenCalledTimes(1);
    // One insert per callback: the model message when calls start, the user
    // message when responses settle.
    expect(updateAndPersistSessions).toHaveBeenCalledTimes(2);
    expect(handlers.streamOnPart).toHaveBeenCalledWith({ text: 'final answer' }, { recordFirstToken: false });
    expect(handlers.onThoughtChunk).toHaveBeenCalledWith('reasoning', { recordFirstToken: false });
    expect(handlers.streamOnComplete).toHaveBeenCalledWith({ totalTokenCount: 5 }, undefined, undefined, undefined);
  });

  it('journals a fresh Gemini user stream through the relative proxy path and clears it on completion', async () => {
    mocks.isGeminiProxyRelativePath.mockReturnValue(true);
    mocks.sendStatelessMessageStreamApi.mockImplementation(
      async (_key, _model, _history, _parts, _config, _signal, _onPart, _onThought, _onError, onComplete) => {
        onComplete();
      },
    );

    await performStandardChatApiCall(baseParams() as never);

    expect(mocks.recordPendingStreamJob).toHaveBeenCalledWith({
      sessionId: 'session-1',
      generationId: 'generation-1',
      jobId: 'generation-1',
      secret: 'mock-job-secret',
      startedAt: expect.any(Number),
    });
    const streamResume = mocks.sendStatelessMessageStreamApi.mock.calls[0][12];
    expect(streamResume).toEqual({
      jobId: 'generation-1',
      jobSecret: 'mock-job-secret',
      lastSeq: 0,
      onSeq: expect.any(Function),
    });
    expect(mocks.clearPendingStreamJob).toHaveBeenCalledWith('session-1');
  });

  it('replays non-stream Gemini completion parts through the stream handlers', async () => {
    mocks.sendStatelessMessageNonStreamApi.mockImplementation(
      async (_key, _model, _history, _parts, _config, _signal, _onError, onComplete) => {
        onComplete([{ text: 'answer' }], 'thoughts', { totalTokenCount: 3 });
      },
    );

    const params = baseParams({ appSettings: { ...DEFAULT_APP_SETTINGS, isStreamingEnabled: false } });
    await performStandardChatApiCall(params as never);

    expect(mocks.sendStatelessMessageNonStreamApi).toHaveBeenCalledTimes(1);
    expect(handlers.streamOnPart).toHaveBeenCalledWith(
      { text: 'answer' },
      { recordFirstToken: false, source: 'gemini' },
    );
    expect(handlers.onThoughtChunk).toHaveBeenCalledWith('thoughts', { recordFirstToken: false, source: 'gemini' });
    expect(handlers.streamOnComplete).toHaveBeenCalledWith({ totalTokenCount: 3 }, undefined, undefined);
  });

  it('silently auto-retries when Files API permission denied error is encountered', async () => {
    let callCount = 0;
    mocks.sendStatelessMessageStreamApi.mockImplementation(
      async (_key, _model, _history, _parts, _config, _signal, _part, _thought, onError, onComplete) => {
        callCount += 1;
        if (callCount === 1) {
          onError(
            new Error(
              'upstream 403: Google API returned error: 403 PERMISSION_DENIED {"error":{"message":"You do not have permission to access the File 5aa5e27996bcaf1603af49ec6d30f7c40bac24ab"}}',
            ),
          );
        } else {
          onComplete();
        }
      },
    );

    mocks.useChatStoreGetState.mockReturnValue({
      savedSessions: [
        {
          id: 'session-1',
          settings: {},
          messages: [
            {
              id: 'm1',
              role: 'user',
              files: [{ id: 'f1', fileApiName: 'files/5aa5e27996bcaf1603af49ec6d30f7c40bac24ab' }],
            },
          ],
        },
      ],
    });

    mocks.ensureHistoryFilesApiReferences.mockResolvedValue({
      ok: true,
      changed: true,
      messages: [
        {
          id: 'm1',
          role: 'user',
          files: [{ id: 'f1', fileApiName: 'files/new-file-id' }],
        },
      ],
    });

    const params = baseParams();
    await performStandardChatApiCall(params as never);

    expect(callCount).toBe(2);
    expect(mocks.ensureHistoryFilesApiReferences).toHaveBeenCalledTimes(1);
    expect(handlers.streamOnError).not.toHaveBeenCalled();
    expect(handlers.streamOnComplete).toHaveBeenCalledTimes(1);
  });
});
