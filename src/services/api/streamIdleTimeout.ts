/**
 * Shared idle watchdog for streaming responses.
 *
 * Both the Gemini-native stream (chatApi.ts) and the third-party SSE readers
 * (OpenAI-compatible, Anthropic) surface a silent upstream stall — a half-open
 * TCP socket or a proxy that reaps an idle connection does not raise an error
 * event, so a `for await`/reader loop would just wait forever — as a surfaced
 * stream error instead of an infinite spinner.
 *
 * Deep search runs Google Search on the Gemini server, so the SSE can
 * legitimately sit silent for 10-60s between chunks; hence the generous 60s
 * default. Override via VITE_STREAM_IDLE_TIMEOUT_MS when a deployment needs a
 * longer budget.
 */
const STREAM_IDLE_TIMEOUT_MS = readStreamIdleTimeoutMs();

function readStreamIdleTimeoutMs(): number {
  const raw = import.meta.env?.VITE_STREAM_IDLE_TIMEOUT_MS;
  if (typeof raw === 'string' && raw.trim()) {
    const parsed = Number(raw.trim());
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed;
    }
  }
  return 60_000;
}

export const createStreamIdleTimeoutError = (): Error => {
  const error = new Error('Stream timed out waiting for data.');
  error.name = 'StreamIdleTimeoutError';
  return error;
};

/**
 * Check a stream against the idle timeout. Returns true when the stream should
 * be considered stalled (no activity for longer than the timeout).
 */
export const hasStreamIdleTimeoutElapsed = (lastActivityAt: number, now = Date.now()): boolean =>
  now - lastActivityAt > STREAM_IDLE_TIMEOUT_MS;
