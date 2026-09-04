import { describe, expect, it } from 'vitest';
import { createInlineThinkingParserState, pushInlineThinkingChunk } from './inlineThinkingParser';

describe('inlineThinkingParser', () => {
  it('passes plain text straight through as content', () => {
    const state = createInlineThinkingParserState();

    expect(pushInlineThinkingChunk(state, 'Hello world.')).toEqual({ content: 'Hello world.', thought: '' });
  });

  it('separates a complete thinking block from surrounding content', () => {
    const state = createInlineThinkingParserState();

    expect(pushInlineThinkingChunk(state, 'Let me check.\n<thinking>Careful now.</thinking>\nFinal.')).toEqual({
      content: 'Let me check.\n\nFinal.',
      thought: 'Careful now.',
    });
    expect(state.mode).toBe('content');
    expect(state.buffer).toBe('');
  });

  it('handles the short <think> variant', () => {
    const state = createInlineThinkingParserState();

    expect(pushInlineThinkingChunk(state, '<think>Plan.</think>Done')).toEqual({ content: 'Done', thought: 'Plan.' });
  });

  it('is case-insensitive for both variants', () => {
    const state = createInlineThinkingParserState();

    expect(pushInlineThinkingChunk(state, '<THINKING>Wait.</THINKING>')).toEqual({
      content: '',
      thought: 'Wait.',
    });
  });

  it('carries an opener split across chunk boundaries into thinking mode', () => {
    const state = createInlineThinkingParserState();

    expect(pushInlineThinkingChunk(state, 'Before <thi')).toEqual({ content: 'Before ', thought: '' });
    // The completed opener must not leak into content; the thought text then
    // streams out as it arrives.
    expect(pushInlineThinkingChunk(state, 'nking>Draft.')).toEqual({ content: '', thought: 'Draft.' });
    expect(state.mode).toBe('thinking');

    expect(pushInlineThinkingChunk(state, '</think>')).toEqual({ content: '', thought: '' });
    expect(state.mode).toBe('content');
  });

  it('defers a trailing close-tag prefix in thinking mode until it resolves', () => {
    const state = createInlineThinkingParserState();

    expect(pushInlineThinkingChunk(state, '<think>Brain')).toEqual({ content: '', thought: 'Brain' });
    expect(state.mode).toBe('thinking');

    // "</th" is held back — it could resolve to </think> or </thinking>.
    expect(pushInlineThinkingChunk(state, '</th')).toEqual({ content: '', thought: '' });
    expect(state.buffer).toBe('</th');

    // A bare "i" completes the short close tag, releasing nothing extra.
    expect(pushInlineThinkingChunk(state, 'ink>')).toEqual({ content: '', thought: '' });
    expect(state.mode).toBe('content');
    expect(state.buffer).toBe('');
  });

  it('emits a held-back close-tag prefix as thought text if it never resolves', () => {
    const state = createInlineThinkingParserState();

    expect(pushInlineThinkingChunk(state, '<think>Brain. </th')).toEqual({ content: '', thought: 'Brain. ' });
    expect(state.buffer).toBe('</th');

    // "is is it" cannot complete any close tag, so the held prefix flows as thought.
    expect(pushInlineThinkingChunk(state, 'is is it')).toEqual({ content: '', thought: '</this is it' });
  });

  it('drops a dangling opener prefix at stream end instead of surfacing it', () => {
    const state = createInlineThinkingParserState();

    expect(pushInlineThinkingChunk(state, 'Answer. <thi')).toEqual({ content: 'Answer. ', thought: '' });
    expect(state.buffer).toBe('<thi');
  });

  it('processes several blocks in a single chunk', () => {
    const state = createInlineThinkingParserState();

    expect(pushInlineThinkingChunk(state, '<thinking>A</thinking>Mid<think>B</think>Tail')).toEqual({
      content: 'MidTail',
      thought: 'AB',
    });
  });

  it('alternates across chunks and coalesces adjacent blocks', () => {
    const state = createInlineThinkingParserState();

    expect(pushInlineThinkingChunk(state, '<think>A</think>')).toEqual({ content: '', thought: 'A' });
    expect(pushInlineThinkingChunk(state, 'Text.')).toEqual({ content: 'Text.', thought: '' });
    expect(pushInlineThinkingChunk(state, '<think>B</think>')).toEqual({ content: '', thought: 'B' });
    expect(pushInlineThinkingChunk(state, 'Done.')).toEqual({ content: 'Done.', thought: '' });

    expect(state.mode).toBe('content');
    expect(state.buffer).toBe('');
  });

  it('emits unclosed thinking content as thought', () => {
    const state = createInlineThinkingParserState();

    expect(pushInlineThinkingChunk(state, 'Start. <think>No closer')).toEqual({
      content: 'Start. ',
      thought: 'No closer',
    });
    expect(state.mode).toBe('thinking');

    // In thinking mode there is no close tag yet, so each chunk's text streams
    // out as thought (per-chunk deltas, not accumulated) and mode stays 'thinking'.
    expect(pushInlineThinkingChunk(state, ' yet.')).toEqual({ content: '', thought: ' yet.' });
    expect(state.mode).toBe('thinking');

    // A close tag later resumes content mode.
    expect(pushInlineThinkingChunk(state, '</thinking>')).toEqual({ content: '', thought: '' });
    expect(state.mode).toBe('content');
  });

  it('treats a lone close tag in content mode as plain text', () => {
    const state = createInlineThinkingParserState();

    expect(pushInlineThinkingChunk(state, 'Prose </thinking> here.')).toEqual({
      content: 'Prose </thinking> here.',
      thought: '',
    });
  });

  it('handles thought and content in the same chunk via the trailing-prefix boundary', () => {
    const state = createInlineThinkingParserState();

    // "</th" is held back as a potential close tag; the rest is thought.
    expect(pushInlineThinkingChunk(state, '<think>Brain.</th')).toEqual({ content: '', thought: 'Brain.' });
    expect(state.buffer).toBe('</th');

    // The held prefix now completes into a close tag, releasing the trailing content.
    expect(pushInlineThinkingChunk(state, 'ink>Done.')).toEqual({ content: 'Done.', thought: '' });
  });
});
