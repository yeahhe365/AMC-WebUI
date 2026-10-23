import { type LibraryItem, type PersistedSessionFileRecord, type SavedChatSession } from '@/types';
import { getKeyValue, getItem, getAll, getDb, transactionToPromise, withWriteLock } from './indexedDbAccess';
import { FILES_STORE, KEY_VALUE_STORE, SESSIONS_STORE } from './dbSchema';
import { extractLibraryItemsFromSessions } from '@/utils/library/libraryFiles';
import { base64ToBlob } from '@/utils/file/fileEncoding';
import { removeStoredEmbeddings, updateStoredEmbeddingName } from '@/services/embedding/multimodalIndexStore';

const STANDALONE_LIBRARY_STORAGE_KEY = 'amc_library_standalone_files_v1';
const DELETED_LIBRARY_FILES_STORAGE_KEY = 'amc_library_deleted_file_ids_v1';

export const getDeletedLibraryFileIds = async (): Promise<string[]> => {
  const ids = await getKeyValue<string[]>(DELETED_LIBRARY_FILES_STORAGE_KEY);
  return Array.isArray(ids) ? ids : [];
};

export const addDeletedLibraryFileIds = async (newIds: string[]): Promise<void> => {
  await withWriteLock(async () => {
    const db = await getDb();
    const tx = db.transaction(KEY_VALUE_STORE, 'readwrite');
    const done = transactionToPromise(tx);
    const store = tx.objectStore(KEY_VALUE_STORE);
    const request = store.get(DELETED_LIBRARY_FILES_STORAGE_KEY);
    request.onsuccess = () => {
      const idSet = new Set<string>(Array.isArray(request.result) ? request.result : []);
      newIds.forEach((id) => idSet.add(id));
      store.put(Array.from(idSet), DELETED_LIBRARY_FILES_STORAGE_KEY);
    };
    await done;
  });
};

export const getStandaloneLibraryFiles = async (): Promise<LibraryItem[]> => {
  const items = await getKeyValue<LibraryItem[]>(STANDALONE_LIBRARY_STORAGE_KEY);
  return Array.isArray(items) ? items : [];
};

/**
 * Resolves a single standalone item's payload. Prefers the id-keyed
 * FILES_STORE mirror and only falls back to scanning the legacy array.
 */
export const getStandaloneLibraryFile = async (id: string): Promise<LibraryItem | undefined> => {
  if (!id) return undefined;

  const record = await getItem<{ rawFile?: Blob }>(FILES_STORE, id);
  if (record?.rawFile instanceof Blob) {
    return { id, rawFile: record.rawFile } as LibraryItem;
  }

  const items = await getStandaloneLibraryFiles();
  return items.find((item) => item?.id === id);
};

/** Keep the legacy metadata array and id-keyed payload mirror in one transaction.
 * The read must share the write transaction even in browsers without Web Locks.
 * Queue writes in the request callback so the transaction cannot auto-commit.
 */
const updateStandaloneFiles = async (
  update: (files: LibraryItem[]) => LibraryItem[],
  deletedIds: string[] = [],
  rename?: { id: string; name: string },
): Promise<void> =>
  withWriteLock(async () => {
    const db = await getDb();
    const tx = db.transaction([KEY_VALUE_STORE, FILES_STORE], 'readwrite');
    const done = transactionToPromise(tx);
    const metadataStore = tx.objectStore(KEY_VALUE_STORE);
    const fileStore = tx.objectStore(FILES_STORE);
    const request = metadataStore.get(STANDALONE_LIBRARY_STORAGE_KEY);
    request.onsuccess = () => {
      const files = update(Array.isArray(request.result) ? request.result : []);
      metadataStore.put(files, STANDALONE_LIBRARY_STORAGE_KEY);
      files.forEach((file) => {
        if (file?.id && file.rawFile instanceof Blob) {
          fileStore.put({
            id: file.id,
            sessionId: file.sessionId,
            messageId: file.messageId,
            name: file.name,
            type: file.type,
            rawFile: file.rawFile,
          });
        }
      });
      if (rename && files.some((file) => file.id === rename.id)) {
        const payload = fileStore.get(rename.id);
        payload.onsuccess = () => {
          if (payload.result) fileStore.put({ ...payload.result, name: rename.name });
        };
      }
      deletedIds.forEach((id) => fileStore.delete(id));
    };
    await done;
  });

export const saveStandaloneLibraryFiles = async (files: LibraryItem[]): Promise<void> => {
  await updateStandaloneFiles(() => files);
};

export const addStandaloneLibraryFiles = async (newFiles: LibraryItem[]): Promise<void> => {
  await updateStandaloneFiles((current) => {
    const existingIds = new Set(current.map((item) => item.id));
    return [
      ...newFiles.filter((item) => {
        if (existingIds.has(item.id)) return false;
        existingIds.add(item.id);
        return true;
      }),
      ...current,
    ];
  });
};

export const deleteStandaloneLibraryFiles = async (ids: string[]): Promise<void> => {
  const idSet = new Set(ids);
  await updateStandaloneFiles((current) => current.filter((item) => !idSet.has(item.id)), ids);
  await removeStoredEmbeddings(ids).catch(() => {});
};

export const renameStandaloneLibraryFile = async (id: string, newName: string): Promise<void> => {
  await updateStandaloneFiles(
    (current) => current.map((item) => (item.id === id ? { ...item, name: newName } : item)),
    [],
    { id, name: newName },
  );
  await updateStoredEmbeddingName(id, newName).catch(() => {});
};

/**
 * Minimal shape needed to locate a file payload. Accepting a structural subset
 * lets the indexer resolve payloads for lightweight descriptors that carry no
 * blob/text payload of their own.
 */
export type LibraryFileLookup = Pick<LibraryItem, 'id' | 'name' | 'type'> &
  Partial<Pick<LibraryItem, 'size' | 'sessionId' | 'isStandalone' | 'rawFile' | 'dataUrl' | 'textContent'>>;

export const fetchLibraryFileBlob = async (item: LibraryFileLookup): Promise<Blob | undefined> => {
  // 1. Direct rawFile Blob
  if (item.rawFile instanceof Blob) {
    return item.rawFile;
  }

  // 2. Direct inline base64 dataUrl
  if (item.dataUrl && item.dataUrl.startsWith('data:')) {
    try {
      const base64Clean = item.dataUrl.includes(',') ? item.dataUrl.split(',')[1] : item.dataUrl;
      return base64ToBlob(base64Clean, item.type);
    } catch {
      // ignore and fallback
    }
  }

  // 3. Direct lookup in FILES_STORE by item.id
  try {
    const record = await getItem<PersistedSessionFileRecord>(FILES_STORE, item.id);
    if (record && record.rawFile instanceof Blob) {
      return record.rawFile;
    }
  } catch {
    // ignore and fallback
  }

  // 4. If associated with a session, retrieve from historical session in SESSIONS_STORE
  if (item.sessionId) {
    try {
      const session = await getItem<SavedChatSession>(SESSIONS_STORE, item.sessionId);
      if (session?.messages) {
        for (const message of session.messages) {
          if (!message.files) continue;
          for (const file of message.files) {
            if (file.id === item.id || (file.name === item.name && (item.size ? file.size === item.size : true))) {
              if (file.rawFile instanceof Blob) {
                return file.rawFile;
              }
              if (file.dataUrl && file.dataUrl.startsWith('data:')) {
                try {
                  const base64Clean = file.dataUrl.includes(',') ? file.dataUrl.split(',')[1] : file.dataUrl;
                  return base64ToBlob(base64Clean, file.type || item.type);
                } catch {
                  // ignore
                }
              }
            }
          }
        }
      }
    } catch {
      // ignore
    }
  }

  // 5. If standalone file, retrieve from standalone storage. This reaches for the
  //    id-keyed FILES_STORE mirror before scanning the legacy array, so indexing
  //    a standalone item stays O(1) instead of O(library size).
  if (item.isStandalone || !item.sessionId) {
    try {
      const match = await getStandaloneLibraryFile(item.id);
      if (match) {
        if (match.rawFile instanceof Blob) {
          return match.rawFile;
        }
        if (match.dataUrl && match.dataUrl.startsWith('data:')) {
          try {
            const base64Clean = match.dataUrl.includes(',') ? match.dataUrl.split(',')[1] : match.dataUrl;
            return base64ToBlob(base64Clean, match.type || item.type);
          } catch {
            // ignore
          }
        }
      }
    } catch {
      // ignore
    }
  }

  // 6. Text content fallback
  if (item.textContent) {
    return new Blob([item.textContent], { type: item.type || 'text/plain' });
  }

  return undefined;
};

export const getAllHistoricalSessionFiles = async (): Promise<LibraryItem[]> => {
  const sessions = await getAll<SavedChatSession>(SESSIONS_STORE);
  return extractLibraryItemsFromSessions(sessions);
};
