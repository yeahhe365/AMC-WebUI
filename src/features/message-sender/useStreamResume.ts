import { type MutableRefObject, useCallback } from 'react';
import type { AppSettings, ChatSettings as IndividualChatSettings } from '@/types';
import { logService } from '@/services/logService';
import { isGeminiProxyRelativePath } from '@/services/api/geminiApiBaseUrl';
import { sendStatelessMessageStreamApi } from '@/services/api/chatApi';
import { createChatHistoryForApi } from '@/utils/chat/builder';
import { buildGenerationConfig } from '@/services/api/generationConfig';
import {
  getGeminiKeyForRequest,
  isServerManagedApiEnabledForProxyRequests,
  SERVER_MANAGED_API_KEY,
} from '@/utils/apiKeySelection';
import { TAB_ID } from '@/stores/tabIdentity';
import {
  isGenerationLeaseHeldByTab,
  releaseGenerationLease,
  startGenerationLeaseHeartbeat,
  stopGenerationLeaseHeartbeat,
  tryAcquireGenerationLease,
} from './generationLease';
import {
  startActiveGenerationJob,
  unregisterActiveGenerationJob,
  hasActiveGenerationJobForSession,
} from './activeGenerationJobs';
import {
  readPendingStreamJob,
  clearPendingStreamJob,
  advancePendingStreamJobSeq,
} from '@/features/stream-jobs/amcStreamJobs';
import type { GetStreamHandlers } from './messageSenderTypes';

interface UseStreamResumeProps {
  appSettings: AppSettings;
  getStreamHandlers: GetStreamHandlers;
  activeJobs: MutableRefObject<Map<string, AbortController>>;
  sessionKeyMapRef: MutableRefObject<Map<string, string>>;
  setSessionLoading: (sessionId: string, isLoading: boolean) => void;
}

interface ResumeTarget {
  sessionId: string;
  generationId: string;
  modelId: string;
  startedAt: number;
  /** Full session settings so the API key can be re-resolved after a refresh. */
  sessionSettings?: IndividualChatSettings;
}

interface StreamResumeApi {
  /** Resume any pending stream job for the active session after a page load. */
  resumePendingStream: (target: ResumeTarget) => Promise<void>;
}
/**
 * After a page refresh, if the api container is still buffering an upstream
 * stream for this session (recorded in localStorage as a "pending stream
 * job"), reattach the same stream handlers and replay the buffered events from
 * the last seq the browser saw. Only engages when routing through the Docker
 * api container (relative /api/gemini); direct or absolute-proxy URLs bypass
 * the journal and resume is a no-op.
 */
export const useStreamResume = ({
  appSettings,
  getStreamHandlers,
  activeJobs,
  sessionKeyMapRef,
  setSessionLoading,
}: UseStreamResumeProps): StreamResumeApi => {
  // Resolve an API key for the resumed stream. After a full page refresh the
  // in-memory `sessionKeyMapRef` is empty, so fall back to server-managed
  // sentinel (Docker proxy holds the key) or BYOK rotation. We deliberately do
  // NOT persist the key map to storage — the codebase masks keys in storage
  // (maskApiKeyForStorage) and exposing a plaintext map would widen the XSS
  // surface; runtime re-resolution suffices.
  const resolveResumeKey = useCallback(
    (sessionId: string, sessionSettings: IndividualChatSettings): string | null => {
      const cachedKey = sessionKeyMapRef.current.get(sessionId);
      if (cachedKey) {
        return cachedKey;
      }

      if (isServerManagedApiEnabledForProxyRequests(appSettings)) {
        return SERVER_MANAGED_API_KEY;
      }

      const keyResult = getGeminiKeyForRequest(appSettings, sessionSettings, { skipIncrement: true });
      return 'error' in keyResult ? null : keyResult.key;
    },
    [appSettings, sessionKeyMapRef],
  );

  const resumePendingStream = useCallback(
    async (target: ResumeTarget) => {
      if (!isGeminiProxyRelativePath(appSettings)) {
        return;
      }

      const pending = readPendingStreamJob(target.sessionId);
      if (!pending || pending.generationId !== target.generationId) {
        return;
      }

      // If THIS tab still holds the generation lease AND has a live in-memory
      // generation job, the original send is still running in this tab
      // (runMessageLifecycle holds the lease for the whole turn). Attaching a
      // second stream handler would deliver every buffered event twice. The
      // in-memory check is what distinguishes that from a page refresh: after a
      // refresh the lease is stale (belongs to the old page, survives in
      // localStorage up to its TTL) but the memory Map is empty, so resume
      // proceeds and reacquires the lease.
      if (
        isGenerationLeaseHeldByTab(target.sessionId) &&
        hasActiveGenerationJobForSession(activeJobs, target.sessionId)
      ) {
        logService.info('Stream resume skipped: generation still in flight in this tab.', {
          sessionId: target.sessionId,
          generationId: pending.generationId,
        });
        return;
      }

      // Multi-tab guard: only the tab that started the job resumes it, so two
      // tabs never attach the same upstream job simultaneously.
      if (pending.tabId !== TAB_ID) {
        logService.info('Stream resume skipped: pending job belongs to another tab.', {
          sessionId: target.sessionId,
        });
        return;
      }

      const sessionSettings = target.sessionSettings ?? ({ modelId: target.modelId } as IndividualChatSettings);

      const key = resolveResumeKey(target.sessionId, sessionSettings);
      if (!key) {
        logService.warn('Stream resume skipped: no API key could be resolved for session.', {
          sessionId: target.sessionId,
        });
        clearPendingStreamJob(target.sessionId);
        return;
      }

      // Re-acquire the per-tab generation lease so other tabs keep seeing the
      // session as "generating elsewhere", then register the resumed job in
      // activeJobs so the stop button can abort it (local + server abort).
      if (!tryAcquireGenerationLease(target.sessionId, target.generationId)) {
        logService.warn('Stream resume skipped: generation lease held by another tab.', {
          sessionId: target.sessionId,
        });
        clearPendingStreamJob(target.sessionId);
        return;
      }

      const controller = new AbortController();
      startGenerationLeaseHeartbeat(target.sessionId, target.generationId);
      startActiveGenerationJob(activeJobs, target.sessionId, target.generationId, controller);
      // Mirror startMessageLifecycle so the UI shows the resumed stream as
      // generating (stop button, favicon, cross-tab SESSION_LOADING sync).
      // finishActiveGenerationJob clears it on completion/error/abort.
      setSessionLoading(target.sessionId, true);

      const generationStartTime = new Date(target.startedAt);
      const handlers = getStreamHandlers(
        target.sessionId,
        target.generationId,
        controller,
        generationStartTime,
        sessionSettings,
        [],
      );

      try {
        await sendStatelessMessageStreamApi(
          key,
          target.modelId,
          await createChatHistoryForApi([], false, target.modelId),
          [],
          await buildGenerationConfig({ settings: sessionSettings, modelId: target.modelId }),
          controller.signal,
          handlers.streamOnPart,
          handlers.onThoughtChunk,
          handlers.streamOnError,
          handlers.streamOnComplete,
          'user',
          undefined,
          {
            jobId: pending.jobId,
            jobSecret: pending.secret,
            // This resume path only runs after a full page load: streamingStore
            // (which held the streamed prefix) is gone and the DB message
            // content is still the empty string written at stream start (parts
            // only persist on complete). localStorage's lastSeq describes how
            // far the PREVIOUS page instance consumed — resuming from it would
            // skip the prefix this page never received, truncating the message
            // to just the tail. Replay from 0 instead; the server replays every
            // buffered chunk (seq > cursor). onSeq's own guard
            // (advancePendingStreamJobSeq: seq <= existing.lastSeq) prevents the
            // cursor from moving backwards.
            lastSeq: 0,
            onSeq: (seq) => advancePendingStreamJobSeq(target.sessionId, seq),
          },
        );
        logService.info('Stream resume completed.', { sessionId: target.sessionId });
        // The job is fully replayed and persisted by streamOnComplete — drop the
        // pending record so a later refresh cannot attach the same completed job
        // again (it would only be caught by the 10-minute TTL or the
        // loadingMessage.isLoading check otherwise).
        clearPendingStreamJob(target.sessionId);
      } catch (error) {
        logService.error('Stream resume failed.', error);
        clearPendingStreamJob(target.sessionId);
      } finally {
        stopGenerationLeaseHeartbeat(target.sessionId);
        releaseGenerationLease(target.sessionId, target.generationId);
        unregisterActiveGenerationJob(activeJobs, target.generationId);
        // A setup failure before the stream starts (createChatHistoryForApi /
        // buildGenerationConfig throwing) never reaches streamOnError, which is
        // what normally clears the loading flag. Clear it unconditionally: in
        // the happy path streamOnComplete already did, so this is a no-op.
        setSessionLoading(target.sessionId, false);
      }
    },
    [appSettings, getStreamHandlers, activeJobs, resolveResumeKey, setSessionLoading],
  );

  return { resumePendingStream };
};
