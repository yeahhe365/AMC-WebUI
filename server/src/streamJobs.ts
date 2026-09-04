import type { IncomingMessage, ServerResponse } from 'node:http';
import { sendJson } from './cors.js';
import { JOB_ID_HEADER, runDetachedUpstream, maybeStreamWithSharedJob, type StreamJob } from './streamJobStore.js';
import { buildGeminiProxyHeaders, resolveGeminiRequestApiKey } from './proxyHeaders.js';

// Re-export the shared job-store abort primitive so existing callers
// (createServer, geminiProxy) keep importing from a single module.
// Header constants and the rest of the store live in streamJobStore —
// import them from there directly (thirdPartyProxy already does).
export { abortJob, readJobSecret } from './streamJobStore.js';

const isStreamPath = (pathname: string): boolean => pathname.includes(':streamGenerateContent');

// ── Gemini-specific header builders ─────────────────────────────────────────

interface GeminiStreamProxyConfig {
  geminiApiBase: string;
  geminiApiKey?: string;
  allowedOrigins: string[];
  serverKeyPriority?: boolean;
  fetchImpl: typeof fetch;
}

// Header construction (BYOK 兜底 key resolution + header stamping) is shared
// with geminiProxy via proxyHeaders; only the upstream runner differs here.
const runUpstream = (
  job: StreamJob,
  request: IncomingMessage,
  upstreamUrl: string,
  apiKey: string,
  fetchImpl: typeof fetch,
) => runDetachedUpstream(job, request, upstreamUrl, () => buildGeminiProxyHeaders(request, apiKey), fetchImpl);

/**
 * Handles a streaming Gemini request with job journaling. If no `x-amc-job-id`
 * header is present, this returns false and the caller should fall back to the
 * ordinary pass-through proxy. When the header is present, the upstream is
 * fetched and buffered independently of the browser connection: a browser
 * disconnect only unsubscribes (does NOT abort upstream), so a page refresh can
 * resume from the last seq the browser saw.
 */
export async function maybeStreamWithJob(
  request: IncomingMessage,
  response: ServerResponse,
  upstreamPath: string,
  upstreamUrl: string,
  config: GeminiStreamProxyConfig,
): Promise<boolean> {
  if (!isStreamPath(upstreamPath)) {
    return false;
  }
  const jobIdRaw = request.headers[JOB_ID_HEADER];
  const jobId = (Array.isArray(jobIdRaw) ? jobIdRaw[0] : jobIdRaw)?.trim();
  if (!jobId) {
    return false;
  }

  const apiKey = resolveGeminiRequestApiKey(request, config.geminiApiKey, config.serverKeyPriority);
  if (!apiKey) {
    sendJson(request, response, 500, { error: 'GEMINI_API_KEY is not configured.' }, config.allowedOrigins);
    return true;
  }

  // Delegate the shared journal plumbing to streamJobStore: create the job if
  // missing, fire the Gemini-specific upstream fetch detached, then attach the
  // browser response to the buffered chunks. A browser disconnect only
  // unsubscribes (does NOT abort upstream), so a page refresh can resume.
  return maybeStreamWithSharedJob(request, response, { allowedOrigins: config.allowedOrigins }, (job) => {
    void runUpstream(job, request, upstreamUrl, apiKey, config.fetchImpl);
  });
}
