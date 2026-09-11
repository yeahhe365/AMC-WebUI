import { applyMigrations, DB_NAME, DB_VERSION, KEY_VALUE_STORE, LOCK_NAME } from './dbSchema';

let dbPromise: Promise<IDBDatabase> | null = null;

const isVersionConflictError = (error: unknown): boolean => {
  if (error instanceof DOMException) {
    return error.name === 'VersionError';
  }

  if (error instanceof Error) {
    return error.name === 'VersionError' || /requested version .* less than .* existing version/i.test(error.message);
  }

  return false;
};

export const getDb = (): Promise<IDBDatabase> => {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const openDatabase = (version?: number, allowVersionFallback: boolean = false) => {
        const request = version === undefined ? indexedDB.open(DB_NAME) : indexedDB.open(DB_NAME, version);

        request.onerror = () => {
          if (allowVersionFallback && isVersionConflictError(request.error)) {
            console.warn(
              `IndexedDB version ${DB_VERSION} is older than the stored schema. Reopening ${DB_NAME} with the browser's current version.`,
            );
            openDatabase(undefined, false);
            return;
          }

          console.error('IndexedDB error:', request.error);
          reject(request.error);
        };

        request.onsuccess = () => resolve(request.result);

        request.onupgradeneeded = (event) => {
          const db = (event.target as IDBOpenDBRequest).result;
          applyMigrations(db, event.oldVersion);
        };
      };

      openDatabase(DB_VERSION, true);
    });
  }
  return dbPromise;
};

const requestToPromise = <T>(request: IDBRequest<T>): Promise<T> => {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
};

export const transactionToPromise = (tx: IDBTransaction): Promise<void> => {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
};

export async function withWriteLock<T>(callback: () => Promise<T>): Promise<T> {
  if (typeof navigator !== 'undefined' && 'locks' in navigator) {
    return navigator.locks.request(LOCK_NAME, { mode: 'exclusive' }, callback);
  }
  return callback();
}

export async function getItem<T>(storeName: string, key: string): Promise<T | undefined> {
  const db = await getDb();
  return requestToPromise(db.transaction(storeName, 'readonly').objectStore(storeName).get(key));
}

export async function getAll<T>(storeName: string): Promise<T[]> {
  const db = await getDb();
  return requestToPromise(db.transaction(storeName, 'readonly').objectStore(storeName).getAll());
}

export async function setAll<T>(storeName: string, values: T[]): Promise<void> {
  return withWriteLock(async () => {
    const db = await getDb();
    const tx = db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    store.clear();
    values.forEach((value) => store.put(value));
    return transactionToPromise(tx);
  });
}

export async function getKeyValue<T>(key: string): Promise<T | undefined> {
  const db = await getDb();
  return requestToPromise(db.transaction(KEY_VALUE_STORE, 'readonly').objectStore(KEY_VALUE_STORE).get(key));
}

export async function setKeyValue<T>(key: string, value: T): Promise<void> {
  return withWriteLock(async () => {
    const db = await getDb();
    const tx = db.transaction(KEY_VALUE_STORE, 'readwrite');
    tx.objectStore(KEY_VALUE_STORE).put(value, key);
    return transactionToPromise(tx);
  });
}

export async function deleteKeyValue(key: string): Promise<void> {
  return withWriteLock(async () => {
    const db = await getDb();
    const tx = db.transaction(KEY_VALUE_STORE, 'readwrite');
    tx.objectStore(KEY_VALUE_STORE).delete(key);
    return transactionToPromise(tx);
  });
}
