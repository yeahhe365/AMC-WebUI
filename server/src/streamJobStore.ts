import type { IncomingMessage, ServerResponse } from 'node:http';
import { Readable } from 'node:stream';
import type { ReadableStream as NodeReadableStream } from 'node:stream/web';
import { getCorsHeaders, sendJson } from './cors.js';

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
  /** Client-generated secret bound at creation; undefined for legacy secret-less jobs. */
  secret?: string;
}

// ── Tuning constants ────────────────────────────────────────────────────────

const JOB_TTL_MS = 10 * 60_000; // completed jobs retained for 10 min
const JOB_HARD_LIMIT_MS = 60 * 60_000; // hard cap 60 min even while in flight
const MAX_BUFFER_BYTES = 8 * 1024 * 1024;
const MAX_DROP_RATIO = 0.25;

// ── Shared job store ────────────────────────────────────────────────────────

const jobs = new Map<string, StreamJob>();

// Periodically evict expired jobs. unref() so the timer never keeps the process
// alive on its own (the HTTP server owns lifetime).
const sweeper = setInterval(() => {
  const now = Date.now();
  for (const [id, job] of jobs) {
    const expired = job.done && now - job.updatedAt > JOB_TTL_MS;
    const tooOld = now - job.createdAt > JOB_HARD_LIMIT_MS;
    if (expired || tooOld) {
      // If a job is still in flight past the hard limit, abort the upstream so
      // it cannot leak forever behind an orphaned listener.
      if (!job.done) {
        try {
          job.abortController.abort();
        } catch {
          /* ignore */
        }
      }
      jobs.delete(id);
    }
  }
}, 60_000);
sweeper.unref();

// ── CRUD ────────────────────────────────────────────────────────────────────

const getJob = (id: string): StreamJob | undefined => jobs.get(id);

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
  };
  jobs.set(id, job);
  return job;
};

const appendChunk = (job: StreamJob, data: string): void => {
  const seq = job.firstSeq + job.chunks.length;
  job.chunks.push({ seq, data });
  job.updatedAt = Date.now();
  job.bufferedBytes += data.length;

  // Bounded buffer: drop the oldest chunk bucket so a runaway stream cannot
  // exhaust memory. Resume callers can only rejoin the tail after a drop.
  if (job.bufferedBytes > MAX_BUFFER_BYTES) {
    const drop = Math.max(1, Math.ceil(job.chunks.length * MAX_DROP_RATIO));
    const removed = job.chunks.splice(0, drop);
    job.firstSeq += removed.length;
    job.bufferedBytes = job.chunks.reduce((sum, chunk) => sum + chunk.data.length, 0);
  }

  for (const notify of job.listeners) {
    try {
      notify();
    } catch {
      /* a listener throwing must not break the producer */
    }
  }
};

const finishJob = (job: StreamJob, error?: string): void => {
  if (job.done) {
    return;
  }
  job.done = true;
  if (error) {
    job.error = error;
  }
  job.updatedAt = Date.now();
  const listeners = job.listeners;
  job.listeners = new Set();
  for (const notify of listeners) {
    try {
      notify();
    } catch {
      /* ignore */
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

const readBoundedErrorBody = async (response: Response): Promise<string> => {
  if (!response.body) {
    return '';
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let out = '';
  let received = 0;
  for (;;) {
    const { value, done } = await reader.read();
    if (done) {
      break;
    }
    if (!value) {
      continue;
    }
    received += value.byteLength;
    out += decoder.decode(value, { stream: true });
    if (received >= MAX_ERROR_BODY_BYTES) {
      await reader.cancel();
      break;
    }
  }
  out += decoder.decode();
  return out.trim();
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

    if (!upstreamResponse.ok || !upstreamResponse.body) {
      const errorBody = await readBoundedErrorBody(upstreamResponse);
      finishJob(job, summarizeUpstreamError(upstreamResponse, errorBody));
      return;
    }

    await pumpUpstreamBodyIntoJob(job, upstreamResponse);
  } catch (error) {
    if (job.abortController.signal.aborted) {
      // Aborted by client (stream-abort endpoint); already finished with that
      // reason. Don't overwrite the abort error.
      return;
    }
    finishJob(job, error instanceof Error ? error.message : String(error));
  }
}

/**
 * Append the raw upstream body to the job's chunk buffer, splitting on SSE
 * event boundaries (\n\n) so each chunk maps to one complete SSE event. This
 * keeps resume precise: a reconnect resumes at the exact next event boundary.
 *
 * Works for any SSE-based stream (Gemini, OpenAI-compatible, Anthropic).
 */
function pumpUpstreamBodyIntoJob(job: StreamJob, upstreamResponse: Response): Promise<void> {
  return (async () => {
    // Stream-safe decoding: a multi-byte UTF-8 sequence (e.g. a CJK character)
    // can be split across two network chunks. Decoding each chunk independently
    // would turn each half into a U+FFFD replacement char inside the journal.
    // The streaming decoder holds incomplete sequences back until the next chunk
    // completes them, and the final flush emits any tail.
    const decoder = new TextDecoder('utf-8');
    let buffer = '';
    for await (const bytes of Readable.fromWeb(upstreamResponse.body as unknown as NodeReadableStream)) {
      // Normalize CRLF/CR line endings to LF FIRST so \n\n splitting works
      // for upstreams that send \r\n\r\n events (e.g. aistudio-to-api).
      buffer += decoder.decode(bytes, { stream: true }).replace(/\r\n/g, '\n').replace(/\r/g, '\n');
      let idx: number;
      while ((idx = buffer.indexOf('\n\n')) !== -1) {
        const rawEvent = buffer.slice(0, idx + 2);
        buffer = buffer.slice(idx + 2);
        if (rawEvent.trim()) {
          appendChunk(job, rawEvent);
        }
      }
    }
    buffer += decoder.decode();
    if (buffer.trim()) {
      appendChunk(job, buffer);
    }
    finishJob(job);
  })().catch((error: unknown) => {
    finishJob(job, error instanceof Error ? error.message : String(error));
  });
}

/**
 * Fan out the buffered chunks to the browser response, from `cursor + 1`
 * onward. Each call drains everything currently buffered. When the job is
 * done, the response is closed. Returns the new cursor.
 */
function flushToResponse(job: StreamJob, response: ServerResponse, cursor: number): number {
  let nextCursor = cursor;
  for (const chunk of job.chunks) {
    if (chunk.seq > nextCursor && chunk.seq >= job.firstSeq) {
      // write() returns false when the socket's internal write buffer is full.
      // The chunk is still accepted (queued for flush) — the return value only
      // says "wait before writing MORE". So the cursor must advance past this
      // chunk either way: re-writing it on the next flush would duplicate the
      // event in the browser, and skipping past it would lose the tail. We stop
      // here and let the caller register a 'drain' retry for the rest.
      nextCursor = chunk.seq;
      if (!response.write(chunk.data)) {
        break;
      }
    }
  }
  return nextCursor;
}

// ── Shared SSE attach helper ─────────────────────────────────────────────────

interface AttachJobStreamConfig {
  allowedOrigins: string[];
}

// ── Upstream error → SSE error event ────────────────────────────────────────

// The browser's @google/genai SDK parses each raw network chunk as JSON before
// splitting it into SSE events, and throws an ApiError for any chunk that is a
// standalone {"error":{code,status,message}} object with a numeric code in
// [400,600). We rely on that to surface an upstream failure to the browser once
// the 200 SSE headers are already on the wire: emit the error as a raw JSON
// chunk (NOT `data:`-prefixed — that form is treated as an ordinary event and
// silently yields an empty chunk), then end the response cleanly. Ending clean
// instead of destroying the socket also stops the web proxy from turning the
// failure into a bare "socket hang up".
const parseStreamErrorDetails = (raw: string): { code: number; status: string } => {
  const codeMatch = /(?:upstream\s+)?(\d{3})/.exec(raw);
  const statusMatch = /([A-Z][A-Z0-9_]{2,})/.exec(raw);
  return {
    code: codeMatch ? Number(codeMatch[1]) : 502,
    status: statusMatch ? statusMatch[1] : 'INTERNAL',
  };
};

const buildStreamErrorEvent = (raw: string): string => {
  const { code, status } = parseStreamErrorDetails(raw);
  return `${JSON.stringify({ error: { code, status, message: raw } })}\n\n`;
};

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

  let job = getJob(jobId);
  if (!job) {
    job = createJob(jobId);
    if (jobSecret) {
      job.secret = jobSecret;
    }
    // Fire the upstream fetch detached from the browser connection so that a
    // browser disconnect does not cancel the upstream. The fetch reads the
    // request body lazily; if the browser never sent a body (e.g. an abort
    // probe) the upstream fetch will fail fast and finish the job.
    startUpstream(job);
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
  const lastSeq = Number(lastSeqRaw ?? 0) || 0;

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
  let drainScheduled = false;

  const flush = () => {
    if (response.writableEnded || response.destroyed) {
      return;
    }
    drainScheduled = false;
    cursor = flushToResponse(job, response, cursor);

    // Some buffered chunks were not written because the socket's write buffer
    // was full (write() returned false). Do NOT end the response even if the
    // job is done — that would permanently drop the tail. Register a drain
    // retry so the remaining chunks are delivered once the socket drains.
    // (A write() that returned false is still queued for flush; chunks *after*
    // the break live only in job.chunks, so end() alone would drop them.)
    const hasPendingChunks = job.chunks.some((chunk) => chunk.seq > cursor && chunk.seq >= job.firstSeq);
    if (hasPendingChunks) {
      if (!drainScheduled) {
        drainScheduled = true;
        response.once('drain', flush);
      }
      return;
    }

    if (job?.done) {
      job.listeners.delete(flush);
      // If the upstream finished with an error after we already started
      // streaming, we can no longer change the 200 status. Instead of
      // destroying the socket (which loses the reason and surfaces upstream as
      // a bare "socket hang up" through the web proxy), emit a raw-JSON Gemini
      // error chunk and end cleanly: the SDK throws an ApiError on a standalone
      // {"error":{...}} chunk and the frontend routes the real cause into the
      // error bubble. A clean end also means the proxy never sees a broken
      // connection, so "Bad Gateway: socket hang up" is gone entirely.
      if (job.error) {
        console.error('[stream-jobs] upstream finished with error after headers sent:', job.error);
        // A client-initiated abort is already surfaced to the user by the
        // frontend's AbortError path; emitting an SSE error event for it would
        // render a spurious error bubble. Only genuine upstream failures get
        // the error event. And a write to an already-destroyed response throws
        // (browser went away); there's nothing left to send then.
        if (job.error !== ABORTED_BY_CLIENT_MESSAGE && !response.writableEnded && !response.destroyed) {
          response.write(buildStreamErrorEvent(job.error));
          response.end();
        }
        return;
      }
      response.end();
    }
  };

  // Drain anything already buffered (covers the resume case where the job
  // already has history, and the just-started case where the first events
  // landed before this listener attached).
  flush();
  if (job && !job.done) {
    job.listeners.add(flush);
    // Key difference vs. the normal proxy: a browser disconnect here only
    // unsubscribes. The upstream keeps running so a refresh can resume.
    response.on('close', () => {
      job?.listeners.delete(flush);
    });
  }

  return true;
}
