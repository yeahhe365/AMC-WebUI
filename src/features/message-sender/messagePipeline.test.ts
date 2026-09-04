import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SavedChatSession } from '@/types';
import { createAppSettings, createChatSettings, createUploadedFile } from '@/test/data/factories';

const { playCompletionSoundMock } = vi.hoisted(() => ({
  playCompletionSoundMock: vi.fn(),
}));

vi.mock('@/utils/browserCompletionFeedback', () => ({
  playCompletionSound: playCompletionSoundMock,
  showNotification: vi.fn(),
}));

import { runOptimisticMessagePipeline } from './messagePipeline';

describe('messagePipeline', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates a new optimistic user/model turn through one shared entry point', async () => {
    let sessions: SavedChatSession[] = [];
    const updateAndPersistSessions = vi.fn((updater: (prev: SavedChatSession[]) => SavedChatSession[]) => {
      sessions = updater(sessions);
    });
    const setActiveSessionId = vi.fn();
    const generationStartTime = new Date('2026-05-02T01:15:00.000Z');
    const file = createUploadedFile({
      name: 'source.png',
    });

    const result = await runOptimisticMessagePipeline({
      activeSessionId: null,
      appSettings: createAppSettings({
        modelId: 'app-default-model',
        temperature: 0.9,
        topP: 0.8,
      }),
      currentChatSettings: createChatSettings({
        modelId: 'turn-model',
        temperature: 0.2,
      }),
      updateAndPersistSessions,
      setActiveSessionId,
      text: 'edit this image',
      files: [file],
      generationId: 'generation-1',
      generationStartTime,
      keyToLock: 'api-key',
      shouldLockKey: true,
      shouldGenerateTitle: true,
      createSessionId: () => 'new-session',
      abortController: new AbortController(),
      errorPrefix: 'Test Error',
      runMessageLifecycle: vi.fn(async () => undefined),
      execute: async () => undefined,
    });

    expect(result.finalSessionId).toBe('new-session');
    expect(result.modelMessageId).toBe('generation-1');
    expect(setActiveSessionId).toHaveBeenCalledWith('new-session');
    expect(updateAndPersistSessions).toHaveBeenCalledOnce();
    expect(sessions).toHaveLength(1);
    expect(sessions[0]).toEqual(
      expect.objectContaining({
        id: 'new-session',
        settings: expect.objectContaining({
          modelId: 'turn-model',
          temperature: 0.2,
          lockedApiKey: 'api-key',
        }),
      }),
    );
    expect(sessions[0].messages).toHaveLength(2);
    expect(sessions[0].messages[0]).toEqual(
      expect.objectContaining({
        role: 'user',
        content: 'edit this image',
        files: [file],
      }),
    );
    expect(sessions[0].messages[1]).toEqual(
      expect.objectContaining({
        id: 'generation-1',
        role: 'model',
        content: '',
        isLoading: true,
        generationStartTime,
      }),
    );
  });

  it('runs optimistic senders through one shared lifecycle and completion path', async () => {
    let sessions: SavedChatSession[] = [];
    const updateAndPersistSessions = vi.fn((updater: (prev: SavedChatSession[]) => SavedChatSession[]) => {
      sessions = updater(sessions);
    });
    const setActiveSessionId = vi.fn();
    const runMessageLifecycle = vi.fn(async ({ execute }) => execute());
    const generationStartTime = new Date('2026-05-04T10:00:00.000Z');

    const turn = await runOptimisticMessagePipeline({
      activeSessionId: null,
      appSettings: createAppSettings({
        isCompletionSoundEnabled: true,
        isCompletionNotificationEnabled: false,
      }),
      currentChatSettings: createChatSettings({
        modelId: 'gemini-3.1-flash-image-preview',
      }),
      updateAndPersistSessions,
      setActiveSessionId,
      text: 'draw a foxglove',
      generationId: 'generation-1',
      generationStartTime,
      keyToLock: 'api-key',
      shouldLockKey: true,
      abortController: new AbortController(),
      errorPrefix: 'Image Gen Error',
      runMessageLifecycle,
      execute: async () => ({
        patch: {
          isLoading: false,
          content: 'Generated image',
          generationEndTime: new Date('2026-05-04T10:00:01.000Z'),
        },
        feedback: { sound: true },
      }),
      createSessionId: () => 'new-session',
    });

    expect(turn?.finalSessionId).toBe('new-session');
    expect(runMessageLifecycle).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: 'new-session',
        generationId: 'generation-1',
        modelMessageId: 'generation-1',
        errorPrefix: 'Image Gen Error',
      }),
    );
    expect(sessions[0].messages[1]).toEqual(
      expect.objectContaining({
        id: 'generation-1',
        isLoading: false,
        content: 'Generated image',
      }),
    );
    expect(playCompletionSoundMock).toHaveBeenCalledOnce();
  });

  it('can start a standard chat turn with sender-specific optimistic message metadata', async () => {
    let sessions: SavedChatSession[] = [
      {
        id: 'session-1',
        title: 'New Chat',
        timestamp: 1,
        groupId: null,
        settings: createChatSettings({ modelId: 'old-model' }),
        messages: [
          {
            id: 'previous-model',
            role: 'model',
            content: 'previous',
            timestamp: new Date('2026-05-04T09:59:00.000Z'),
            cumulativeTotalTokens: 42,
          },
        ],
      },
    ];
    const updateAndPersistSessions = vi.fn((updater: (prev: SavedChatSession[]) => SavedChatSession[]) => {
      sessions = updater(sessions);
    });
    const file = createUploadedFile({ name: 'report.csv' });
    const generationStartTime = new Date('2026-05-04T10:01:00.000Z');

    await runOptimisticMessagePipeline({
      activeSessionId: 'session-1',
      appSettings: createAppSettings(),
      currentChatSettings: createChatSettings({ modelId: 'gemini-3-flash-preview' }),
      updateAndPersistSessions,
      setActiveSessionId: vi.fn(),
      text: 'summarize',
      files: [file],
      generationId: 'generation-2',
      generationStartTime,
      editingMessageId: null,
      shouldGenerateTitle: true,
      userMessageOptions: {
        cumulativeTotalTokens: 42,
      },
      modelMessageOptions: {
        content: '<thinking>',
      },
      abortController: new AbortController(),
      errorPrefix: 'Test Error',
      runMessageLifecycle: vi.fn(async () => undefined),
      execute: async () => undefined,
    });

    expect(sessions[0].title).toBe('summarize');
    expect(sessions[0].messages[1]).toEqual(
      expect.objectContaining({
        role: 'user',
        content: 'summarize',
        files: [file],
        cumulativeTotalTokens: 42,
      }),
    );
    expect(sessions[0].messages[2]).toEqual(
      expect.objectContaining({
        id: 'generation-2',
        role: 'model',
        content: '<thinking>',
        isLoading: true,
        generationStartTime,
      }),
    );
  });

  it('can start an inserted model-only turn for Live Artifacts generation', async () => {
    let sessions: SavedChatSession[] = [
      {
        id: 'session-1',
        title: 'Chat',
        timestamp: 1,
        groupId: null,
        settings: createChatSettings(),
        messages: [
          {
            id: 'source-message',
            role: 'model',
            content: 'source',
            timestamp: new Date('2026-05-04T09:59:00.000Z'),
          },
          {
            id: 'next-message',
            role: 'user',
            content: 'next',
            timestamp: new Date('2026-05-04T10:00:00.000Z'),
          },
        ],
      },
    ];
    const updateAndPersistSessions = vi.fn((updater: (prev: SavedChatSession[]) => SavedChatSession[]) => {
      sessions = updater(sessions);
    });
    const generationStartTime = new Date('2026-05-04T10:02:00.000Z');

    await runOptimisticMessagePipeline({
      activeSessionId: 'session-1',
      appSettings: createAppSettings(),
      currentChatSettings: createChatSettings(),
      updateAndPersistSessions,
      setActiveSessionId: vi.fn(),
      text: '',
      generationId: 'live-artifacts-generation',
      generationStartTime,
      placement: {
        type: 'insert-model-after',
        sourceMessageId: 'source-message',
      },
      modelMessageOptions: {
        excludeFromContext: true,
      },
      abortController: new AbortController(),
      errorPrefix: 'Test Error',
      runMessageLifecycle: vi.fn(async () => undefined),
      execute: async () => undefined,
    });

    expect(sessions[0].messages.map((message) => message.id)).toEqual([
      'source-message',
      'live-artifacts-generation',
      'next-message',
    ]);
    expect(sessions[0].messages[1]).toEqual(
      expect.objectContaining({
        role: 'model',
        content: '',
        isLoading: true,
        excludeFromContext: true,
        generationStartTime,
      }),
    );
  });

  it('does not emit completion feedback for stream-owned pipeline executions', async () => {
    const runMessageLifecycle = vi.fn(async ({ execute }) => execute());

    await runOptimisticMessagePipeline({
      activeSessionId: 'session-1',
      appSettings: createAppSettings({
        isCompletionSoundEnabled: true,
      }),
      currentChatSettings: createChatSettings(),
      updateAndPersistSessions: vi.fn(),
      setActiveSessionId: vi.fn(),
      text: 'hello',
      generationId: 'generation-1',
      abortController: new AbortController(),
      errorPrefix: 'Error',
      runMessageLifecycle,
      execute: async () => undefined,
    });

    expect(playCompletionSoundMock).not.toHaveBeenCalled();
  });

  it('resets timing fields and updates generationStartTime when continuing a model message', async () => {
    const oldStart = new Date('2026-05-04T08:00:00.000Z');
    const newStart = new Date('2026-05-04T10:00:00.000Z');
    let sessions: SavedChatSession[] = [
      {
        id: 'session-1',
        title: 'Chat',
        timestamp: 1,
        groupId: null,
        settings: createChatSettings(),
        messages: [
          {
            id: 'target-model',
            role: 'model',
            content: 'continue me',
            timestamp: oldStart,
            generationStartTime: oldStart,
            firstTokenTimeMs: 500,
            thinkingTimeMs: 1200,
            generationEndTime: new Date('2026-05-04T08:00:02.000Z'),
          },
        ],
      },
    ];
    const updateAndPersistSessions = vi.fn((updater: (prev: SavedChatSession[]) => SavedChatSession[]) => {
      sessions = updater(sessions);
    });

    await runOptimisticMessagePipeline({
      activeSessionId: 'session-1',
      appSettings: createAppSettings(),
      currentChatSettings: createChatSettings(),
      updateAndPersistSessions,
      setActiveSessionId: vi.fn(),
      text: '',
      generationId: 'target-model',
      generationStartTime: newStart,
      placement: { type: 'continue-model', targetMessageId: 'target-model' },
      abortController: new AbortController(),
      errorPrefix: 'Test Error',
      runMessageLifecycle: vi.fn(async () => undefined),
      execute: async () => undefined,
    });

    expect(sessions[0].messages[0]).toEqual(
      expect.objectContaining({
        id: 'target-model',
        isLoading: true,
        generationStartTime: newStart,
        generationEndTime: undefined,
        firstTokenTimeMs: undefined,
        thinkingTimeMs: undefined,
      }),
    );
  });
});
