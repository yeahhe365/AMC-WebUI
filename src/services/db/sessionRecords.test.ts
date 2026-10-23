import { describe, it, expect, beforeEach, vi } from 'vitest';
import { deleteFilesFromSessions } from './sessionRecords';
import type { SavedChatSession } from '@/types';

let mockSessions: Record<string, SavedChatSession> = {};
let mockMetadata: Record<string, SavedChatSession> = {};
let mockFiles: Record<string, any> = {};
let mockEmbeddings: Record<string, any> = {};
const mockKv: Record<string, any> = {};

vi.mock('./indexedDbAccess', () => ({
  getDb: vi.fn(async () => ({
    objectStoreNames: {
      contains: (name: string) =>
        ['sessions', 'session_metadata', 'files', 'multimodal_embeddings', 'keyValueStore'].includes(name),
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
              update: (newVal: any) => {
                records[k] = newVal;
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

      const sessionStore = {
        get: (id: string) => {
          const req: any = { onsuccess: null, onerror: null, result: mockSessions[id] };
          setTimeout(() => req.onsuccess && req.onsuccess({ target: req }), 0);
          return req;
        },
        put: (val: any) => {
          mockSessions[val.id] = val;
        },
        delete: (id: string) => {
          delete mockSessions[id];
        },
        clear: () => {
          mockSessions = {};
        },
        openCursor: () => createCursorReq(mockSessions),
      };

      const metaStore = {
        put: (val: any) => {
          mockMetadata[val.id] = val;
        },
        delete: (id: string) => {
          delete mockMetadata[id];
        },
        clear: () => {
          mockMetadata = {};
        },
        openCursor: () => createCursorReq(mockMetadata),
      };

      const fileStore = {
        put: (val: any) => {
          mockFiles[val.id] = val;
        },
        delete: (id: string) => {
          delete mockFiles[id];
        },
        clear: () => {
          mockFiles = {};
        },
        index: (_indexName: string) => ({
          openCursor: (_range?: any) => {
            const req: any = { onsuccess: null, onerror: null, result: null };
            setTimeout(() => {
              if (req.onsuccess) req.onsuccess({ target: req });
            }, 0);
            return req;
          },
        }),
      };

      const embeddingsStore = {
        delete: (id: string) => {
          delete mockEmbeddings[id];
        },
        openCursor: () => createCursorReq(mockEmbeddings),
      };

      const kvStore = {
        delete: (key: string) => {
          delete mockKv[key];
        },
      };

      return {
        objectStore: (name: string) => {
          if (name === 'sessions') return sessionStore;
          if (name === 'session_metadata') return metaStore;
          if (name === 'multimodal_embeddings') return embeddingsStore;
          if (name === 'keyValueStore') return kvStore;
          return fileStore;
        },
      };
    },
  })),
  withWriteLock: vi.fn(async (fn: () => Promise<any>) => fn()),
  transactionToPromise: vi.fn(async () => undefined),
  getAll: vi.fn(async () => []),
  getItem: vi.fn(async () => undefined),
}));

describe('sessionRecords.deleteFilesFromSessions', () => {
  beforeEach(() => {
    mockSessions = {
      'session-1': {
        id: 'session-1',
        title: 'Chat 1',
        timestamp: 1000,
        settings: {} as any,
        messages: [
          {
            id: 'msg-1',
            role: 'user',
            content: 'hello with files',
            timestamp: new Date(),
            files: [
              { id: 'f-1', name: 'a.png', type: 'image/png', size: 10 },
              { id: 'f-2', name: 'b.pdf', type: 'application/pdf', size: 20 },
            ],
          },
        ],
      },
    };
    mockFiles = {
      'f-1': { id: 'f-1', rawFile: new Blob(['f1']) },
      'f-2': { id: 'f-2', rawFile: new Blob(['f2']) },
    };
    mockEmbeddings = {
      'f-1': { id: 'f-1', vector: [0.1] },
      'f-2': { id: 'f-2', vector: [0.2] },
    };
  });

  it('removes target file ids from sessions and deletes blobs from files store and embeddings store', async () => {
    await deleteFilesFromSessions(['f-1']);

    const session = mockSessions['session-1'];
    expect(session.messages[0].files).toHaveLength(1);
    expect(session.messages[0].files?.[0].id).toBe('f-2');
    expect(mockFiles['f-1']).toBeUndefined();
    expect(mockFiles['f-2']).toBeDefined();
    expect(mockEmbeddings['f-1']).toBeUndefined();
    expect(mockEmbeddings['f-2']).toBeDefined();
  });

  it('sets files to undefined when all files in message are removed', async () => {
    await deleteFilesFromSessions(['f-1', 'f-2']);

    const session = mockSessions['session-1'];
    expect(session.messages[0].files).toBeUndefined();
    expect(mockFiles['f-1']).toBeUndefined();
    expect(mockFiles['f-2']).toBeUndefined();
    expect(mockEmbeddings['f-1']).toBeUndefined();
    expect(mockEmbeddings['f-2']).toBeUndefined();
  });

  it('removes deleted attachments from inactive variants without changing other variant files', async () => {
    const original = mockSessions['session-1'].messages[0];
    mockSessions['session-1'].messages = [
      {
        ...original,
        id: 'current',
        files: undefined,
        variants: [{ ...original, id: 'old' }],
        currentVariantIndex: 0,
      },
    ];
    await deleteFilesFromSessions(['f-1']);
    expect(mockSessions['session-1'].messages[0].variants?.[0].files?.map(({ id }) => id)).toEqual(['f-2']);
    expect(mockFiles['f-1']).toBeUndefined();
    expect(mockFiles['f-2']).toBeDefined();
  });

  it('bails out early if fileIds is empty', async () => {
    await deleteFilesFromSessions([]);
    expect(mockFiles['f-1']).toBeDefined();
    expect(mockEmbeddings['f-1']).toBeDefined();
  });
});

describe('sessionRecords dual-write and metadata storage', () => {
  beforeEach(() => {
    mockSessions = {};
    mockMetadata = {};
    mockFiles = {};
    mockEmbeddings = {};
  });

  it('dual-populates both sessions and session_metadata on setAllSessions', async () => {
    const { setAllSessions } = await import('./sessionRecords');

    const sessionsToSet: SavedChatSession[] = [
      {
        id: 'sess-set',
        title: 'Batch Set',
        timestamp: 100,
        settings: {} as any,
        messages: [{ id: 'm1', role: 'user', content: 'test msg', timestamp: new Date() }],
      },
    ];

    await setAllSessions(sessionsToSet);

    expect(mockSessions['sess-set']).toBeDefined();
    expect(mockSessions['sess-set'].messages).toHaveLength(1);
    expect(mockMetadata['sess-set']).toBeDefined();
    expect(mockMetadata['sess-set'].messages).toEqual([]);
  });

  it('dual-writes full session to sessions and metadata-only to session_metadata on saveSession', async () => {
    const { saveSession } = await import('./sessionRecords');

    const sessionToSave: SavedChatSession = {
      id: 'sess-dual',
      title: 'Dual Session',
      timestamp: 1234,
      settings: { modelId: 'test-model' } as any,
      messages: [{ id: 'm1', role: 'user', content: 'heavy body', timestamp: new Date() }],
    };

    await saveSession(sessionToSave);

    const savedInFull = mockSessions['sess-dual'];
    const savedInMeta = mockMetadata['sess-dual'];

    expect(savedInFull).toBeDefined();
    expect(savedInFull.messages).toHaveLength(1);

    expect(savedInMeta).toBeDefined();
    expect(savedInMeta.title).toBe('Dual Session');
    expect(savedInMeta.messages).toEqual([]);
  });

  it('dual-deletes from both sessions and session_metadata on deleteSession', async () => {
    const { deleteSession } = await import('./sessionRecords');

    mockSessions['sess-delete'] = { id: 'sess-delete', title: 'Del', timestamp: 1, settings: {} as any, messages: [] };
    mockMetadata['sess-delete'] = { id: 'sess-delete', title: 'Del', timestamp: 1, settings: {} as any, messages: [] };

    await deleteSession('sess-delete');

    expect(mockSessions['sess-delete']).toBeUndefined();
    expect(mockMetadata['sess-delete']).toBeUndefined();
  });

  it('reads lightweight metadata directly from session_metadata in getAllSessionMetadata', async () => {
    const { getAllSessionMetadata } = await import('./sessionRecords');

    mockMetadata['s1'] = { id: 's1', title: 'From Meta Store', timestamp: 100, settings: {} as any, messages: [] };

    const results = await getAllSessionMetadata();
    expect(results).toHaveLength(1);
    expect(results[0].title).toBe('From Meta Store');
    expect(results[0].messages).toEqual([]);
  });

  it('falls back to sessions store if session_metadata is empty', async () => {
    const { getAllSessionMetadata } = await import('./sessionRecords');

    mockSessions['s-fallback'] = {
      id: 's-fallback',
      title: 'Fallback Title',
      timestamp: 200,
      settings: {} as any,
      messages: [{ id: 'm1', role: 'user', content: 'test', timestamp: new Date() }],
    };

    const results = await getAllSessionMetadata();
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe('s-fallback');
    expect(results[0].title).toBe('Fallback Title');
    expect(results[0].messages).toEqual([]);
  });

  it('updates session_metadata and preserves full sessions messages on saveSessionMetadata', async () => {
    const { saveSessionMetadata } = await import('./sessionRecords');

    // Existing full session with messages
    mockSessions['s-meta'] = {
      id: 's-meta',
      title: 'Old Title',
      timestamp: 100,
      settings: {} as any,
      messages: [{ id: 'm1', role: 'user', content: 'Preserve me', timestamp: new Date() }],
    };
    mockMetadata['s-meta'] = {
      id: 's-meta',
      title: 'Old Title',
      timestamp: 100,
      settings: {} as any,
      messages: [],
    };

    // Metadata update (e.g. title rename, sort order change)
    await saveSessionMetadata({
      id: 's-meta',
      title: 'New Title',
      sortOrder: 42,
      timestamp: 100,
      settings: {} as any,
      messages: [],
    });

    expect(mockMetadata['s-meta'].title).toBe('New Title');
    expect(mockMetadata['s-meta'].sortOrder).toBe(42);
    expect(mockMetadata['s-meta'].messages).toEqual([]);

    expect(mockSessions['s-meta'].title).toBe('New Title');
    expect(mockSessions['s-meta'].sortOrder).toBe(42);
    expect(mockSessions['s-meta'].messages).toHaveLength(1);
    expect(mockSessions['s-meta'].messages[0].content).toBe('Preserve me');
  });

  it('batch updates multiple sessions via saveManySessionMetadata', async () => {
    const { saveManySessionMetadata } = await import('./sessionRecords');

    mockSessions['s-batch-1'] = {
      id: 's-batch-1',
      title: 'T1',
      timestamp: 1,
      settings: {} as any,
      messages: [{ id: 'm1', role: 'user', content: 'c1', timestamp: new Date() }],
    };
    mockSessions['s-batch-2'] = {
      id: 's-batch-2',
      title: 'T2',
      timestamp: 2,
      settings: {} as any,
      messages: [{ id: 'm2', role: 'user', content: 'c2', timestamp: new Date() }],
    };

    await saveManySessionMetadata([
      { id: 's-batch-1', title: 'T1-Updated', timestamp: 1, settings: {} as any, messages: [] },
      { id: 's-batch-2', title: 'T2-Updated', timestamp: 2, settings: {} as any, messages: [] },
    ]);

    expect(mockMetadata['s-batch-1'].title).toBe('T1-Updated');
    expect(mockMetadata['s-batch-2'].title).toBe('T2-Updated');
    expect(mockSessions['s-batch-1'].messages).toHaveLength(1);
    expect(mockSessions['s-batch-2'].messages).toHaveLength(1);
  });
});
