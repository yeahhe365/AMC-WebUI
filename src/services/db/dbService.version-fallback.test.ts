import { afterEach, describe, expect, it, vi } from 'vitest';
vi.unmock('./dbService');

const DB_NAME = 'AllModelChatDB';
const DB_VERSION = 5;

interface MutableRequest<T> {
  result: T;
  error: DOMException | null;
  onsuccess: ((event: Event) => void) | null;
  onerror: ((event: Event) => void) | null;
}

interface MutableOpenRequest extends MutableRequest<IDBDatabase | undefined> {
  onupgradeneeded: ((event: IDBVersionChangeEvent) => void) | null;
}

const createRequest = <T>() => {
  const request: MutableRequest<T | undefined> = {
    result: undefined,
    error: null as DOMException | null,
    onsuccess: null as ((event: Event) => void) | null,
    onerror: null as ((event: Event) => void) | null,
  };

  return request;
};

const createOpenRequest = () => {
  const request: MutableOpenRequest = {
    result: undefined,
    error: null as DOMException | null,
    onsuccess: null as ((event: Event) => void) | null,
    onerror: null as ((event: Event) => void) | null,
    onupgradeneeded: null as ((event: IDBVersionChangeEvent) => void) | null,
  };

  return request;
};

const createMockDb = () => {
  return {
    transaction: vi.fn(() => ({
      objectStore: vi.fn(() => ({
        getAll: vi.fn(() => {
          const request = createRequest<unknown[]>();
          queueMicrotask(() => {
            request.result = [];
            request.onsuccess?.(new Event('success'));
          });
          return request as unknown as IDBRequest<unknown[]>;
        }),
      })),
    })),
  } as unknown as IDBDatabase;
};

describe('dbService IndexedDB version fallback', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it('retries without an explicit version when the stored database version is newer', async () => {
    const existingDb = createMockDb();
    const versionError = new DOMException(
      'The requested version (4) is less than the existing version (5).',
      'VersionError',
    );

    const openMock = vi.fn((_name: string, version?: number) => {
      const request = createOpenRequest();

      queueMicrotask(() => {
        if (version === DB_VERSION) {
          request.error = versionError;
          request.onerror?.(new Event('error'));
          return;
        }

        request.result = existingDb;
        request.onsuccess?.(new Event('success'));
      });

      return request as unknown as IDBOpenDBRequest;
    });

    vi.stubGlobal('indexedDB', {
      open: openMock,
    });

    const { dbService } = await import('./dbService');
    const sessions = await dbService.getAllSessions();

    expect(sessions).toEqual([]);
    expect(openMock).toHaveBeenNthCalledWith(1, DB_NAME, DB_VERSION);
    expect(openMock).toHaveBeenNthCalledWith(2, DB_NAME);
  });
});
