import { describe, it, expect, beforeEach, vi } from 'vitest';
import { cleanupOrphanFiles } from './orphanFileCleanup';
import type { PersistedSessionFileRecord } from '@/types';

let mockFiles: Record<string, PersistedSessionFileRecord> = {};
let mockMetadata: Record<string, any> = {};
let mockSessions: Record<string, any> = {};
let mockEmbeddings: Record<string, any> = {};
let mockKv: Record<string, any> = {};

vi.mock('@/services/objectUrlManager', () => ({
  releaseManagedObjectUrlsByOwner: vi.fn(),
}));

vi.mock('./indexedDbAccess', () => ({
  getDb: vi.fn(async () => ({
    objectStoreNames: {
      contains: (name: string) =>
        ['files', 'session_metadata', 'sessions', 'multimodal_embeddings', 'keyValueStore'].includes(name),
    },
    transaction: (_stores: string[], _mode: string) => {
      const createCursorReq = (records: Record<string, any>) => {
        const keys = Object.keys(records);
        let idx = 0;
        const req: any = {
          onsuccess: null,
          onerror: null,
          result: null,
        };
        const step = () => {
          if (idx < keys.length) {
            const k = keys[idx];
            req.result = {
              primaryKey: k,
              value: records[k],
              delete: () => {
                delete records[k];
              },
              continue: () => {
                idx++;
                step();
              },
            };
          } else {
            req.result = null;
          }
          if (req.onsuccess) req.onsuccess({ target: req });
        };
        setTimeout(step, 0);
        return req;
      };

      const fileStore = {
        openCursor: () => createCursorReq(mockFiles),
        delete: (id: string) => {
          delete mockFiles[id];
        },
      };

      const metaStore = {
        openCursor: () => createCursorReq(mockMetadata),
        getAll: () => {
          const req: any = {
            onsuccess: null,
            onerror: null,
            result: Object.values(mockMetadata),
          };
          setTimeout(() => {
            if (req.onsuccess) req.onsuccess({ target: req });
          }, 0);
          return req;
        },
      };

      const sessionStore = {
        openCursor: () => createCursorReq(mockSessions),
      };

      const embeddingsStore = {
        delete: (id: string) => {
          delete mockEmbeddings[id];
        },
      };

      const kvStore = {
        get: (key: string) => {
          const req: any = {
            onsuccess: null,
            onerror: null,
            result: mockKv[key],
          };
          setTimeout(() => {
            if (req.onsuccess) req.onsuccess({ target: req });
          }, 0);
          return req;
        },
      };

      return {
        objectStore: (name: string) => {
          if (name === 'files') return fileStore;
          if (name === 'session_metadata') return metaStore;
          if (name === 'sessions') return sessionStore;
          if (name === 'multimodal_embeddings') return embeddingsStore;
          if (name === 'keyValueStore') return kvStore;
          throw new Error(`Unknown store: ${name}`);
        },
      };
    },
  })),
  withWriteLock: vi.fn(async (fn: () => Promise<any>) => fn()),
  transactionToPromise: vi.fn(async () => undefined),
}));

describe('cleanupOrphanFiles', () => {
  beforeEach(() => {
    mockFiles = {};
    mockMetadata = {};
    mockSessions = {};
    mockEmbeddings = {};
    mockKv = {};
  });

  it('deletes files with undefined or non-existent sessionIds, preserving valid files and embeddings', async () => {
    // Valid session
    mockMetadata['session-valid'] = { id: 'session-valid', title: 'Active Chat' };

    // File 1: attached to valid session (size: 100)
    mockFiles['file-valid'] = {
      id: 'file-valid',
      sessionId: 'session-valid',
      name: 'valid.png',
      type: 'image/png',
      rawFile: new Blob(['a'.repeat(100)]),
    } as any;
    mockEmbeddings['file-valid'] = { id: 'file-valid', vector: [0.1] };

    // File 2: sessionId undefined (size: 200)
    mockFiles['file-undefined-sess'] = {
      id: 'file-undefined-sess',
      sessionId: undefined,
      name: 'orphan1.png',
      type: 'image/png',
      rawFile: new Blob(['b'.repeat(200)]),
    } as any;
    mockEmbeddings['file-undefined-sess'] = { id: 'file-undefined-sess', vector: [0.2] };

    // File 3: non-existent sessionId (size: 300)
    mockFiles['file-deleted-sess'] = {
      id: 'file-deleted-sess',
      sessionId: 'session-deleted',
      name: 'orphan2.png',
      type: 'image/png',
      rawFile: new Blob(['c'.repeat(300)]),
    } as any;
    mockEmbeddings['file-deleted-sess'] = { id: 'file-deleted-sess', vector: [0.3] };

    const result = await cleanupOrphanFiles();

    expect(result.deletedFileCount).toBe(2);
    expect(result.freedBytes).toBe(500);

    // Valid file remains
    expect(mockFiles['file-valid']).toBeDefined();
    expect(mockEmbeddings['file-valid']).toBeDefined();

    // Orphan files deleted
    expect(mockFiles['file-undefined-sess']).toBeUndefined();
    expect(mockEmbeddings['file-undefined-sess']).toBeUndefined();
    expect(mockFiles['file-deleted-sess']).toBeUndefined();
    expect(mockEmbeddings['file-deleted-sess']).toBeUndefined();
  });

  // DB-1：session_metadata 只是 v7 的轻量镜像。旧实现"有镜像就只看镜像"，
  // 一旦两表漂移（旧标签页以无版本号方式打开 v7 库，只写 sessions），
  // 该会话的全部附件与向量会在同一事务里被删掉，不可恢复。
  it('keeps attachments of a session that exists only in the authoritative sessions store', async () => {
    mockMetadata['session-other'] = { id: 'session-other', title: 'Other' };
    mockSessions['session-drifted'] = { id: 'session-drifted', title: 'Drifted' };

    mockFiles['file-drifted'] = {
      id: 'file-drifted',
      sessionId: 'session-drifted',
      name: 'drifted.png',
      type: 'image/png',
      rawFile: new Blob(['x'.repeat(50)]),
    } as any;
    mockEmbeddings['file-drifted'] = { id: 'file-drifted', vector: [0.1] };

    const result = await cleanupOrphanFiles();

    expect(result.deletedFileCount).toBe(0);
    expect(result.freedBytes).toBe(0);
    expect(mockFiles['file-drifted']).toBeDefined();
    expect(mockEmbeddings['file-drifted']).toBeDefined();
  });

  it('returns 0 when there are no orphan files', async () => {
    mockMetadata['s1'] = { id: 's1', title: 'S1' };
    mockFiles['f1'] = {
      id: 'f1',
      sessionId: 's1',
      name: 'f1.txt',
      type: 'text/plain',
      rawFile: new Blob(['hello']),
    } as any;

    const result = await cleanupOrphanFiles();
    expect(result.deletedFileCount).toBe(0);
    expect(result.freedBytes).toBe(0);
    expect(mockFiles['f1']).toBeDefined();
  });

  it('preserves standalone library files even if they have no sessionId', async () => {
    // Registered in standalone library storage
    mockKv['amc_library_standalone_files_v1'] = [
      { id: 'standalone-file-1', name: 'library_book.pdf', type: 'application/pdf' },
    ];

    mockFiles['standalone-file-1'] = {
      id: 'standalone-file-1',
      sessionId: undefined,
      name: 'library_book.pdf',
      type: 'application/pdf',
      rawFile: new Blob(['pdf-content']),
    } as any;
    mockEmbeddings['standalone-file-1'] = { id: 'standalone-file-1', vector: [0.5] };

    const result = await cleanupOrphanFiles();
    expect(result.deletedFileCount).toBe(0);
    expect(result.freedBytes).toBe(0);
    expect(mockFiles['standalone-file-1']).toBeDefined();
    expect(mockEmbeddings['standalone-file-1']).toBeDefined();
  });
});
