import { useEffect, useRef, useState } from 'react';
import type { SupportedLanguage } from '@/i18n/languageRegistry';
import { type AppSettings, type SavedChatSession } from '@/types';
import { dbService } from '@/services/db/dbService';
import { logService } from '@/services/logService';
import { useChatStore } from '@/stores/chatStore';
import { autoTitleSession, isSessionAutoTitleEligible } from '@/features/auto-titling/autoTitleSession';

interface AutoTitleBackfillProps {
  appSettings: AppSettings;
  language: SupportedLanguage;
}

export const useAutoTitleBackfill = ({ appSettings, language }: AutoTitleBackfillProps) => {
  const checkedMarkersRef = useRef<Map<string, string>>(new Map());
  const isProcessingRef = useRef(false);
  const rerunRequestedRef = useRef(false);
  const [rerunToken, setRerunToken] = useState(0);

  const savedSessions = useChatStore((state) => state.savedSessions);
  const activeSessionId = useChatStore((state) => state.activeSessionId);
  const loadingSessionIds = useChatStore((state) => state.loadingSessionIds);
  const generatingTitleSessionIds = useChatStore((state) => state.generatingTitleSessionIds);

  useEffect(() => {
    if (!appSettings.isAutoTitleEnabled) {
      return;
    }
    if (isProcessingRef.current) {
      // A state change arrived mid-batch: record one re-run request so the
      // freshly-titled session is picked up once the current batch finishes.
      rerunRequestedRef.current = true;
      return;
    }

    const candidates = savedSessions.filter((session) => {
      if (session.id === activeSessionId) return false; // active chat handled by useAutoTitling
      // Memory pre-filter: sessions whose title is protected never qualify, so
      // skip the expensive DB read (getSession hydrates files) for them.
      if (session.titleSource === 'manual' || session.titleSource === 'auto') return false;
      if (loadingSessionIds.has(session.id)) return false;
      if (generatingTitleSessionIds.has(session.id)) return false;
      return checkedMarkersRef.current.get(session.id) !== `${session.title}|${session.timestamp}`;
    });

    if (candidates.length === 0) {
      return;
    }

    isProcessingRef.current = true;
    let cancelled = false;

    // Titles are independent per session, so a small concurrency pool batches
    // the per-session DB read + API call instead of running them strictly
    // serially. Kept low (2) so a burst of backfill requests does not hammer
    // the model API or the IndexedDB write lock all at once.
    const BACKFILL_CONCURRENCY = 2;

    const processCandidate = async (candidate: SavedChatSession) => {
      if (cancelled) return;

      checkedMarkersRef.current.set(candidate.id, `${candidate.title}|${candidate.timestamp}`);

      let fullSession;
      try {
        fullSession = await dbService.getSession(candidate.id);
      } catch (error) {
        logService.warn('Auto title backfill failed to load session.', { sessionId: candidate.id, error });
        return;
      }

      if (cancelled) return;
      if (!fullSession || !isSessionAutoTitleEligible(fullSession)) {
        return;
      }

      useChatStore.getState().setGeneratingTitleSessionIds((prev) => new Set(prev).add(candidate.id));
      try {
        await autoTitleSession({
          session: fullSession,
          appSettings,
          language,
          updateAndPersistSessions: useChatStore.getState().updateAndPersistSessions,
        });
      } catch (error) {
        logService.warn('Auto title backfill failed for session.', { sessionId: candidate.id, error });
      } finally {
        useChatStore.getState().setGeneratingTitleSessionIds((prev) => {
          const next = new Set(prev);
          next.delete(candidate.id);
          return next;
        });
      }
    };

    const processCandidates = async () => {
      try {
        // Small pool: launch up to BACKFILL_CONCURRENCY candidate processors at
        // once, each pulling the next candidate as it finishes.
        let nextIndex = 0;
        const workers = Array.from({ length: Math.min(BACKFILL_CONCURRENCY, candidates.length) }, async () => {
          while (!cancelled) {
            const index = nextIndex;
            nextIndex += 1;
            if (index >= candidates.length) {
              return;
            }
            await processCandidate(candidates[index]);
          }
        });
        await Promise.all(workers);
      } finally {
        isProcessingRef.current = false;

        // Another state change queued while this batch ran (e.g. a tab broadcast
        // a freshly-titled session). Re-run to pick it up rather than dropping it.
        if (rerunRequestedRef.current) {
          rerunRequestedRef.current = false;
          setRerunToken((token) => token + 1);
        }
      }
    };

    void processCandidates();

    return () => {
      cancelled = true;
    };
  }, [activeSessionId, appSettings, generatingTitleSessionIds, language, loadingSessionIds, rerunToken, savedSessions]);
};
