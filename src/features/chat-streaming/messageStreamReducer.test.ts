import { describe, expect, it, vi } from 'vitest';
import type { Part, UsageMetadata } from '@google/genai';
import { createMessageStreamState, reduceMessageStreamEvent } from './messageStreamReducer';

type MessageStreamEvent = Parameters<typeof reduceMessageStreamEvent>[1];

vi.mock('@/utils/chat/ids', () => ({
  generateUniqueId: () => 'generated-id',
}));

describe('messageStreamReducer', () => {
  it('accumulates content, thoughts, api parts, files, and first-token timings from normalized events', () => {
    const generationStartTime = new Date('2026-05-05T10:00:00.000Z');
    const firstTokenTime = new Date('2026-05-05T10:00:00.125Z');
    const firstContentTime = new Date('2026-05-05T10:00:00.250Z');

    const events: MessageStreamEvent[] = [
      { type: 'thought', text: 'I should calculate.', receivedAt: firstTokenTime },
      { type: 'part', part: { text: 'Result: ' } as Part, receivedAt: firstContentTime },
      {
        type: 'part',
        part: { executableCode: { language: 'PYTHON', code: 'print(42)' } } as Part,
        receivedAt: firstContentTime,
      },
      {
        type: 'part',
        part: { codeExecutionResult: { outcome: 'OUTCOME_OK', output: '42\n' } } as Part,
        receivedAt: firstContentTime,
      },
      {
        type: 'part',
        part: { inlineData: { mimeType: 'image/png', data: 'Y2hhcnQ=' }, thoughtSignature: 'sig-image' } as Part,
        receivedAt: firstContentTime,
      },
    ];
    const state = events.reduce(
      reduceMessageStreamEvent,
      createMessageStreamState({ generationId: 'model-message', generationStartTime }),
    );

    expect(state.content).toContain('Result: ');
    expect(state.content).toContain('<pre class="code-exec-code"><code class="language-python">print(42)</code></pre>');
    expect(state.content).toContain('class="tool-result outcome-ok"');
    expect(state.thoughts).toBe('I should calculate.');
    expect(state.apiParts).toEqual([
      { text: 'Result: ' },
      { executableCode: { language: 'PYTHON', code: 'print(42)' } },
      { codeExecutionResult: { outcome: 'OUTCOME_OK', output: '42\n' } },
      { inlineData: { mimeType: 'image/png', data: 'Y2hhcnQ=' }, thoughtSignature: 'sig-image' },
    ]);
    expect(state.files).toEqual([
      expect.objectContaining({
        name: 'generated-plot-d-id.png',
        type: 'image/png',
      }),
    ]);
    expect(state.firstTokenTimeMs).toBe(125);
    expect(state.firstContentPartTime).toEqual(firstContentTime);
  });

  it('merges usage, grounding, and url context metadata from repeated completion events', () => {
    const events: MessageStreamEvent[] = [
      {
        type: 'complete',
        usage: {
          promptTokenCount: 10,
          responseTokenCount: 2,
          totalTokenCount: 12,
          responseTokensDetails: [{ modality: 'TEXT', tokenCount: 2 }],
        } as UsageMetadata,
        grounding: {
          webSearchQueries: ['alpha'],
          citations: [{ uri: 'https://example.com/a' }],
        },
        urlContext: {
          urlMetadata: [{ retrievedUrl: 'https://example.com/doc', urlRetrievalStatus: 'FAILED' }],
        },
      },
      {
        type: 'complete',
        usage: {
          responseTokenCount: 3,
          totalTokenCount: 3,
          responseTokensDetails: [{ modality: 'TEXT', tokenCount: 3 }],
        } as UsageMetadata,
        grounding: {
          webSearchQueries: ['alpha', 'beta'],
          citations: [{ uri: 'https://example.com/a' }, { uri: 'https://example.com/b' }],
        },
        urlContext: {
          urlMetadata: [{ retrievedUrl: 'https://example.com/doc', urlRetrievalStatus: 'SUCCESS' }],
        },
      },
    ];
    const state = events.reduce(
      reduceMessageStreamEvent,
      createMessageStreamState({ generationId: 'model-message', generationStartTime: new Date(0) }),
    );

    expect(state.usage).toEqual({
      promptTokenCount: 10,
      responseTokenCount: 5,
      totalTokenCount: 15,
      responseTokensDetails: [{ modality: 'TEXT', tokenCount: 5 }],
    });
    expect(state.grounding).toEqual({
      webSearchQueries: ['alpha', 'beta'],
      citations: [{ uri: 'https://example.com/a' }, { uri: 'https://example.com/b' }],
    });
    expect(state.urlContext).toEqual({
      urlMetadata: [{ retrievedUrl: 'https://example.com/doc', urlRetrievalStatus: 'SUCCESS' }],
    });
  });

  it('preserves recursive url context metadata while replacing repeated URL retrieval statuses', () => {
    const state = [
      {
        type: 'complete',
        urlContext: {
          nested: { first: true },
          extraUrls: ['https://example.com/a'],
          urlMetadata: [{ retrievedUrl: 'https://example.com/doc', urlRetrievalStatus: 'FAILED' }],
        },
      },
      {
        type: 'complete',
        urlContext: {
          nested: { second: true },
          extraUrls: ['https://example.com/a', 'https://example.com/b'],
          urlMetadata: [{ retrievedUrl: 'https://example.com/doc', urlRetrievalStatus: 'SUCCESS' }],
        },
      },
    ] satisfies MessageStreamEvent[];

    const stateAfterEvents = state.reduce(
      reduceMessageStreamEvent,
      createMessageStreamState({ generationId: 'model-message', generationStartTime: new Date(0) }),
    );

    expect(stateAfterEvents.urlContext).toEqual({
      nested: { first: true, second: true },
      extraUrls: ['https://example.com/a', 'https://example.com/b'],
      urlMetadata: [{ retrievedUrl: 'https://example.com/doc', urlRetrievalStatus: 'SUCCESS' }],
    });
  });

  it('tracks thinking as active until the first content part, keeps it active through code-execution round trips, and resumes on re-entered thought', () => {
    const start = new Date('2026-05-05T10:00:00.000Z');
    const thoughtAt = new Date('2026-05-05T10:00:00.100Z');
    const textAt = new Date('2026-05-05T10:00:00.300Z');
    const codeAt = new Date('2026-05-05T10:00:00.400Z');
    const reThoughtAt = new Date('2026-05-05T10:00:00.500Z');

    const state = (
      [
        { type: 'thought', text: 'First pass', receivedAt: thoughtAt },
        { type: 'part', part: { text: 'Run this' } as Part, receivedAt: textAt },
        // Code execution is a tooling round trip: it must not end thinking.
        {
          type: 'part',
          part: { executableCode: { language: 'PYTHON', code: 'print(1)' } } as Part,
          receivedAt: codeAt,
        },
        {
          type: 'part',
          part: { codeExecutionResult: { outcome: 'OUTCOME_OK', output: '1' } } as Part,
          receivedAt: codeAt,
        },
        { type: 'thought', text: 'Re-entered thinking', receivedAt: reThoughtAt },
      ] satisfies MessageStreamEvent[]
    ).reduce(
      reduceMessageStreamEvent,
      createMessageStreamState({ generationId: 'model-message', generationStartTime: start }),
    );

    expect(state.firstTokenTimeMs).toBe(100);
    expect(state.firstContentPartTime).toEqual(textAt);
    expect(state.lastContentPartTime).toEqual(textAt);
    expect(state.thinkingActive).toBe(true);
    expect(state.lastThoughtChunkTimeMs).toBe(500);
  });

  it('does not advance timing fields for replayed parts (non-streaming reply / tool-loop final turn)', () => {
    const start = new Date('2026-05-05T10:00:00.000Z');
    const replayAt = new Date('2026-05-05T10:00:08.200Z');

    const state = (
      [
        { type: 'thought', text: 'Replayed reasoning', receivedAt: replayAt, recordFirstToken: false },
        { type: 'part', part: { text: 'Replayed answer' } as Part, receivedAt: replayAt, recordFirstToken: false },
      ] satisfies MessageStreamEvent[]
    ).reduce(
      reduceMessageStreamEvent,
      createMessageStreamState({ generationId: 'model-message', generationStartTime: start }),
    );

    // No first-token stamp, no per-chunk thought timing, no content switch: the
    // whole replay is measured once at finalize (firstContentPartTime - start).
    expect(state.firstTokenTimeMs).toBeUndefined();
    expect(state.lastThoughtChunkTimeMs).toBeUndefined();
    expect(state.thinkingActive).toBe(false);
    expect(state.firstContentPartTime).toEqual(replayAt);
  });

  it('applies split content and thought deltas while keeping the original part in apiParts', () => {
    const start = new Date('2026-05-05T10:00:00.000Z');
    const at = new Date('2026-05-05T10:00:00.100Z');

    const state = (
      [
        {
          type: 'part',
          part: { text: '<thinking>Plan.</thinking>Answer.' } as Part,
          contentDelta: 'Answer.',
          thoughtDelta: 'Plan.',
          receivedAt: at,
        },
      ] satisfies MessageStreamEvent[]
    ).reduce(
      reduceMessageStreamEvent,
      createMessageStreamState({ generationId: 'model-message', generationStartTime: start }),
    );

    expect(state.content).toBe('Answer.');
    expect(state.thoughts).toBe('Plan.');
    // apiParts keep the raw part text so history replay and stripReasoningMarkup
    // semantics are unchanged.
    expect(state.apiParts).toEqual([{ text: '<thinking>Plan.</thinking>Answer.' }]);
    // First token is stamped on the part (the first thought chunk counts), but
    // first content time only when the visible answer arrives.
    expect(state.firstTokenTimeMs).toBe(100);
    expect(state.firstContentPartTime).toEqual(at);
    expect(state.lastContentPartTime).toEqual(at);
    expect(state.thinkingActive).toBe(false);
  });

  it('records a thought-only delta as thought without ending thinking', () => {
    const start = new Date('2026-05-05T10:00:00.000Z');
    const at = new Date('2026-05-05T10:00:00.100Z');

    const state = (
      [
        {
          type: 'part',
          part: { text: '<thinking>deep reasoning' } as Part,
          contentDelta: '',
          thoughtDelta: 'deep reasoning',
          receivedAt: at,
        },
      ] satisfies MessageStreamEvent[]
    ).reduce(
      reduceMessageStreamEvent,
      createMessageStreamState({ generationId: 'model-message', generationStartTime: start }),
    );

    expect(state.content).toBe('');
    expect(state.thoughts).toBe('deep reasoning');
    // The visible answer has not arrived yet.
    expect(state.firstContentPartTime).toBeNull();
    expect(state.lastContentPartTime).toBeUndefined();
    expect(state.thinkingActive).toBe(true);
    expect(state.lastThoughtChunkTimeMs).toBe(100);
    // First token still counts the reasoning chunk.
    expect(state.firstTokenTimeMs).toBe(100);
  });

  it('falls back to getContentDeltaFromPart when split deltas are absent', () => {
    const start = new Date('2026-05-05T10:00:00.000Z');
    const at = new Date('2026-05-05T10:00:00.100Z');

    const state = (
      [{ type: 'part', part: { text: 'Hello' } as Part, receivedAt: at }] satisfies MessageStreamEvent[]
    ).reduce(
      reduceMessageStreamEvent,
      createMessageStreamState({ generationId: 'model-message', generationStartTime: start }),
    );

    expect(state.content).toBe('Hello');
    expect(state.thoughts).toBe('');
    expect(state.firstContentPartTime).toEqual(at);
    expect(state.thinkingActive).toBe(false);
  });

  it('tracks the split thinking state machine across interleaved thought/content deltas', () => {
    const start = new Date('2026-05-05T10:00:00.000Z');
    const t1 = new Date('2026-05-05T10:00:00.100Z');
    const t2 = new Date('2026-05-05T10:00:00.300Z');
    const t3 = new Date('2026-05-05T10:00:00.500Z');

    const state = (
      [
        {
          type: 'part',
          part: { text: '<thinking>one</thinking>' } as Part,
          contentDelta: '',
          thoughtDelta: 'one',
          receivedAt: t1,
        },
        { type: 'part', part: { text: 'Answer' } as Part, contentDelta: 'Answer', thoughtDelta: '', receivedAt: t2 },
        {
          type: 'part',
          part: { text: '<thinking>two</thinking>' } as Part,
          contentDelta: '',
          thoughtDelta: 'two',
          receivedAt: t3,
        },
      ] satisfies MessageStreamEvent[]
    ).reduce(
      reduceMessageStreamEvent,
      createMessageStreamState({ generationId: 'model-message', generationStartTime: start }),
    );

    expect(state.content).toBe('Answer');
    expect(state.thoughts).toBe('onetwo');
    expect(state.firstContentPartTime).toEqual(t2);
    expect(state.lastContentPartTime).toEqual(t2);
    // Re-entered thinking after the content switch stays active.
    expect(state.thinkingActive).toBe(true);
    expect(state.lastThoughtChunkTimeMs).toBe(500);
  });

  it('replays split thought deltas into thoughts without advancing timing', () => {
    const start = new Date('2026-05-05T10:00:00.000Z');
    const replayAt = new Date('2026-05-05T10:00:08.200Z');

    const state = (
      [
        {
          type: 'part',
          part: { text: '<thinking>R</thinking>A' } as Part,
          contentDelta: 'A',
          thoughtDelta: 'R',
          receivedAt: replayAt,
          recordFirstToken: false,
        },
      ] satisfies MessageStreamEvent[]
    ).reduce(
      reduceMessageStreamEvent,
      createMessageStreamState({ generationId: 'model-message', generationStartTime: start }),
    );

    expect(state.content).toBe('A');
    expect(state.thoughts).toBe('R');
    expect(state.thinkingActive).toBe(false);
    expect(state.lastThoughtChunkTimeMs).toBeUndefined();
    expect(state.firstTokenTimeMs).toBeUndefined();
  });
});
