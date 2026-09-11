import { appendSseChunk } from './sseBuffer';
import { createStreamIdleTimeoutError, hasStreamIdleTimeoutElapsed } from './streamIdleTimeout';

export type SseStreamParser<T> = (buffer: string) => { events: T[]; rest: string };

/**
 * Splits an SSE buffer by `\n\n` boundaries, extracts and concatenates `data:` lines
 * for each event block, and returns the extracted raw data strings along with any
 * trailing unparsed buffer.
 */
export const parseSseRawDataChunks = (buffer: string): { events: string[]; rest: string } => {
  const events: string[] = [];
  let searchStart = 0;
  let boundaryIndex = buffer.indexOf('\n\n', searchStart);

  while (boundaryIndex !== -1) {
    const rawEvent = buffer.slice(searchStart, boundaryIndex);
    const eventData = rawEvent
      .split('\n')
      .map((line) => line.trimEnd())
      .filter((line) => line.startsWith('data:'))
      .map((line) => line.slice(5).trimStart())
      .join('\n');

    if (eventData) {
      events.push(eventData);
    }

    searchStart = boundaryIndex + 2;
    boundaryIndex = buffer.indexOf('\n\n', searchStart);
  }

  return { events, rest: buffer.slice(searchStart) };
};

/**
 * Parses raw SSE data chunks as JSON, silently skipping malformed entries and `[DONE]` markers.
 */
export const parseSseJsonEvents = <T>(buffer: string): { events: T[]; rest: string } => {
  const { events: rawChunks, rest } = parseSseRawDataChunks(buffer);
  const events: T[] = [];

  for (const chunk of rawChunks) {
    if (chunk === '[DONE]') continue;
    try {
      events.push(JSON.parse(chunk) as T);
    } catch {
      // Skip malformed SSE lines
    }
  }

  return { events, rest };
};

/**
 * Read a streaming SSE body to completion, parsing events with `parse` and
 * invoking `onEvent` for each. Stops early when `isDone` returns true for an
 * event (used for terminal markers like Anthropic's `message_stop` or OpenAI's
 * `[DONE]`). The reader is always released (cancel) so the connection returns
 * to the pool.
 *
 * An idle watchdog mirrors the Gemini-native stream (chatApi.ts): a half-open
 * TCP socket or an idle-reaping proxy stalls `reader.read()` without erroring,
 * so without a timeout the UI would spin forever. A stall longer than the
 * shared VITE_STREAM_IDLE_TIMEOUT_MS budget rejects with a surfaced
 * StreamIdleTimeoutError instead.
 */
export const readSseStream = async <T>(
  response: Response,
  abortSignal: AbortSignal,
  parse: SseStreamParser<T>,
  onEvent: (event: T) => void,
  isDone?: (event: T) => boolean,
): Promise<void> => {
  if (!response.body) {
    return;
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  let lastActivityAt = Date.now();
  let timedOut = false;
  const idleWatchdog = setInterval(() => {
    if (hasStreamIdleTimeoutElapsed(lastActivityAt)) {
      timedOut = true;
      void reader.cancel().catch(() => undefined);
    }
  }, 5_000);
  idleWatchdog.unref?.();

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done || abortSignal.aborted) break;

      lastActivityAt = Date.now();
      buffer = appendSseChunk(buffer, decoder.decode(value, { stream: true }));
      const parsed = parse(buffer);
      buffer = parsed.rest;
      for (const event of parsed.events) {
        onEvent(event);
        if (isDone?.(event)) {
          return;
        }
      }
    }

    if (timedOut) {
      throw createStreamIdleTimeoutError();
    }

    const tail = decoder.decode();
    if (tail) {
      buffer = appendSseChunk(buffer, tail);
    }
    const parsed = parse(`${buffer}\n\n`);
    for (const event of parsed.events) {
      onEvent(event);
    }
  } finally {
    clearInterval(idleWatchdog);
    // Release the reader so the underlying HTTP/TLS connection is returned to the pool.
    await reader.cancel().catch(() => undefined);
  }
};
