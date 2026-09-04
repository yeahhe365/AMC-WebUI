import { afterEach, describe, expect, it, vi } from 'vitest';

import { buildPyodideWorkerScript, PyodideService, type ExecutionResult } from './pyodideService';
import { createUploadedFile } from '@/test/data/factories';

type PyodideServiceInternals = {
  pendingPromises: Map<string, unknown>;
  activeRequestId: string | null;
};

class FakeWorker {
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  onmessageerror: ((event: MessageEvent) => void) | null = null;
  postMessage = vi.fn();
  terminate = vi.fn();

  emit(data: Record<string, unknown>) {
    this.onmessage?.({ data } as MessageEvent);
  }

  emitError(message = 'worker crashed') {
    this.onerror?.({ message } as ErrorEvent);
  }

  emitMessageError(data: Record<string, unknown> = {}) {
    this.onmessageerror?.({ data } as MessageEvent);
  }
}

const createService = (overrides: Partial<ConstructorParameters<typeof PyodideService>[0]> = {}) => {
  const workers = [new FakeWorker(), new FakeWorker(), new FakeWorker()];
  const createObjectUrl = vi.fn(() => 'blob:pyodide-worker');
  const revokeObjectUrl = vi.fn();
  const createWorker = vi.fn(() => (workers.shift() ?? new FakeWorker()) as unknown as Worker);
  const ids = ['mount-1', 'run-1', 'run-2', 'run-3', 'run-4'];

  const service = new PyodideService({
    baseUri: 'https://example.com/app/index.html',
    createWorker,
    createObjectUrl,
    revokeObjectUrl,
    createRequestId: () => ids.shift() ?? `req-${Date.now()}`,
    // Keep the idle reclaim window tiny in tests so the feature is exercised
    // without forcing every test to drive a multi-minute fake clock.
    idleTimeoutMs: 1000,
    ...overrides,
  });

  return { service, workers, createWorker, createObjectUrl, revokeObjectUrl };
};

const setRuntimeConfig = (config: Record<string, unknown>) => {
  (window as Window & { __AMC_RUNTIME_CONFIG__?: Record<string, unknown> }).__AMC_RUNTIME_CONFIG__ = config;
};

const flushMicrotasks = async () => {
  await Promise.resolve();
  await Promise.resolve();
};

const waitForWorkerPost = async () => {
  await new Promise((resolve) => setTimeout(resolve, 0));
};

class DelayedBlob extends Blob {
  streamCancelled = false;

  constructor(private readonly delayMs = 1000) {
    super(['']);
  }

  override stream(): ReadableStream<Uint8Array<ArrayBuffer>> {
    return new ReadableStream<Uint8Array<ArrayBuffer>>({
      start: (controller) => {
        setTimeout(() => {
          const chunk = new Uint8Array<ArrayBuffer>(new ArrayBuffer(3));
          chunk.set([1, 2, 3]);
          controller.enqueue(chunk);
          controller.close();
        }, this.delayMs);
      },
      cancel: () => {
        this.streamCancelled = true;
      },
    });
  }

  override arrayBuffer(): Promise<ArrayBuffer> {
    return new Promise<ArrayBuffer>((resolve) => {
      setTimeout(() => {
        const buffer = new ArrayBuffer(3);
        new Uint8Array(buffer).set([1, 2, 3]);
        resolve(buffer);
      }, this.delayMs);
    });
  }
}

describe('buildPyodideWorkerScript', () => {
  it('injects the resolved pyodide base URL into the worker code', () => {
    const { pyodideBaseUrl, workerCode } = buildPyodideWorkerScript('https://example.com/nested/app/index.html');

    expect(pyodideBaseUrl).toBe('https://example.com/nested/app/pyodide/');
    expect(workerCode).toContain('https://example.com/nested/app/pyodide/');
    expect(workerCode).not.toContain('__PYODIDE_BASE_URL__');
    expect(workerCode).toContain('const runDir =');
    expect(workerCode).toContain('pyodide.FS.chdir(runDir)');
    expect(workerCode).toContain('removePath(runDir)');
  });

  it('does not base64-encode generated output files (zero-copy ArrayBuffer transfer)', () => {
    const { workerCode } = buildPyodideWorkerScript('https://example.com/app/index.html');

    expect(workerCode).not.toContain('arrayBufferToBase64');
    expect(workerCode).not.toMatch(/\sbtoa\(/);
  });

  it('exposes a WARMUP message handler that preloads the runtime without executing code', () => {
    const { workerCode } = buildPyodideWorkerScript('https://example.com/app/index.html');

    expect(workerCode).toContain("'WARMUP'");
    expect(workerCode).toContain('loadPyodideAndPackages');
  });

  it('closes all matplotlib figures and resets rcParams between runs', () => {
    const { workerCode } = buildPyodideWorkerScript('https://example.com/app/index.html');

    expect(workerCode).toContain("plt.close('all')");
    expect(workerCode).toContain('plt.rcdefaults()');
  });

  it('walks files via currentPath without a misleading basePath parameter', () => {
    const { workerCode } = buildPyodideWorkerScript('https://example.com/app/index.html');

    expect(workerCode).not.toContain('function listFilesRecursively(basePath');
    expect(workerCode).toContain('listFilesRecursively(runDir)');
  });
});

describe('PyodideService', () => {
  afterEach(() => {
    delete window.__AMC_RUNTIME_CONFIG__;
    vi.useRealTimers();
  });

  it('loads Pyodide from the same-origin copied assets by default', async () => {
    const originalUrl = window.location.href;
    const capturedBlobs: Blob[] = [];
    const createObjectUrl = vi.fn((blob: Blob) => {
      capturedBlobs.push(blob);
      return 'blob:pyodide-worker';
    });
    const { service, workers } = createService({ baseUri: undefined, createObjectUrl });
    const [worker] = workers;

    window.history.pushState({}, '', '/chat/123?thread=abc');

    try {
      const runPromise = service.runPython('print("local")');

      await waitForWorkerPost();

      expect(createObjectUrl).toHaveBeenCalledTimes(1);
      await expect(capturedBlobs[0]?.text()).resolves.toContain(
        'const PYODIDE_BASE_URL = "http://localhost/pyodide/";',
      );

      worker.emit({
        id: 'mount-1',
        status: 'success',
        output: 'local',
      });

      await expect(runPromise).resolves.toMatchObject({
        status: 'success',
        output: 'local',
      });
    } finally {
      window.history.pushState({}, '', originalUrl);
    }
  });

  it('uses the runtime Pyodide base URL override when configured', async () => {
    const capturedBlobs: Blob[] = [];
    const createObjectUrl = vi.fn((blob: Blob) => {
      capturedBlobs.push(blob);
      return 'blob:pyodide-worker';
    });
    const { service, workers } = createService({ baseUri: undefined, createObjectUrl });
    const [worker] = workers;

    setRuntimeConfig({
      pyodideBaseUrl: 'https://cdn.example.com/pyodide/v0.25.1/full/',
    });

    const runPromise = service.runPython('print("cdn")');

    await waitForWorkerPost();

    await expect(capturedBlobs[0]?.text()).resolves.toContain(
      'const PYODIDE_BASE_URL = "https://cdn.example.com/pyodide/v0.25.1/full/";',
    );

    worker.emit({
      id: 'mount-1',
      status: 'success',
      output: 'cdn',
    });

    await expect(runPromise).resolves.toMatchObject({
      status: 'success',
      output: 'cdn',
    });
  });

  it('treats arbitrary runtime Pyodide directory URLs as exact asset roots', async () => {
    const capturedBlobs: Blob[] = [];
    const createObjectUrl = vi.fn((blob: Blob) => {
      capturedBlobs.push(blob);
      return 'blob:pyodide-worker';
    });
    const { service, workers } = createService({ baseUri: undefined, createObjectUrl });
    const [worker] = workers;

    setRuntimeConfig({
      pyodideBaseUrl: 'https://static.example.com/vendor/python-wasm',
    });

    const runPromise = service.runPython('print("custom")');

    await waitForWorkerPost();

    const workerCode = await capturedBlobs[0]?.text();
    expect(workerCode).toContain('const PYODIDE_BASE_URL = "https://static.example.com/vendor/python-wasm/";');
    expect(workerCode).not.toContain('https://static.example.com/vendor/python-wasm/pyodide/');

    worker.emit({
      id: 'mount-1',
      status: 'success',
      output: 'custom',
    });

    await expect(runPromise).resolves.toMatchObject({
      status: 'success',
      output: 'custom',
    });
  });

  it('resolves execution payloads posted back from the worker as zero-copy ArrayBuffers', async () => {
    const { service, workers } = createService();
    const [worker] = workers;

    const runPromise = service.runPython('print("hello")');

    await waitForWorkerPost();

    expect(worker.postMessage).toHaveBeenCalledWith(
      {
        id: 'mount-1',
        type: 'RUN_PYTHON',
        code: 'print("hello")',
        files: [],
      },
      [],
    );

    const imageBuffer = new ArrayBuffer(8);
    const fileBuffer = new ArrayBuffer(3);
    const payload: Omit<ExecutionResult, 'status'> & { id: string; status: 'success' } = {
      id: 'mount-1',
      status: 'success',
      output: 'hello',
      image: imageBuffer,
      files: [{ name: 'chart.png', data: fileBuffer, type: 'image/png' }],
      result: 'None',
    };

    worker.emit(payload);

    const result = await runPromise;
    expect(result.status).toBe('success');
    expect(result.output).toBe('hello');
    expect(result.image).toBe(imageBuffer);
    expect(result.files).toHaveLength(1);
    expect(result.files?.[0].data).toBe(fileBuffer);
  });

  it('sends execution-scoped files with each python request', async () => {
    const { service, workers } = createService();
    const [worker] = workers;
    const csvFile = new File(['a,b\n1,2\n'], 'dataset.csv', { type: 'text/csv' });

    const runPromise = service.runPython('print("hello")', {
      files: [
        createUploadedFile({
          id: 'file-1',
          name: 'dataset.csv',
          type: 'text/csv',
          size: csvFile.size,
          rawFile: csvFile,
        }),
      ],
    });

    await waitForWorkerPost();

    expect(worker.postMessage).toHaveBeenCalledTimes(1);
    const [message, transferredBuffers] = worker.postMessage.mock.calls[0];

    expect(message).toMatchObject({
      id: 'mount-1',
      type: 'RUN_PYTHON',
      code: 'print("hello")',
    });
    expect(message.files).toHaveLength(1);
    expect(message.files[0].name).toBe('dataset.csv');
    expect(message.files[0].data).toBeInstanceOf(ArrayBuffer);
    expect(transferredBuffers).toHaveLength(1);

    worker.emit({
      id: 'mount-1',
      status: 'success',
      output: 'hello',
    });

    await expect(runPromise).resolves.toEqual({
      status: 'success',
      output: 'hello',
      image: null,
      files: [],
      result: undefined,
    });
  });

  it('rejects python execution after the safety timeout and warms up a replacement worker', async () => {
    vi.useFakeTimers();

    const { service, workers, createWorker } = createService();
    const [firstWorker, secondWorker] = workers;

    const timedOutRun = service.runPython('print("slow")');
    const timedOutRejection = expect(timedOutRun).rejects.toThrow('Execution timed out (60s)');
    await vi.advanceTimersByTimeAsync(60_000);
    await timedOutRejection;

    expect(firstWorker.terminate).toHaveBeenCalledTimes(1);

    // The aborted worker is replaced immediately so the next request skips the
    // cold Pyodide load. The replacement is warmed up in the background.
    expect(createWorker).toHaveBeenCalledTimes(2);
    expect(secondWorker.postMessage).toHaveBeenCalledWith(expect.objectContaining({ type: 'WARMUP' }), []);

    vi.useRealTimers();
  });

  it('aborts an in-flight execution when the abort signal fires and warms up a replacement', async () => {
    const { service, workers, createWorker } = createService();
    const [firstWorker, secondWorker] = workers;
    const abortController = new AbortController();

    const runPromise = service.runPython('print("slow")', {
      abortSignal: abortController.signal,
    });

    await waitForWorkerPost();
    abortController.abort();

    await expect(runPromise).rejects.toMatchObject({
      name: 'AbortError',
      message: 'Execution aborted.',
    });
    expect(firstWorker.terminate).toHaveBeenCalledTimes(1);
    expect(createWorker).toHaveBeenCalledTimes(2);
    expect(secondWorker.postMessage).toHaveBeenCalledWith(expect.objectContaining({ type: 'WARMUP' }), []);
  });

  it('aborts while preparing attachment buffers before the worker request starts', async () => {
    vi.useFakeTimers();

    const { service, workers } = createService();
    const [worker] = workers;
    const delayedFile = new DelayedBlob();

    const abortController = new AbortController();
    const runPromise = service.runPython('print("slow files")', {
      abortSignal: abortController.signal,
      files: [
        createUploadedFile({
          id: 'file-1',
          name: 'large.bin',
          type: 'application/octet-stream',
          size: delayedFile.size,
          rawFile: delayedFile,
        }),
      ],
    });
    const rejectionExpectation = expect(runPromise).rejects.toMatchObject({
      name: 'AbortError',
      message: 'Execution aborted.',
    });

    await flushMicrotasks();
    abortController.abort();
    await vi.advanceTimersByTimeAsync(0);

    await rejectionExpectation;
    expect(worker.postMessage).not.toHaveBeenCalled();
    expect(delayedFile.streamCancelled).toBe(true);
  });

  it('queues overlapping requests while attachment preparation is still in progress', async () => {
    vi.useFakeTimers();

    const { service, workers } = createService();
    const [worker] = workers;
    const delayedFile = new DelayedBlob();

    const firstRun = service.runPython('print("first")', {
      files: [
        createUploadedFile({
          id: 'file-1',
          name: 'large.bin',
          type: 'application/octet-stream',
          size: delayedFile.size,
          rawFile: delayedFile,
        }),
      ],
    });
    const secondRun = service.runPython('print("second")');

    // The second request does NOT reject — it waits in the queue while the
    // first request is still preparing its attachments.
    await flushMicrotasks();
    expect(worker.postMessage).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1000);
    await flushMicrotasks();

    expect(worker.postMessage).toHaveBeenNthCalledWith(
      1,
      {
        id: 'mount-1',
        type: 'RUN_PYTHON',
        code: 'print("first")',
        files: [
          {
            name: 'large.bin',
            data: expect.any(ArrayBuffer),
          },
        ],
      },
      [expect.any(ArrayBuffer)],
    );

    worker.emit({
      id: 'mount-1',
      status: 'success',
      output: 'first',
    });

    await expect(firstRun).resolves.toEqual({
      status: 'success',
      output: 'first',
      image: null,
      files: [],
      result: undefined,
    });

    // The queued second request now runs.
    await vi.advanceTimersByTimeAsync(0);
    expect(worker.postMessage).toHaveBeenNthCalledWith(
      2,
      {
        id: 'run-1',
        type: 'RUN_PYTHON',
        code: 'print("second")',
        files: [],
      },
      [],
    );

    worker.emit({
      id: 'run-1',
      status: 'success',
      output: 'second',
    });

    await expect(secondRun).resolves.toEqual({
      status: 'success',
      output: 'second',
      image: null,
      files: [],
      result: undefined,
    });
  });

  it('executes queued requests in FIFO order', async () => {
    const { service, workers } = createService();
    const [worker] = workers;

    const first = service.runPython('print("a")');
    const second = service.runPython('print("b")');
    const third = service.runPython('print("c")');

    await waitForWorkerPost();
    // Only the head of the queue has been posted; the rest wait.
    expect(worker.postMessage).toHaveBeenCalledTimes(1);
    expect(worker.postMessage.mock.calls[0][0].code).toBe('print("a")');

    worker.emit({ id: 'mount-1', status: 'success', output: 'a' });
    await expect(first).resolves.toMatchObject({ output: 'a' });

    await waitForWorkerPost();
    expect(worker.postMessage.mock.calls[1][0].code).toBe('print("b")');
    worker.emit({ id: 'run-1', status: 'success', output: 'b' });
    await expect(second).resolves.toMatchObject({ output: 'b' });

    await waitForWorkerPost();
    expect(worker.postMessage.mock.calls[2][0].code).toBe('print("c")');
    worker.emit({ id: 'run-2', status: 'success', output: 'c' });
    await expect(third).resolves.toMatchObject({ output: 'c' });
  });

  it('aborts a queued request without terminating the in-flight worker', async () => {
    const { service, workers } = createService();
    const [worker] = workers;

    const firstRun = service.runPython('print("first")');
    const abortController = new AbortController();
    const secondRun = service.runPython('print("second")', { abortSignal: abortController.signal });

    await waitForWorkerPost();
    expect(worker.postMessage).toHaveBeenCalledTimes(1);

    // Abort the request that is still waiting in the queue.
    abortController.abort();
    await expect(secondRun).rejects.toMatchObject({
      name: 'AbortError',
      message: 'Execution aborted.',
    });

    // The in-flight worker is untouched; cancelling a queued request must not
    // tear down a healthy runtime.
    expect(worker.terminate).not.toHaveBeenCalled();

    worker.emit({ id: 'mount-1', status: 'success', output: 'first' });
    await expect(firstRun).resolves.toMatchObject({ output: 'first' });
  });

  it('clears pending request bookkeeping when worker postMessage throws synchronously', async () => {
    const { service, workers } = createService();
    const [worker] = workers;

    worker.postMessage.mockImplementationOnce(() => {
      throw new Error('structured clone failed');
    });

    await expect(service.runPython('print("boom")')).rejects.toThrow('structured clone failed');
    const serviceInternals = service as unknown as PyodideServiceInternals;
    expect(serviceInternals.pendingPromises.size).toBe(0);
    expect(serviceInternals.activeRequestId).toBeNull();

    const recoveredRun = service.runPython('print("after clone error")');
    await flushMicrotasks();

    expect(worker.postMessage).toHaveBeenNthCalledWith(
      2,
      {
        id: 'run-1',
        type: 'RUN_PYTHON',
        code: 'print("after clone error")',
        files: [],
      },
      [],
    );

    worker.emit({
      id: 'run-1',
      status: 'success',
      output: 'after clone error',
    });

    await expect(recoveredRun).resolves.toEqual({
      status: 'success',
      output: 'after clone error',
      image: null,
      files: [],
      result: undefined,
    });
  });

  it('recreates the worker after a fatal worker error and rejects the in-flight request', async () => {
    const { service, workers, createWorker } = createService();
    const [firstWorker, secondWorker] = workers;

    const crashedRun = service.runPython('print("boom")');
    await flushMicrotasks();
    firstWorker.emitError('worker crashed');

    await expect(crashedRun).rejects.toThrow('worker crashed');
    expect(firstWorker.terminate).toHaveBeenCalledTimes(1);

    const recoveredRun = service.runPython('print("after crash")');
    await flushMicrotasks();
    expect(createWorker).toHaveBeenCalledTimes(2);

    secondWorker.emit({
      id: 'run-1',
      status: 'success',
      output: 'after crash',
    });

    await expect(recoveredRun).resolves.toEqual({
      status: 'success',
      output: 'after crash',
      image: null,
      files: [],
      result: undefined,
    });
  });

  it('terminates the worker after the idle reclaim window elapses', async () => {
    vi.useFakeTimers();

    const { service, workers } = createService({ idleTimeoutMs: 1000 });
    const [worker] = workers;

    const run = service.runPython('print("hi")');
    await vi.advanceTimersByTimeAsync(0);
    worker.emit({ id: 'mount-1', status: 'success', output: 'hi' });
    await vi.advanceTimersByTimeAsync(0);
    await expect(run).resolves.toMatchObject({ output: 'hi' });

    expect(worker.terminate).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1000);
    expect(worker.terminate).toHaveBeenCalledTimes(1);
  });

  it('cancels the idle timer when a new request arrives before reclaim', async () => {
    vi.useFakeTimers();

    const { service, workers } = createService({ idleTimeoutMs: 1000 });
    const [worker] = workers;

    const first = service.runPython('print("a")');
    await vi.advanceTimersByTimeAsync(0);
    worker.emit({ id: 'mount-1', status: 'success', output: 'a' });
    await vi.advanceTimersByTimeAsync(0);
    await first;

    // Part-way through the idle window a new request arrives.
    await vi.advanceTimersByTimeAsync(500);
    const second = service.runPython('print("b")');
    await vi.advanceTimersByTimeAsync(0);
    worker.emit({ id: 'run-1', status: 'success', output: 'b' });
    await vi.advanceTimersByTimeAsync(0);
    await second;

    // Advancing past the original idle deadline must NOT terminate the worker,
    // because the timer was reset by the second request.
    await vi.advanceTimersByTimeAsync(700);
    expect(worker.terminate).not.toHaveBeenCalled();
  });

  it('disposes the worker, clears pending state, and rejects queued requests', async () => {
    const { service, workers } = createService();
    const [worker] = workers;

    const firstRun = service.runPython('print("first")');
    const secondRun = service.runPython('print("second")');
    await waitForWorkerPost();

    service.dispose();

    expect(worker.terminate).toHaveBeenCalledTimes(1);
    await expect(firstRun).rejects.toThrow();
    await expect(secondRun).rejects.toThrow();

    const serviceInternals = service as unknown as PyodideServiceInternals;
    expect(serviceInternals.pendingPromises.size).toBe(0);
  });

  it('binds the default timeout implementation so browser native timers do not throw illegal invocation', async () => {
    const originalSetTimeout = globalThis.setTimeout;
    const strictSetTimeout = function (
      this: typeof globalThis,
      handler: Parameters<typeof setTimeout>[0],
      timeout?: number,
    ) {
      if (this !== globalThis) {
        throw new TypeError('Illegal invocation');
      }
      return originalSetTimeout(handler, timeout);
    } as typeof setTimeout;

    vi.stubGlobal('setTimeout', strictSetTimeout);

    try {
      const { service, workers } = createService({ setTimeoutFn: undefined });
      const [worker] = workers;
      const runPromise = service.runPython('print("bound")');

      await flushMicrotasks();

      worker.emit({
        id: 'mount-1',
        status: 'success',
        output: 'bound',
      });

      await expect(runPromise).resolves.toEqual({
        status: 'success',
        output: 'bound',
        image: null,
        files: [],
        result: undefined,
      });
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
