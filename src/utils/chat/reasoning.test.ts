import { describe, expect, it } from 'vitest';
import {
  extractGemmaThoughtChannel,
  extractRawThinkingBlocks,
  stripGemmaThoughtMarkup,
  stripReasoningMarkup,
  wrapReasoningMarkup,
} from './reasoning';

describe('extractGemmaThoughtChannel', () => {
  it('returns plain text unchanged when no Gemma thought channel markup is present', () => {
    const plainText = 'Hello\n\nworld\n';

    expect(extractGemmaThoughtChannel(plainText)).toEqual({
      content: plainText,
    });
  });

  it('extracts official Gemma thought channels without changing the final answer text', () => {
    expect(extractGemmaThoughtChannel('<|channel>thought\nPlan carefully.\n<channel|>Final answer.')).toEqual({
      content: 'Final answer.',
      thoughts: 'Plan carefully.',
    });
  });
});

describe('stripReasoningMarkup', () => {
  it('preserves plain-text whitespace when no reasoning markup exists', () => {
    const plainText = '\n\n- item 1\n- item 2\n';

    expect(stripReasoningMarkup(plainText)).toBe(plainText);
  });
});

describe('renderable reasoning markup helpers', () => {
  it('wraps raw thinking blocks without touching fenced code examples', () => {
    const markdown = '```html\n<thinking>literal</thinking>\n```\n\n<thinking>Plan <x>.</thinking>\nFinal.';

    expect(wrapReasoningMarkup(markdown, false, 'Reasoning')).toContain('```html\n<thinking>literal</thinking>\n```');
    expect(wrapReasoningMarkup(markdown, false, 'Reasoning')).toContain('<details>');
    expect(wrapReasoningMarkup(markdown, false, 'Reasoning')).toContain('Plan &lt;x&gt;.');
  });

  it('strips Gemma thought channels outside literal markdown segments', () => {
    const markdown = '`<|channel>thought keep literal<channel|>`\n<|channel>thought hidden<channel|>Visible.';

    expect(stripGemmaThoughtMarkup(markdown)).toBe('`<|channel>thought keep literal<channel|>`\n Visible.');
  });
});

describe('extractRawThinkingBlocks', () => {
  it('separates completed raw thinking blocks from visible content', () => {
    expect(extractRawThinkingBlocks('<thinking>Plan carefully.</thinking>\nFinal answer.')).toEqual({
      content: 'Final answer.',
      thoughts: 'Plan carefully.',
      hasOpenThinkingBlock: false,
    });
  });

  it('extracts the short <think> variant with its own closer', () => {
    expect(extractRawThinkingBlocks('<think>Plan carefully.</think>\nFinal answer.')).toEqual({
      content: 'Final answer.',
      thoughts: 'Plan carefully.',
      hasOpenThinkingBlock: false,
    });
  });

  it('extracts a long opener closed by a short closer', () => {
    expect(extractRawThinkingBlocks('<thinking>Plan.</think>Final.')).toEqual({
      content: 'Final.',
      thoughts: 'Plan.',
      hasOpenThinkingBlock: false,
    });
  });

  it('treats an unclosed thinking block as live raw thoughts', () => {
    expect(extractRawThinkingBlocks('<thinking>Drafting the answer')).toEqual({
      content: '',
      thoughts: 'Drafting the answer',
      hasOpenThinkingBlock: true,
    });
  });

  it('treats an unclosed short <think> block as live raw thoughts', () => {
    expect(extractRawThinkingBlocks('Intro <think>Drafting the answer')).toEqual({
      content: 'Intro',
      thoughts: 'Drafting the answer',
      hasOpenThinkingBlock: true,
    });
  });

  it('does not strip thinking examples inside fenced code blocks', () => {
    const markdown = '```html\n<thinking>literal</thinking>\n```\n\nFinal answer.';

    expect(extractRawThinkingBlocks(markdown)).toEqual({
      content: markdown,
      hasOpenThinkingBlock: false,
    });
  });
});

describe('renderable reasoning markup helpers — <think> variant', () => {
  it('wraps short <think> blocks into collapsible details', () => {
    const wrapped = wrapReasoningMarkup('<think>Plan.</think>\nFinal.', false, 'Reasoning');

    expect(wrapped).toContain('<details>');
    expect(wrapped).toContain('Plan.');
    expect(wrapped).toContain('Final.');
  });

  it('strips short <think> blocks from content while preserving plain text', () => {
    expect(stripReasoningMarkup('<think>Hidden.</think>Visible.')).toBe('Visible.');
  });
});
