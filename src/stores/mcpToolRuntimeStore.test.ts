import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { appendMcpToolProgress, beginMcpToolRun, finishMcpToolRun, useMcpToolRun } from './mcpToolRuntimeStore';

describe('mcpToolRuntimeStore', () => {
  it('correlates a run to the exact args object and tracks its lifecycle', () => {
    const args = { path: '/tmp/a.txt' };
    const otherArgs = { path: '/tmp/b.txt' };

    const runId = beginMcpToolRun(args);
    expect(runId).toBeDefined();
    expect(beginMcpToolRun(otherArgs)).not.toBe(runId);

    const { result } = renderHook(() => useMcpToolRun(args));
    expect(result.current?.status).toBe('running');
    expect(result.current?.events).toEqual([]);

    act(() => {
      appendMcpToolProgress(runId, { progress: 1, total: 4, message: 'step' });
    });
    expect(result.current?.events).toEqual([{ progress: 1, total: 4, message: 'step', at: expect.any(Number) }]);

    act(() => {
      finishMcpToolRun(runId, 'success');
    });
    expect(result.current?.status).toBe('success');
    expect(result.current?.endedAt).toBeDefined();

    // Unrelated args resolve to nothing.
    const { result: otherResult } = renderHook(() => useMcpToolRun({ never: 'registered' }));
    expect(otherResult.current).toBeUndefined();
  });

  it('marks a run cancelled and ignores progress after completion', () => {
    const args = { query: 'x' };
    const runId = beginMcpToolRun(args);
    finishMcpToolRun(runId, 'cancelled');

    act(() => {
      appendMcpToolProgress(runId, { message: 'late' });
    });

    const { result } = renderHook(() => useMcpToolRun(args));
    expect(result.current?.status).toBe('cancelled');
    expect(result.current?.events).toEqual([]);
  });

  it('caps events per run, dropping the oldest', () => {
    const args = { n: 1 };
    const runId = beginMcpToolRun(args);
    for (let i = 0; i < 210; i += 1) {
      appendMcpToolProgress(runId, { progress: i });
    }

    const { result } = renderHook(() => useMcpToolRun(args));
    expect(result.current?.events).toHaveLength(200);
    expect(result.current?.events[0]?.progress).toBe(10);
    expect(result.current?.events[199]?.progress).toBe(209);
  });

  it('returns undefined for non-object or unknown args without throwing', () => {
    expect(beginMcpToolRun('not-an-object')).toBeUndefined();

    const { result } = renderHook(() => useMcpToolRun({ unknown: true }));
    expect(result.current).toBeUndefined();
  });

  it('keeps only a bounded number of finished runs', () => {
    const firstArgs = { keep: 'oldest' };
    const firstId = beginMcpToolRun(firstArgs);
    finishMcpToolRun(firstId, 'success');

    for (let i = 0; i < 120; i += 1) {
      const id = beginMcpToolRun({ index: i });
      finishMcpToolRun(id, 'success');
    }

    const { result } = renderHook(() => useMcpToolRun(firstArgs));
    expect(result.current).toBeUndefined();
  });
});
