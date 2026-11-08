import type { LibraryItem, PersistedSessionFileRecord } from '@/types';
import { releaseManagedObjectUrlsByOwner } from '@/services/objectUrlManager';
import { EMBEDDINGS_STORE, FILES_STORE, KEY_VALUE_STORE, SESSION_METADATA_STORE, SESSIONS_STORE } from './dbSchema';
import { getDb, transactionToPromise, withWriteLock } from './indexedDbAccess';

const STANDALONE_LIBRARY_STORAGE_KEY = 'amc_library_standalone_files_v1';

export interface OrphanCleanupResult {
  deletedFileCount: number;
  freedBytes: number;
}

/**
 * Sweeps through FILES_STORE and purges orphaned file blobs:
 * - Files referencing a deleted sessionId (sessionId not in sessions / session_metadata).
 * - Files with undefined / null sessionId that are not registered in the standalone library.
 * Also removes corresponding multimodal embeddings and releases object URLs.
 */
export const cleanupOrphanFiles = async (): Promise<OrphanCleanupResult> => {
  return withWriteLock(async () => {
    const db = await getDb();
    const hasEmbeddings = db.objectStoreNames.contains(EMBEDDINGS_STORE);
    const hasMetadata = db.objectStoreNames.contains(SESSION_METADATA_STORE);
    const hasKeyValue = db.objectStoreNames.contains(KEY_VALUE_STORE);
    // 权威表是 SESSIONS_STORE，session_metadata 只是 v7 的轻量镜像，两者可能漂移
    // （旧标签页以无版本号方式打开 v7 库时只写 sessions）。只用镜像判断"会话还存不存在"
    // 会在镜像缺一条时把该会话的**全部**附件与向量一起删掉，而且同一事务提交、不可恢复。
    // 因此这里取两张表的并集：只要任一表里还有这个会话，就认为它活着。
    const sessionStoreNames = hasMetadata ? [SESSIONS_STORE, SESSION_METADATA_STORE] : [SESSIONS_STORE];

    const storeNames = [
      FILES_STORE,
      ...sessionStoreNames,
      ...(hasKeyValue ? [KEY_VALUE_STORE] : []),
      ...(hasEmbeddings ? [EMBEDDINGS_STORE] : []),
    ];

    const tx = db.transaction(storeNames, 'readwrite');
    const fileStore = tx.objectStore(FILES_STORE);
    const kvStore = hasKeyValue ? tx.objectStore(KEY_VALUE_STORE) : null;
    const embeddingsStore = hasEmbeddings ? tx.objectStore(EMBEDDINGS_STORE) : null;

    // 1. Gather all active session IDs (union of the authoritative store and the mirror)
    const validSessionIds = new Set<string>();
    for (const storeName of sessionStoreNames) {
      const sessionStore = tx.objectStore(storeName);
      await new Promise<void>((resolve, reject) => {
        const req = sessionStore.openCursor();
        req.onsuccess = (event) => {
          const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result;
          if (cursor) {
            const val = cursor.value;
            if (val && typeof val.id === 'string') {
              validSessionIds.add(val.id);
            }
            cursor.continue();
          } else {
            resolve();
          }
        };
        req.onerror = () => reject(req.error);
      });
    }

    // 2. Gather standalone library file IDs from KEY_VALUE_STORE if present
    const validLibraryFileIds = new Set<string>();
    if (kvStore) {
      await new Promise<void>((resolve, reject) => {
        const req = kvStore.get(STANDALONE_LIBRARY_STORAGE_KEY);
        req.onsuccess = () => {
          const items = req.result as LibraryItem[] | undefined;
          if (Array.isArray(items)) {
            items.forEach((item) => {
              if (item?.id) validLibraryFileIds.add(item.id);
            });
          }
          resolve();
        };
        req.onerror = () => reject(req.error);
      });
    }

    let deletedFileCount = 0;
    let freedBytes = 0;
    const deletedFileIds: string[] = [];

    // 3. Iterate FILES_STORE to purge orphans
    await new Promise<void>((resolve, reject) => {
      const req = fileStore.openCursor();
      req.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result;
        if (!cursor) {
          resolve();
          return;
        }

        const fileRecord = cursor.value as PersistedSessionFileRecord;
        const sessionId = fileRecord?.sessionId;
        const fileId = (fileRecord?.id || cursor.primaryKey) as string;

        const isStandaloneLibrary = validLibraryFileIds.has(fileId);
        const hasValidSession = sessionId ? validSessionIds.has(sessionId) : false;

        const isOrphan = !isStandaloneLibrary && !hasValidSession;

        if (isOrphan) {
          deletedFileCount++;
          const size = fileRecord?.rawFile?.size ?? (fileRecord as { size?: number })?.size ?? 0;
          freedBytes += size;
          deletedFileIds.push(fileId);

          cursor.delete();
          embeddingsStore?.delete(cursor.primaryKey);
        }

        cursor.continue();
      };
      req.onerror = () => reject(req.error);
    });

    await transactionToPromise(tx);

    // 4. Release managed object URLs for deleted files
    for (const fileId of deletedFileIds) {
      releaseManagedObjectUrlsByOwner(fileId);
    }

    return { deletedFileCount, freedBytes };
  });
};
