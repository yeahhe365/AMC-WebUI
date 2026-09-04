import { act } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useLiveTools } from './useLiveTools';
import type { LiveClientFunctions } from '@/types';
import { createUploadedFile } from '@/test/data/factories';
import { createLiveSessionRef, createLiveSessionStub, createLiveToolCall } from '@/test/live-api/fixtures';
import { renderHook } from '@/test/render/renderer';

describe('useLiveTools', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('sends tool responses for uncancelled function calls', async () => {
    const sendToolResponse = vi.fn();
    const onGeneratedFiles = vi.fn();
    const generatedFile = createUploadedFile({ name: 'chart.png' });
    const clientFunctions: LiveClientFunctions = {
      run_local_python: {
        declaration: { name: 'run_local_python' },
        handler: vi.fn(async () => ({
          response: { output: '42' },
          generatedFiles: [generatedFile],
        })),
      },
    };

    const { result, unmount } = renderHook(() =>
      useLiveTools({
        clientFunctions,
        sessionRef: createLiveSessionRef(createLiveSessionStub({ sendToolResponse })),
        onGeneratedFiles,
      }),
    );

    await act(async () => {
      await result.current.handleToolCall(
        createLiveToolCall({
          functionCalls: [
            {
              id: 'call-1',
              name: 'run_local_python',
              args: { code: 'print(42)' },
            },
          ],
        }),
      );
    });

    expect(sendToolResponse).toHaveBeenCalledWith({
      functionResponses: [
        {
          id: 'call-1',
          name: 'run_local_python',
          response: {
            output: '42',
          },
        },
      ],
    });
    expect(onGeneratedFiles).toHaveBeenCalledWith([generatedFile]);

    unmount();
  });

  it('does not send tool responses for cancelled calls that finish later', async () => {
    const sendToolResponse = vi.fn();
    let resolveHandler: ((value: { response: { output: string }; generatedFiles: [] }) => void) | null = null;
    const clientFunctions: LiveClientFunctions = {
      run_local_python: {
        declaration: { name: 'run_local_python' },
        handler: vi.fn(
          (_args, options) =>
            new Promise<{ response: { output: string }; generatedFiles: [] }>((resolve, reject) => {
              options?.abortSignal?.addEventListener('abort', () => {
                const abortError = new Error('aborted');
                abortError.name = 'AbortError';
                reject(abortError);
              });
              resolveHandler = resolve;
            }),
        ),
      },
    };

    const { result, unmount } = renderHook(() =>
      useLiveTools({
        clientFunctions,
        sessionRef: createLiveSessionRef(createLiveSessionStub({ sendToolResponse })),
      }),
    );

    let toolCallPromise: Promise<void> | undefined;
    await act(async () => {
      toolCallPromise = result.current.handleToolCall(
        createLiveToolCall({
          functionCalls: [
            {
              id: 'call-1',
              name: 'run_local_python',
              args: { code: 'print(42)' },
            },
          ],
        }),
      );
    });

    act(() => {
      result.current.cancelToolCalls(['call-1']);
    });

    await act(async () => {
      resolveHandler?.({ response: { output: '42' }, generatedFiles: [] });
      await toolCallPromise;
    });

    expect(sendToolResponse).not.toHaveBeenCalled();

    unmount();
  });
});
