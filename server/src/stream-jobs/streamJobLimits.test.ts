// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import http from 'node:http';
import { EventEmitter } from 'node:events';
import { startHttpServer } from '../../test/httpServer';
import type { StreamJob } from './streamJobStore';

type Store = typeof import('./streamJobStore');
const cleanups: Array<() => Promise<unknown>> = [];
afterEach(async () => {
  while (cleanups.length) await cleanups.pop()!();
  vi.unstubAllEnvs();
});

async function setup(limits: Record<string, number> = {}) {
  vi.resetModules();
  for (const [key, value] of Object.entries(limits)) vi.stubEnv(`AMC_STREAM_JOB_${key}`, String(value));
  const store: Store = await import('./streamJobStore');
  const jobs: StreamJob[] = [];
  let producer: (job: StreamJob, req: http.IncomingMessage) => void = () => {};
  const server = http.createServer((req, res) => {
    void store
      .maybeStreamWithSharedJob(req, res, { allowedOrigins: [] }, (job) => {
        jobs.push(job);
        producer(job, req);
      })
      .then(() => {
        if (res.headersSent && !res.writableEnded) res.flushHeaders();
      });
  });
  const started = await startHttpServer(server);
  cleanups.push(async () => {
    for (const job of jobs) store.abortJob(job.id, job.secret);
    server.closeAllConnections();
    await started.close();
  });
  return {
    store,
    jobs,
    produce: (next: typeof producer) => {
      producer = next;
    },
    request: (id: string, seq?: number) =>
      fetch(started.baseUrl, {
        headers: { 'x-amc-job-id': id, ...(seq === undefined ? {} : { 'x-amc-last-seq': String(seq) }) },
      }),
  };
}

function upstream(parts: string[], close = true) {
  return new Response(
    new ReadableStream<Uint8Array>({
      start(controller) {
        for (const part of parts) controller.enqueue(new TextEncoder().encode(part));
        if (close) controller.close();
      },
    }),
  );
}

function feed(store: Store, job: StreamJob, req: http.IncomingMessage, response: Response) {
  return store.runDetachedUpstream(
    job,
    req,
    'https://upstream.test',
    () => new Headers(),
    async () => response,
  );
}

describe('stream journal resource and replay contracts', () => {
  it('keeps one multiline event at every CRLF network split', async () => {
    const app = await setup();
    const event = 'data: {"text":"中"}\r\ndata: second\r\n\r\n';
    for (let split = 1; split < event.length; split += 1) {
      app.produce((job, req) => {
        void feed(app.store, job, req, upstream([event.slice(0, split), event.slice(split)]));
      });
      const res = await app.request(`split-${split}`);
      expect(await res.text()).toBe('data: {"text":"中"}\ndata: second\n\n');
      expect(app.jobs.at(-1)!.chunks).toHaveLength(1);
    }
  });

  it('returns 409 when the requested replay prefix was evicted', async () => {
    const app = await setup({ RETAINED_BYTES: 24 });
    app.produce((job, req) => {
      void feed(app.store, job, req, upstream(['data: a\n\ndata: b\n\ndata: c\n\ndata: d\n\n']));
    });
    await (await app.request('gap')).text();
    const replay = await app.request('gap', 0);
    expect(replay.status).toBe(409);
    expect(await replay.json()).toMatchObject({ error: expect.stringContaining('history'), firstSeq: 3 });
    expect(await (await app.request('gap', 2)).text()).toBe('data: c\n\ndata: d\n\n');
  });

  it('does not restart an absent job when resuming from a nonzero cursor', async () => {
    const app = await setup();
    const response = await app.request('missing', 4);
    // Consume/cancel before assertions so a broken implementation cannot leave a test socket alive.
    await response.body?.cancel();
    expect(response.status).toBe(409);
    expect(app.jobs).toHaveLength(0);
  });

  it('bounds unterminated events in UTF-8 bytes and cancels their upstream', async () => {
    const app = await setup({ EVENT_BYTES: 16 });
    let canceled = false;
    app.produce((job, req) => {
      const response = new Response(
        new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(new TextEncoder().encode('data: 中中中中'));
          },
          cancel() {
            canceled = true;
          },
        }),
      );
      void feed(app.store, job, req, response);
    });
    await expect((async () => (await app.request('oversize')).text())()).rejects.toThrow();
    expect(app.jobs[0].error).toContain('limit');
    expect(canceled).toBe(true);
    expect(app.jobs[0].chunks).toHaveLength(0);
  });

  it('counts retained UTF-8 bytes globally and reports affected history gaps', async () => {
    const app = await setup({ TOTAL_RETAINED_BYTES: 30 });
    app.produce((job, req) => {
      void feed(app.store, job, req, upstream(['data: 中中中\n\n']));
    });
    await (await app.request('bytes-a')).text();
    await (await app.request('bytes-b')).text();
    expect(app.jobs.reduce((sum, job) => sum + job.bufferedBytes, 0)).toBeLessThanOrEqual(30);
    expect((await app.request('bytes-a', 0)).status).toBe(409);
    expect(await (await app.request('bytes-b', 0)).text()).toBe('data: 中中中\n\n');
  });

  it('rejects active-job capacity and frees it after abort', async () => {
    const app = await setup({ MAX_ACTIVE: 1 });
    const first = app.request('active-a');
    await vi.waitFor(() => expect(app.jobs).toHaveLength(1));
    const second = await app.request('active-b');
    await second.body?.cancel();
    expect(second.status).toBe(429);
    expect(app.jobs).toHaveLength(1);
    app.store.abortJob('active-a');
    await (await first).text();
    app.produce((job, req) => {
      void feed(app.store, job, req, upstream(['data: ok\n\n']));
    });
    expect(await (await app.request('active-c')).text()).toBe('data: ok\n\n');
  });

  it('expires idle jobs promptly and releases their listeners', async () => {
    const app = await setup({ IDLE_MS: 30 });
    app.produce((job, req) => {
      void feed(app.store, job, req, upstream([], false));
    });
    await expect((async () => (await app.request('idle')).text())()).rejects.toThrow();
    expect(app.jobs[0].error).toContain('idle');
    expect(app.jobs[0].done).toBe(true);
    expect(app.jobs[0].abortController.signal.aborted).toBe(true);
    expect(app.jobs[0].listeners.size).toBe(0);
  });

  it('cancels a stalled upstream error body when the job expires', async () => {
    const app = await setup({ IDLE_MS: 30 });
    let canceled = false;
    app.produce((job, req) => {
      void feed(
        app.store,
        job,
        req,
        new Response(
          new ReadableStream<Uint8Array>({
            cancel() {
              canceled = true;
            },
          }),
          { status: 500 },
        ),
      );
    });
    await expect((async () => (await app.request('idle-error')).text())()).rejects.toThrow();
    expect(app.jobs[0].error).toContain('idle');
    expect(canceled).toBe(true);
  });

  it('accounts for pending events across jobs and releases their budget after abort', async () => {
    const app = await setup({ TOTAL_PENDING_BYTES: 20 });
    app.produce((job, req) => {
      void feed(app.store, job, req, upstream(['data: 中中'], false));
    });
    const first = await app.request('pending-a');
    await vi.waitFor(() => expect(app.jobs[0].pendingBytes).toBe(12));
    await expect((async () => (await app.request('pending-b')).text())()).rejects.toThrow();
    expect(app.jobs[1].error).toContain('limit');
    expect(app.jobs[1].done).toBe(true);
    app.store.abortJob('pending-a');
    await first.text();
    expect(app.jobs[0].pendingBytes).toBe(0);
    app.produce((job, req) => {
      void feed(app.store, job, req, upstream(['data: ok\n\n']));
    });
    expect(await (await app.request('pending-c')).text()).toBe('data: ok\n\n');
  });

  it('rejects a full job store with 503 and evicts completed jobs for capacity', async () => {
    const app = await setup({ MAX_JOBS: 1, MAX_ACTIVE: 8 });
    const first = await app.request('map-a');
    const rejected = await app.request('map-b');
    await rejected.body?.cancel();
    expect(rejected.status).toBe(503);
    expect(app.jobs).toHaveLength(1);
    app.store.abortJob('map-a');
    await first.text();
    app.produce((job, req) => {
      void feed(app.store, job, req, upstream(['data: ok\n\n']));
    });
    expect(await (await app.request('map-c')).text()).toBe('data: ok\n\n');
    expect((await app.request('map-a', 1)).status).toBe(409);
  });

  it('prunes expired retained histories before replay and new creation', async () => {
    const app = await setup({ TTL_MS: 30 });
    app.produce((job, req) => {
      void feed(app.store, job, req, upstream(['data: ok\n\n']));
    });
    await (await app.request('ttl-a')).text();
    await new Promise((resolve) => setTimeout(resolve, 35));
    expect((await app.request('ttl-a', 1)).status).toBe(409);
    expect(app.jobs[0].bufferedBytes).toBe(0);
    expect(app.jobs[0].chunks).toHaveLength(0);
  });

  it('enforces a hard lifetime while upstream data continues arriving', async () => {
    const app = await setup({ HARD_MS: 45, IDLE_MS: 100 });
    app.produce((job, req) => {
      let interval: ReturnType<typeof setInterval>;
      cleanups.push(async () => {
        clearInterval(interval);
      });
      const response = new Response(
        new ReadableStream<Uint8Array>({
          start(controller) {
            interval = setInterval(() => controller.enqueue(new TextEncoder().encode('data: tick\n\n')), 5);
          },
          cancel() {
            clearInterval(interval);
          },
        }),
      );
      void feed(app.store, job, req, response);
    });
    await expect((async () => (await app.request('hard')).text())()).rejects.toThrow();
    expect(app.jobs[0].error).toContain('lifetime');
    expect(app.jobs[0].done).toBe(true);
  });

  it('caps subscribers without starting another upstream', async () => {
    const app = await setup({ MAX_SUBSCRIBERS: 1 });
    const first = app.request('subscribers');
    await vi.waitFor(() => expect(app.jobs[0]?.listeners.size).toBe(1));
    const second = await app.request('subscribers');
    await second.body?.cancel();
    expect(second.status).toBe(429);
    expect(app.jobs).toHaveLength(1);
    app.store.abortJob('subscribers');
    await (await first).text();
  });

  it('waits for drain without duplicate writes or drain listener growth', async () => {
    const app = await setup({ DRAIN_MS: 150 });
    let controller!: ReadableStreamDefaultController<Uint8Array>;
    const req = { method: 'GET', headers: { 'x-amc-job-id': 'slow' } } as unknown as http.IncomingMessage;
    const emitter = new EventEmitter();
    const response = Object.assign(emitter, {
      writableEnded: false,
      destroyed: false,
      headersSent: false,
      writableLength: 0,
      writes: [] as string[],
      writeHead() {
        this.headersSent = true;
      },
      write(data: string) {
        this.writes.push(data);
        return false;
      },
      end(data?: string) {
        if (data) this.writes.push(data);
        this.writableEnded = true;
        emitter.emit('finish');
      },
      destroy() {
        this.destroyed = true;
        emitter.emit('close');
      },
    });
    let job!: StreamJob;
    await app.store.maybeStreamWithSharedJob(
      req,
      response as unknown as http.ServerResponse,
      { allowedOrigins: [] },
      (created) => {
        job = created;
        void feed(
          app.store,
          created,
          req,
          new Response(
            new ReadableStream<Uint8Array>({
              start(c) {
                controller = c;
              },
            }),
          ),
        );
      },
    );
    const emit = (value: string) => controller.enqueue(new TextEncoder().encode(value));
    emit('data: a\n\n');
    await vi.waitFor(() => expect(response.writes).toHaveLength(1), { interval: 1 });
    emit('data: b\n\n');
    emit('data: c\n\n');
    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(response.writes).toEqual(['data: a\n\n']);
    expect(response.listenerCount('drain')).toBe(1);
    await vi.waitFor(() => expect(response.destroyed || response.writableEnded).toBe(true));
    expect(job.listeners.size).toBe(0);
    expect(response.listenerCount('drain')).toBe(0);
    app.store.abortJob(job.id);
  });

  it('limits queued bytes across slow subscribers and releases capacity on close', async () => {
    const app = await setup({ TOTAL_WRITE_BYTES: 12 });
    const req = { method: 'GET', headers: { 'x-amc-job-id': 'global-slow' } } as unknown as http.IncomingMessage;
    const makeResponse = () => {
      const emitter = new EventEmitter();
      return Object.assign(emitter, {
        writableEnded: false,
        destroyed: false,
        headersSent: false,
        writableLength: 0,
        writes: [] as string[],
        writeHead() {
          this.headersSent = true;
        },
        write(data: string) {
          this.writes.push(data);
          return false;
        },
        end() {
          this.writableEnded = true;
          emitter.emit('finish');
        },
        destroy() {
          this.destroyed = true;
          emitter.emit('close');
        },
      });
    };
    const first = makeResponse();
    let job!: StreamJob;
    await app.store.maybeStreamWithSharedJob(
      req,
      first as unknown as http.ServerResponse,
      { allowedOrigins: [] },
      (created) => {
        job = created;
        void feed(app.store, created, req, upstream(['data: a\n\n']));
      },
    );
    await vi.waitFor(() => expect(first.writes).toEqual(['data: a\n\n']));
    const second = makeResponse();
    await app.store.maybeStreamWithSharedJob(
      req,
      second as unknown as http.ServerResponse,
      { allowedOrigins: [] },
      () => {},
    );
    expect(second.destroyed).toBe(true);
    expect(second.writableEnded).toBe(false);
    expect(second.writes).not.toContain('data: a\n\n');
    first.destroy();
    const third = makeResponse();
    await app.store.maybeStreamWithSharedJob(
      req,
      third as unknown as http.ServerResponse,
      { allowedOrigins: [] },
      () => {},
    );
    expect(third.writes).toEqual(['data: a\n\n']);
    third.emit('drain');
    expect(third.writableEnded).toBe(true);
    expect(job.subscribers).toBe(0);
  });
});
