import { describe, expect, it } from 'vitest';
import type { ChatHistoryItem } from '@/types';
import { buildAnthropicRequestBody } from './anthropicMessages';

const history: ChatHistoryItem[] = [
  { role: 'user', parts: [{ text: 'Hello' }] },
  { role: 'model', parts: [{ text: 'Hi there' }] },
];

describe('buildAnthropicRequestBody', () => {
  it('extracts system instruction to top-level system field', () => {
    const body = buildAnthropicRequestBody(
      'claude-sonnet-5',
      history,
      [{ text: 'How are you?' }],
      { systemInstruction: 'Be helpful', temperature: 0.5 },
      'user',
      false,
    );
    expect(body.system).toBe('Be helpful');
    expect(body.temperature).toBe(0.5);
  });

  it('maps history roles: model->assistant, user stays user', () => {
    const body = buildAnthropicRequestBody(
      'claude-sonnet-5',
      history,
      [{ text: 'How are you?' }],
      {},
      'user',
      false,
    ) as { messages: Array<{ role: string }> };
    const roles = body.messages.map((m) => m.role);
    expect(roles).toEqual(['user', 'assistant', 'user']);
  });

  it('omits system field when no system instruction', () => {
    const body = buildAnthropicRequestBody('m', [], [{ text: 'hi' }], {}, 'user', false);
    expect(body.system).toBeUndefined();
  });

  it('includes stream flag and max_tokens', () => {
    const bodyStream = buildAnthropicRequestBody('m', [], [{ text: 'hi' }], {}, 'user', true);
    expect(bodyStream.stream).toBe(true);
    expect(bodyStream.max_tokens).toBeGreaterThan(0);
    const bodyNoStream = buildAnthropicRequestBody('m', [], [{ text: 'hi' }], {}, 'user', false);
    expect(bodyNoStream.stream).toBe(false);
  });

  it('maps thinkingLevel to output_config.effort for Claude Sonnet 5 / Opus 5', () => {
    expect(
      (
        buildAnthropicRequestBody(
          'claude-sonnet-5',
          [],
          [{ text: 'hi' }],
          { thinkingLevel: 'HIGH' },
          'user',
          false,
        ) as { output_config: { effort: string } }
      ).output_config,
    ).toEqual({ effort: 'high' });

    expect(
      (
        buildAnthropicRequestBody(
          'claude-opus-5',
          [],
          [{ text: 'hi' }],
          { thinkingLevel: 'MEDIUM' },
          'user',
          false,
        ) as { output_config: { effort: string } }
      ).output_config,
    ).toEqual({ effort: 'medium' });

    expect(
      (
        buildAnthropicRequestBody('claude-sonnet-5', [], [{ text: 'hi' }], { thinkingLevel: 'LOW' }, 'user', false) as {
          output_config: { effort: string };
        }
      ).output_config,
    ).toEqual({ effort: 'low' });

    expect(
      (
        buildAnthropicRequestBody('claude-sonnet-5', [], [{ text: 'hi' }], { thinkingLevel: 'MAX' }, 'user', false) as {
          output_config: { effort: string };
        }
      ).output_config,
    ).toEqual({ effort: 'max' });

    expect(
      (
        buildAnthropicRequestBody(
          'claude-sonnet-5',
          [],
          [{ text: 'hi' }],
          { thinkingLevel: 'XHIGH' },
          'user',
          false,
        ) as {
          output_config: { effort: string };
        }
      ).output_config,
    ).toEqual({ effort: 'max' });
  });

  it('maps thinkingLevel to budget_tokens for Claude 3.7 models', () => {
    const body = buildAnthropicRequestBody(
      'claude-3-7-sonnet-20250219',
      [],
      [{ text: 'hi' }],
      { thinkingLevel: 'HIGH' },
      'user',
      false,
    ) as { thinking: { type: string; budget_tokens: number } };
    expect(body.thinking).toEqual({ type: 'enabled', budget_tokens: 16384 });
  });

  it('defaults effort to high for adaptive Claude models when thinkingLevel is omitted', () => {
    expect(
      (
        buildAnthropicRequestBody('claude-sonnet-5', [], [{ text: 'hi' }], {}, 'user', false) as {
          output_config: { effort: string };
        }
      ).output_config,
    ).toEqual({ effort: 'high' });
  });

  it('never sends budget_tokens thinking for Claude Sonnet 5 / Opus 5 / Fable 5', () => {
    for (const modelId of ['claude-sonnet-5', 'claude-opus-5', 'claude-fable-5']) {
      const body = buildAnthropicRequestBody(
        modelId,
        [],
        [{ text: 'hi' }],
        { thinkingBudget: 5000, thinkingLevel: 'HIGH' },
        'user',
        false,
      ) as { thinking?: unknown; max_tokens: number; output_config?: { effort: string } };
      expect(body.thinking).toBeUndefined();
      expect(body.max_tokens).toBe(8192);
      expect(body.output_config).toEqual({ effort: 'high' });
    }
  });

  it('maps Fable 5 thinkingLevel to output_config.effort without thinking block', () => {
    const body = buildAnthropicRequestBody(
      'claude-fable-5',
      [],
      [{ text: 'hi' }],
      { thinkingLevel: 'MEDIUM', thinkingBudget: 9999 },
      'user',
      false,
    ) as { thinking?: unknown; output_config: { effort: string } };
    expect(body.thinking).toBeUndefined();
    expect(body.output_config).toEqual({ effort: 'medium' });
  });

  it('keeps legacy budget_tokens thinking for models without effort support', () => {
    const body = buildAnthropicRequestBody(
      'claude-haiku-4-5',
      [],
      [{ text: 'hi' }],
      { thinkingBudget: 5000 },
      'user',
      false,
    ) as { thinking: { type: string; budget_tokens: number }; max_tokens: number; output_config?: unknown };
    expect(body.thinking).toEqual({ type: 'enabled', budget_tokens: 5000 });
    expect(body.max_tokens).toBe(5000 + 8192);
    expect(body.output_config).toBeUndefined();
  });

  it('clamps legacy thinking budget to the Anthropic minimum (1024)', () => {
    const body = buildAnthropicRequestBody(
      'claude-haiku-4-5',
      [],
      [{ text: 'hi' }],
      { thinkingBudget: 500 },
      'user',
      false,
    ) as { thinking: { budget_tokens: number } };
    expect(body.thinking.budget_tokens).toBe(1024);
  });

  it('omits thinking when no thinking budget is set on legacy models', () => {
    const body = buildAnthropicRequestBody('claude-haiku-4-5', [], [{ text: 'hi' }], {}, 'user', false) as {
      thinking?: unknown;
      output_config?: unknown;
    };
    expect(body.thinking).toBeUndefined();
    expect(body.output_config).toBeUndefined();
  });

  it('omits temperature/top_p while legacy extended thinking is enabled (Anthropic constraint)', () => {
    const body = buildAnthropicRequestBody(
      'claude-haiku-4-5',
      [],
      [{ text: 'hi' }],
      { thinkingBudget: 5000, temperature: 0.7, topP: 0.9 },
      'user',
      false,
    ) as { thinking: { budget_tokens: number }; temperature?: unknown; top_p?: unknown };
    expect(body.thinking).toEqual({ type: 'enabled', budget_tokens: 5000 });
    expect(body.temperature).toBeUndefined();
    expect(body.top_p).toBeUndefined();
  });

  it('keeps temperature/top_p on adaptive effort models, which have no such restriction', () => {
    const body = buildAnthropicRequestBody(
      'claude-sonnet-5',
      [],
      [{ text: 'hi' }],
      { thinkingLevel: 'HIGH', temperature: 0.7, topP: 0.9 },
      'user',
      false,
    ) as { output_config?: { effort?: string }; temperature?: unknown; top_p?: unknown; thinking?: unknown };
    expect(body.output_config?.effort).toBe('high');
    expect(body.thinking).toBeUndefined();
    expect(body.temperature).toBe(0.7);
    expect(body.top_p).toBe(0.9);
  });

  it('supports custom maxOutputTokens and stopSequences', () => {
    const body = buildAnthropicRequestBody(
      'claude-sonnet-5',
      [],
      [{ text: 'hi' }],
      {
        maxOutputTokens: 2048,
        stopSequences: ['Human:', 'Assistant:'],
      },
      'user',
      false,
    );

    expect(body.max_tokens).toBe(2048);
    expect(body.stop_sequences).toEqual(['Human:', 'Assistant:']);
  });
});
