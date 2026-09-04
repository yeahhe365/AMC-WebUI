// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import http from 'node:http';
import { Buffer } from 'node:buffer';
import { createServer } from './createServer';
import { createHttpServerCleanup, startHttpServer } from '../test/httpServer';
import { JOB_ID_HEADER, LAST_SEQ_HEADER } from './streamJobStore';

const dnsLookup = vi.hoisted(() => vi.fn(async () => [{ address: '1.2.3.4', family: 4 as const }]));

vi.mock('node:dns/promises', () => ({
  default: { lookup: dnsLookup },
  lookup: dnsLookup,
}));

const serverCleanup = createHttpServerCleanup();

afterEach(async () => {
  await serverCleanup.cleanup();
  dnsLookup.mockReset();
  dnsLookup.mockResolvedValue([{ address: '1.2.3.4', family: 4 }]);
});

// Builds an SSE-style upstream that emits N events then ends. Each event is a
// complete `\n\n`-delimited block so the journal can split on boundaries.
const createSseUpstream = (events: string[]) => {
  const server = http.createServer((request, response) => {
    request.resume();
    response.writeHead(200, { 'content-type': 'text/event-stream' });
    let i = 0;
    const tick = () => {
      if (i >= events.length) {
        response.end();
        return;
      }
      response.write(events[i]);
      i += 1;
      setTimeout(tick, 10);
    };
    setTimeout(tick, 5);
  });
  return server;
};

const readStream = async (res: Response): Promise<string> => {
  const reader = res.body?.getReader();
  if (!reader) {
    return '';
  }
  const decoder = new TextDecoder();
  let out = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) {
      break;
    }
    out += decoder.decode(value, { stream: true });
  }
  return out;
};

const STREAM_PATH = '/api/gemini/v1beta/models/gemini-2.5-flash:streamGenerateContent?alt=sse';

describe('stream journal (job-id gated)', () => {
  it('buffers upstream independently and replays all events to the browser', async () => {
    const events = ['data: a\n\n', 'data: b\n\n', 'data: c\n\n'];
    const upstream = serverCleanup.track(await startHttpServer(createSseUpstream(events)));

    const app = createServer({
      geminiApiBase: upstream.baseUrl,
      geminiApiKey: 'server-key',
    });
    const appStarted = serverCleanup.track(await startHttpServer(app));

    const res = await fetch(`${appStarted.baseUrl}${STREAM_PATH}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        [JOB_ID_HEADER]: 'job-all',
      },
      body: JSON.stringify({ contents: [] }),
    });

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/event-stream');
    const body = await readStream(res);
    expect(body).toBe(events.join(''));
  });

  it('resumes from lastSeq, delivering only events after that cursor', async () => {
    const events = ['data: 1\n\n', 'data: 2\n\n', 'data: 3\n\n', 'data: 4\n\n'];
    const upstream = serverCleanup.track(await startHttpServer(createSseUpstream(events)));

    const app = createServer({
      geminiApiBase: upstream.baseUrl,
      geminiApiKey: 'server-key',
    });
    const appStarted = serverCleanup.track(await startHttpServer(app));

    // First connection: read the first two events, then abort the browser side.
    // The upstream is buffered server-side regardless of the browser connection.
    const first = await fetch(`${appStarted.baseUrl}${STREAM_PATH}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        [JOB_ID_HEADER]: 'job-resume',
      },
      body: JSON.stringify({ contents: [] }),
    });

    const reader = first.body!.getReader();
    const decoder = new TextDecoder();
    let seen = '';
    // Read until we've consumed the first two events.
    while (Buffer.from(seen).toString('utf8').split('\n\n').filter(Boolean).length < 2) {
      const { value, done } = await reader.read();
      if (done) {
        break;
      }
      seen += decoder.decode(value, { stream: true });
    }
    reader.cancel();

    // Wait for the upstream to finish buffering the remaining events.
    await new Promise((resolve) => setTimeout(resolve, 120));

    // Resume: declare we have seq 1 and 2; expect only events 3 and 4 back.
    const resume = await fetch(`${appStarted.baseUrl}${STREAM_PATH}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        [JOB_ID_HEADER]: 'job-resume',
        [LAST_SEQ_HEADER]: '2',
      },
      body: JSON.stringify({ contents: [] }),
    });

    const body = await readStream(resume);
    expect(body).toBe('data: 3\n\ndata: 4\n\n');
  });

  it('aborts the upstream via the stream-abort endpoint', async () => {
    // Upstream emits forever and only stops when its connection is torn down
    // (by the abort). It must NOT end the response on request-body close,
    // otherwise the job would finish before the abort lands.
    const upstream = serverCleanup.track(
      await startHttpServer(
        http.createServer((_request, response) => {
          response.writeHead(200, { 'content-type': 'text/event-stream' });
          let n = 0;
          const interval = setInterval(() => {
            response.write(`data: ${n++}\n\n`);
          }, 5);
          response.on('close', () => clearInterval(interval));
        }),
      ),
    );

    const app = createServer({
      geminiApiBase: upstream.baseUrl,
      geminiApiKey: 'server-key',
    });
    const appStarted = serverCleanup.track(await startHttpServer(app));

    // Open the stream with a raw http client so the socket stays open and we
    // can keep it open until we abort. fetch().body.cancel() can close the
    // proxy response too eagerly; a raw client keeps the connection alive.
    const streamReq = http.request(`${appStarted.baseUrl}${STREAM_PATH}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        [JOB_ID_HEADER]: 'job-abort',
      },
    });
    streamReq.write(JSON.stringify({ contents: [] }));
    streamReq.end();

    // Allow a couple of chunks to land so the job is alive upstream.
    await new Promise((resolve) => setTimeout(resolve, 40));

    const abortRes = await fetch(`${appStarted.baseUrl}/api/gemini/stream-abort/job-abort`, {
      method: 'POST',
    });
    expect(abortRes.status).toBe(200);
    expect((await abortRes.json()) as Record<string, unknown>).toEqual({ ok: true });

    // A second abort on the now-finished job returns 404.
    const second = await fetch(`${appStarted.baseUrl}/api/gemini/stream-abort/job-abort`, {
      method: 'POST',
    });
    expect(second.status).toBe(404);

    streamReq.destroy();
  });

  it('falls through to ordinary proxy when no job-id header is present', async () => {
    const events = ['data: x\n\n'];
    const upstream = serverCleanup.track(await startHttpServer(createSseUpstream(events)));

    const app = createServer({
      geminiApiBase: upstream.baseUrl,
      geminiApiKey: 'server-key',
    });
    const appStarted = serverCleanup.track(await startHttpServer(app));

    const res = await fetch(`${appStarted.baseUrl}${STREAM_PATH}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ contents: [] }),
    });
    const body = await readStream(res);
    expect(body).toBe('data: x\n\n');
    expect(res.headers.get('content-type')).toContain('text/event-stream');
  });

  it('returns 502 with the error message when resuming a job that finished with an upstream error', async () => {
    // Upstream rejects immediately with a non-2xx, so runUpstream finishes
    // the job with an error. A later resume (or even the first attach after
    // the error lands) must surface that as 502 JSON, not an empty 200 stream.
    const upstream = serverCleanup.track(
      await startHttpServer(
        http.createServer((_request, response) => {
          response.writeHead(429, { 'content-type': 'application/json' });
          response.end(JSON.stringify({ error: { message: 'quota exceeded' } }));
        }),
      ),
    );

    const app = createServer({
      geminiApiBase: upstream.baseUrl,
      geminiApiKey: 'server-key',
    });
    const appStarted = serverCleanup.track(await startHttpServer(app));

    // Open the stream (kicks off the upstream that will fail) and ignore the
    // body — we only need the job to reach its terminal error state. The
    // initial connection may either return a 200 that is then destroyed, or
    // reject outright once the upstream error lands; tolerate both.
    try {
      const initial = await fetch(`${appStarted.baseUrl}${STREAM_PATH}`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          [JOB_ID_HEADER]: 'job-err',
        },
        body: JSON.stringify({ contents: [] }),
      });
      await readStream(initial).catch(() => undefined);
    } catch {
      // expected: the socket is destroyed once the upstream error is recorded
    }

    // Wait for runUpstream to register the terminal error on the job.
    await new Promise((resolve) => setTimeout(resolve, 60));

    // A resume against the now-terminal job returns 502 + the real cause.
    const resume = await fetch(`${appStarted.baseUrl}${STREAM_PATH}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        [JOB_ID_HEADER]: 'job-err',
        [LAST_SEQ_HEADER]: '0',
      },
      body: JSON.stringify({ contents: [] }),
    });

    expect(resume.status).toBe(502);
    const body = (await resume.json()) as Record<string, unknown>;
    expect(body.error).toBeDefined();
    expect(String(body.error)).toContain('429');
  });

  it('preserves the real upstream error body (code/message/status) in the 502', async () => {
    // Upstream rejects with a Gemini-shaped error that carries the actual
    // reason. The old code only kept the status code; we now surface the body.
    const upstream = serverCleanup.track(
      await startHttpServer(
        http.createServer((_request, response) => {
          response.writeHead(403, { 'content-type': 'application/json' });
          response.end(
            JSON.stringify({
              error: {
                code: 403,
                message: 'The caller does not have permission',
                status: 'PERMISSION_DENIED',
              },
            }),
          );
        }),
      ),
    );

    const app = createServer({
      geminiApiBase: upstream.baseUrl,
      geminiApiKey: 'server-key',
    });
    const appStarted = serverCleanup.track(await startHttpServer(app));

    try {
      const initial = await fetch(`${appStarted.baseUrl}${STREAM_PATH}`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          [JOB_ID_HEADER]: 'job-err-body',
        },
        body: JSON.stringify({ contents: [] }),
      });
      await readStream(initial).catch(() => undefined);
    } catch {
      // expected: socket destroyed once the upstream error is recorded
    }

    await new Promise((resolve) => setTimeout(resolve, 80));

    const resume = await fetch(`${appStarted.baseUrl}${STREAM_PATH}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        [JOB_ID_HEADER]: 'job-err-body',
        [LAST_SEQ_HEADER]: '0',
      },
      body: JSON.stringify({ contents: [] }),
    });

    expect(resume.status).toBe(502);
    const body = (await resume.json()) as Record<string, unknown>;
    const errorString = String(body.error);
    expect(errorString).toContain('403');
    expect(errorString).toContain('PERMISSION_DENIED');
    expect(errorString).toContain('The caller does not have permission');
  });

  it('emits a raw-JSON Gemini error chunk when the upstream fails mid-stream', async () => {
    // The upstream starts a 200 SSE stream, then its socket dies (a real
    // mid-stream failure). The browser already got 200 + SSE headers, so the
    // terminal error must be delivered as a raw JSON {"error":{...}} chunk
    // (which the genai SDK turns into an ApiError) instead of a socket destroy
    // (which becomes "socket hang up" through the web proxy). Note: `data:`-
    // prefixed error events are silently swallowed by the SDK as empty chunks,
    // so the chunk must NOT be SSE-formatted.
    const upstream = serverCleanup.track(
      await startHttpServer(
        http.createServer((_request, response) => {
          response.writeHead(200, { 'content-type': 'text/event-stream' });
          response.write('data: {"text":"partial"}\n\n');
          setTimeout(() => {
            response.socket?.destroy();
          }, 15);
        }),
      ),
    );

    const app = createServer({
      geminiApiBase: upstream.baseUrl,
      geminiApiKey: 'server-key',
    });
    const appStarted = serverCleanup.track(await startHttpServer(app));

    const res = await fetch(`${appStarted.baseUrl}${STREAM_PATH}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        [JOB_ID_HEADER]: 'job-midstream-err',
      },
      body: JSON.stringify({ contents: [] }),
    });

    expect(res.status).toBe(200);
    const body = await readStream(res);

    // Partial content first, then a standalone JSON error chunk with a real
    // cause (the upstream's read failure, e.g. "terminated"). The error chunk
    // is raw JSON (not `data:`-prefixed), so it parses as a standalone object.
    expect(body).toContain('partial');
    const blocks = body.split('\n\n').filter((b) => b.trim().length > 0);
    const lastBlock = blocks[blocks.length - 1];
    expect(lastBlock.startsWith('{')).toBe(true);
    const parsed = JSON.parse(lastBlock) as { error: { code?: number; status?: string; message?: string } };
    expect(parsed.error.code).toBeGreaterThanOrEqual(400);
    expect(parsed.error.code).toBeLessThan(600);
    expect(parsed.error.message?.length).toBeGreaterThan(0);
  });

  it('does not emit an SSE error event for a client abort', async () => {
    // Aborting via the stream-abort endpoint finishes the job with
    // 'aborted by client'; the browser handles that stop locally, so no error
    // event should be appended (which would render a spurious error bubble).
    const upstream = serverCleanup.track(
      await startHttpServer(
        http.createServer((_request, response) => {
          response.writeHead(200, { 'content-type': 'text/event-stream' });
          let n = 0;
          const interval = setInterval(() => {
            response.write(`data: ${n++}\n\n`);
          }, 5);
          response.on('close', () => clearInterval(interval));
        }),
      ),
    );

    const app = createServer({
      geminiApiBase: upstream.baseUrl,
      geminiApiKey: 'server-key',
    });
    const appStarted = serverCleanup.track(await startHttpServer(app));

    const streamReq = http.request(`${appStarted.baseUrl}${STREAM_PATH}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        [JOB_ID_HEADER]: 'job-client-abort',
      },
    });
    streamReq.write(JSON.stringify({ contents: [] }));
    streamReq.end();

    await new Promise((resolve) => setTimeout(resolve, 40));

    await fetch(`${appStarted.baseUrl}/api/gemini/stream-abort/job-client-abort`, {
      method: 'POST',
    });

    // Allow the abort to land and the flush to run.
    await new Promise((resolve) => setTimeout(resolve, 60));

    let sawErrorEvent = false;
    streamReq.on('data', (chunk: Buffer) => {
      if (chunk.toString('utf8').includes('"error"')) {
        sawErrorEvent = true;
      }
    });
    // Give any (erroneous) error event a chance to arrive.
    await new Promise((resolve) => setTimeout(resolve, 80));
    streamReq.destroy();

    expect(sawErrorEvent).toBe(false);
  });

  it('journals multi-byte UTF-8 characters split across TCP chunks without corruption', async () => {
    // A CJK character is 3 bytes in UTF-8. Splitting its bytes across two
    // network chunks and decoding each chunk independently would produce a
    // U+FFFD replacement char. The journal must stream-decode and replay the
    // original character intact (this is what refresh-resume replays).
    const splitChar = '中'; // 3 bytes
    const firstBytes = Buffer.from('data: 前缀');
    const boundary = Math.floor(firstBytes.length / 2);
    const events = [
      // First event: emit a 2-byte + partial-multibyte split across chunks.
      { chunk: firstBytes.subarray(0, boundary), delay: 5 },
      { chunk: Buffer.concat([firstBytes.subarray(boundary), Buffer.from(splitChar), Buffer.from('\n\n')]), delay: 5 },
      { chunk: Buffer.from(`data: ${splitChar}尾\n\n`), delay: 5 },
    ];

    const upstream = serverCleanup.track(
      await startHttpServer(
        http.createServer((_request, response) => {
          response.writeHead(200, { 'content-type': 'text/event-stream' });
          let i = 0;
          const tick = () => {
            if (i >= events.length) {
              response.end();
              return;
            }
            response.write(events[i].chunk);
            i += 1;
            setTimeout(tick, events[i - 1].delay);
          };
          setTimeout(tick, 5);
        }),
      ),
    );

    const app = createServer({
      geminiApiBase: upstream.baseUrl,
      geminiApiKey: 'server-key',
    });
    const appStarted = serverCleanup.track(await startHttpServer(app));

    const res = await fetch(`${appStarted.baseUrl}${STREAM_PATH}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        [JOB_ID_HEADER]: 'job-utf8',
      },
      body: JSON.stringify({ contents: [] }),
    });

    const body = await readStream(res);
    // No replacement characters anywhere in the replayed stream.
    expect(body).not.toContain('�');
    expect(body).toContain('前缀');
    expect(body).toContain('中尾');
  });

  it('delivers the full tail even when the socket write buffer backs up', async () => {
    // A single large chunk (well over the default 16KB highWaterMark) forces
    // response.write() to return false on a slow reader. The old code would
    // stop and then end() the response when the job completed, dropping the
    // tail permanently. The fix registers a 'drain' retry so every byte lands.
    const bigPayload = `data: ${'x'.repeat(64 * 1024)}\n\n`;
    const upstream = serverCleanup.track(
      await startHttpServer(
        http.createServer((_request, response) => {
          response.writeHead(200, { 'content-type': 'text/event-stream' });
          response.write(bigPayload);
          response.end();
        }),
      ),
    );

    const app = createServer({
      geminiApiBase: upstream.baseUrl,
      geminiApiKey: 'server-key',
    });
    const appStarted = serverCleanup.track(await startHttpServer(app));

    const res = await fetch(`${appStarted.baseUrl}${STREAM_PATH}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        [JOB_ID_HEADER]: 'job-backpressure',
      },
      body: JSON.stringify({ contents: [] }),
    });

    const body = await readStream(res);
    expect(body.length).toBe(bigPayload.length);
    expect(body).toBe(bigPayload);
  });
});
