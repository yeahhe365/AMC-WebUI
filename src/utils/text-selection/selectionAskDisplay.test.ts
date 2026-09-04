import { describe, expect, it } from 'vitest';
import { formatSelectionAskModelLabel } from './selectionAskDisplay';

describe('formatSelectionAskModelLabel', () => {
  it('formats known gemini ids', () => {
    expect(formatSelectionAskModelLabel('gemini-3.7-flash')).toBe('Gemini 3.7 Flash');
    expect(formatSelectionAskModelLabel('models/gemini-2.5-pro')).toBe('Gemini 2.5 Pro');
    expect(formatSelectionAskModelLabel('gemini-3.5-flash-lite')).toBe('Gemini 3.5 Flash Lite');
  });

  it('formats third-party ids with brand tokens', () => {
    expect(formatSelectionAskModelLabel('gpt-4o-mini')).toBe('GPT 4o Mini');
    expect(formatSelectionAskModelLabel('deepseek_chat')).toBe('DeepSeek Chat');
    expect(formatSelectionAskModelLabel('claude-sonnet-4')).toBe('Claude Sonnet 4');
  });

  it('uppercases short token-only segments and keeps digit-led versions', () => {
    expect(formatSelectionAskModelLabel('tts-hd')).toBe('TTS HD');
    expect(formatSelectionAskModelLabel('qwen3-8b')).toBe('Qwen3 8b');
  });

  it('falls back to the raw id for empty-ish input', () => {
    expect(formatSelectionAskModelLabel('')).toBe('');
  });
});
