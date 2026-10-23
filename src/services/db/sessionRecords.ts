import type { PersistedSessionFileRecord, SavedChatSession } from '@/types';
import {
  attachPersistedSessionFiles,
  extractPersistedSessionFileRecords,
  stripSessionFilePayloads,
} from '@/utils/chat/session';
import { EMBEDDINGS_STORE, FILES_STORE, KEY_VALUE_STORE, SESSIONS_STORE, SESSION_METADATA_STORE } from './dbSchema';
import { getAll, getDb, getItem, transactionToPromise, withWriteLock } from './indexedDbAccess';
import { getDraftFilesKey } from './draftFileRecords';
import { mapMessageFiles } from '@/utils/chat/messageVariants';
import { releaseManagedObjectUrlsByOwner } from '@/services/objectUrlManager';

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
    const hasEmbeddings = db.objectStoreNames.contains(EMBEDDINGS_STORE);
    const hasMetadata = db.objectStoreNames.contains(SESSION_METADATA_STORE);
    const storeNames = [
      SESSIONS_STORE,
      FILES_STORE,
      ...(hasMetadata ? [SESSION_METADATA_STORE] : []),
      ...(hasEmbeddings ? [EMBEDDINGS_STORE] : []),
    ];
    const tx = db.transaction(storeNames, 'readwrite');
    const sessionStore = tx.objectStore(SESSIONS_STORE);
    const metaStore = hasMetadata ? tx.objectStore(SESSION_METADATA_STORE) : null;
    const fileStore = tx.objectStore(FILES_STORE);
    const fileIndex = fileStore.index('sessionId');
    const embeddingsStore = hasEmbeddings ? tx.objectStore(EMBEDDINGS_STORE) : null;

    const sanitizedSession = stripSessionFilePayloads(session);
    const fileRecords = extractPersistedSessionFileRecords(session);
    const nextFileIds = new Set(fileRecords.map((record) => record.id));

    sessionStore.put(sanitizedSession);
    if (metaStore) {
      metaStore.put({ ...sanitizedSession, messages: [] });
    }
    fileRecords.forEach((record) => fileStore.put(record));

    const cleanupRequest = fileIndex.openCursor(IDBKeyRange.only(session.id));
    cleanupRequest.onsuccess = () => {
      const cursor = cleanupRequest.result;
      if (!cursor) {
        return;
      }

      if (!nextFileIds.has(cursor.primaryKey as string)) {
        fileStore.delete(cursor.primaryKey);
        embeddingsStore?.delete(cursor.primaryKey);
      }
      cursor.continue();
    };
    cleanupRequest.onerror = () => {
      tx.abort();
    };

    return transactionToPromise(tx);
  });
};

export const saveManySessionMetadata = async (sessions: SavedChatSession[]): Promise<void> => {
  if (sessions.length === 0) return;
  return withWriteLock(async () => {
    const db = await getDb();
    const hasMetadata = db.objectStoreNames.contains(SESSION_METADATA_STORE);
    const storeNames = [SESSIONS_STORE, ...(hasMetadata ? [SESSION_METADATA_STORE] : [])];
    const tx = db.transaction(storeNames, 'readwrite');
    const sessionStore = tx.objectStore(SESSIONS_STORE);
    const metaStore = hasMetadata ? tx.objectStore(SESSION_METADATA_STORE) : null;

    await Promise.all(
      sessions.map(
        (session) =>
          new Promise<void>((resolve, reject) => {
            if (metaStore) {
              metaStore.put({ ...session, messages: [] });
            }

            const getReq = sessionStore.get(session.id);
            getReq.onsuccess = () => {
              const existing = getReq.result as SavedChatSession | undefined;
              if (existing) {
                sessionStore.put({
                  ...existing,
                  ...session,
                  settings: { ...existing.settings, ...session.settings },
                  messages: existing.messages,
                });
              } else {
                sessionStore.put({ ...session, messages: [] });
              }
              resolve();
            };
            getReq.onerror = () => reject(getReq.error);
          }),
      ),
    );

    return transactionToPromise(tx);
  });
};

export const saveSessionMetadata = async (session: SavedChatSession): Promise<void> => {
  return saveManySessionMetadata([session]);
};

export const setAllSessions = async (sessions: SavedChatSession[]): Promise<void> => {
  return withWriteLock(async () => {
    const db = await getDb();
    const hasEmbeddings = db.objectStoreNames.contains(EMBEDDINGS_STORE);
    const hasMetadata = db.objectStoreNames.contains(SESSION_METADATA_STORE);
    const storeNames = [
      SESSIONS_STORE,
      FILES_STORE,
      ...(hasMetadata ? [SESSION_METADATA_STORE] : []),
      ...(hasEmbeddings ? [EMBEDDINGS_STORE] : []),
    ];
    const tx = db.transaction(storeNames, 'readwrite');
    const sessionStore = tx.objectStore(SESSIONS_STORE);
    const metaStore = hasMetadata ? tx.objectStore(SESSION_METADATA_STORE) : null;
    const fileStore = tx.objectStore(FILES_STORE);
    const embeddingsStore = hasEmbeddings ? tx.objectStore(EMBEDDINGS_STORE) : null;

    sessionStore.clear();
    metaStore?.clear();
    fileStore.clear();

    const retainedSessionIds = new Set<string>(sessions.map((session) => session.id));
    const retainedFileIds = new Set<string>();

    sessions.forEach((session) => {
      const sanitized = stripSessionFilePayloads(session);
      sessionStore.put(sanitized);
      metaStore?.put({ ...sanitized, messages: [] });
      extractPersistedSessionFileRecords(session).forEach((record) => {
        retainedFileIds.add(record.id);
        fileStore.put(record);
      });
    });

    if (embeddingsStore) {
      const cursorRequest = embeddingsStore.openCursor();
      cursorRequest.onsuccess = () => {
        const cursor = cursorRequest.result;
        if (!cursor) return;
        const item = cursor.value as { id?: string; sessionId?: string };
        if (item?.sessionId && !retainedSessionIds.has(item.sessionId)) {
          cursor.delete();
        } else if (item?.id && item?.sessionId && !retainedFileIds.has(item.id)) {
          cursor.delete();
        }
        cursor.continue();
      };
      cursorRequest.onerror = () => {
        tx.abort();
      };
    }

    return transactionToPromise(tx);
  });
};

export const deleteSession = async (id: string): Promise<void> => {
  return withWriteLock(async () => {
    releaseManagedObjectUrlsByOwner(`draft:${id}`);
    releaseManagedObjectUrlsByOwner(`session:${id}`);
    const db = await getDb();
    const hasEmbeddings = db.objectStoreNames.contains(EMBEDDINGS_STORE);
    const hasMetadata = db.objectStoreNames.contains(SESSION_METADATA_STORE);
    const storeNames = [
      SESSIONS_STORE,
      FILES_STORE,
      KEY_VALUE_STORE,
      ...(hasMetadata ? [SESSION_METADATA_STORE] : []),
      ...(hasEmbeddings ? [EMBEDDINGS_STORE] : []),
    ];
    const tx = db.transaction(storeNames, 'readwrite');
    const sessionStore = tx.objectStore(SESSIONS_STORE);
    const metaStore = hasMetadata ? tx.objectStore(SESSION_METADATA_STORE) : null;
    const fileStore = tx.objectStore(FILES_STORE);
    const kvStore = tx.objectStore(KEY_VALUE_STORE);
    const fileIndex = fileStore.index('sessionId');
    const embeddingsStore = hasEmbeddings ? tx.objectStore(EMBEDDINGS_STORE) : null;

    sessionStore.delete(id);
    metaStore?.delete(id);
    kvStore.delete(getDraftFilesKey(id));

    const cleanupRequest = fileIndex.openCursor(IDBKeyRange.only(id));
    cleanupRequest.onsuccess = () => {
      const cursor = cleanupRequest.result;
      if (!cursor) {
        return;
      }

      fileStore.delete(cursor.primaryKey);
      embeddingsStore?.delete(cursor.primaryKey);
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

const readMetadataFromStore = async (db: IDBDatabase, storeName: string): Promise<SavedChatSession[]> => {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const store = tx.objectStore(storeName);
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

export const getAllSessionMetadata = async (): Promise<SavedChatSession[]> => {
  const db = await getDb();
  if (!db.objectStoreNames.contains(SESSION_METADATA_STORE)) {
    return readMetadataFromStore(db, SESSIONS_STORE);
  }

  const metadata = await readMetadataFromStore(db, SESSION_METADATA_STORE);
  if (metadata.length === 0) {
    const sessions = await readMetadataFromStore(db, SESSIONS_STORE);
    if (sessions.length > 0) {
      void (async () => {
        try {
          const freshDb = await getDb();
          if (!freshDb.objectStoreNames.contains(SESSION_METADATA_STORE)) return;
          const tx = freshDb.transaction(SESSION_METADATA_STORE, 'readwrite');
          const metaStore = tx.objectStore(SESSION_METADATA_STORE);
          sessions.forEach((s) => metaStore.put({ ...s, messages: [] }));
        } catch {
          // ignore background backfill failure
        }
      })();
      return sessions;
    }
  }
  return metadata;
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

export const deleteFilesFromSessions = async (fileIds: string[]): Promise<void> => {
  if (!fileIds || fileIds.length === 0) {
    return;
  }
  const targetIds = new Set(fileIds);

  return withWriteLock(async () => {
    const db = await getDb();
    const hasEmbeddings = db.objectStoreNames?.contains(EMBEDDINGS_STORE);
    const storeNames = hasEmbeddings ? [SESSIONS_STORE, FILES_STORE, EMBEDDINGS_STORE] : [SESSIONS_STORE, FILES_STORE];
    const tx = db.transaction(storeNames, 'readwrite');
    const sessionStore = tx.objectStore(SESSIONS_STORE);
    const fileStore = tx.objectStore(FILES_STORE);
    const embeddingsStore = hasEmbeddings ? tx.objectStore(EMBEDDINGS_STORE) : null;

    const request = sessionStore.openCursor();
    await new Promise<void>((resolve, reject) => {
      request.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result;
        if (!cursor) {
          resolve();
          return;
        }

        const session = cursor.value as SavedChatSession;
        if (session.messages && session.messages.length > 0) {
          let sessionChanged = false;
          const updatedMessages = session.messages.map((message) => {
            const updated = mapMessageFiles(message, (files) => {
              const remaining = files.filter((file) => !targetIds.has(file.id));
              return remaining.length === files.length ? files : remaining.length > 0 ? remaining : undefined;
            });
            if (updated !== message) sessionChanged = true;
            return updated;
          });

          if (sessionChanged) {
            cursor.update({
              ...session,
              messages: updatedMessages,
            });
          }
        }
        cursor.continue();
      };
      request.onerror = () => reject(request.error);
    });

    for (const id of fileIds) {
      fileStore.delete(id);
      embeddingsStore?.delete(id);
    }

    return transactionToPromise(tx);
  });
};
