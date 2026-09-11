import { logService } from '@/services/logService';
import { createManagedObjectUrl, releaseManagedObjectUrl } from '@/services/objectUrlManager';
import { type UploadedFile } from '@/types';
import { getPyodideBaseUrl } from '@/runtime/runtimeConfig';
import { PYODIDE_WORKER_CODE_TEMPLATE } from './pyodideWorkerTemplate';

export interface PyodideFile {
  name: string;
  data: ArrayBuffer;
  type: string;
}

export interface ExecutionResult {
  output: string;
  image?: ArrayBuffer | null;
  files?: PyodideFile[];
  result?: string;
  error?: string;
  status: 'success' | 'error';
}

interface PyodideServiceDependencies {
  baseUri?: string;
  createWorker?: (url: string) => Worker;
  createObjectUrl?: (blob: Blob) => string;
  revokeObjectUrl?: (url: string) => void;
  setTimeoutFn?: typeof setTimeout;
  createRequestId?: () => string;
  idleTimeoutMs?: number;
}

interface RunPythonOptions {
  files?: UploadedFile[];
  abortSignal?: AbortSignal;
}

interface BuildPyodideWorkerScriptOptions {
  baseUriIsPyodideBaseUrl?: boolean;
}

interface QueuedRequest {
  id: string;
  code: string;
  uploadedFiles: UploadedFile[];
  abortSignal?: AbortSignal;
  resolve: (result: ExecutionResult) => void;
  reject: (error: unknown) => void;
  aborted: boolean;
}

type PendingPyodideRequest = {
  resolve: (result: ExecutionResult) => void;
  reject: (error: unknown) => void;
};

const DEFAULT_IDLE_TIMEOUT_MS = 300_000;
const DEFAULT_EXECUTION_TIMEOUT_MS = 60_000;

const ensureTrailingSlash = (value: string) => value.replace(/\/?$/, '/');

export const buildPyodideWorkerScript = (baseUri: string, options: BuildPyodideWorkerScriptOptions = {}) => {
  const normalizedBaseUri =
    options.baseUriIsPyodideBaseUrl || /(?:\/pyodide|\/full)\/?$/.test(baseUri)
      ? ensureTrailingSlash(baseUri)
      : new URL('pyodide/', baseUri).toString();

  return {
    pyodideBaseUrl: normalizedBaseUri,
    workerCode: PYODIDE_WORKER_CODE_TEMPLATE.replace(/__PYODIDE_BASE_URL__/g, normalizedBaseUri),
  };
};

const getBrowserPyodideBaseUri = () => {
  const runtimePyodideBaseUrl = getPyodideBaseUrl();
  if (runtimePyodideBaseUrl) {
    return { baseUri: runtimePyodideBaseUrl, baseUriIsPyodideBaseUrl: true };
  }

  const origin = typeof window !== 'undefined' && window.location?.origin ? window.location.origin : 'http://localhost';
  return {
    baseUri: new URL('pyodide/', new URL(import.meta.env.BASE_URL || '/', origin)).toString(),
    baseUriIsPyodideBaseUrl: true,
  };
};

export class PyodideService {
  private worker: Worker | null = null;
  private pendingPromises = new Map<string, PendingPyodideRequest>();
  private activeRequestId: string | null = null;
  private readonly baseUri: string | undefined;
  private readonly createWorker: (url: string) => Worker;
  private readonly createObjectUrl: (blob: Blob) => string;
  private readonly revokeObjectUrl: (url: string) => void;
  private readonly setTimeoutFn: typeof setTimeout;
  private readonly createRequestId: () => string;
  private readonly idleTimeoutMs: number;
  private queue: QueuedRequest[] = [];
  private running = false;
  private idleTimerVersion = 0;
  private disposed = false;

  private consecutiveCrashCount = 0;
  private static readonly MAX_CONSECUTIVE_CRASHES = 3;

  constructor({
    baseUri,
    createWorker,
    createObjectUrl,
    revokeObjectUrl,
    setTimeoutFn,
    createRequestId,
    idleTimeoutMs,
  }: PyodideServiceDependencies = {}) {
    this.baseUri = baseUri;
    this.createWorker = createWorker ?? ((url) => new Worker(url));
    this.createObjectUrl = createObjectUrl ?? createManagedObjectUrl;
    this.revokeObjectUrl = revokeObjectUrl ?? releaseManagedObjectUrl;
    this.setTimeoutFn = setTimeoutFn ?? globalThis.setTimeout.bind(globalThis);
    this.createRequestId = createRequestId ?? (() => Math.random().toString(36).substring(7));
    this.idleTimeoutMs = idleTimeoutMs ?? DEFAULT_IDLE_TIMEOUT_MS;
  }

  private normalizeWorkerError(error: unknown, fallbackMessage: string) {
    if (error instanceof Error) {
      return error;
    }

    if (typeof error === 'string') {
      return new Error(error);
    }

    if (
      typeof error === 'object' &&
      error !== null &&
      'message' in error &&
      typeof (error as { message?: unknown }).message === 'string'
    ) {
      return new Error((error as { message: string }).message);
    }

    return new Error(fallbackMessage);
  }

  private createAbortError() {
    const abortError = new Error('Execution aborted.');
    abortError.name = 'AbortError';
    return abortError;
  }

  private completeRequest(id: string) {
    if (this.activeRequestId === id) {
      this.activeRequestId = null;
    }
  }

  public terminateWorker() {
    if (!this.worker) {
      return;
    }

    this.worker.onmessage = null;
    this.worker.onerror = null;
    this.worker.onmessageerror = null;
    this.worker.terminate();
    this.worker = null;
  }

  private resetWorker(reason: unknown, options?: { skipRejectIds?: string[] }) {
    this.consecutiveCrashCount += 1;
    const normalizedError = this.normalizeWorkerError(reason, 'Pyodide worker terminated unexpectedly.');
    const skipRejectIds = new Set(options?.skipRejectIds ?? []);

    this.terminateWorker();
    this.activeRequestId = null;

    for (const [id, promise] of this.pendingPromises.entries()) {
      if (skipRejectIds.has(id)) {
        continue;
      }

      promise.reject(normalizedError);
      this.pendingPromises.delete(id);
    }

    // Abort/timeout/fatal-error all tear down the worker (Pyodide cannot be
    // interrupted cleanly mid-C-extension). Bring up a replacement if within limits.
    if (this.consecutiveCrashCount < PyodideService.MAX_CONSECUTIVE_CRASHES) {
      this.warmupReplacement();
    } else {
      logService.error('Pyodide Worker repeatedly crashed. Halting automatic restart.', {
        consecutiveCrashCount: this.consecutiveCrashCount,
      });
    }
  }

  private warmupReplacement() {
    if (this.disposed) {
      return;
    }
    this.initWorker();
    this.worker?.postMessage({ type: 'WARMUP' }, []);
  }

  private initWorker() {
    if (this.worker) {
      return;
    }

    const workerScriptInput = this.baseUri
      ? { baseUri: this.baseUri, baseUriIsPyodideBaseUrl: false }
      : getBrowserPyodideBaseUri();
    const { pyodideBaseUrl, workerCode } = buildPyodideWorkerScript(workerScriptInput.baseUri, {
      baseUriIsPyodideBaseUrl: workerScriptInput.baseUriIsPyodideBaseUrl,
    });
    const blob = new Blob([workerCode], { type: 'application/javascript' });
    const url = this.createObjectUrl(blob);

    this.worker = this.createWorker(url);
    this.worker.onmessage = this.handleMessage.bind(this);
    this.worker.onerror = (event) => {
      this.resetWorker(event, { skipRejectIds: [] });
    };
    this.worker.onmessageerror = (event) => {
      this.resetWorker(event, { skipRejectIds: [] });
    };

    // Clean up the object URL after worker creation
    this.revokeObjectUrl(url);

    logService.info('Pyodide Worker initialized (Local Mode)', { baseUrl: pyodideBaseUrl });
  }

  private handleMessage(event: MessageEvent) {
    const { id, status, output, image, files, result, error, type } = event.data;

    // Warmup completions carry no request id and have no pending promise to settle.
    if (type === 'WARMUP_READY') {
      this.consecutiveCrashCount = 0;
      return;
    }

    const promise = this.pendingPromises.get(id);
    if (!promise) {
      return;
    }

    this.pendingPromises.delete(id);
    this.completeRequest(id);

    if (status === 'success') {
      this.consecutiveCrashCount = 0;
      promise.resolve({
        output,
        image: image ?? null,
        files: files ?? [],
        result,
        status: 'success',
      });
    } else {
      const errorObj = this.normalizeWorkerError(error, 'Execution failed.');
      if (output) {
        Object.assign(errorObj, { output });
      }
      promise.reject(errorObj);
    }
  }

  private clearIdleTimer() {
    // Invalidate any in-flight idle-reclaim callback by bumping the version it
    // captured; the callback checks the version before tearing the worker down.
    this.idleTimerVersion += 1;
  }

  private scheduleIdleReclaim() {
    if (this.idleTimeoutMs <= 0 || !this.worker) {
      return;
    }
    const version = ++this.idleTimerVersion;
    this.setTimeoutFn(() => {
      if (version !== this.idleTimerVersion || this.disposed) {
        return;
      }
      if (!this.running && this.queue.length === 0 && this.worker) {
        this.terminateWorker();
        logService.info('Pyodide Worker reclaimed after idle');
      }
    }, this.idleTimeoutMs);
  }

  private async drain() {
    if (this.running || this.disposed) {
      return;
    }
    this.running = true;
    try {
      while (!this.disposed && this.queue.length > 0) {
        const req = this.queue.shift() as QueuedRequest;
        if (req.aborted) {
          req.reject(this.createAbortError());
          continue;
        }
        try {
          const result = await this.executeRequest(req);
          if (!this.disposed) {
            req.resolve(result);
          }
        } catch (error) {
          req.reject(error);
        }
      }
    } finally {
      this.running = false;
      if (!this.disposed) {
        this.scheduleIdleReclaim();
      }
    }
  }

  private async executeRequest(req: QueuedRequest): Promise<ExecutionResult> {
    this.clearIdleTimer();
    this.initWorker();
    this.activeRequestId = req.id;
    const abortSignal = req.abortSignal;
    const abortError = this.createAbortError();

    if (abortSignal?.aborted || req.aborted) {
      this.activeRequestId = null;
      throw abortError;
    }

    let files: Array<{ name: string; data: ArrayBuffer }>;
    try {
      files = await this.prepareExecutionFiles(req.uploadedFiles, abortSignal);
    } catch (error) {
      this.activeRequestId = null;
      throw error;
    }

    if (abortSignal?.aborted || req.aborted) {
      this.activeRequestId = null;
      throw abortError;
    }

    return this.dispatchToWorker(req, files);
  }

  private dispatchToWorker(
    req: QueuedRequest,
    files: Array<{ name: string; data: ArrayBuffer }>,
  ): Promise<ExecutionResult> {
    const abortSignal = req.abortSignal;
    const abortError = this.createAbortError();

    return new Promise<ExecutionResult>((resolve, reject) => {
      const cleanup = () => {
        abortSignal?.removeEventListener('abort', handleAbort);
        this.completeRequest(req.id);
      };
      const resolveWithCleanup = (value: ExecutionResult) => {
        cleanup();
        resolve(value);
      };
      const rejectWithCleanup = (error: unknown) => {
        cleanup();
        reject(error);
      };
      const handleAbort = () => {
        // Only the in-flight request (already dispatched) is cancelled here.
        // Queued-but-not-yet-dispatched aborts are rejected directly in runPython.
        if (this.pendingPromises.has(req.id)) {
          this.pendingPromises.delete(req.id);
          this.resetWorker(abortError);
          rejectWithCleanup(abortError);
        }
      };

      abortSignal?.addEventListener('abort', handleAbort, { once: true });

      this.pendingPromises.set(req.id, {
        resolve: resolveWithCleanup,
        reject: rejectWithCleanup,
      });

      try {
        const buffers = files.map((file) => file.data);
        this.worker?.postMessage({ id: req.id, type: 'RUN_PYTHON', code: req.code, files }, buffers);
      } catch (error) {
        this.pendingPromises.delete(req.id);
        rejectWithCleanup(error);
        return;
      }

      this.setTimeoutFn(() => {
        if (this.pendingPromises.has(req.id)) {
          this.pendingPromises.delete(req.id);
          this.resetWorker(new Error('Execution timed out (60s)'), { skipRejectIds: [req.id] });
          rejectWithCleanup(new Error('Execution timed out (60s)'));
        }
      }, DEFAULT_EXECUTION_TIMEOUT_MS);
    });
  }

  private async readRawFileBuffer(rawFile: Blob, abortSignal?: AbortSignal): Promise<ArrayBuffer> {
    const abortError = this.createAbortError();

    if (abortSignal?.aborted) {
      throw abortError;
    }

    const streamFn = (rawFile as Blob & { stream?: () => ReadableStream<Uint8Array> }).stream;
    if (!abortSignal || typeof streamFn !== 'function') {
      const buffer = await rawFile.arrayBuffer();
      if (abortSignal?.aborted) {
        throw abortError;
      }
      return buffer;
    }

    const reader = streamFn.call(rawFile).getReader();
    let rejectAbort: ((reason?: unknown) => void) | null = null;
    const abortPromise = new Promise<never>((_, reject) => {
      rejectAbort = reject;
    });
    const handleAbort = () => {
      void reader.cancel(abortError).catch(() => undefined);
      rejectAbort?.(abortError);
    };
    abortSignal.addEventListener('abort', handleAbort, { once: true });

    try {
      const chunks: Uint8Array[] = [];
      let totalLength = 0;

      while (true) {
        const { done, value } = await Promise.race([reader.read(), abortPromise]);
        if (done) {
          break;
        }

        if (value) {
          chunks.push(value);
          totalLength += value.byteLength;
        }
      }

      if (abortSignal.aborted) {
        throw abortError;
      }

      const combined = new Uint8Array(totalLength);
      let offset = 0;
      for (const chunk of chunks) {
        combined.set(chunk, offset);
        offset += chunk.byteLength;
      }

      return combined.buffer;
    } catch (error) {
      if (abortSignal.aborted) {
        throw abortError;
      }
      throw error;
    } finally {
      abortSignal.removeEventListener('abort', handleAbort);
      try {
        reader.releaseLock();
      } catch {
        // no-op
      }
    }
  }

  private async prepareExecutionFiles(files: UploadedFile[] = [], abortSignal?: AbortSignal) {
    const preparedFiles: Array<{ name: string; data: ArrayBuffer }> = [];
    const abortError = this.createAbortError();

    for (const file of files) {
      if (!file.rawFile) continue;
      if (abortSignal?.aborted) {
        throw abortError;
      }

      const buffer = await this.readRawFileBuffer(file.rawFile, abortSignal);
      preparedFiles.push({ name: file.name, data: buffer });
    }

    return preparedFiles;
  }

  public runPython(code: string, options: RunPythonOptions = {}): Promise<ExecutionResult> {
    this.consecutiveCrashCount = 0;
    const id = this.createRequestId();
    const abortSignal = options.abortSignal;

    if (abortSignal?.aborted) {
      return Promise.reject(this.createAbortError());
    }

    return new Promise<ExecutionResult>((resolve, reject) => {
      const req: QueuedRequest = {
        id,
        code,
        uploadedFiles: options.files ?? [],
        abortSignal,
        resolve,
        reject,
        aborted: false,
      };

      // Reject a queued request the moment it is aborted, without waiting for
      // the in-flight request ahead of it to finish and without touching the
      // healthy worker.
      const onAbort = () => {
        req.aborted = true;
        const idx = this.queue.indexOf(req);
        if (idx >= 0) {
          this.queue.splice(idx, 1);
          req.reject(this.createAbortError());
        }
      };
      abortSignal?.addEventListener('abort', onAbort, { once: true });

      this.queue.push(req);
      void this.drain();
    });
  }

  public dispose() {
    this.disposed = true;
    this.clearIdleTimer();

    const error = new Error('Pyodide service disposed.');
    const queued = this.queue;
    this.queue = [];
    for (const req of queued) {
      req.reject(error);
    }
    const pending = [...this.pendingPromises.values()];
    this.pendingPromises.clear();
    for (const promise of pending) {
      promise.reject(error);
    }
    this.activeRequestId = null;
    this.terminateWorker();
  }
}

export const pyodideService = new PyodideService();
