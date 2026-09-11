import { useState, useCallback } from 'react';
import { getErrorMessage } from '@/utils/errorMessage';
import type { UploadedFile } from '@/types';
import { getPyodideService, type PyodideFile } from './loadPyodideService';

interface PyodideState {
  isRunning: boolean;
  output: string | null;
  image: ArrayBuffer | null;
  files: PyodideFile[];
  error: string | null;
  hasRun: boolean;
}

export interface RunCodeOptions {
  files?: UploadedFile[];
  abortSignal?: AbortSignal;
}

/**
 * Upper bound on how many execution results stay cached. Each entry can hold
 * base64-encoded images/files (potentially several MB), so without a cap a long
 * session leaks memory as every distinct code block adds an entry.
 */
const PYODIDE_RESULT_CACHE_LIMIT = 24;

// Global LRU cache to persist manual execution results across virtual list
// unmounts (e.g. when the message list virtualizes blocks out of view).
// Map iteration order follows insertion order, so re-inserting a key promotes
// it to most-recently-used and the oldest entry is evicted once the cap is hit.
const pyodideResultCache = new Map<string, PyodideState>();

const readCachedResult = (codeKey: string): PyodideState | undefined => {
  const cached = pyodideResultCache.get(codeKey);
  if (cached) {
    // Promote to most-recently-used so frequently viewed blocks survive eviction.
    pyodideResultCache.delete(codeKey);
    pyodideResultCache.set(codeKey, cached);
  }
  return cached;
};

const writeCachedResult = (codeKey: string, state: PyodideState) => {
  if (pyodideResultCache.has(codeKey)) {
    pyodideResultCache.delete(codeKey);
  }
  pyodideResultCache.set(codeKey, state);
  while (pyodideResultCache.size > PYODIDE_RESULT_CACHE_LIMIT) {
    const oldestKey = pyodideResultCache.keys().next().value;
    if (oldestKey === undefined) break;
    pyodideResultCache.delete(oldestKey);
  }
};

/** Drop every cached execution result (e.g. on session switch / clear history). */
export const clearPyodideResultCache = () => {
  pyodideResultCache.clear();
};

export const usePyodide = (codeKey?: string) => {
  const [state, setState] = useState<PyodideState>(() => {
    if (codeKey && pyodideResultCache.has(codeKey)) {
      const cached = readCachedResult(codeKey);
      if (cached) {
        return cached;
      }
    }
    return {
      isRunning: false,
      output: null,
      image: null,
      files: [],
      error: null,
      hasRun: false,
    };
  });

  const runCode = useCallback(
    async (code: string, options?: RunCodeOptions) => {
      const runningState: PyodideState = {
        isRunning: true,
        error: null,
        output: null,
        image: null,
        files: [],
        hasRun: false,
      };
      setState(runningState);
      if (codeKey) {
        writeCachedResult(codeKey, runningState);
      }

      try {
        const pyodideService = await getPyodideService();
        const result = await pyodideService.runPython(code, {
          files: options?.files,
          abortSignal: options?.abortSignal,
        });

        const finalState: PyodideState = {
          isRunning: false,
          output: result.output || (result.image || (result.files && result.files.length > 0) ? null : 'No output'),
          image: result.image || null,
          files: result.files || [],
          error: null,
          hasRun: true,
        };
        setState(finalState);
        if (codeKey) {
          writeCachedResult(codeKey, finalState);
        }
        return finalState;
      } catch (executionError) {
        const errorOutput =
          typeof executionError === 'object' && executionError !== null && 'output' in executionError
            ? ((executionError as { output?: string }).output ?? null)
            : null;
        const errorState: PyodideState = {
          isRunning: false,
          output: errorOutput,
          image: null,
          files: [],
          error: getErrorMessage(executionError),
          hasRun: true,
        };
        setState(errorState);
        if (codeKey) {
          writeCachedResult(codeKey, errorState);
        }
        return errorState;
      }
    },
    [codeKey],
  );

  const clearOutput = useCallback(() => {
    const clearedState: PyodideState = {
      isRunning: false,
      output: null,
      image: null,
      files: [],
      error: null,
      hasRun: false,
    };
    setState(clearedState);
    if (codeKey) {
      pyodideResultCache.delete(codeKey);
    }
  }, [codeKey]);

  const resetState = useCallback(() => {
    clearOutput();
  }, [clearOutput]);

  return {
    ...state,
    runCode,
    clearOutput,
    resetState,
  };
};
