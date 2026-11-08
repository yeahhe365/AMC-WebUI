import { describe, expect, it } from 'vitest';
import { buildChatInputSubmitText, hasSendableChatInputContent } from './chatInputContent';

describe('buildChatInputSubmitText', () => {
  it('wraps transcript text with TTS context before sending', () => {
    expect(
      buildChatInputSubmitText({
        inputText: 'hello world',
        quotes: [],
        modelId: 'gemini-3.8-flash-tts',
        ttsContext: 'Use a calm narrator voice.',
      }),
    ).toBe('Use a calm narrator voice.\n\n#### TRANSCRIPT\nhello world');
  });

  it('formats multiple quotes before the input text', () => {
    expect(
      buildChatInputSubmitText({
        inputText: 'Summarize this.',
        quotes: ['first line\nsecond line', 'third line'],
        modelId: 'gemini-3.1-pro-preview',
      }),
    ).toBe('**Quote 1**:\n> first line\n> second line\n\n**Quote 2**:\n> third line\n\nSummarize this.');
  });
});

describe('hasSendableChatInputContent', () => {
  const base = {
    inputText: '',
    quotes: [] as string[],
    selectedFileCount: 0,
  };

  it('does not treat files as sendable content for Live sessions', () => {
    expect(
      hasSendableChatInputContent({
        ...base,
        isNativeAudioModel: true,
        selectedFileCount: 1,
      }),
    ).toBe(false);
  });

  it('allows Live sessions to send text or quoted text', () => {
    expect(
      hasSendableChatInputContent({
        ...base,
        isNativeAudioModel: true,
        inputText: 'hello live',
      }),
    ).toBe(true);

    expect(
      hasSendableChatInputContent({
        ...base,
        isNativeAudioModel: true,
        quotes: ['selected text'],
      }),
    ).toBe(true);
  });

  it('keeps file-only sends available for standard models', () => {
    expect(
      hasSendableChatInputContent({
        ...base,
        isNativeAudioModel: false,
        selectedFileCount: 1,
      }),
    ).toBe(true);
  });
});
