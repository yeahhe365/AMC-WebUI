import { useEffect } from 'react';

/**
 * Task executed after the debounce window. Receives an `isMounted` probe so
 * async work can skip state updates once the component has unmounted (or the
 * effect re-ran) without leaking updates.
 */
export type DebouncedDiagramRenderTask = (isMounted: () => boolean) => void | Promise<void>;

/**
 * Debounces diagram rendering: `renderTask` runs `delayMs` after the latest
 * change of its dependencies, and any pending run is cancelled on dependency
 * change or unmount.
 *
 * `renderTask` must be a stable reference (wrap it in `useCallback`) so the
 * underlying effect only re-fires when its real inputs change.
 *
 * Error handling is left to the task itself, mirroring the per-block behavior
 * it replaced: MermaidBlock catches inside the task, GraphvizBlock attaches a
 * `.catch` that logs via logService.
 */
export const useDebouncedDiagramRender = (renderTask: DebouncedDiagramRenderTask, delayMs: number): void => {
  useEffect(() => {
    let isMounted = true;

    // Debounce rendering to avoid syntax errors while typing
    const timeoutId = setTimeout(() => {
      if (!isMounted) return;
      void Promise.resolve(renderTask(() => isMounted));
    }, delayMs);

    return () => {
      isMounted = false;
      clearTimeout(timeoutId);
    };
  }, [renderTask, delayMs]);
};
