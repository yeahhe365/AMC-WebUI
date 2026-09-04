import type { SavedChatSession } from '@/types';
import type { SyncMessage } from '@/types/sync';
import { logService } from '@/services/logService';
import { mergePersistedSessionMessages } from './sessionPersistence';

interface PersistSessionChangesOptions {
  modifiedSessions: SavedChatSession[];
  deletedSessionIds: string[];
  activeSessionId: string | null;
  sessionPersistVersions: Map<string, number>;
  getSession: (sessionId: string) => Promise<SavedChatSession | null | undefined>;
  saveSession: (session: SavedChatSession) => Promise<void>;
  deleteSession: (sessionId: string) => Promise<void>;
  broadcastSyncMessage: (message: SyncMessage) => void;
}

export async function persistSessionChanges({
  modifiedSessions,
  deletedSessionIds,
  activeSessionId,
  sessionPersistVersions,
  getSession,
  saveSession,
  deleteSession,
  broadcastSyncMessage,
}: PersistSessionChangesOptions) {
  if (modifiedSessions.length === 0 && deletedSessionIds.length === 0) {
    return;
  }

  const persistVersions = new Map<string, number>();
  modifiedSessions.forEach((session) => {
    const nextVersion = (sessionPersistVersions.get(session.id) ?? 0) + 1;
    sessionPersistVersions.set(session.id, nextVersion);
    persistVersions.set(session.id, nextVersion);
  });

  const sessionsToPersist = await Promise.all(
    modifiedSessions.map(async (session) => {
      const version = persistVersions.get(session.id);
      if (version !== undefined && sessionPersistVersions.get(session.id) !== version) {
        return null;
      }

      if (session.id === activeSessionId || session.messages.length > 0) {
        return session;
      }

      // The in-memory messages of an inactive session are stripped to [], so
      // saving it is only safe once the persisted record has been re-merged. If
      // the lookup fails or the session vanished from the DB, skip the save:
      // persisting an empty shell would trip the file-record GC in saveSession
      // and permanently delete every attachment blob of that session.
      let persistedSession: SavedChatSession | null | undefined;
      try {
        persistedSession = await getSession(session.id);
      } catch (error) {
        logService.warn('Skipping session persist: persisted record could not be read.', {
          sessionId: session.id,
          error,
        });
        return null;
      }
      if (!persistedSession) {
        logService.warn('Skipping session persist: session has no persisted record to merge with.', {
          sessionId: session.id,
        });
        return null;
      }
      if (version !== undefined && sessionPersistVersions.get(session.id) !== version) {
        return null;
      }
      return mergePersistedSessionMessages(session, persistedSession);
    }),
  );

  const persistedSessionIds = new Set<string>();
  await Promise.all([
    ...sessionsToPersist.map(async (session) => {
      if (!session) return;

      const version = persistVersions.get(session.id);
      if (version !== undefined && sessionPersistVersions.get(session.id) !== version) {
        return;
      }

      await saveSession(session);

      if (version !== undefined && sessionPersistVersions.get(session.id) === version) {
        persistedSessionIds.add(session.id);
      }
    }),
    ...deletedSessionIds.map((id) => deleteSession(id)),
  ]);

  if (
    deletedSessionIds.length === 0 &&
    modifiedSessions.length === 1 &&
    persistedSessionIds.has(modifiedSessions[0].id)
  ) {
    broadcastSyncMessage({ type: 'SESSION_CONTENT_UPDATED', sessionId: modifiedSessions[0].id });
  } else {
    broadcastSyncMessage({ type: 'SESSIONS_UPDATED' });
  }
}
