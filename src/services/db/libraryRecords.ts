import { type LibraryItem, type PersistedSessionFileRecord, type SavedChatSession } from '@/types';
import { getKeyValue, setKeyValue, getItem, getAll } from './indexedDbAccess';
import { FILES_STORE, SESSIONS_STORE } from './dbSchema';
import { extractLibraryItemsFromSessions } from '@/utils/library/libraryFiles';
import { base64ToBlob } from '@/utils/file/fileEncoding';

const STANDALONE_LIBRARY_STORAGE_KEY = 'amc_library_standalone_files_v1';
const DELETED_LIBRARY_FILES_STORAGE_KEY = 'amc_library_deleted_file_ids_v1';

export const getDeletedLibraryFileIds = async (): Promise<string[]> => {
  const ids = await getKeyValue<string[]>(DELETED_LIBRARY_FILES_STORAGE_KEY);
  return Array.isArray(ids) ? ids : [];
};

export const addDeletedLibraryFileIds = async (newIds: string[]): Promise<void> => {
  const current = await getDeletedLibraryFileIds();
  const idSet = new Set(current);
  newIds.forEach((id) => idSet.add(id));
  await setKeyValue(DELETED_LIBRARY_FILES_STORAGE_KEY, Array.from(idSet));
};

export const getStandaloneLibraryFiles = async (): Promise<LibraryItem[]> => {
  const items = await getKeyValue<LibraryItem[]>(STANDALONE_LIBRARY_STORAGE_KEY);
  return Array.isArray(items) ? items : [];
};

export const saveStandaloneLibraryFiles = async (files: LibraryItem[]): Promise<void> => {
  await setKeyValue(STANDALONE_LIBRARY_STORAGE_KEY, files);
};

export const addStandaloneLibraryFiles = async (newFiles: LibraryItem[]): Promise<void> => {
  const current = await getStandaloneLibraryFiles();
  const existingIds = new Set(current.map((item) => item.id));
  const merged = [...newFiles.filter((item) => !existingIds.has(item.id)), ...current];
  await saveStandaloneLibraryFiles(merged);
};

export const deleteStandaloneLibraryFiles = async (ids: string[]): Promise<void> => {
  const current = await getStandaloneLibraryFiles();
  const idSet = new Set(ids);
  const remaining = current.filter((item) => !idSet.has(item.id));
  await saveStandaloneLibraryFiles(remaining);
};

export const renameStandaloneLibraryFile = async (id: string, newName: string): Promise<void> => {
  const current = await getStandaloneLibraryFiles();
  const updated = current.map((item) => (item.id === id ? { ...item, name: newName } : item));
  await saveStandaloneLibraryFiles(updated);
};

export const fetchLibraryFileBlob = async (item: LibraryItem): Promise<Blob | undefined> => {
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

  // 5. If standalone file, retrieve from standalone storage
  if (item.isStandalone || !item.sessionId) {
    try {
      const standalone = await getStandaloneLibraryFiles();
      const match = standalone.find((f) => f.id === item.id);
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
