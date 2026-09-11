import { describe, expect, it } from 'vitest';
import { buildOpenAIResponsesRequestBody } from './openaiResponsesMessages';

describe('openaiResponsesMessages', () => {
  it('maps chat history and current parts to OpenAI Responses input and instructions', () => {
    expect(
      buildOpenAIResponsesRequestBody(
        'gpt-4o',
        [{ role: 'model', parts: [{ text: 'previous answer' }] }],
        [{ text: 'current question' }],
        { systemInstruction: 'Be concise.', temperature: 0.7, topP: 0.9, maxOutputTokens: 2048 },
        'user',
        false,
      ),
    ).toEqual({
      model: 'gpt-4o',
      input: [
        { role: 'assistant', content: 'previous answer' },
        { role: 'user', content: 'current question' },
      ],
      instructions: 'Be concise.',
      stream: false,
      temperature: 0.7,
      top_p: 0.9,
      max_output_tokens: 2048,
    });
  });

  it('maps inline image and audio parts to OpenAI Responses input content items', () => {
    const body = buildOpenAIResponsesRequestBody(
      'gpt-4o',
      [],
      [
        { text: 'analyze this media' },
        { inlineData: { mimeType: 'image/jpeg', data: 'jpeg-base64' } },
        { inlineData: { mimeType: 'audio/mp3', data: 'mp3-base64' } },
      ],
      {},
      'user',
      true,
    );

    expect(body).toEqual({
      model: 'gpt-4o',
      input: [
        {
          role: 'user',
          content: [
            { type: 'input_text', text: 'analyze this media' },
            { type: 'input_image', image_url: 'data:image/jpeg;base64,jpeg-base64' },
            { type: 'input_audio', input_audio: { data: 'mp3-base64', format: 'mp3' } },
          ],
        },
      ],
      stream: true,
    });
  });

  it('rejects Gemini Files API fileData attachments with a clear error', () => {
    expect(() =>
      buildOpenAIResponsesRequestBody(
        'gpt-4o',
        [],
        [{ fileData: { mimeType: 'image/png', fileUri: 'https://generativelanguage.googleapis.com/v1/files/abc' } }],
        {},
        'user',
        false,
      ),
    ).toThrow('OpenAI Responses mode cannot send Gemini Files API file references.');
  });

  it('maps thinkingLevel to reasoning.effort', () => {
    expect(
      buildOpenAIResponsesRequestBody('o4-mini', [], [{ text: 'hi' }], { thinkingLevel: 'HIGH' }, 'user', false),
    ).toMatchObject({
      reasoning: { effort: 'high' },
    });

    expect(
      buildOpenAIResponsesRequestBody('o4-mini', [], [{ text: 'hi' }], { thinkingLevel: 'MEDIUM' }, 'user', false),
    ).toMatchObject({
      reasoning: { effort: 'medium' },
    });

    expect(
      buildOpenAIResponsesRequestBody('o4-mini', [], [{ text: 'hi' }], { thinkingLevel: 'LOW' }, 'user', false),
    ).toMatchObject({
      reasoning: { effort: 'low' },
    });

    expect(
      buildOpenAIResponsesRequestBody('o4-mini', [], [{ text: 'hi' }], { thinkingLevel: 'MINIMAL' }, 'user', false),
    ).toMatchObject({
      reasoning: { effort: 'minimal' },
    });

    expect(
      buildOpenAIResponsesRequestBody('o4-mini', [], [{ text: 'hi' }], { thinkingLevel: 'XHIGH' }, 'user', false),
    ).toMatchObject({
      reasoning: { effort: 'xhigh' },
    });
  });

  it('does not attach reasoning for non-reasoning models in OpenAI Responses mode', () => {
    const body = buildOpenAIResponsesRequestBody(
      'gpt-4o',
      [],
      [{ text: 'hi' }],
      { thinkingLevel: 'HIGH' },
      'user',
      false,
    );
    expect(body.reasoning).toBeUndefined();
  });

  it('includes tools and previous_response_id when provided', () => {
    const body = buildOpenAIResponsesRequestBody(
      'gpt-4o',
      [],
      [{ text: 'search web' }],
      {
        tools: [{ type: 'web_search_preview' }],
        previousResponseId: 'resp_12345',
      },
      'user',
      false,
    );

    expect(body).toMatchObject({
      tools: [{ type: 'web_search_preview' }],
      previous_response_id: 'resp_12345',
    });
  });
});
