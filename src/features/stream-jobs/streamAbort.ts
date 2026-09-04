import { STREAM_ABORT_URL_PREFIX } from './streamAbortUrl';

/**
 * Fire-and-forget POST to the api container's stream-abort endpoint so the
 * upstream Gemini connection is torn down in addition to the local abort.
 * Returns a promise the caller can await or ignore; failures are logged but
 * never thrown — the local abort is the source of truth for the UI.
 *
 * `jobSecret` must be the secret the job was created with; the server rejects
 * aborts for secret-bound jobs that don't present it.
 */
export const abortServerStreamJob = async (
  jobId: string,
  options: { abortSignal?: AbortSignal; jobSecret?: string } = {},
): Promise<void> => {
  const { abortSignal, jobSecret } = options;
  if (!jobId) {
    return;
  }
  try {
    await fetch(`${STREAM_ABORT_URL_PREFIX}/${encodeURIComponent(jobId)}`, {
      method: 'POST',
      signal: abortSignal,
      ...(jobSecret ? { headers: { 'x-amc-job-secret': jobSecret } } : {}),
    });
  } catch (error) {
    // Swallow: this is best-effort. The local AbortController already
    // cancelled the browser-side stream; if the upstream abort misses, the
    // job TTL (10 min) on the server reaps it.
    if (!(error instanceof DOMException && error.name === 'AbortError')) {
      // Avoid importing logService at module top to keep this leaf free of
      // the service singletons for test isolation.
      void import('@/services/logService').then(({ logService }) =>
        logService.warn('stream-abort request failed (best-effort)', { jobId }),
      );
    }
  }
};
