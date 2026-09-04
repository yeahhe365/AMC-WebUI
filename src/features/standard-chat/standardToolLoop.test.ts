import { describe, expect, it, vi } from 'vitest';
import type { Part } from '@google/genai';
import type { ChatHistoryItem } from '@/types';
import { createUploadedFile } from '@/test/data/factories';
import { runStandardToolLoop, DEFAULT_TOOL_LOOP_ROUNDS } from './standardToolLoop';

describe('runStandardToolLoop', () => {
  it('returns immediately when the model responds without function calls', async () => {
    const initialContents: ChatHistoryItem[] = [{ role: 'user', parts: [{ text: 'Hello' }] }];
    const runTurn = vi.fn().mockResolvedValue({
      modelContent: { role: 'model', parts: [{ text: 'Hi there' }] },
      parts: [{ text: 'Hi there' }],
      thoughts: undefined,
      functionCalls: [],
      usage: undefined,
      grounding: undefined,
      urlContext: undefined,
    });

    const result = await runStandardToolLoop({
      initialContents,
      clientFunctions: {},
      runTurn,
    });

    expect(runTurn).toHaveBeenCalledTimes(1);
    expect(result.toolMessages).toEqual([]);
    expect(result.generatedFiles).toEqual([]);
    expect(result.finalTurn.parts).toEqual([{ text: 'Hi there' }]);
  });

  it('executes tool calls, appends function responses, and continues until a final model answer is returned', async () => {
    const initialContents: ChatHistoryItem[] = [{ role: 'user', parts: [{ text: 'Calculate 6 * 7' }] }];
    const toolCallMessage = {
      role: 'model' as const,
      parts: [
        {
          functionCall: {
            id: 'call-1',
            name: 'run_local_python',
            args: { code: 'print(6 * 7)' },
          },
        },
      ],
    };
    const generatedFile = createUploadedFile({ name: 'chart.png' });
    const runTurn = vi
      .fn()
      .mockResolvedValueOnce({
        modelContent: toolCallMessage,
        parts: [],
        thoughts: 'Need a calculation.',
        functionCalls: [
          {
            id: 'call-1',
            name: 'run_local_python',
            args: { code: 'print(6 * 7)' },
          },
        ],
        usage: undefined,
        grounding: undefined,
        urlContext: undefined,
      })
      .mockResolvedValueOnce({
        modelContent: { role: 'model' as const, parts: [{ text: 'The result is 42.' }] },
        parts: [{ text: 'The result is 42.' }],
        thoughts: undefined,
        functionCalls: [],
        usage: { totalTokenCount: 10 },
        grounding: undefined,
        urlContext: undefined,
      });

    const result = await runStandardToolLoop({
      initialContents,
      clientFunctions: {
        run_local_python: {
          declaration: {
            name: 'run_local_python',
            description: 'Run Python locally.',
          },
          handler: vi.fn(async () => ({
            response: { result: { output: '42' } },
            generatedFiles: [generatedFile],
          })),
        },
      },
      runTurn,
    });

    expect(runTurn).toHaveBeenCalledTimes(2);
    expect(runTurn.mock.calls[1][0]).toEqual([
      ...initialContents,
      toolCallMessage,
      {
        role: 'user',
        parts: [
          {
            functionResponse: {
              id: 'call-1',
              name: 'run_local_python',
              response: { result: { output: '42' } },
            },
          },
        ],
      },
    ]);
    expect(result.toolMessages).toEqual([
      {
        modelContent: toolCallMessage,
        functionResponseParts: [
          {
            functionResponse: {
              id: 'call-1',
              name: 'run_local_python',
              response: { result: { output: '42' } },
            },
          },
        ],
      },
    ]);
    expect(result.generatedFiles).toEqual([generatedFile]);
    expect(result.finalTurn.parts).toEqual([{ text: 'The result is 42.' }]);
  });

  it('passes the request abort signal to client tool handlers', async () => {
    const abortController = new AbortController();
    const toolHandler = vi.fn(async () => ({
      response: { result: 'ok' },
    }));
    const runTurn = vi
      .fn()
      .mockResolvedValueOnce({
        modelContent: {
          role: 'model' as const,
          parts: [
            {
              functionCall: {
                id: 'call-1',
                name: 'run_local_python',
                args: { code: 'print(42)' },
              },
            },
          ],
        },
        parts: [],
        functionCalls: [
          {
            id: 'call-1',
            name: 'run_local_python',
            args: { code: 'print(42)' },
          },
        ],
      })
      .mockResolvedValueOnce({
        modelContent: { role: 'model' as const, parts: [{ text: 'done' }] },
        parts: [{ text: 'done' }],
        functionCalls: [],
      });

    await runStandardToolLoop({
      initialContents: [{ role: 'user', parts: [{ text: 'Calculate.' }] }],
      clientFunctions: {
        run_local_python: {
          declaration: {
            name: 'run_local_python',
            description: 'Run Python locally.',
          },
          handler: toolHandler,
        },
      },
      runTurn,
      abortSignal: abortController.signal,
    });

    expect(toolHandler).toHaveBeenCalledWith({ code: 'print(42)' }, { abortSignal: abortController.signal });
  });

  it('aggregates usage and metadata from earlier tool turns into the returned final turn', async () => {
    const initialContents: ChatHistoryItem[] = [{ role: 'user', parts: [{ text: 'Research and calculate.' }] }];
    const toolCallMessage = {
      role: 'model' as const,
      parts: [
        {
          functionCall: {
            id: 'call-1',
            name: 'run_local_python',
            args: { code: 'print(6 * 7)' },
          },
        },
      ],
    };
    const runTurn = vi
      .fn()
      .mockResolvedValueOnce({
        modelContent: toolCallMessage,
        parts: [],
        thoughts: undefined,
        functionCalls: [
          {
            id: 'call-1',
            name: 'run_local_python',
            args: { code: 'print(6 * 7)' },
          },
        ],
        usage: {
          promptTokenCount: 10,
          toolUsePromptTokenCount: 5,
          totalTokenCount: 20,
          promptTokensDetails: [{ modality: 'TEXT', tokenCount: 10 }],
          toolUsePromptTokensDetails: [{ modality: 'TEXT', tokenCount: 5 }],
          responseTokensDetails: [{ modality: 'TEXT', tokenCount: 5 }],
        },
        grounding: {
          citations: [{ uri: 'https://example.com/search' }],
          webSearchQueries: ['latest weather'],
        },
        urlContext: {
          urlMetadata: [{ retrievedUrl: 'https://example.com/doc-a' }],
        },
      })
      .mockResolvedValueOnce({
        modelContent: { role: 'model' as const, parts: [{ text: 'The result is 42.' }] },
        parts: [{ text: 'The result is 42.' }],
        thoughts: undefined,
        functionCalls: [],
        usage: {
          responseTokenCount: 7,
          totalTokenCount: 7,
          responseTokensDetails: [{ modality: 'TEXT', tokenCount: 7 }],
        },
        grounding: {
          citations: [{ uri: 'https://example.com/final' }],
        },
        urlContext: {
          urlMetadata: [{ retrievedUrl: 'https://example.com/doc-b' }],
        },
      });

    const result = await runStandardToolLoop({
      initialContents,
      clientFunctions: {
        run_local_python: {
          declaration: {
            name: 'run_local_python',
            description: 'Run Python locally.',
          },
          handler: vi.fn(async () => ({
            response: { output: '42' },
            generatedFiles: [],
          })),
        },
      },
      runTurn,
    });

    expect(result.finalTurn.usage).toEqual({
      promptTokenCount: 10,
      toolUsePromptTokenCount: 5,
      responseTokenCount: 12,
      totalTokenCount: 27,
      promptTokensDetails: [{ modality: 'TEXT', tokenCount: 10 }],
      toolUsePromptTokensDetails: [{ modality: 'TEXT', tokenCount: 5 }],
      responseTokensDetails: [{ modality: 'TEXT', tokenCount: 12 }],
    });
    expect(result.finalTurn.grounding).toEqual({
      citations: [{ uri: 'https://example.com/final' }, { uri: 'https://example.com/search' }],
      webSearchQueries: ['latest weather'],
    });
    expect(result.finalTurn.urlContext).toEqual({
      urlMetadata: [{ retrievedUrl: 'https://example.com/doc-a' }, { retrievedUrl: 'https://example.com/doc-b' }],
    });
  });

  it('preserves earlier grounding sources without merging prior support offsets into the final turn', async () => {
    const initialContents: ChatHistoryItem[] = [{ role: 'user', parts: [{ text: 'Search and then answer.' }] }];
    const toolCallMessage = {
      role: 'model' as const,
      parts: [
        {
          functionCall: {
            id: 'call-1',
            name: 'run_local_python',
            args: { code: 'print(42)' },
          },
        },
      ],
    };
    const runTurn = vi
      .fn()
      .mockResolvedValueOnce({
        modelContent: toolCallMessage,
        parts: [],
        thoughts: undefined,
        functionCalls: [
          {
            id: 'call-1',
            name: 'run_local_python',
            args: { code: 'print(42)' },
          },
        ],
        usage: undefined,
        grounding: {
          webSearchQueries: ['alpha query'],
          groundingChunks: [
            {
              web: {
                uri: 'https://example.com/alpha',
                title: 'Alpha source',
              },
            },
          ],
          groundingSupports: [
            {
              segment: { endIndex: 5 },
              groundingChunkIndices: [0],
            },
          ],
        },
        urlContext: undefined,
      })
      .mockResolvedValueOnce({
        modelContent: { role: 'model' as const, parts: [{ text: 'Beta' }] },
        parts: [{ text: 'Beta' }],
        thoughts: undefined,
        functionCalls: [],
        usage: undefined,
        grounding: {
          webSearchQueries: ['beta query'],
          groundingChunks: [
            {
              web: {
                uri: 'https://example.com/beta',
                title: 'Beta source',
              },
            },
          ],
          groundingSupports: [
            {
              segment: { endIndex: 4 },
              groundingChunkIndices: [0],
            },
          ],
        },
        urlContext: undefined,
      });

    const result = await runStandardToolLoop({
      initialContents,
      clientFunctions: {
        run_local_python: {
          declaration: {
            name: 'run_local_python',
            description: 'Run Python locally.',
          },
          handler: vi.fn(async () => ({
            response: { output: '42' },
            generatedFiles: [],
          })),
        },
      },
      runTurn,
    });

    expect(result.finalTurn.grounding).toEqual({
      webSearchQueries: ['alpha query', 'beta query'],
      groundingChunks: [
        {
          web: {
            uri: 'https://example.com/beta',
            title: 'Beta source',
          },
        },
      ],
      groundingSupports: [
        {
          segment: { endIndex: 4 },
          groundingChunkIndices: [0],
        },
      ],
      citations: [
        {
          uri: 'https://example.com/alpha',
          title: 'Alpha source',
        },
      ],
    });
  });

  it('keeps only the latest url-context status for a repeated URL across tool turns', async () => {
    const initialContents: ChatHistoryItem[] = [{ role: 'user', parts: [{ text: 'Follow this URL.' }] }];
    const toolCallMessage = {
      role: 'model' as const,
      parts: [
        {
          functionCall: {
            id: 'call-1',
            name: 'run_local_python',
            args: { code: 'print(42)' },
          },
        },
      ],
    };
    const runTurn = vi
      .fn()
      .mockResolvedValueOnce({
        modelContent: toolCallMessage,
        parts: [],
        thoughts: undefined,
        functionCalls: [
          {
            id: 'call-1',
            name: 'run_local_python',
            args: { code: 'print(42)' },
          },
        ],
        usage: undefined,
        grounding: undefined,
        urlContext: {
          urlMetadata: [
            {
              retrievedUrl: 'https://example.com/doc',
              urlRetrievalStatus: 'URL_RETRIEVAL_STATUS_FAILED',
            },
          ],
        },
      })
      .mockResolvedValueOnce({
        modelContent: { role: 'model' as const, parts: [{ text: 'Done.' }] },
        parts: [{ text: 'Done.' }],
        thoughts: undefined,
        functionCalls: [],
        usage: undefined,
        grounding: undefined,
        urlContext: {
          urlMetadata: [
            {
              retrievedUrl: 'https://example.com/doc',
              urlRetrievalStatus: 'URL_RETRIEVAL_STATUS_SUCCESS',
            },
          ],
        },
      });

    const result = await runStandardToolLoop({
      initialContents,
      clientFunctions: {
        run_local_python: {
          declaration: {
            name: 'run_local_python',
            description: 'Run Python locally.',
          },
          handler: vi.fn(async () => ({
            response: { output: '42' },
            generatedFiles: [],
          })),
        },
      },
      runTurn,
    });

    expect(result.finalTurn.urlContext).toEqual({
      urlMetadata: [
        {
          retrievedUrl: 'https://example.com/doc',
          urlRetrievalStatus: 'URL_RETRIEVAL_STATUS_SUCCESS',
        },
      ],
    });
  });

  it('uses the latest available search entry point across grounded tool turns', async () => {
    const initialContents: ChatHistoryItem[] = [{ role: 'user', parts: [{ text: 'Search twice and answer.' }] }];
    const toolCallMessage = {
      role: 'model' as const,
      parts: [
        {
          functionCall: {
            id: 'call-1',
            name: 'run_local_python',
            args: { code: 'print(42)' },
          },
        },
      ],
    };
    const runTurn = vi
      .fn()
      .mockResolvedValueOnce({
        modelContent: toolCallMessage,
        parts: [],
        thoughts: undefined,
        functionCalls: [
          {
            id: 'call-1',
            name: 'run_local_python',
            args: { code: 'print(42)' },
          },
        ],
        usage: undefined,
        grounding: {
          webSearchQueries: ['alpha query'],
          searchEntryPoint: {
            renderedContent: '<div>alpha widget</div>',
          },
        },
        urlContext: undefined,
      })
      .mockResolvedValueOnce({
        modelContent: toolCallMessage,
        parts: [],
        thoughts: undefined,
        functionCalls: [
          {
            id: 'call-1',
            name: 'run_local_python',
            args: { code: 'print(42)' },
          },
        ],
        usage: undefined,
        grounding: {
          webSearchQueries: ['beta query'],
          searchEntryPoint: {
            renderedContent: '<div>beta widget</div>',
          },
        },
        urlContext: undefined,
      })
      .mockResolvedValueOnce({
        modelContent: { role: 'model' as const, parts: [{ text: 'Done.' }] },
        parts: [{ text: 'Done.' }],
        thoughts: undefined,
        functionCalls: [],
        usage: undefined,
        grounding: {
          webSearchQueries: ['final query'],
        },
        urlContext: undefined,
      });

    const result = await runStandardToolLoop({
      initialContents,
      clientFunctions: {
        run_local_python: {
          declaration: {
            name: 'run_local_python',
            description: 'Run Python locally.',
          },
          handler: vi.fn(async () => ({
            response: { output: '42' },
            generatedFiles: [],
          })),
        },
      },
      runTurn,
    });

    expect(result.finalTurn.grounding).toEqual({
      webSearchQueries: ['alpha query', 'beta query', 'final query'],
      searchEntryPoint: {
        renderedContent: '<div>beta widget</div>',
      },
    });
  });

  it('fires live-surface callbacks per iteration: calls started before responses settle', async () => {
    const initialContents: ChatHistoryItem[] = [{ role: 'user', parts: [{ text: 'Do two things' }] }];
    const toolCallMessage = {
      role: 'model' as const,
      parts: [
        {
          functionCall: {
            id: `call-${1}`,
            name: 'run_local_python',
            args: { code: '1' },
          },
        },
      ],
    };
    let resolveFirstHandler: ((value: { response: unknown }) => void) | undefined;
    const runTurn = vi
      .fn()
      .mockResolvedValueOnce({
        modelContent: toolCallMessage,
        parts: [],
        functionCalls: [{ id: 'call-1', name: 'run_local_python', args: { code: '1' } }],
      })
      .mockResolvedValueOnce({
        modelContent: { role: 'model' as const, parts: [{ text: 'done' }] },
        parts: [{ text: 'done' }],
        functionCalls: [],
      });
    const clientFunctions = {
      run_local_python: {
        declaration: { name: 'run_local_python', description: 'test' },
        handler: vi.fn(
          () =>
            new Promise<{ response: unknown }>((resolve) => {
              resolveFirstHandler = resolve;
            }),
        ),
      },
    };
    const events: string[] = [];
    const onToolCallsStarted = vi.fn((_modelContent: ChatHistoryItem) => {
      events.push('calls-started');
    });
    const onToolResponsesSettled = vi.fn((_parts: Part[]) => {
      events.push('responses-settled');
    });

    const loopPromise = runStandardToolLoop({
      initialContents,
      clientFunctions,
      runTurn,
      onToolCallsStarted,
      onToolResponsesSettled,
    });

    // The calls-started callback fires while the handler is still pending.
    await Promise.resolve();
    expect(events).toEqual(['calls-started']);
    expect(onToolCallsStarted).toHaveBeenCalledWith(toolCallMessage);

    resolveFirstHandler?.({ response: { ok: true } });
    await loopPromise;

    expect(events).toEqual(['calls-started', 'responses-settled']);
    expect(onToolResponsesSettled).toHaveBeenCalledTimes(1);
    const parts = onToolResponsesSettled.mock.calls[0][0];
    expect(parts[0]?.functionResponse?.name).toBe('run_local_python');
  });
});

describe('runStandardToolLoop round cap', () => {
  const makeCallTurn = (round: number) => ({
    modelContent: {
      role: 'model' as const,
      parts: [{ functionCall: { id: `call-${round}`, name: 'tick', args: { round } } }],
    },
    parts: [] as Part[],
    thoughts: undefined,
    functionCalls: [{ id: `call-${round}`, name: 'tick', args: { round } }],
    usage: undefined,
    grounding: undefined,
    urlContext: undefined,
  });

  it('stops gracefully after maxToolRounds rounds, keeping completed rounds and appending a notice', async () => {
    // Sentinel: without a round cap the loop keeps calling runTurn forever and
    // trips this error, failing the test deterministically.
    let calls = 0;
    const runTurn = vi.fn(async () => {
      calls += 1;
      if (calls > 3) throw new Error('SENTINEL_LIMIT');
      return makeCallTurn(calls);
    });
    const handler = vi.fn(async () => ({ response: { ok: true } }));

    const result = await runStandardToolLoop({
      initialContents: [],
      clientFunctions: {
        tick: {
          declaration: { name: 'tick', description: 'Endless caller.' },
          handler,
        },
      },
      runTurn,
      maxToolRounds: 3,
    });

    // Rounds 1 and 2 executed their tool calls; round 3's calls are not run.
    expect(runTurn).toHaveBeenCalledTimes(3);
    expect(handler).toHaveBeenCalledTimes(2);
    expect(result.toolMessages).toHaveLength(2);

    const noticeParts = result.finalTurn.parts.filter(
      (part) => typeof part.text === 'string' && part.text.includes('tool'),
    );
    expect(noticeParts).toHaveLength(1);
  });

  it('applies the default round cap when maxToolRounds is not provided', async () => {
    let calls = 0;
    const runTurn = vi.fn(async () => {
      calls += 1;
      // Literal 50: the constant doesn't exist yet before implementation, and
      // an undefined sentinel comparison would never fire (runaway loop).
      if (calls > 50) throw new Error('SENTINEL_LIMIT');
      return makeCallTurn(calls);
    });
    const handler = vi.fn(async () => ({ response: { ok: true } }));

    const result = await runStandardToolLoop({
      initialContents: [],
      clientFunctions: {
        tick: {
          declaration: { name: 'tick', description: 'Endless caller.' },
          handler,
        },
      },
      runTurn,
    });

    expect(runTurn).toHaveBeenCalledTimes(DEFAULT_TOOL_LOOP_ROUNDS);
    expect(handler).toHaveBeenCalledTimes(DEFAULT_TOOL_LOOP_ROUNDS - 1);
    expect(result.finalTurn.parts.some((part) => typeof part.text === 'string')).toBe(true);
  });
});
