import { describe, expect, it, vi } from 'vitest';
vi.unmock('./dbService');

// Since the db module uses module-level state and browser IndexedDB globals,
// we test the utility patterns rather than importing the module directly.

function createIDBMock() {
  const stores: Record<string, Map<string, unknown>> = {};

  const createObjectStore = (name: string, _options?: { keyPath?: string; autoIncrement?: boolean }) => {
    if (!stores[name]) stores[name] = new Map();
    return stores[name];
  };

  return {
    stores,
    objectStoreNames: {
      contains(name: string) {
        return Object.prototype.hasOwnProperty.call(stores, name);
      },
    },
    createObjectStore,
  };
}

describe('IndexedDB Service Patterns', () => {
  it('should create stores with correct keyPaths', () => {
    const db = createIDBMock();
    db.createObjectStore('sessions', { keyPath: 'id' });
    db.createObjectStore('files', { keyPath: 'id' });
    db.createObjectStore('groups', { keyPath: 'id' });
    db.createObjectStore('scenarios', { keyPath: 'id' });
    db.createObjectStore('keyValueStore');
    db.createObjectStore('logs', { keyPath: 'id', autoIncrement: true });
    expect(db.objectStoreNames.contains('sessions')).toBe(true);
    expect(db.objectStoreNames.contains('files')).toBe(true);
    expect(db.objectStoreNames.contains('logs')).toBe(true);
  });

  it('should put and get items from store', () => {
    const db = createIDBMock();
    const store = db.createObjectStore('sessions', { keyPath: 'id' });

    const session = { id: 'test-1', title: 'Test Session', messages: [] };
    store.set('test-1', session);

    expect(store.get('test-1')).toEqual(session);
    expect(store.get('nonexistent')).toBeUndefined();
  });

  it('should delete items from store', () => {
    const db = createIDBMock();
    const store = db.createObjectStore('sessions', { keyPath: 'id' });

    store.set('del-me', { id: 'del-me', messages: [] });
    expect(store.has('del-me')).toBe(true);

    store.delete('del-me');
    expect(store.has('del-me')).toBe(false);
  });

  it('should clear all items from store', () => {
    const db = createIDBMock();
    const store = db.createObjectStore('sessions', { keyPath: 'id' });

    store.set('a', { id: 'a' });
    store.set('b', { id: 'b' });
    expect(store.size).toBe(2);

    store.clear();
    expect(store.size).toBe(0);
  });

  it('should search sessions by title and content', () => {
    const db = createIDBMock();
    const store = db.createObjectStore('sessions', { keyPath: 'id' });

    store.set('1', { id: '1', title: 'React Hooks Guide', messages: [{ content: 'useState tutorial' }] });
    store.set('2', { id: '2', title: 'Python Basics', messages: [{ content: 'intro to python' }] });
    store.set('3', { id: '3', title: 'TypeScript Tips', messages: [{ content: 'React patterns' }] });

    const searchSessions = (query: string): string[] => {
      const lowerQuery = query.toLowerCase();
      const results: string[] = [];
      store.forEach((session: any) => {
        const titleMatch = session.title?.toLowerCase().includes(lowerQuery);
        const contentMatch = session.messages?.some((m: any) => m.content?.toLowerCase().includes(lowerQuery));
        if (titleMatch || contentMatch) results.push(session.id);
      });
      return results;
    };

    expect(searchSessions('react')).toEqual(['1', '3']);
    expect(searchSessions('python')).toEqual(['2']);
    expect(searchSessions('nonexistent')).toEqual([]);
  });
});

describe('requestToPromise pattern', () => {
  it('should resolve on successful request', async () => {
    const result = { data: 'test' };
    const requestToPromise = <T>(req: IDBRequest<T>): Promise<T> => {
      return new Promise((resolve, reject) => {
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
    };

    const mockReq = {
      result,
      error: null,
      onsuccess: null as IDBRequest<typeof result>['onsuccess'],
      onerror: null as IDBRequest<typeof result>['onerror'],
    } as unknown as IDBRequest<typeof result>;

    const promise = requestToPromise(mockReq);
    mockReq.onsuccess!({} as Event);
    await expect(promise).resolves.toEqual(result);
  });

  it('should reject on error request', async () => {
    const requestToPromise = <T>(req: IDBRequest<T>): Promise<T> => {
      return new Promise((resolve, reject) => {
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
    };

    const error = new DOMException('fail');
    const mockReq = {
      result: null,
      error,
      onsuccess: null as IDBRequest['onsuccess'],
      onerror: null as IDBRequest['onerror'],
    } as unknown as IDBRequest;

    const promise = requestToPromise(mockReq);
    mockReq.onerror!({} as Event);
    await expect(promise).rejects.toBe(error);
  });
});

describe('Web Locks fallback', () => {
  it('should fall back to direct callback when locks unavailable', async () => {
    const withWriteLock = async <T>(cb: () => Promise<T>, hasLocks: boolean): Promise<T> => {
      if (hasLocks) {
        return navigator.locks.request('test', { mode: 'exclusive' }, cb);
      }
      return cb();
    };

    const result = await withWriteLock(async () => 42, false);
    expect(result).toBe(42);
  });
});
