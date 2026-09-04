import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
vi.unmock('./dbService');
import { createChatSettings } from '@/test/data/factories';

const createSession = () => {
  const rawFile = new Blob(['hello world from indexeddb'], { type: 'text/plain' });

  return {
    id: 'session-1',
    title: 'Stored Session',
    timestamp: 1,
    settings: createChatSettings(),
    messages: [
      {
        id: 'message-1',
        role: 'user' as const,
        content: 'hello',
        timestamp: new Date(0),
        files: [
          {
            id: 'file-1',
            name: 'notes.txt',
            type: 'text/plain',
            size: rawFile.size,
            rawFile,
          },
        ],
      },
    ],
  };
};

describe('dbService estimateAppDataSize', () => {
  beforeEach(async () => {
    localStorage.clear();
    vi.resetModules();

    const { dbService } = await import('./dbService');
    await dbService.clearAllData();
  });

  afterEach(async () => {
    localStorage.clear();
    vi.resetModules();

    const { dbService } = await import('./dbService');
    await dbService.clearAllData();
  });

  it('counts IndexedDB data together with localStorage data', async () => {
    const { dbService } = await import('./dbService');

    localStorage.setItem('chatDraft_session-1', 'local draft');
    await dbService.setAllSessions([createSession()]);
    await dbService.setAllGroups([{ id: 'group-1', title: 'Pinned', timestamp: 1 }]);

    const estimate = await dbService.estimateAppDataSize();

    expect(estimate.localStorageBytes).toBeGreaterThan(0);
    expect(estimate.indexedDbBytes).toBeGreaterThan(0);
    expect(estimate.totalBytes).toBe(estimate.localStorageBytes + estimate.indexedDbBytes);
  });
});
