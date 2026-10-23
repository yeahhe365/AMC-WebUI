import { renderHook } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { extractTurnNavigationItems, useTurnNavigationItems } from './useTurnNavigationItems';
import type { ChatMessage } from '@/types';

function createMessage(
  partial: Partial<ChatMessage> & { id: string; role: 'user' | 'model' | 'error'; content: string },
): ChatMessage {
  return {
    timestamp: new Date(),
    ...partial,
  };
}

describe('extractTurnNavigationItems', () => {
  it('returns empty array when there are no messages or no user messages', () => {
    expect(extractTurnNavigationItems([])).toEqual([]);
    expect(extractTurnNavigationItems([createMessage({ id: 'm1', role: 'model', content: 'Hello!' })])).toEqual([]);
  });

  it('extracts turns with prompt and response', () => {
    const messages: ChatMessage[] = [
      createMessage({ id: 'u1', role: 'user', content: 'What is AMC?' }),
      createMessage({ id: 'm1', role: 'model', content: 'AMC is All Model Chat.' }),
      createMessage({ id: 'u2', role: 'user', content: 'How does it work?' }),
      createMessage({ id: 'm2', role: 'model', content: 'It connects multiple LLMs.' }),
    ];

    const items = extractTurnNavigationItems(messages);
    expect(items).toHaveLength(2);
    expect(items[0]).toEqual({
      turn: 1,
      messageIndex: 0,
      messageId: 'u1',
      prompt: 'What is AMC?',
      response: 'AMC is All Model Chat.',
      anchor: { kind: 'loaded', key: 'u1' },
    });
    expect(items[1]).toEqual({
      turn: 2,
      messageIndex: 2,
      messageId: 'u2',
      prompt: 'How does it work?',
      response: 'It connects multiple LLMs.',
      anchor: { kind: 'loaded', key: 'u2' },
    });
  });

  it('handles user message without model response yet', () => {
    const messages: ChatMessage[] = [
      createMessage({ id: 'u1', role: 'user', content: 'First question' }),
      createMessage({ id: 'm1', role: 'model', content: 'First answer' }),
      createMessage({ id: 'u2', role: 'user', content: 'Generating question...' }),
    ];

    const items = extractTurnNavigationItems(messages);
    expect(items).toHaveLength(2);
    expect(items[1]).toEqual({
      turn: 2,
      messageIndex: 2,
      messageId: 'u2',
      prompt: 'Generating question...',
      response: '',
      anchor: { kind: 'loaded', key: 'u2' },
    });
  });

  it('cleans whitespace and handles thoughts/text in response', () => {
    const messages: ChatMessage[] = [
      createMessage({ id: 'u1', role: 'user', content: '  Line 1\nLine 2  ' }),
      createMessage({ id: 'm1', role: 'model', content: 'Answer line 1\nAnswer line 2' }),
    ];

    const items = extractTurnNavigationItems(messages);
    expect(items[0].prompt).toBe('Line 1 Line 2');
    expect(items[0].response).toBe('Answer line 1 Answer line 2');
  });

  it('strips HTML tags and markdown formatting from preview snippets', () => {
    const messages: ChatMessage[] = [
      createMessage({
        id: 'u1',
        role: 'user',
        content: '<div style="display:block;width:100%;">简而言之：<b>用户提问</b></div>',
      }),
      createMessage({
        id: 'm1',
        role: 'model',
        content: '<div style="display:block;width:100%;box-sizing:border-box;"><p>这是模型的文本回答</p></div>',
      }),
    ];

    const items = extractTurnNavigationItems(messages);
    expect(items[0].prompt).toBe('简而言之： 用户提问');
    expect(items[0].response).toBe('这是模型的文本回答');
  });
});

describe('useTurnNavigationItems cache', () => {
  it('reuses stable history snippets while refreshing changed content and thoughts', () => {
    const prompt = createMessage({ id: 'cached-user', role: 'user', content: '**history prompt**' });
    const response = createMessage({ id: 'cached-model', role: 'model', content: 'history response' });
    const livePrompt = createMessage({ id: 'live-user', role: 'user', content: 'live' });
    const liveResponse = createMessage({ id: 'live-model', role: 'model', content: 'first chunk' });
    const { result, rerender } = renderHook(({ messages }) => useTurnNavigationItems(messages), {
      initialProps: { messages: [prompt, response, livePrompt, liveResponse] },
    });
    const replace = vi.spyOn(String.prototype, 'replace');
    rerender({ messages: [{ ...prompt }, { ...response }, livePrompt, { ...liveResponse, content: 'second chunk' }] });
    expect(result.current[1].response).toBe('second chunk');
    expect(replace.mock.calls.length).toBeLessThanOrEqual(12);
    replace.mockRestore();
    rerender({
      messages: [
        { ...prompt, content: 'edited prompt' },
        { ...response, content: '', thoughts: 'thinking' },
      ],
    });
    expect(result.current[0]).toMatchObject({ prompt: 'edited prompt', response: 'thinking' });
    rerender({
      messages: [
        { ...prompt, content: 'edited prompt' },
        { ...response, content: '', thoughts: 'new thoughts' },
      ],
    });
    expect(result.current[0].response).toBe('new thoughts');
  });
});
