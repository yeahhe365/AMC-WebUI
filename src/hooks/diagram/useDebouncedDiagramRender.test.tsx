import { act } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from '@/test/render/renderer';
import { useDebouncedDiagramRender } from './useDebouncedDiagramRender';

afterEach(() => {
  vi.useRealTimers();
});

describe('useDebouncedDiagramRender', () => {
  it('runs the task once after the debounce delay elapses', () => {
    vi.useFakeTimers();
    const task = vi.fn();
    const { rerender, unmount } = renderHook(() => useDebouncedDiagramRender(task, 500));

    act(() => {
      vi.advanceTimersByTime(499);
    });
    expect(task).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(task).toHaveBeenCalledTimes(1);

    // A rerender without a new task identity must not schedule another run.
    rerender();
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(task).toHaveBeenCalledTimes(1);
    unmount();
  });

  it('restarts the debounce window when the task identity changes', () => {
    vi.useFakeTimers();
    const taskA = vi.fn();
    const taskB = vi.fn();
    let currentTask = taskA;
    const { rerender, unmount } = renderHook(() => useDebouncedDiagramRender(currentTask, 500));

    act(() => {
      vi.advanceTimersByTime(250);
    });

    currentTask = taskB;
    rerender();

    // The pending run for taskA was cancelled; the window restarts for taskB.
    act(() => {
      vi.advanceTimersByTime(250);
    });
    expect(taskA).not.toHaveBeenCalled();
    expect(taskB).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(250);
    });
    expect(taskA).not.toHaveBeenCalled();
    expect(taskB).toHaveBeenCalledTimes(1);
    unmount();
  });

  it('never runs a pending task after unmount', () => {
    vi.useFakeTimers();
    const task = vi.fn();
    const { unmount } = renderHook(() => useDebouncedDiagramRender(task, 500));

    unmount();
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(task).not.toHaveBeenCalled();
  });

  it('exposes an isMounted probe that flips to false after unmount', async () => {
    vi.useFakeTimers();
    let capturedProbe: (() => boolean) | null = null;
    const task = async (isMounted: () => boolean) => {
      capturedProbe = isMounted;
    };

    const { unmount } = renderHook(() => useDebouncedDiagramRender(task, 0));
    await act(async () => {
      vi.advanceTimersByTime(0);
    });

    expect(capturedProbe).not.toBeNull();
    expect(capturedProbe!()).toBe(true);

    unmount();
    expect(capturedProbe!()).toBe(false);
  });
});
