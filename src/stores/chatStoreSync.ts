import type { MutableRefObject } from 'react';
import type { SavedChatSession } from '@/types';
import type { SyncMessage } from '@/types/sync';
import { logService } from '@/services/logService';
import { dbService } from '@/services/db/dbService';
import { rehydrateSessionFiles } from '@/utils/chat/session';
import { abortActiveGenerationJobsForSession } from '@/features/message-sender/activeGenerationJobs';
import { GENERATION_LEASE_TTL_MS, readGenerationLease } from '@/features/message-sender/generationLease';
import { TAB_ID } from './tabIdentity';
import { getChatSyncChannel } from './chatSyncChannel';
import type { UpdaterOrValue } from './stateUpdaters';

/** How often to sweep remote loading flags that lost their lease. */
const SESSION_LOADING_STALE_CHECK_MS = 30_000;

interface ChatSyncStore {
  getState: () => {
    activeSessionId: string | null;
    refreshSessions: () => Promise<void>;
    refreshGroups: () => Promise<void>;
    setActiveMessages: (messages: SavedChatSession['messages']) => void;
    setSavedSessions: (updater: UpdaterOrValue<SavedChatSession[]>) => void;
    setLoadingSessionIds: (updater: UpdaterOrValue<Set<string>>) => void;
    setCompletedSessions: (updater: UpdaterOrValue<Record<string, 'success' | 'error'>>) => void;
  };
}

interface ChatStoreSyncDependencies {
  store: ChatSyncStore;
  localLoadingSessionIds: Set<string>;
  activeJobs?: MutableRefObject<Map<string, AbortController>>;
  getChannel?: () => BroadcastChannel;
  getSession?: (sessionId: string) => Promise<SavedChatSession | null | undefined>;
  rehydrateSession?: (session: SavedChatSession) => SavedChatSession;
  logger?: Pick<typeof logService, 'info' | 'warn'>;
  documentRef?: Document;
  now?: () => number;
  setIntervalFn?: typeof setInterval;
  clearIntervalFn?: typeof clearInterval;
}

export function setupChatStoreSync({
  store,
  localLoadingSessionIds,
  activeJobs,
  getChannel = getChatSyncChannel,
  getSession = dbService.getSession.bind(dbService),
  rehydrateSession = rehydrateSessionFiles,
  logger = logService,
  documentRef,
  now = Date.now,
  setIntervalFn = setInterval,
  clearIntervalFn = clearInterval,
}: ChatStoreSyncDependencies) {
  const resolvedDocument = documentRef ?? (typeof document !== 'undefined' ? document : undefined);

  if (typeof BroadcastChannel === 'undefined' || !resolvedDocument) {
    return () => {};
  }

  let isDirty = false;
  const channel = getChannel();

  const clearStaleRemoteLoading = () => {
    store.getState().setLoadingSessionIds((previous) => {
      let changed = false;
      const next = new Set(previous);

      for (const sessionId of previous) {
        if (localLoadingSessionIds.has(sessionId)) {
          continue;
        }

        const lease = readGenerationLease(sessionId);
        const leaseFresh = Boolean(lease && now() - lease.ts < GENERATION_LEASE_TTL_MS);
        if (!leaseFresh) {
          next.delete(sessionId);
          changed = true;
          logger.info?.(`[Sync] Cleared stale remote loading for session ${sessionId}`);
        }
      }

      return changed ? next : previous;
    });
  };

  const staleCheckTimer =
    typeof setIntervalFn === 'function' ? setIntervalFn(clearStaleRemoteLoading, SESSION_LOADING_STALE_CHECK_MS) : null;

  const handleMessage = (event: MessageEvent<SyncMessage>) => {
    const syncMessage = event.data;

    switch (syncMessage.type) {
      case 'SETTINGS_UPDATED':
      case 'SESSIONS_UPDATED':
        if (resolvedDocument.hidden) {
          isDirty = true;
        } else {
          store.getState().refreshSessions();
        }
        break;
      case 'GROUPS_UPDATED':
        if (resolvedDocument.hidden) {
          isDirty = true;
        } else {
          store.getState().refreshGroups();
        }
        break;
      case 'SESSION_CONTENT_UPDATED': {
        if (localLoadingSessionIds.has(syncMessage.sessionId)) return;
        if (resolvedDocument.hidden) {
          isDirty = true;
          return;
        }

        const { activeSessionId } = store.getState();
        if (syncMessage.sessionId === activeSessionId) {
          getSession(syncMessage.sessionId)
            .then((session) => {
              if (session) {
                const rehydrated = rehydrateSession(session);
                store.getState().setActiveMessages(rehydrated.messages);
                store
                  .getState()
                  .setSavedSessions((previousSessions) =>
                    previousSessions.map((savedSession) =>
                      savedSession.id === syncMessage.sessionId ? { ...rehydrated, messages: [] } : savedSession,
                    ),
                  );
              }
            })
            .catch((error) => {
              logService.error('[Sync] Failed to reload session', { error });
            });
        } else {
          store.getState().refreshSessions();
        }
        break;
      }
      case 'SESSION_LOADING': {
        if (syncMessage.originId === TAB_ID) {
          break;
        }

        // 本 tab 持有该会话有效租约时，远端 false 不得覆盖本地 loading。
        // 持有方完成时租约已先释放，不受影响；崩溃残留由 clearStaleRemoteLoading（30s 间隔）兜底。
        const ownLease = readGenerationLease(syncMessage.sessionId);
        const ownsFreshLease = Boolean(
          ownLease && ownLease.tabId === TAB_ID && now() - ownLease.ts < GENERATION_LEASE_TTL_MS,
        );

        store.getState().setLoadingSessionIds((previousLoadingSessionIds) => {
          const nextLoadingSessionIds = new Set(previousLoadingSessionIds);
          if (syncMessage.isLoading) nextLoadingSessionIds.add(syncMessage.sessionId);
          else if (!ownsFreshLease) nextLoadingSessionIds.delete(syncMessage.sessionId);
          return nextLoadingSessionIds;
        });
        break;
      }
      case 'ABORT_GENERATION': {
        if (syncMessage.originId === TAB_ID) {
          break;
        }
        if (!activeJobs) {
          break;
        }
        const aborted = abortActiveGenerationJobsForSession(activeJobs, syncMessage.sessionId);
        if (aborted > 0) {
          logger.info?.(
            `[Sync] Aborted ${aborted} local generation job(s) for session ${syncMessage.sessionId} (remote request)`,
          );
        }
        break;
      }
      // 完成标记:只直接改本地 state,绝不调用 markSessionCompleted /
      // markSessionViewed(那会再次广播,形成广播循环)。
      case 'SESSION_COMPLETED': {
        const { activeSessionId, setCompletedSessions } = store.getState();
        if (syncMessage.sessionId === activeSessionId) {
          break; // 本标签页正在观看该会话,不显示。
        }
        setCompletedSessions((previous) => ({
          ...previous,
          [syncMessage.sessionId]: syncMessage.outcome,
        }));
        break;
      }
      case 'SESSION_VIEWED': {
        store.getState().setCompletedSessions((previous) => {
          if (!(syncMessage.sessionId in previous)) {
            return previous;
          }
          const next = { ...previous };
          delete next[syncMessage.sessionId];
          return next;
        });
        break;
      }
    }
  };

  const handleVisibilityChange = () => {
    if (resolvedDocument.visibilityState === 'visible' && isDirty) {
      logger.info('[Sync] Tab visible, syncing pending updates from DB.');
      store.getState().refreshSessions();
      store.getState().refreshGroups();
      isDirty = false;
    }
    if (resolvedDocument.visibilityState === 'visible') {
      clearStaleRemoteLoading();
    }
  };

  channel.addEventListener('message', handleMessage);
  resolvedDocument.addEventListener('visibilitychange', handleVisibilityChange);

  return () => {
    channel.removeEventListener('message', handleMessage);
    resolvedDocument.removeEventListener('visibilitychange', handleVisibilityChange);
    if (staleCheckTimer !== null) {
      clearIntervalFn(staleCheckTimer);
    }
  };
}
