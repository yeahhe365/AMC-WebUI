import { appendSseChunk } from './sseBuffer';
import { createStreamIdleTimeoutError, hasStreamIdleTimeoutElapsed } from './streamIdleTimeout';

type SseStreamParser<T> = (buffer: string) => { events: T[]; rest: string };

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
