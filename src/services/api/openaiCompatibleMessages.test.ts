import { describe, expect, it } from 'vitest';
import { buildOpenAICompatibleRequestBody } from './openaiCompatibleMessages';

describe('openaiCompatibleMessages', () => {
  it('maps Gemini chat history and current parts to OpenAI-compatible messages', () => {
    expect(
      buildOpenAICompatibleRequestBody(
        'gemini-3-flash-preview',
        [{ role: 'model', parts: [{ text: 'previous answer' }] }],
        [{ text: 'current question' }],
        { systemInstruction: 'Be concise.', temperature: 0.4, topP: 0.9 },
        'user',
        false,
      ),
    ).toEqual({
      model: 'gemini-3-flash-preview',
      messages: [
        { role: 'system', content: 'Be concise.' },
        { role: 'assistant', content: 'previous answer' },
        { role: 'user', content: 'current question' },
      ],
      stream: false,
      temperature: 0.4,
      top_p: 0.9,
    });
  });

  it('maps inline image and audio parts to OpenAI-compatible content items', () => {
    const body = buildOpenAICompatibleRequestBody(
      'gpt-4o-mini',
      [],
      [
        { text: 'describe these' },
        { inlineData: { mimeType: 'image/png', data: 'image-data' } },
        { inlineData: { mimeType: 'audio/wav', data: 'audio-data' } },
      ],
      {},
      'user',
      true,
    );

    expect(body).toEqual({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: 'describe these' },
            { type: 'image_url', image_url: { url: 'data:image/png;base64,image-data' } },
            { type: 'input_audio', input_audio: { data: 'audio-data', format: 'wav' } },
          ],
        },
      ],
      stream: true,
      stream_options: { include_usage: true },
    });
  });

  it('maps thinkingLevel to GLM thinking enabled/disabled', () => {
    expect(
      buildOpenAICompatibleRequestBody('glm-5.2', [], [{ text: 'hi' }], { thinkingLevel: 'HIGH' }, 'user', false)
        .thinking,
    ).toEqual({ type: 'enabled' });
    expect(
      buildOpenAICompatibleRequestBody('glm-5.2', [], [{ text: 'hi' }], { thinkingLevel: 'LOW' }, 'user', false)
        .thinking,
    ).toEqual({ type: 'disabled' });
  });

  it('maps thinkingLevel to OpenAI GPT-5 reasoning_effort', () => {
    expect(
      buildOpenAICompatibleRequestBody('gpt-5.6-sol', [], [{ text: 'hi' }], { thinkingLevel: 'HIGH' }, 'user', false)
        .reasoning_effort,
    ).toBe('high');
    expect(
      buildOpenAICompatibleRequestBody(
        'gpt-5.6-terra',
        [],
        [{ text: 'hi' }],
        { thinkingLevel: 'MEDIUM' },
        'user',
        false,
      ).reasoning_effort,
    ).toBe('medium');
    expect(
      buildOpenAICompatibleRequestBody('gpt-5.6-luna', [], [{ text: 'hi' }], { thinkingLevel: 'LOW' }, 'user', false)
        .reasoning_effort,
    ).toBe('low');
    expect(
      buildOpenAICompatibleRequestBody('gpt-5.6-sol', [], [{ text: 'hi' }], { thinkingLevel: 'MINIMAL' }, 'user', false)
        .reasoning_effort,
    ).toBe('minimal');
    expect(
      buildOpenAICompatibleRequestBody('gpt-5.6-sol', [], [{ text: 'hi' }], { thinkingLevel: 'NONE' }, 'user', false)
        .reasoning_effort,
    ).toBe('none');
    expect(
      buildOpenAICompatibleRequestBody('gpt-5.6-sol', [], [{ text: 'hi' }], { thinkingLevel: 'XHIGH' }, 'user', false)
        .reasoning_effort,
    ).toBe('xhigh');
    expect(
      buildOpenAICompatibleRequestBody('gpt-5.6-sol', [], [{ text: 'hi' }], { thinkingLevel: 'MAX' }, 'user', false)
        .reasoning_effort,
    ).toBe('max');
  });

  it('defaults GPT-5 reasoning_effort to high when thinkingLevel is omitted', () => {
    expect(
      buildOpenAICompatibleRequestBody('gpt-5.6-sol', [], [{ text: 'hi' }], {}, 'user', false).reasoning_effort,
    ).toBe('high');
  });

  it('does not attach reasoning_effort for non-GPT-5 OpenAI-compatible models', () => {
    expect(
      buildOpenAICompatibleRequestBody('gpt-4o-mini', [], [{ text: 'hi' }], { thinkingLevel: 'HIGH' }, 'user', false)
        .reasoning_effort,
    ).toBeUndefined();
  });

  it('maps thinkingLevel to Kimi K3 reasoning_effort (low/high/max)', () => {
    expect(
      buildOpenAICompatibleRequestBody('kimi-k3', [], [{ text: 'hi' }], { thinkingLevel: 'HIGH' }, 'user', false)
        .reasoning_effort,
    ).toBe('max');
    expect(
      buildOpenAICompatibleRequestBody('kimi-k3', [], [{ text: 'hi' }], { thinkingLevel: 'MEDIUM' }, 'user', false)
        .reasoning_effort,
    ).toBe('high');
    expect(
      buildOpenAICompatibleRequestBody('kimi-k3', [], [{ text: 'hi' }], { thinkingLevel: 'LOW' }, 'user', false)
        .reasoning_effort,
    ).toBe('low');
    expect(
      buildOpenAICompatibleRequestBody('kimi-k3', [], [{ text: 'hi' }], { thinkingLevel: 'MINIMAL' }, 'user', false)
        .reasoning_effort,
    ).toBe('low');
  });

  it('defaults Kimi K3 reasoning_effort to max when thinkingLevel is omitted', () => {
    expect(buildOpenAICompatibleRequestBody('kimi-k3', [], [{ text: 'hi' }], {}, 'user', false).reasoning_effort).toBe(
      'max',
    );
  });

  it('maps advanced generation parameters (max_tokens, stop, penalties, seed)', () => {
    const body = buildOpenAICompatibleRequestBody(
      'gpt-4o',
      [],
      [{ text: 'hello' }],
      {
        maxOutputTokens: 2048,
        stopSequences: ['STOP', 'END'],
        presencePenalty: 0.5,
        frequencyPenalty: 0.8,
        seed: 1234,
      },
      'user',
      false,
    );

    expect(body.max_tokens).toBe(2048);
    expect(body.stop).toEqual(['STOP', 'END']);
    expect(body.presence_penalty).toBe(0.5);
    expect(body.frequency_penalty).toBe(0.8);
    expect(body.seed).toBe(1234);
  });

  it('maps single stop sequence as a string instead of an array', () => {
    const body = buildOpenAICompatibleRequestBody(
      'gpt-4o',
      [],
      [{ text: 'hello' }],
      {
        stopSequences: ['STOP'],
      },
      'user',
      false,
    );

    expect(body.stop).toBe('STOP');
  });

  describe('reasoning parameter wire formatting and provider decoupling', () => {
    it('omits reasoning_effort for DeepSeek official endpoint (preventing HTTP 400 error)', () => {
      const bodyWithTemplate = buildOpenAICompatibleRequestBody(
        'deepseek-reasoner',
        [],
        [{ text: 'reason for me' }],
        { templateId: 'deepseek', thinkingLevel: 'HIGH' },
        'user',
        false,
      );
      expect(bodyWithTemplate.reasoning_effort).toBeUndefined();

      const bodyWithBaseUrl = buildOpenAICompatibleRequestBody(
        'deepseek-reasoner',
        [],
        [{ text: 'reason for me' }],
        { baseUrl: 'https://api.deepseek.com/chat/completions', thinkingLevel: 'HIGH' },
        'user',
        false,
      );
      expect(bodyWithBaseUrl.reasoning_effort).toBeUndefined();
    });

    it('formats thinking mode for DeepSeek V4 without sending reasoning_effort', () => {
      const enabledBody = buildOpenAICompatibleRequestBody(
        'deepseek-v4-flash',
        [],
        [{ text: 'hello' }],
        { templateId: 'deepseek', thinkingLevel: 'HIGH' },
        'user',
        false,
      );
      expect(enabledBody.thinking).toEqual({ type: 'enabled' });
      expect(enabledBody.reasoning_effort).toBeUndefined();

      const disabledBody = buildOpenAICompatibleRequestBody(
        'deepseek-v4-pro',
        [],
        [{ text: 'hello' }],
        { templateId: 'deepseek', thinkingLevel: 'NONE' },
        'user',
        false,
      );
      expect(disabledBody.thinking).toEqual({ type: 'disabled' });
      expect(disabledBody.reasoning_effort).toBeUndefined();
    });

    it('maps thinkingLevel to enable_thinking on DashScope without sending reasoning_effort', () => {
      const enabledBody = buildOpenAICompatibleRequestBody(
        'qwq-32b',
        [],
        [{ text: 'solve math' }],
        { templateId: 'dashscope', thinkingLevel: 'HIGH', thinkingBudget: 4096 },
        'user',
        false,
      );
      expect(enabledBody.enable_thinking).toBe(true);
      expect(enabledBody.thinking_budget).toBe(4096);
      expect(enabledBody.reasoning_effort).toBeUndefined();

      const disabledBody = buildOpenAICompatibleRequestBody(
        'qwq-32b',
        [],
        [{ text: 'solve math' }],
        {
          baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
          thinkingLevel: 'NONE',
        },
        'user',
        false,
      );
      expect(disabledBody.enable_thinking).toBe(false);
      expect(disabledBody.thinking_budget).toBeUndefined();
      expect(disabledBody.reasoning_effort).toBeUndefined();
    });

    it('omits reasoning_effort for local engines (Ollama and LM Studio)', () => {
      const ollamaBody = buildOpenAICompatibleRequestBody(
        'deepseek-r1:8b',
        [],
        [{ text: 'local reasoning' }],
        { templateId: 'ollama', thinkingLevel: 'HIGH' },
        'user',
        false,
      );
      expect(ollamaBody.reasoning_effort).toBeUndefined();

      const lmStudioBody = buildOpenAICompatibleRequestBody(
        'qwq:32b',
        [],
        [{ text: 'local reasoning' }],
        { baseUrl: 'http://localhost:1234/v1', thinkingLevel: 'HIGH' },
        'user',
        false,
      );
      expect(lmStudioBody.reasoning_effort).toBeUndefined();
    });

    it('attaches reasoning_effort for reasoning models on third-party proxies (e.g. OpenRouter, SiliconFlow)', () => {
      const openRouterBody = buildOpenAICompatibleRequestBody(
        'deepseek-ai/DeepSeek-R1',
        [],
        [{ text: 'reason' }],
        { templateId: 'openrouter', thinkingLevel: 'MEDIUM' },
        'user',
        false,
      );
      expect(openRouterBody.reasoning_effort).toBe('medium');

      const siliconFlowBody = buildOpenAICompatibleRequestBody(
        'deepseek-ai/DeepSeek-R1-Distill-Qwen-32B',
        [],
        [{ text: 'reason' }],
        { templateId: 'siliconflow', thinkingLevel: 'HIGH' },
        'user',
        false,
      );
      expect(siliconFlowBody.reasoning_effort).toBe('high');

      const qwqProxyBody = buildOpenAICompatibleRequestBody(
        'qwen/qwq-32b',
        [],
        [{ text: 'reason' }],
        { templateId: 'openrouter', thinkingLevel: 'HIGH' },
        'user',
        false,
      );
      expect(qwqProxyBody.reasoning_effort).toBe('high');
    });
  });
});
