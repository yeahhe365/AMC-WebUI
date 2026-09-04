import type { PersistedSessionFileRecord, SavedChatSession } from '@/types';
import {
  attachPersistedSessionFiles,
  extractPersistedSessionFileRecords,
  stripSessionFilePayloads,
} from '@/utils/chat/session';
import { FILES_STORE, SESSIONS_STORE } from './dbSchema';
import { getAll, getDb, getItem, transactionToPromise, withWriteLock } from './indexedDbAccess';

const getSessionFileRecords = async (sessionId: string): Promise<PersistedSessionFileRecord[]> => {
  const db = await getDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(FILES_STORE, 'readonly');
    const index = tx.objectStore(FILES_STORE).index('sessionId');
    const request = index.getAll(sessionId);
    request.onsuccess = () => resolve((request.result as PersistedSessionFileRecord[]) || []);
    request.onerror = () => reject(request.error);
  });
};

export const saveSession = async (session: SavedChatSession): Promise<void> => {
  return withWriteLock(async () => {
    const db = await getDb();
    const tx = db.transaction([SESSIONS_STORE, FILES_STORE], 'readwrite');
    const sessionStore = tx.objectStore(SESSIONS_STORE);
    const fileStore = tx.objectStore(FILES_STORE);
    const fileIndex = fileStore.index('sessionId');

    const sanitizedSession = stripSessionFilePayloads(session);
    const fileRecords = extractPersistedSessionFileRecords(session);
    const nextFileIds = new Set(fileRecords.map((record) => record.id));

    sessionStore.put(sanitizedSession);
    fileRecords.forEach((record) => fileStore.put(record));

    const cleanupRequest = fileIndex.openCursor(IDBKeyRange.only(session.id));
    cleanupRequest.onsuccess = () => {
      const cursor = cleanupRequest.result;
      if (!cursor) {
        return;
      }

      if (!nextFileIds.has(cursor.primaryKey as string)) {
        fileStore.delete(cursor.primaryKey);
      }
      cursor.continue();
    };
    cleanupRequest.onerror = () => {
      tx.abort();
    };

    return transactionToPromise(tx);
  });
};

export const setAllSessions = async (sessions: SavedChatSession[]): Promise<void> => {
  return withWriteLock(async () => {
    const db = await getDb();
    const tx = db.transaction([SESSIONS_STORE, FILES_STORE], 'readwrite');
    const sessionStore = tx.objectStore(SESSIONS_STORE);
    const fileStore = tx.objectStore(FILES_STORE);

    sessionStore.clear();
    fileStore.clear();

    sessions.forEach((session) => {
      sessionStore.put(stripSessionFilePayloads(session));
      extractPersistedSessionFileRecords(session).forEach((record) => fileStore.put(record));
    });

    return transactionToPromise(tx);
  });
};

export const deleteSession = async (id: string): Promise<void> => {
  return withWriteLock(async () => {
    const db = await getDb();
    const tx = db.transaction([SESSIONS_STORE, FILES_STORE], 'readwrite');
    const sessionStore = tx.objectStore(SESSIONS_STORE);
    const fileStore = tx.objectStore(FILES_STORE);
    const fileIndex = fileStore.index('sessionId');

    sessionStore.delete(id);

    const cleanupRequest = fileIndex.openCursor(IDBKeyRange.only(id));
    cleanupRequest.onsuccess = () => {
      const cursor = cleanupRequest.result;
      if (!cursor) {
        return;
      }

      fileStore.delete(cursor.primaryKey);
      cursor.continue();
    };
    cleanupRequest.onerror = () => {
      tx.abort();
    };

    return transactionToPromise(tx);
  });
};

export const getSession = async (id: string): Promise<SavedChatSession | undefined> => {
  const session = await getItem<SavedChatSession>(SESSIONS_STORE, id);
  if (!session) {
    return session;
  }

  const persistedRecords = await getSessionFileRecords(id);
  const inlineRecords = extractPersistedSessionFileRecords(session);
  const combinedRecords = new Map<string, PersistedSessionFileRecord>();

  persistedRecords.forEach((record) => combinedRecords.set(record.id, record));
  inlineRecords.forEach((record) => combinedRecords.set(record.id, record));

  const hydratedSession = attachPersistedSessionFiles(stripSessionFilePayloads(session), combinedRecords);

  if (inlineRecords.length > 0) {
    await saveSession(hydratedSession);
  }

  return hydratedSession;
};

/**
 * Lightweight session read for code that only needs the session record (title,
 * titleSource, settings, message *text*) and not the attached file blobs.
 *
 * Unlike getSession this does NOT query FILES_STORE and does NOT hydrate file
 * data onto the messages, so it stays fast even for sessions with many or large
 * attachments. It also skips the inline-file migration write that getSession
 * performs, so the returned session may still carry legacy inline file payloads
 * — callers must not persist it back wholesale.
 */
export const getSessionMetadataOnly = async (id: string): Promise<SavedChatSession | undefined> =>
  getItem<SavedChatSession>(SESSIONS_STORE, id);

export const getAllSessions = async (): Promise<SavedChatSession[]> => {
  const sessions = await getAll<SavedChatSession>(SESSIONS_STORE);
  const hydratedSessions = await Promise.all(sessions.map((session) => getSession(session.id)));
  return hydratedSessions.filter((session): session is SavedChatSession => !!session);
};

export const getAllSessionMetadata = async (): Promise<SavedChatSession[]> => {
  const db = await getDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(SESSIONS_STORE, 'readonly');
    const store = tx.objectStore(SESSIONS_STORE);
    const request = store.openCursor();
    const results: SavedChatSession[] = [];

    request.onsuccess = (event) => {
      const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result;
      if (cursor) {
        results.push({ ...cursor.value, messages: [] });
        cursor.continue();
      } else {
        resolve(results);
      }
    };
    request.onerror = () => reject(request.error);
  });
};

export const searchSessions = async (query: string): Promise<string[]> => {
  const db = await getDb();
  const lowerQuery = query.toLowerCase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(SESSIONS_STORE, 'readonly');
    const store = tx.objectStore(SESSIONS_STORE);
    const request = store.openCursor();
    const results: string[] = [];

    request.onsuccess = (event) => {
      const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result;
      if (!cursor) {
        resolve(results);
        return;
      }

      const session = cursor.value as SavedChatSession;
      const titleMatch = session.title?.toLowerCase().includes(lowerQuery);
      let contentMatch = false;

      if (!titleMatch && session.messages) {
        for (const message of session.messages) {
          if (
            message.content?.toLowerCase().includes(lowerQuery) ||
            message.thoughts?.toLowerCase().includes(lowerQuery)
          ) {
            contentMatch = true;
            break;
          }
        }
      }

      if (titleMatch || contentMatch) {
        results.push(session.id);
      }
      cursor.continue();
    };
    request.onerror = () => reject(request.error);
  });
};
