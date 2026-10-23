import type { IncomingMessage, ServerResponse } from 'node:http';
import { getCorsHeaders, sendJson } from '../cors.js';

// Request headers that gate stream journaling. Exported so every provider's
// proxy (Gemini, OpenAI-compatible, Anthropic) and the unified abort route
// share the exact same header names.
export const JOB_ID_HEADER = 'x-amc-job-id';
export const LAST_SEQ_HEADER = 'x-amc-last-seq';
const JOB_SECRET_HEADER = 'x-amc-job-secret';

// ── Job data structures ─────────────────────────────────────────────────────

export interface StreamJobChunk {
  seq: number;
  data: string;
}

export interface StreamJob {
  id: string;
  firstSeq: number;
  chunks: StreamJobChunk[];
  done: boolean;
  error?: string;
  abortController: AbortController;
  listeners: Set<() => void>;
  createdAt: number;
  updatedAt: number;
  bufferedBytes: number;
  pendingBytes: number;
  subscribers: number;
  hardTimer?: ReturnType<typeof setTimeout>;
  idleTimer?: ReturnType<typeof setTimeout>;
  /** Client-generated secret bound at creation; undefined for legacy secret-less jobs. */
  secret?: string;
}

// ── Tuning constants ────────────────────────────────────────────────────────

// Each budget is process-wide unless named per-job. Invalid environment values
// fall back to bounded defaults rather than disabling a limit.
const limit = (name: string, fallback: number): number => {
  const value = Number(process.env[`AMC_STREAM_JOB_${name}`]);
  return Number.isSafeInteger(value) && value > 0 && value <= 2_147_483_647 ? value : fallback;
};
const JOB_TTL_MS = limit('TTL_MS', 10 * 60_000);
const JOB_HARD_LIMIT_MS = limit('HARD_MS', 60 * 60_000);
const JOB_IDLE_MS = limit('IDLE_MS', 120_000);
const MAX_EVENT_BYTES = limit('EVENT_BYTES', 8 * 1024 * 1024);
const MAX_BUFFER_BYTES = limit('RETAINED_BYTES', 8 * 1024 * 1024);
const MAX_TOTAL_BYTES = limit('TOTAL_RETAINED_BYTES', 64 * 1024 * 1024);
const MAX_PENDING_BYTES = limit('TOTAL_PENDING_BYTES', 16 * 1024 * 1024);
const MAX_JOBS = limit('MAX_JOBS', 256);
const MAX_ACTIVE = limit('MAX_ACTIVE', 32);
const MAX_SUBSCRIBERS = limit('MAX_SUBSCRIBERS', 4);
const MAX_TOTAL_SUBSCRIBERS = limit('TOTAL_SUBSCRIBERS', 128);
const DRAIN_TIMEOUT_MS = limit('DRAIN_MS', 30_000);
const MAX_WRITE_BYTES = limit('WRITE_BYTES', 8 * 1024 * 1024 + 64 * 1024);
const MAX_TOTAL_WRITE_BYTES = limit('TOTAL_WRITE_BYTES', 64 * 1024 * 1024);
const MAX_CHUNKS = limit('MAX_CHUNKS', 8192);
const MAX_TOTAL_CHUNKS = limit('TOTAL_CHUNKS', 65_536);

const jobs = new Map<string, StreamJob>();
let retainedBytes = 0;
let retainedChunks = 0;
let pendingBytes = 0;
let subscribers = 0;
let blockedWriteBytes = 0;

const setPendingBytes = (job: StreamJob, bytes: number): void => {
  pendingBytes += bytes - job.pendingBytes;
  job.pendingBytes = bytes;
};

const finishJob = (job: StreamJob, error?: string): void => {
  if (job.done) return;
  job.done = true;
  if (error) job.error = error;
  job.updatedAt = Date.now();
  clearTimeout(job.hardTimer);
  clearTimeout(job.idleTimer);
  setPendingBytes(job, 0);
  const listeners = [...job.listeners];
  job.listeners.clear();
  for (const notify of listeners) {
    try {
      notify();
    } catch {
      /* a broken subscriber must not break the producer */
    }
  }
};

const failJob = (job: StreamJob, error: string): void => {
  finishJob(job, error);
  job.abortController.abort();
};

const touchJob = (job: StreamJob): void => {
  if (job.done) return;
  job.updatedAt = Date.now();
  clearTimeout(job.idleTimer);
  job.idleTimer = setTimeout(() => failJob(job, 'stream job idle timeout'), JOB_IDLE_MS);
  job.idleTimer.unref();
};

const removeJob = (job: StreamJob): void => {
  retainedBytes -= job.bufferedBytes;
  retainedChunks -= job.chunks.length;
  job.chunks = [];
  job.bufferedBytes = 0;
  jobs.delete(job.id);
};

const pruneJobs = (): void => {
  const now = Date.now();
  for (const job of jobs.values()) {
    if (job.done && !job.subscribers && now - job.updatedAt >= JOB_TTL_MS) removeJob(job);
  }
};
const sweeper = setInterval(pruneJobs, 60_000);
sweeper.unref();

const getJob = (id: string): StreamJob | undefined => {
  pruneJobs();
  return jobs.get(id);
};

const createJob = (id: string): StreamJob => {
  const job: StreamJob = {
    id,
    firstSeq: 1,
    chunks: [],
    done: false,
    abortController: new AbortController(),
    listeners: new Set(),
    createdAt: Date.now(),
    updatedAt: Date.now(),
    bufferedBytes: 0,
    pendingBytes: 0,
    subscribers: 0,
  };
  jobs.set(id, job);
  job.hardTimer = setTimeout(() => failJob(job, 'stream job lifetime limit exceeded'), JOB_HARD_LIMIT_MS);
  job.hardTimer.unref();
  touchJob(job);
  return job;
};

const dropFirstChunk = (job: StreamJob): void => {
  const removed = job.chunks.shift();
  if (!removed) return;
  const bytes = Buffer.byteLength(removed.data, 'utf8');
  job.firstSeq = removed.seq + 1;
  job.bufferedBytes -= bytes;
  retainedBytes -= bytes;
  retainedChunks -= 1;
};

const appendChunk = (job: StreamJob, data: string): void => {
  if (job.done) return;
  const bytes = Buffer.byteLength(data, 'utf8');
  const seq = job.firstSeq + job.chunks.length;
  job.chunks.push({ seq, data });
  job.bufferedBytes += bytes;
  retainedBytes += bytes;
  retainedChunks += 1;
  while (job.bufferedBytes > MAX_BUFFER_BYTES || job.chunks.length > MAX_CHUNKS) dropFirstChunk(job);
  for (const oldest of jobs.values()) {
    while ((retainedBytes > MAX_TOTAL_BYTES || retainedChunks > MAX_TOTAL_CHUNKS) && oldest.chunks.length)
      dropFirstChunk(oldest);
    if (retainedBytes <= MAX_TOTAL_BYTES && retainedChunks <= MAX_TOTAL_CHUNKS) break;
  }
  for (const notify of job.listeners) {
    try {
      notify();
    } catch {
      /* isolate subscribers */
    }
  }
};

// ── Generic SSE helpers (provider-agnostic) ─────────────────────────────────

// The error message recorded when a client aborts a job via the abort endpoint.
// Kept distinct from upstream failures so downstream code can tell a
// client-initiated stop (already surfaced to the user by the frontend) from a
// genuine upstream error (which deserves an SSE error event / 502).
const ABORTED_BY_CLIENT_MESSAGE = 'aborted by client';

/**
 * Abort a job by id. Returns true if the job was aborted, false if not found,
 * already done, or the presented secret does not match a secret-bound job
 * (reported as "not found" so the endpoint doesn't leak a job's existence).
 * Works for any provider's job in the shared Map.
 */
export const abortJob = (id: string, secret?: string): boolean => {
  const job = jobs.get(id);
  if (!job || job.done) {
    return false;
  }
  if (job.secret && job.secret !== secret) {
    return false;
  }
  try {
    job.abortController.abort();
  } catch {
    /* ignore */
  }
  finishJob(job, ABORTED_BY_CLIENT_MESSAGE);
  return true;
};

// Read a bounded amount of an error response body. The body carries the real
// upstream failure reason (e.g. Gemini's {"error":{"code":403,"message":...}});
// we want that message in the job error so the browser and logs surface the
// actual cause instead of a bare status code. Bounded to avoid buffering a
// huge error page from a misbehaving upstream.
const MAX_ERROR_BODY_BYTES = 64 * 1024;

const readBoundedErrorBody = async (job: StreamJob, response: Response): Promise<string> => {
  if (!response.body) {
    return '';
  }
  const reader = response.body.getReader();
  const cancel = () => {
    void reader.cancel().catch(() => {});
  };
  job.abortController.signal.addEventListener('abort', cancel, { once: true });
  const decoder = new TextDecoder('utf-8');
  let out = '';
  let received = 0;
  try {
    if (job.abortController.signal.aborted) cancel();
    while (!job.done) {
      const { value, done } = await reader.read();
      if (done) break;
      if (!value) continue;
      touchJob(job);
      const allowed = value.subarray(0, MAX_ERROR_BODY_BYTES - received);
      received += allowed.byteLength;
      out += decoder.decode(allowed, { stream: true });
      if (received >= MAX_ERROR_BODY_BYTES) {
        await reader.cancel();
        break;
      }
    }
    out += decoder.decode();
    return out.trim();
  } finally {
    job.abortController.signal.removeEventListener('abort', cancel);
    reader.releaseLock();
  }
};

// Normalize an upstream error body into a compact, human-readable reason.
// Gemini-shaped JSON keeps its code/message/status; anything else falls back
// to the raw body (bounded) so the status code alone is never all we have.
const summarizeUpstreamError = (response: Response, body: string): string => {
  if (!body) {
    return `upstream ${response.status}`;
  }
  try {
    const parsed = JSON.parse(body) as {
      error?: { code?: unknown; message?: unknown; status?: unknown };
    };
    const error = parsed?.error;
    if (error && (error.code !== undefined || error.message !== undefined || error.status !== undefined)) {
      const parts: string[] = [];
      if (error.code !== undefined) parts.push(String(error.code));
      if (error.status !== undefined) parts.push(String(error.status));
      if (error.message !== undefined) parts.push(String(error.message));
      return `upstream ${response.status}: ${parts.join(' ')}`;
    }
  } catch {
    // Not JSON; fall through to the raw body.
  }
  return `upstream ${response.status}: ${body}`;
};

/**
 * Fire a detached upstream fetch for a journaled stream job and pump its SSE
 * body into the job buffer. Shared by the Gemini and third-party proxies —
 * the only provider difference is how the request headers are built, supplied
 * via `buildHeaders`. Uses the job's abort signal so the stream-abort endpoint
 * can kill it; a browser disconnect does NOT abort this — only the abort
 * endpoint or the sweeper does.
 */
export async function runDetachedUpstream(
  job: StreamJob,
  request: IncomingMessage,
  upstreamUrl: string,
  buildHeaders: () => Headers,
  fetchImpl: typeof fetch,
): Promise<void> {
  try {
    const method = request.method || 'POST';
    const hasBody = !['GET', 'HEAD'].includes(method);
    const requestInit: RequestInit & { duplex?: 'half' } = {
      method,
      headers: buildHeaders(),
      signal: job.abortController.signal,
      // redirect: 'manual' so a public upstream base cannot 302 into a
      // private network host after the input URL passed validation.
      redirect: 'manual',
    };
    if (hasBody) {
      requestInit.body = request as unknown as BodyInit;
      requestInit.duplex = 'half';
    }

    const upstreamResponse = await fetchImpl(upstreamUrl, requestInit);
    if (job.done) {
      await upstreamResponse.body?.cancel();
      return;
    }
    touchJob(job);

    if (!upstreamResponse.ok || !upstreamResponse.body) {
      const errorBody = await readBoundedErrorBody(job, upstreamResponse);
      finishJob(job, summarizeUpstreamError(upstreamResponse, errorBody));
      return;
    }

    await pumpUpstreamBodyIntoJob(job, upstreamResponse);
  } catch (upstreamStreamError) {
    if (job.abortController.signal.aborted) {
      // Aborted by client (stream-abort endpoint); already finished with that
      // reason. Don't overwrite the abort error.
      return;
    }
    finishJob(job, upstreamStreamError instanceof Error ? upstreamStreamError.message : String(upstreamStreamError));
  }
}

/**
 * Append the raw upstream body to the job's chunk buffer, splitting on SSE
 * event boundaries (\n\n) so each chunk maps to one complete SSE event. This
 * keeps resume precise: a reconnect resumes at the exact next event boundary.
 *
 * Works for any SSE-based stream (Gemini, OpenAI-compatible, Anthropic).
 */
async function pumpUpstreamBodyIntoJob(job: StreamJob, upstreamResponse: Response): Promise<void> {
  const reader = upstreamResponse.body!.getReader();
  const cancel = () => {
    void reader.cancel().catch(() => {});
  };
  job.abortController.signal.addEventListener('abort', cancel, { once: true });
  const decoder = new TextDecoder('utf-8');
  let buffer = '';
  let pendingCr = false;
  const consume = (decoded: string, final = false): void => {
    // Delay a trailing CR so a CRLF split over network chunks is one newline.
    let text = (pendingCr ? '\r' : '') + decoded;
    pendingCr = !final && text.endsWith('\r');
    if (pendingCr) text = text.slice(0, -1);
    text = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    let offset = 0;
    while (offset < text.length && !job.done) {
      const end = text.indexOf('\n', offset);
      const piece = text.slice(offset, end === -1 ? text.length : end + 1);
      const bytes = job.pendingBytes + Buffer.byteLength(piece, 'utf8');
      if (bytes > MAX_EVENT_BYTES || pendingBytes - job.pendingBytes + bytes > MAX_PENDING_BYTES) {
        failJob(job, 'stream event byte limit exceeded');
        return;
      }
      buffer += piece;
      setPendingBytes(job, bytes);
      if (buffer.endsWith('\n\n')) {
        const event = buffer;
        buffer = '';
        setPendingBytes(job, 0);
        if (event.trim()) appendChunk(job, event);
      }
      offset += piece.length;
    }
  };
  try {
    if (job.abortController.signal.aborted) cancel();
    while (!job.done) {
      const { value, done } = await reader.read();
      if (done) break;
      touchJob(job);
      // Decode bounded slices so one large network read cannot create an
      // unbounded pending string before the event budget is checked.
      for (let offset = 0; offset < value.byteLength && !job.done; offset += 16_384) {
        consume(decoder.decode(value.subarray(offset, offset + 16_384), { stream: true }));
      }
    }
    if (!job.done) {
      consume(decoder.decode(), true);
      if (!job.done && buffer.trim()) {
        setPendingBytes(job, 0);
        appendChunk(job, buffer);
      }
      finishJob(job);
    }
  } catch (error) {
    finishJob(job, error instanceof Error ? error.message : String(error));
  } finally {
    job.abortController.signal.removeEventListener('abort', cancel);
    if (job.abortController.signal.aborted) await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

// ── Shared SSE attach helper ─────────────────────────────────────────────────

interface AttachJobStreamConfig {
  allowedOrigins: string[];
}

/**
 * Helper for a provider proxy that wants the full journal treatment: detect
 * the job-id header, create the job if missing, fire the (provider-specific)
 * upstream fetch detached from the browser connection, then attach the browser
 * response to the buffered job. Returns true when handled, false when the
 * request had no job-id header (caller falls through to pass-through).
 *
 * `startUpstream` receives the job and must begin the detached upstream fetch
 * (the provider supplies the URL, headers, abort signal wiring, and fetch impl).
 * It is only invoked for a brand-new job.
 */
export const readJobSecret = (request: IncomingMessage): string | undefined => {
  const raw = request.headers[JOB_SECRET_HEADER];
  const value = Array.isArray(raw) ? raw[0] : raw;
  const trimmed = value?.trim();
  return trimmed || undefined;
};

export async function maybeStreamWithSharedJob(
  request: IncomingMessage,
  response: ServerResponse,
  config: AttachJobStreamConfig,
  startUpstream: (job: StreamJob) => void,
): Promise<boolean> {
  const jobIdRaw = request.headers[JOB_ID_HEADER];
  const jobId = (Array.isArray(jobIdRaw) ? jobIdRaw[0] : jobIdRaw)?.trim();
  if (!jobId) {
    return false;
  }
  const jobSecret = readJobSecret(request);

  const lastSeqHeader = request.headers[LAST_SEQ_HEADER];
  const lastSeqRaw = Array.isArray(lastSeqHeader) ? lastSeqHeader[0] : lastSeqHeader;
  const lastSeq = Number(lastSeqRaw ?? 0);
  if (!Number.isSafeInteger(lastSeq) || lastSeq < 0) {
    sendJson(request, response, 400, { error: 'invalid stream cursor' }, config.allowedOrigins);
    return true;
  }
  let job = getJob(jobId);
  if (!job) {
    if (lastSeq > 0) {
      sendJson(request, response, 409, { error: 'stream history is unavailable' }, config.allowedOrigins);
      return true;
    }
    if ([...jobs.values()].filter((existing) => !existing.done).length >= MAX_ACTIVE) {
      sendJson(request, response, 429, { error: 'stream job active capacity exceeded' }, config.allowedOrigins);
      return true;
    }
    if (jobs.size >= MAX_JOBS) {
      for (const existing of jobs.values()) {
        if (existing.done && !existing.subscribers) removeJob(existing);
        if (jobs.size < MAX_JOBS) break;
      }
    }
    if (jobs.size >= MAX_JOBS || subscribers >= MAX_TOTAL_SUBSCRIBERS) {
      sendJson(request, response, 503, { error: 'stream job capacity exceeded' }, config.allowedOrigins);
      return true;
    }
    job = createJob(jobId);
    if (jobSecret) {
      job.secret = jobSecret;
    }
    // Fire the upstream fetch detached from the browser connection so that a
    // browser disconnect does not cancel the upstream. The fetch reads the
    // request body lazily; if the browser never sent a body (e.g. an abort
    // probe) the upstream fetch will fail fast and finish the job.
    try {
      startUpstream(job);
    } catch (error) {
      failJob(job, error instanceof Error ? error.message : String(error));
    }
  } else if (job.secret && job.secret !== jobSecret) {
    // Secret-bound job: reject before any headers are written so a caller
    // without the secret can neither replay nor attach to the buffer.
    sendJson(request, response, 403, { error: 'stream job secret mismatch' }, config.allowedOrigins);
    return true;
  }

  return attachJobStream(request, response, config, job);
}

/**
 * Attach a browser SSE response to an existing job and fan out the buffered
 * chunks. Provider-agnostic. The caller must have already created the job and
 * (for a new job) started the upstream fetch; this function only manages the
 * browser-side subscription. Returns true when handled.
 */
async function attachJobStream(
  request: IncomingMessage,
  response: ServerResponse,
  config: AttachJobStreamConfig,
  job: StreamJob,
): Promise<boolean> {
  const lastSeqHeader = request.headers[LAST_SEQ_HEADER];
  const lastSeqRaw = Array.isArray(lastSeqHeader) ? lastSeqHeader[0] : lastSeqHeader;
  const lastSeq = Number(lastSeqRaw ?? 0);
  const latestSeq = job.firstSeq + job.chunks.length - 1;
  if (lastSeq < job.firstSeq - 1 || lastSeq > latestSeq) {
    sendJson(
      request,
      response,
      409,
      { error: 'stream history is unavailable for this cursor', firstSeq: job.firstSeq },
      config.allowedOrigins,
    );
    return true;
  }
  if (job.subscribers >= MAX_SUBSCRIBERS || subscribers >= MAX_TOTAL_SUBSCRIBERS) {
    sendJson(request, response, 429, { error: 'stream subscriber capacity exceeded' }, config.allowedOrigins);
    return true;
  }

  // Terminal-job short-circuit: if the upstream already finished with an error
  // (e.g. a 429/500 at the start, or a mid-stream failure that completed the
  // job before this request attached), surface it as a 502 with the real cause
  // so the client routes through its error handler and the user sees the actual
  // reason — instead of an HTTP 200 with an empty body that looks like the
  // model simply returned nothing. Must run before writeHead(200) commits the
  // SSE headers, after which the status can no longer change.
  if (job.done && job.error) {
    sendJson(request, response, 502, { error: job.error }, config.allowedOrigins);
    return true;
  }

  response.writeHead(200, {
    ...getCorsHeaders(request, config.allowedOrigins),
    'content-type': 'text/event-stream; charset=utf-8',
    'cache-control': 'no-store',
    'x-accel-buffering': 'no',
  });

  let cursor = lastSeq;
  let blocked = false;
  let cleanedUp = false;
  let queuedBytes = 0;
  let drainTimer: ReturnType<typeof setTimeout> | undefined;
  subscribers += 1;
  job.subscribers += 1;
  const cleanup = () => {
    if (cleanedUp) return;
    cleanedUp = true;
    subscribers -= 1;
    job.subscribers -= 1;
    blockedWriteBytes -= queuedBytes;
    queuedBytes = 0;
    job.listeners.delete(flush);
    response.off('drain', drained);
    response.off('close', cleanup);
    response.off('finish', cleanup);
    clearTimeout(drainTimer);
  };
  const endWithError = (message: string) => {
    cleanup();
    if (!response.destroyed && !response.writableEnded) {
      // A JSON error appended to SSE can be coalesced with the preceding event
      // and ignored by SDK parsers. Fail the HTTP body instead: all providers
      // must observe an incomplete stream, never a successful truncated reply.
      // The job retains its specific error for a later HTTP 502 replay.
      if (message === ABORTED_BY_CLIENT_MESSAGE) response.end();
      else response.destroy();
    }
  };
  const drained = () => {
    blocked = false;
    blockedWriteBytes -= queuedBytes;
    queuedBytes = 0;
    clearTimeout(drainTimer);
    flush();
  };
  const flush = () => {
    if (response.writableEnded || response.destroyed) {
      cleanup();
      return;
    }
    if (blocked) return;
    if (cursor < job.firstSeq - 1) {
      endWithError('409 stream history gap: subscriber fell behind');
      return;
    }
    for (const chunk of job.chunks) {
      if (chunk.seq <= cursor) continue;
      const bytes = Buffer.byteLength(chunk.data, 'utf8');
      if (response.writableLength + bytes > MAX_WRITE_BYTES) {
        endWithError('stream subscriber write byte limit exceeded');
        return;
      }
      if (blockedWriteBytes + response.writableLength + bytes > MAX_TOTAL_WRITE_BYTES) {
        endWithError('stream subscriber queued byte capacity exceeded');
        return;
      }
      cursor = chunk.seq;
      if (!response.write(chunk.data)) {
        blocked = true;
        queuedBytes = Math.max(bytes, response.writableLength);
        blockedWriteBytes += queuedBytes;
        response.once('drain', drained);
        drainTimer = setTimeout(() => {
          cleanup();
          response.destroy();
        }, DRAIN_TIMEOUT_MS);
        drainTimer.unref();
        return;
      }
    }
    if (job.done) {
      if (job.error) endWithError(job.error);
      else {
        cleanup();
        response.end();
      }
    }
  };
  response.once('close', cleanup);
  response.once('finish', cleanup);
  if (!job.done) job.listeners.add(flush);
  flush();
  return true;
}
