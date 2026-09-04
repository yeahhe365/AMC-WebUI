import { describe, expect, it, vi } from 'vitest';

vi.mock('@/utils/model/modelUsageStats', () => ({
  calculateTokenStats: () => ({
    promptTokens: 0,
    cachedPromptTokens: 0,
    completionTokens: 0,
    totalTokens: 0,
    thoughtTokens: 0,
    toolUsePromptTokens: 0,
  }),
}));

vi.mock('@/i18n/translations', () => ({
  getTranslator: () => (key: string) => key,
}));

import { createChatSettings } from '@/test/data/factories';
import { finalizeMessages } from './processors';

describe('finalizeMessages', () => {
  it('preserves files that were attached before finalizing the generated message', () => {
    const generationStartTime = new Date('2026-04-25T01:00:00.000Z');
    const existingFile = {
      id: 'plot-file',
      name: 'generated-plot.png',
      type: 'image/png',
      size: 12,
      dataUrl: 'blob:plot',
      uploadState: 'active' as const,
    };

    const { updatedMessages } = finalizeMessages({
      messages: [
        {
          id: 'model-message',
          role: 'model',
          content: '已生成图片。',
          timestamp: generationStartTime,
          generationStartTime,
          isLoading: true,
          files: [existingFile],
        },
      ],
      generationStartTime,
      newModelMessageIds: new Set(['model-message']),
      currentChatSettings: createChatSettings(),
      language: 'zh',
      firstContentPartTime: generationStartTime,
    });

    expect(updatedMessages[0]?.files).toEqual([existingFile]);
  });

  it('preserves empty internal tool model messages because their api parts rebuild context', () => {
    const generationStartTime = new Date('2026-04-25T01:00:00.000Z');
    const { updatedMessages } = finalizeMessages({
      messages: [
        {
          id: 'user-message',
          role: 'user',
          content: 'Run Python.',
          timestamp: new Date('2026-04-25T00:59:59.000Z'),
        },
        {
          id: 'internal-tool-call',
          role: 'model',
          content: '',
          timestamp: new Date('2026-04-25T01:00:00.100Z'),
          isInternalToolMessage: true,
          toolParentMessageId: 'model-message',
          apiParts: [{ functionCall: { id: 'call-1', name: 'run_local_python', args: { code: 'print(42)' } } }],
        },
        {
          id: 'internal-tool-response',
          role: 'user',
          content: '',
          timestamp: new Date('2026-04-25T01:00:00.200Z'),
          isInternalToolMessage: true,
          toolParentMessageId: 'model-message',
          apiParts: [
            {
              functionResponse: {
                id: 'call-1',
                name: 'run_local_python',
                response: { result: { output: '42' } },
              },
            },
          ],
        },
        {
          id: 'model-message',
          role: 'model',
          content: 'The answer is 42.',
          timestamp: generationStartTime,
          generationStartTime,
          isLoading: true,
        },
      ],
      generationStartTime,
      newModelMessageIds: new Set(['model-message']),
      currentChatSettings: createChatSettings(),
      language: 'zh',
      firstContentPartTime: generationStartTime,
    });

    expect(updatedMessages.map((message) => message.id)).toEqual([
      'user-message',
      'internal-tool-call',
      'internal-tool-response',
      'model-message',
    ]);
  });

  it('does not write thinkingTimeMs for replies without thoughts', () => {
    const generationStartTime = new Date('2026-04-25T01:00:00.000Z');
    const { updatedMessages } = finalizeMessages({
      messages: [
        {
          id: 'model-message',
          role: 'model',
          content: 'Plain answer without reasoning.',
          timestamp: generationStartTime,
          generationStartTime,
          isLoading: true,
        },
      ],
      generationStartTime,
      newModelMessageIds: new Set(['model-message']),
      currentChatSettings: createChatSettings(),
      language: 'zh',
      firstContentPartTime: new Date('2026-04-25T01:00:01.000Z'),
    });

    expect(updatedMessages[0]?.thinkingTimeMs).toBeUndefined();
  });

  it('falls back to total run time for a thoughts-only message with no content part', () => {
    const generationStartTime = new Date('2026-04-25T01:00:00.000Z');
    const { updatedMessages } = finalizeMessages({
      messages: [
        {
          id: 'model-message',
          role: 'model',
          content: '',
          thoughts: 'Only reasoning.',
          timestamp: generationStartTime,
          generationStartTime,
          isLoading: true,
        },
      ],
      generationStartTime,
      newModelMessageIds: new Set(['model-message']),
      currentChatSettings: createChatSettings(),
      language: 'zh',
      firstContentPartTime: null,
    });

    expect(updatedMessages[0]?.thinkingTimeMs).toBeGreaterThanOrEqual(0);
  });

  it('prefers the last thought chunk over the first content part when both exist', () => {
    const generationStartTime = new Date('2026-04-25T01:00:00.000Z');
    const { updatedMessages } = finalizeMessages({
      messages: [
        {
          id: 'model-message',
          role: 'model',
          content: 'Answer.',
          thoughts: 'Thought after interleaved code execution.',
          timestamp: generationStartTime,
          generationStartTime,
          isLoading: true,
        },
      ],
      generationStartTime,
      newModelMessageIds: new Set(['model-message']),
      currentChatSettings: createChatSettings(),
      language: 'zh',
      firstContentPartTime: new Date('2026-04-25T01:00:02.000Z'),
      lastThoughtChunkTimeMs: 4200,
    });

    expect(updatedMessages[0]?.thinkingTimeMs).toBe(4200);
  });

  it('keeps a thinking time committed mid-stream instead of overwriting it at finalize', () => {
    const generationStartTime = new Date('2026-04-25T01:00:00.000Z');
    const { updatedMessages } = finalizeMessages({
      messages: [
        {
          id: 'model-message',
          role: 'model',
          content: 'Answer.',
          thoughts: 'Reasoning.',
          timestamp: generationStartTime,
          generationStartTime,
          isLoading: true,
          thinkingTimeMs: 1200,
        },
      ],
      generationStartTime,
      newModelMessageIds: new Set(['model-message']),
      currentChatSettings: createChatSettings(),
      language: 'zh',
      firstContentPartTime: new Date('2026-04-25T01:00:01.000Z'),
      lastThoughtChunkTimeMs: 3500,
    });

    expect(updatedMessages[0]?.thinkingTimeMs).toBe(1200);
  });

  it('does not prune empty model messages from other runs when finalizing this one', () => {
    const generationStartTime = new Date('2026-04-25T01:00:00.000Z');
    const otherRunTime = new Date('2026-04-25T00:30:00.000Z');
    const { updatedMessages } = finalizeMessages({
      messages: [
        {
          id: 'other-empty-model',
          role: 'model',
          content: '',
          timestamp: otherRunTime,
          generationStartTime: otherRunTime,
        },
        {
          id: 'model-message',
          role: 'model',
          content: 'Fresh answer.',
          timestamp: generationStartTime,
          generationStartTime,
          isLoading: true,
        },
      ],
      generationStartTime,
      newModelMessageIds: new Set(['model-message']),
      currentChatSettings: createChatSettings(),
      language: 'zh',
      firstContentPartTime: generationStartTime,
    });

    // The empty model message from the earlier run must survive — the cleanup
    // only owns the messages finalized by THIS run.
    expect(updatedMessages.map((message) => message.id)).toEqual(['other-empty-model', 'model-message']);
  });
});
