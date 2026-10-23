import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  getStandaloneLibraryFiles,
  saveStandaloneLibraryFiles,
  addStandaloneLibraryFiles,
  deleteStandaloneLibraryFiles,
  renameStandaloneLibraryFile,
  fetchLibraryFileBlob,
  getAllHistoricalSessionFiles,
  getDeletedLibraryFileIds,
  addDeletedLibraryFileIds,
} from './libraryRecords';
import type { LibraryItem } from '@/types';
import * as multimodalIndexStoreModule from '@/services/embedding/multimodalIndexStore';

let mockStore: Record<string, any> = {};
let mockSessions: any[] = [];

vi.mock('./indexedDbAccess', () => ({
  withWriteLock: (callback: () => Promise<void>) => callback(),
  transactionToPromise: async () => {},
  getDb: async () => ({
    transaction: () => ({
      objectStore: (storeName: string) => ({
        get: (key: string) => {
          const request: any = { result: mockStore[key], onsuccess: null };
          queueMicrotask(() => request.onsuccess?.());
          return request;
        },
        put: (value: any, key?: string) => {
          mockStore[storeName === 'files' ? value.id : key!] = value;
        },
        delete: (key: string) => {
          delete mockStore[key];
        },
      }),
    }),
  }),
  getKeyValue: vi.fn(async (key: string) => mockStore[key]),
  setKeyValue: vi.fn(async (key: string, value: any) => {
    mockStore[key] = value;
  }),
  getItem: vi.fn(async (_store: string, key: string) => mockStore[key]),
  getAll: vi.fn(async (_store: string) => mockSessions),
  putMany: vi.fn(async (_store: string, values: any[]) => {
    values.forEach((value) => {
      mockStore[value.id] = value;
    });
  }),
  deleteMany: vi.fn(async (_store: string, keys: any[]) => {
    keys.forEach((key) => {
      delete mockStore[key];
    });
  }),
}));

describe('libraryRecords service', () => {
  beforeEach(() => {
    mockStore = {};
  });

  it('saves and retrieves standalone library files', async () => {
    const files: LibraryItem[] = [
      {
        id: 'lib-1',
        name: 'test.png',
        type: 'image/png',
        size: 100,
        timestamp: 1000,
        source: 'uploaded',
        isStandalone: true,
      },
    ];

    await saveStandaloneLibraryFiles(files);
    const retrieved = await getStandaloneLibraryFiles();
    expect(retrieved).toEqual(files);
  });

  it('adds standalone library files without duplicate ids', async () => {
    const initial: LibraryItem[] = [
      {
        id: 'lib-1',
        name: 'test.png',
        type: 'image/png',
        size: 100,
        timestamp: 1000,
        source: 'uploaded',
        isStandalone: true,
      },
    ];
    await saveStandaloneLibraryFiles(initial);

    const next: LibraryItem[] = [
      {
        id: 'lib-1', // duplicate
        name: 'test-dup.png',
        type: 'image/png',
        size: 100,
        timestamp: 1000,
        source: 'uploaded',
        isStandalone: true,
      },
      {
        id: 'lib-2', // new
        name: 'doc.pdf',
        type: 'application/pdf',
        size: 200,
        timestamp: 2000,
        source: 'uploaded',
        isStandalone: true,
      },
    ];

    await addStandaloneLibraryFiles(next);
    const retrieved = await getStandaloneLibraryFiles();
    expect(retrieved).toHaveLength(2);
    expect(retrieved.map((f) => f.id)).toContain('lib-1');
    expect(retrieved.map((f) => f.id)).toContain('lib-2');
  });

  it('deletes standalone library files', async () => {
    const files: LibraryItem[] = [
      { id: 'lib-1', name: '1.png', type: 'image/png', size: 10, timestamp: 1, source: 'uploaded' },
      { id: 'lib-2', name: '2.png', type: 'image/png', size: 20, timestamp: 2, source: 'uploaded' },
      { id: 'lib-3', name: '3.png', type: 'image/png', size: 30, timestamp: 3, source: 'uploaded' },
    ];
    await saveStandaloneLibraryFiles(files);

    await deleteStandaloneLibraryFiles(['lib-2']);
    const retrieved = await getStandaloneLibraryFiles();
    expect(retrieved.map((f) => f.id)).toEqual(['lib-1', 'lib-3']);
  });

  it('renames standalone library file and syncs stored embedding name', async () => {
    const files: LibraryItem[] = [
      { id: 'lib-1', name: 'old-name.png', type: 'image/png', size: 10, timestamp: 1, source: 'uploaded' },
    ];
    await saveStandaloneLibraryFiles(files);

    const updateEmbeddingSpy = vi.spyOn(multimodalIndexStoreModule, 'updateStoredEmbeddingName').mockResolvedValue();

    await renameStandaloneLibraryFile('lib-1', 'new-name.png');
    const retrieved = await getStandaloneLibraryFiles();
    expect(retrieved[0].name).toBe('new-name.png');
    expect(updateEmbeddingSpy).toHaveBeenCalledWith('lib-1', 'new-name.png');
  });

  it('fetches library file blob from FILES_STORE if not in rawFile', async () => {
    const fakeBlob = new Blob(['hello'], { type: 'text/plain' });
    mockStore['file-123'] = { rawFile: fakeBlob };

    const item: LibraryItem = {
      id: 'file-123',
      name: 'hello.txt',
      type: 'text/plain',
      size: 5,
      timestamp: 1,
      source: 'uploaded',
    };

    const blob = await fetchLibraryFileBlob(item);
    expect(blob).toBe(fakeBlob);
  });

  it('returns item.rawFile if it is already a Blob in fetchLibraryFileBlob', async () => {
    const directBlob = new Blob(['direct'], { type: 'text/plain' });
    const item: LibraryItem = {
      id: 'file-direct',
      name: 'direct.txt',
      type: 'text/plain',
      size: 6,
      timestamp: 1,
      source: 'uploaded',
      rawFile: directBlob,
    };

    const blob = await fetchLibraryFileBlob(item);
    expect(blob).toBe(directBlob);
  });

  it('retrieves files across all historical sessions from SESSIONS_STORE', async () => {
    mockSessions = [
      {
        id: 'session-1',
        title: 'Session One',
        messages: [
          {
            id: 'msg-1',
            role: 'user',
            files: [{ id: 'f-1', name: 'photo.png', type: 'image/png', size: 100 }],
          },
        ],
      },
      {
        id: 'session-2',
        title: 'Session Two',
        messages: [
          {
            id: 'msg-2',
            role: 'model',
            files: [{ id: 'f-2', name: 'generated.pdf', type: 'application/pdf', size: 500 }],
          },
        ],
      },
    ];

    const historicalFiles = await getAllHistoricalSessionFiles();
    expect(historicalFiles).toHaveLength(2);
    expect(historicalFiles[0].id).toBe('f-1');
    expect(historicalFiles[0].sessionId).toBe('session-1');
    expect(historicalFiles[0].sessionTitle).toBe('Session One');
    expect(historicalFiles[0].source).toBe('uploaded');

    expect(historicalFiles[1].id).toBe('f-2');
    expect(historicalFiles[1].sessionId).toBe('session-2');
    expect(historicalFiles[1].sessionTitle).toBe('Session Two');
    expect(historicalFiles[1].source).toBe('generated');
  });

  it('decodes base64 dataUrl when rawFile is missing in fetchLibraryFileBlob', async () => {
    // 'aGVsbG8=' is base64 for 'hello'
    const item: LibraryItem = {
      id: 'file-b64',
      name: 'inline.png',
      type: 'image/png',
      size: 5,
      timestamp: 1,
      source: 'uploaded',
      dataUrl: 'data:image/png;base64,aGVsbG8=',
    };

    const blob = await fetchLibraryFileBlob(item);
    expect(blob).toBeInstanceOf(Blob);
    expect(blob?.type).toBe('image/png');
    const text = await blob?.text();
    expect(text).toBe('hello');
  });

  it('retrieves blob from historical session in SESSIONS_STORE when not in FILES_STORE', async () => {
    const sessionBlob = new Blob(['session content'], { type: 'image/jpeg' });
    mockStore['session-hist-1'] = {
      id: 'session-hist-1',
      title: 'Historical',
      messages: [
        {
          id: 'msg-h1',
          files: [
            {
              id: 'f-hist-1',
              name: 'hist.jpg',
              type: 'image/jpeg',
              rawFile: sessionBlob,
            },
          ],
        },
      ],
    };

    const item: LibraryItem = {
      id: 'f-hist-1',
      name: 'hist.jpg',
      type: 'image/jpeg',
      size: 15,
      timestamp: 1,
      sessionId: 'session-hist-1',
      source: 'uploaded',
    };

    const blob = await fetchLibraryFileBlob(item);
    expect(blob).toBe(sessionBlob);
  });

  it('retrieves blob from standalone storage when not in FILES_STORE', async () => {
    const standaloneBlob = new Blob(['standalone content'], { type: 'image/png' });
    mockStore['amc_library_standalone_files_v1'] = [
      {
        id: 'lib-solo',
        name: 'solo.png',
        type: 'image/png',
        size: 18,
        rawFile: standaloneBlob,
        isStandalone: true,
      },
    ];

    const item: LibraryItem = {
      id: 'lib-solo',
      name: 'solo.png',
      type: 'image/png',
      size: 18,
      timestamp: 1,
      isStandalone: true,
      source: 'uploaded',
    };

    const blob = await fetchLibraryFileBlob(item);
    expect(blob).toBe(standaloneBlob);
  });

  it('manages deleted library file ids (tombstones)', async () => {
    const initial = await getDeletedLibraryFileIds();
    expect(initial).toEqual([]);

    await addDeletedLibraryFileIds(['del-1', 'del-2']);
    let current = await getDeletedLibraryFileIds();
    expect(current).toEqual(['del-1', 'del-2']);

    // Adding duplicates and new entries
    await addDeletedLibraryFileIds(['del-2', 'del-3']);
    current = await getDeletedLibraryFileIds();
    expect(current).toEqual(['del-1', 'del-2', 'del-3']);
  });

  it('mirrors standalone payloads into the id-keyed FILES_STORE', async () => {
    const blob = new Blob(['payload'], { type: 'image/png' });
    const files: LibraryItem[] = [
      {
        id: 'lib-mirror',
        name: 'mirror.png',
        type: 'image/png',
        size: 7,
        timestamp: 1,
        source: 'uploaded',
        isStandalone: true,
        rawFile: blob,
      },
    ];

    await saveStandaloneLibraryFiles(files);

    expect(mockStore['lib-mirror']).toMatchObject({ id: 'lib-mirror', rawFile: blob });
  });

  it('resolves a standalone payload by id without scanning the standalone array', async () => {
    const blob = new Blob(['payload'], { type: 'image/png' });
    mockStore['lib-fast'] = { id: 'lib-fast', rawFile: blob };
    // Poison the legacy array so any full scan would fail loudly.
    mockStore['amc_library_standalone_files_v1'] = 'not-an-array';

    const item: LibraryItem = {
      id: 'lib-fast',
      name: 'fast.png',
      type: 'image/png',
      size: 7,
      timestamp: 1,
      isStandalone: true,
      source: 'uploaded',
    };

    await expect(fetchLibraryFileBlob(item)).resolves.toBe(blob);
  });

  it('drops the mirrored payload and removes stored embeddings when a standalone file is deleted', async () => {
    const removeEmbeddingsSpy = vi.spyOn(multimodalIndexStoreModule, 'removeStoredEmbeddings');
    const blob = new Blob(['payload'], { type: 'image/png' });
    mockStore['lib-doomed'] = { id: 'lib-doomed', rawFile: blob };
    mockStore['amc_library_standalone_files_v1'] = [
      { id: 'lib-doomed', name: 'doomed.png', type: 'image/png', size: 7, timestamp: 1, source: 'uploaded' },
    ];

    await deleteStandaloneLibraryFiles(['lib-doomed']);

    expect(mockStore['lib-doomed']).toBeUndefined();
    expect(await getStandaloneLibraryFiles()).toEqual([]);
    expect(removeEmbeddingsSpy).toHaveBeenCalledWith(['lib-doomed']);
  });
});
