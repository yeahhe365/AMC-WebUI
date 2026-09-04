import { renderHookWithProviders } from '@/test/render/providerRenderer';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  handleApiErrorMock,
  updateMessageInSessionMock,
  updateSessionByIdMock,
  finalizeMessagesMock,
  finishActiveGenerationJobMock,
  clearOwnedPendingStreamJobMock,
  logWarnMock,
  streamingStoreMock,
} = vi.hoisted(() => ({
  handleApiErrorMock: vi.fn(),
  updateMessageInSessionMock: vi.fn(),
  updateSessionByIdMock: vi.fn(),
  finalizeMessagesMock: vi.fn(),
  finishActiveGenerationJobMock: vi.fn(),
  clearOwnedPendingStreamJobMock: vi.fn(),
  logWarnMock: vi.fn(),
  streamingStoreMock: { updateContent: vi.fn(), updateThoughts: vi.fn(), clear: vi.fn() },
}));

vi.mock('./useApiErrorHandler', () => ({
  useApiErrorHandler: () => ({ handleApiError: handleApiErrorMock }),
}));

vi.mock('@/utils/chat/sessionMutations', () => ({
  updateMessageInSession: updateMessageInSessionMock,
  updateSessionById: updateSessionByIdMock,
}));

vi.mock('@/features/chat-streaming/processors', () => ({
  finalizeMessages: finalizeMessagesMock,
}));

vi.mock('./activeGenerationJobs', () => ({
  finishActiveGenerationJob: finishActiveGenerationJobMock,
}));

vi.mock('@/features/stream-jobs/amcStreamJobs', () => ({
  clearOwnedPendingStreamJob: clearOwnedPendingStreamJobMock,
}));

vi.mock('@/services/logService', async () => {
  const { createLogServiceMockModule } = await import('@/test/doubles/moduleMocks');
  return createLogServiceMockModule({ warn: logWarnMock });
});

vi.mock('@/stores/streamingStore', () => ({
  streamingStore: streamingStoreMock,
}));

vi.mock('@/utils/model/modelUsageStats', () => ({
  calculateTokenStats: vi.fn(() => ({})),
}));

vi.mock('@/utils/usagePricingTelemetry', () => ({
  buildExactPricingFromUsageMetadata: vi.fn(() => ({})),
}));

vi.mock('@/utils/chatPricingEvidence', () => ({
  resolveChatExactPricing: vi.fn(() => ({})),
}));

vi.mock('@/i18n/translations', async () => {
  const actual = await vi.importActual<typeof import('@/i18n/translations')>('@/i18n/translations');
  return actual;
});

vi.mock('./completionFeedback', () => ({
  emitCompletionFeedback: vi.fn(),
  buildCompletionNotificationBody: vi.fn(() => ({})),
}));

vi.mock('@/utils/deferToNextTick', () => ({
  deferToNextTick: vi.fn((cb: () => void) => cb()),
}));

import { useChatStreamHandler } from './useChatStreamHandler';
import { DEFAULT_APP_SETTINGS } from '@/constants/settingsDefaults';

describe('useChatStreamHandler empty-reply guard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    finalizeMessagesMock.mockImplementation(({ messages }) => ({ updatedMessages: messages }));
  });

  const renderHandler = () =>
    renderHookWithProviders(() =>
      useChatStreamHandler({
        appSettings: { ...DEFAULT_APP_SETTINGS, language: 'zh' },
        updateAndPersistSessions: vi.fn(),
        setSessionLoading: vi.fn(),
        activeJobs: { current: new Map() },
      }),
    );

  const getHandlers = () => {
    const { result } = renderHandler();
    return result.current.getStreamHandlers('session-1', 'generation-1', new AbortController(), new Date(), {
      modelId: 'gemini-3.6-flash',
      temperature: 1,
      topP: 0.95,
      thinkingLevel: 'HIGH',
      thinkingBudget: -1,
    } as never);
  };

  it('routes an empty reply (only thoughts, no content) through the error path', () => {
    const { streamOnComplete, onThoughtChunk } = getHandlers();

    // Simulate a stream that only produced thoughts, no content part.
    onThoughtChunk('Analyzing the query...');
    streamOnComplete(undefined, undefined, undefined, undefined);

    expect(handleApiErrorMock).toHaveBeenCalledTimes(1);
    const [error] = handleApiErrorMock.mock.calls[0];
    expect(error.name).toBe('EmptyReplyError');
    expect(error.message).toBe(
      '模型结束了这一轮，但没有给出可见回复（只有思考过程）。可以重试，或调低思考等级后再试。',
    );
    expect(finishActiveGenerationJobMock).toHaveBeenCalled();
    expect(logWarnMock).toHaveBeenCalledWith(expect.stringContaining('Empty reply detected'));
  });

  it('does not claim reasoning was produced when the empty reply had no thoughts', () => {
    const { streamOnComplete } = getHandlers();

    streamOnComplete(undefined, undefined, undefined, undefined);

    expect(handleApiErrorMock).toHaveBeenCalledTimes(1);
    const [error] = handleApiErrorMock.mock.calls[0];
    expect(error.name).toBe('EmptyReplyError');
    expect(error.message).toBe('模型结束了这一轮，但没有给出可见回复。请重试。');
  });

  it('does not treat an empty reply as an error when a meaningful part was received', () => {
    const { streamOnComplete, streamOnPart } = getHandlers();

    streamOnPart({ text: 'Hello from the model' });
    streamOnComplete(undefined, undefined, undefined, undefined);

    expect(handleApiErrorMock).not.toHaveBeenCalled();
  });

  it('does not route aborted streams through the empty-reply error path', () => {
    const controller = new AbortController();
    const { result } = renderHandler();
    const handlers = result.current.getStreamHandlers('session-1', 'generation-1', controller, new Date(), {
      modelId: 'gemini-3.6-flash',
    } as never);

    controller.abort();
    handlers.streamOnComplete(undefined, undefined, undefined, undefined);

    expect(handleApiErrorMock).not.toHaveBeenCalled();
  });
});

describe('useChatStreamHandler thinking-end sync', () => {
  let realUpdateMessageInSession: (typeof import('@/utils/chat/sessionMutations'))['updateMessageInSession'];

  beforeEach(async () => {
    vi.clearAllMocks();
    finalizeMessagesMock.mockImplementation(({ messages }) => ({ updatedMessages: messages }));
    realUpdateMessageInSession = (
      await vi.importActual<typeof import('@/utils/chat/sessionMutations')>('@/utils/chat/sessionMutations')
    ).updateMessageInSession;
    // syncFirstTokenTime / syncThinkingEnd call the real updateMessageInSession
    // shape; give the module alias a real implementation so patches actually
    // reach the sessions array and can be asserted.
    updateMessageInSessionMock.mockImplementation((sessions, sessionId, messageId, updater) =>
      realUpdateMessageInSession(sessions, sessionId, messageId, updater),
    );
  });

  const renderHandlers = (
    start = new Date(Date.now() - 100),
    onPersistFalse?: (messages: { thinkingTimeMs?: number }[]) => void,
  ) => {
    const updateAndPersistSessions = vi.fn(
      (
        updater: (prev: import('@/types').SavedChatSession[]) => import('@/types').SavedChatSession[],
        options?: { persist?: boolean },
      ) => {
        // Real updaters here run updateMessageInSession over the sessions
        // array; feed one session whose target message matches generation-1 so
        // patches are applied and can be asserted.
        const result = updater([
          {
            id: 'session-1',
            messages: [
              {
                id: 'generation-1',
                role: 'model',
                content: '',
                thoughts: '',
                isLoading: true,
                generationStartTime: start,
              },
            ],
          },
        ] as unknown as import('@/types').SavedChatSession[]);
        if (options?.persist === false && Array.isArray(result)) {
          onPersistFalse?.(result as { thinkingTimeMs?: number }[]);
        }
      },
    );
    const { result } = renderHookWithProviders(() =>
      useChatStreamHandler({
        appSettings: { ...DEFAULT_APP_SETTINGS, language: 'zh' },
        updateAndPersistSessions,
        setSessionLoading: vi.fn(),
        activeJobs: { current: new Map() },
      }),
    );
    const handlers = result.current.getStreamHandlers('session-1', 'generation-1', new AbortController(), start, {
      modelId: 'gemini-3.6-flash',
    } as never);
    return { ...handlers, updateAndPersistSessions };
  };

  it('writes thinkingTimeMs mid-stream the moment the first meaningful content part arrives after thoughts', () => {
    const writtenMessages: { thinkingTimeMs?: number }[] = [];
    const { streamOnPart, onThoughtChunk } = renderHandlers(undefined, (sessions) => {
      const session = sessions[0] as { messages?: { thinkingTimeMs?: number }[] };
      writtenMessages.push(...(session?.messages ?? []));
    });

    onThoughtChunk('Let me reason');
    streamOnPart({ text: 'Here is the answer' });

    const thinkingPatch = writtenMessages.find((message) => message.thinkingTimeMs !== undefined);
    expect(thinkingPatch?.thinkingTimeMs).toBeDefined();
    expect(thinkingPatch?.thinkingTimeMs).toBeGreaterThan(0);
  });

  it('does not mark thinking as ended for replies with no thoughts', () => {
    const writtenMessages: { thinkingTimeMs?: number }[] = [];
    const { streamOnPart } = renderHandlers(undefined, (sessions) => {
      const session = sessions[0] as { messages?: { thinkingTimeMs?: number }[] };
      writtenMessages.push(...(session?.messages ?? []));
    });

    streamOnPart({ text: 'Direct answer' });

    expect(writtenMessages.some((message) => message.thinkingTimeMs !== undefined)).toBe(false);
  });

  it('re-opens thinking when the model thinks again after a content switch', () => {
    const writtenMessages: { thinkingTimeMs?: number; thinkingActive?: boolean }[] = [];
    const { streamOnPart, onThoughtChunk } = renderHandlers(undefined, (sessions) => {
      const session = sessions[0] as { messages?: { thinkingTimeMs?: number; thinkingActive?: boolean }[] };
      writtenMessages.push(...(session?.messages ?? []));
    });

    onThoughtChunk('First reasoning pass');
    streamOnPart({ text: 'Interleaved answer' });
    onThoughtChunk('Re-entered reasoning after code execution');

    const lastWrite = writtenMessages[writtenMessages.length - 1];
    expect(lastWrite?.thinkingTimeMs).toBeUndefined();
    expect(lastWrite?.thinkingActive).toBe(true);
  });

  it('does not advance the first-token timestamp or thinking timing when parts are replayed', () => {
    const writtenMessages: { thinkingTimeMs?: number; firstTokenTimeMs?: number }[] = [];
    const { streamOnPart, onThoughtChunk } = renderHandlers(undefined, (sessions) => {
      const session = sessions[0] as { messages?: { thinkingTimeMs?: number; firstTokenTimeMs?: number }[] };
      writtenMessages.push(...(session?.messages ?? []));
    });

    onThoughtChunk('Replayed reasoning', { recordFirstToken: false });
    streamOnPart({ text: 'Replayed answer' }, { recordFirstToken: false });

    // Replay must not stamp first-token or commit thinking at completion time.
    expect(writtenMessages.some((message) => message.firstTokenTimeMs !== undefined)).toBe(false);
    expect(writtenMessages.some((message) => message.thinkingTimeMs !== undefined)).toBe(false);
  });

  it('splits inline <thinking> tags out of text parts and times the segment', () => {
    const writtenMessages: { thinkingTimeMs?: number }[] = [];
    const { streamOnPart } = renderHandlers(undefined, (sessions) => {
      const session = sessions[0] as { messages?: { thinkingTimeMs?: number }[] };
      writtenMessages.push(...(session?.messages ?? []));
    });

    // Inline reasoning never calls onThoughtChunk — it rides the text part.
    streamOnPart({ text: '<thinking>Let me plan.</thinking>Here is the answer' });

    // The thought text is split out of the content and routed to the store.
    expect(streamingStoreMock.updateThoughts).toHaveBeenCalledWith('generation-1', 'Let me plan.');
    expect(streamingStoreMock.updateContent).toHaveBeenCalledWith('generation-1', 'Here is the answer');
    // The segment commits once the visible answer arrives.
    const thinkingPatch = writtenMessages.find((message) => message.thinkingTimeMs !== undefined);
    expect(thinkingPatch?.thinkingTimeMs).toBeDefined();
    expect(thinkingPatch?.thinkingTimeMs).toBeGreaterThan(0);
  });

  it('times a thought-only inline chunk without committing, then commits on the next content chunk', () => {
    const writtenMessages: { thinkingTimeMs?: number; thinkingActive?: boolean }[] = [];
    const { streamOnPart } = renderHandlers(undefined, (sessions) => {
      const session = sessions[0] as { messages?: { thinkingTimeMs?: number; thinkingActive?: boolean }[] };
      writtenMessages.push(...(session?.messages ?? []));
    });

    // First chunk is reasoning only (opener split from the closer).
    streamOnPart({ text: '<thinking>Drafting' });

    expect(streamingStoreMock.updateThoughts).toHaveBeenCalledWith('generation-1', 'Drafting');
    expect(streamingStoreMock.updateContent).not.toHaveBeenCalled();
    expect(writtenMessages.some((message) => message.thinkingTimeMs !== undefined)).toBe(false);

    // Second chunk closes the block and carries the answer.
    streamOnPart({ text: ' carefully.</thinking>Done' });

    expect(streamingStoreMock.updateContent).toHaveBeenCalledWith('generation-1', 'Done');
    const thinkingPatch = writtenMessages.find((message) => message.thinkingTimeMs !== undefined);
    expect(thinkingPatch?.thinkingTimeMs).toBeDefined();
    expect(thinkingPatch?.thinkingTimeMs).toBeGreaterThan(0);
  });

  it('re-settles thinking for interleaved inline thought after a content switch', () => {
    const writtenMessages: { thinkingTimeMs?: number; thinkingActive?: boolean }[] = [];
    const { streamOnPart } = renderHandlers(undefined, (sessions) => {
      const session = sessions[0] as { messages?: { thinkingTimeMs?: number; thinkingActive?: boolean }[] };
      writtenMessages.push(...(session?.messages ?? []));
    });

    streamOnPart({ text: '<thinking>First pass</thinking>Answer one' });
    const firstCommit = writtenMessages.find((message) => message.thinkingTimeMs !== undefined);
    expect(firstCommit?.thinkingTimeMs).toBeDefined();

    // Re-entered thinking after the switch: resume clears the settled value.
    streamOnPart({ text: '<thinking>Second pass</thinking>' });
    const resumeWrite = writtenMessages[writtenMessages.length - 1];
    expect(resumeWrite?.thinkingTimeMs).toBeUndefined();
    expect(resumeWrite?.thinkingActive).toBe(true);

    // The second content chunk commits a fresh duration.
    streamOnPart({ text: 'Answer two' });
    const secondCommit = writtenMessages.filter((m) => m.thinkingTimeMs !== undefined).at(-1);
    expect(secondCommit?.thinkingTimeMs).toBeDefined();
  });

  it('stamps third-party thinking provenance from options.source on the first thought', () => {
    const writtenMessages: { thinkingSource?: string }[] = [];
    const { onThoughtChunk } = renderHandlers(undefined, (sessions) => {
      const session = sessions[0] as { messages?: { thinkingSource?: string }[] };
      writtenMessages.push(...(session?.messages ?? []));
    });

    onThoughtChunk('Third-party reasoning', { source: 'third-party' });

    expect(writtenMessages.find((message) => message.thinkingSource !== undefined)?.thinkingSource).toBe('third-party');
  });

  it('stamps third-party provenance on parts carrying inline <thinking> tags', () => {
    const writtenMessages: { thinkingSource?: string }[] = [];
    const { streamOnPart } = renderHandlers(undefined, (sessions) => {
      const session = sessions[0] as { messages?: { thinkingSource?: string }[] };
      writtenMessages.push(...(session?.messages ?? []));
    });

    streamOnPart({ text: '<thinking>Plan.</thinking>Answer' }, { source: 'third-party' });

    expect(writtenMessages.find((message) => message.thinkingSource !== undefined)?.thinkingSource).toBe('third-party');
  });

  it('leaves thinkingSource unset for Gemini-native thinking (no source passed)', () => {
    const writtenMessages: { thinkingSource?: string }[] = [];
    const { onThoughtChunk } = renderHandlers(undefined, (sessions) => {
      const session = sessions[0] as { messages?: { thinkingSource?: string }[] };
      writtenMessages.push(...(session?.messages ?? []));
    });

    onThoughtChunk('Gemini-native reasoning');

    // Only third-party thinking needs the explicit source; an unset value lets
    // the renderer allow Gemini-style sections, so nothing is stamped.
    expect(writtenMessages.some((message) => message.thinkingSource !== undefined)).toBe(false);
  });

  it('does not stamp provenance when no thought is produced', () => {
    const writtenMessages: { thinkingSource?: string }[] = [];
    const { streamOnPart } = renderHandlers(undefined, (sessions) => {
      const session = sessions[0] as { messages?: { thinkingSource?: string }[] };
      writtenMessages.push(...(session?.messages ?? []));
    });

    streamOnPart({ text: 'Direct answer' });

    expect(writtenMessages.some((message) => message.thinkingSource !== undefined)).toBe(false);
  });
});
