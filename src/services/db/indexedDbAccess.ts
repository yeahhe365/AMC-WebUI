import { applyMigrations, DB_NAME, DB_VERSION, KEY_VALUE_STORE, LOCK_NAME } from './dbSchema';

let dbPromise: Promise<IDBDatabase> | null = null;

/**
 * How long to wait for an open request before giving up.
 *
 * `indexedDB.open` never settles while another tab holds the old version open
 * and the upgrade is blocked. Every writer awaits `getDb` inside the Web Lock,
 * so an open that hangs forever blocks all writes for the life of the tab; this
 * bound turns that into a recoverable failure the caller can retry.
 */
const DB_OPEN_TIMEOUT_MS = 10_000;

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

        let settled = false;
        const timeoutId = setTimeout(() => {
          if (settled) return;
          settled = true;
          // A blocked upgrade is the usual cause: another tab still holds the
          // previous version open. Failing the open lets the write lock be
          // released so a later retry (after the tab closes) can succeed.
          console.warn(
            `IndexedDB open did not settle within ${DB_OPEN_TIMEOUT_MS}ms. Another tab may be holding an older version of ${DB_NAME} open.`,
          );
          dbPromise = null;
          reject(new Error(`IndexedDB open timed out after ${DB_OPEN_TIMEOUT_MS}ms`));
        }, DB_OPEN_TIMEOUT_MS);
        const settle = () => {
          settled = true;
          clearTimeout(timeoutId);
        };

        request.onblocked = () => {
          // Fires when another connection holds the previous version open. The
          // timeout above covers the case where it never clears; this log is
          // the actionable hint.
          console.warn(`IndexedDB upgrade for ${DB_NAME} is blocked by another tab.`);
        };

        request.onerror = () => {
          settle();
          if (allowVersionFallback && isVersionConflictError(request.error)) {
            console.warn(
              `IndexedDB version ${DB_VERSION} is older than the stored schema. Reopening ${DB_NAME} with the browser's current version.`,
            );
            openDatabase(undefined, false);
            return;
          }

          console.error('IndexedDB error:', request.error);
          dbPromise = null;
          reject(request.error);
        };

        request.onsuccess = () => {
          settle();
          const db = request.result;
          db.onversionchange = () => {
            try {
              db.close();
            } catch {
              // Ignore close errors
            }
            dbPromise = null;
          };
          db.onclose = () => {
            dbPromise = null;
          };
          resolve(db);
        };

        request.onupgradeneeded = (event) => {
          const target = event.target as IDBOpenDBRequest;
          const db = target.result;
          applyMigrations(db, event.oldVersion, target.transaction);
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

/**
 * Returns every primary key in a store without materializing the stored values.
 * Cheap enough to use as a membership set for large stores.
 */
export async function getAllKeys(storeName: string): Promise<IDBValidKey[]> {
  const db = await getDb();
  return requestToPromise(db.transaction(storeName, 'readonly').objectStore(storeName).getAllKeys());
}

/**
 * Counts records in a store without materializing them (IDBObjectStore.count).
 */
export async function countAll(storeName: string): Promise<number> {
  const db = await getDb();
  return requestToPromise(db.transaction(storeName, 'readonly').objectStore(storeName).count());
}

/**
 * Writes many records in a single transaction. Far cheaper than one
 * read-modify-write cycle per record.
 */
export async function putMany<T>(storeName: string, values: T[]): Promise<void> {
  if (values.length === 0) return;
  return withWriteLock(async () => {
    const db = await getDb();
    const tx = db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    values.forEach((value) => store.put(value));
    return transactionToPromise(tx);
  });
}

/**
 * Deletes many records by primary key in a single transaction.
 */
export async function deleteMany(storeName: string, keys: IDBValidKey[]): Promise<void> {
  if (keys.length === 0) return;
  return withWriteLock(async () => {
    const db = await getDb();
    const tx = db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    keys.forEach((key) => store.delete(key));
    return transactionToPromise(tx);
  });
}

/**
 * Deletes every record in a store without dropping the store itself.
 */
export async function clearStore(storeName: string): Promise<void> {
  return withWriteLock(async () => {
    const db = await getDb();
    const tx = db.transaction(storeName, 'readwrite');
    tx.objectStore(storeName).clear();
    return transactionToPromise(tx);
  });
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
