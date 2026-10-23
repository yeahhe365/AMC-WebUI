import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Blob as NodeBlob } from 'node:buffer';
import type { LibraryItem } from '@/types';
import { FILES_STORE, KEY_VALUE_STORE } from './dbSchema';
import { clearStore, getAll, getItem } from './indexedDbAccess';
import {
  addDeletedLibraryFileIds,
  addStandaloneLibraryFiles,
  deleteStandaloneLibraryFiles,
  getDeletedLibraryFileIds,
  getStandaloneLibraryFiles,
  renameStandaloneLibraryFile,
  saveStandaloneLibraryFiles,
} from './libraryRecords';

const file = (id: string): LibraryItem => ({
  id,
  name: `${id}.txt`,
  type: 'text/plain',
  size: 1,
  timestamp: 1,
  source: 'uploaded',
  rawFile: new Blob([id], { type: 'text/plain' }),
  isStandalone: true,
});

describe.each([false, true])('atomic library updates (Web Locks: %s)', (withLocks) => {
  beforeEach(async () => {
    // Use a native Blob so fake-indexeddb's Node structuredClone preserves it.
    vi.stubGlobal('Blob', NodeBlob);
    if (withLocks) {
      let pending = Promise.resolve();
      vi.stubGlobal('navigator', {
        locks: {
          request: (_name: string, _options: unknown, callback: () => Promise<void>) => {
            const next = pending.then(callback);
            pending = next.catch(() => {});
            return next;
          },
        },
      });
    } else {
      vi.stubGlobal('navigator', {});
    }
    await clearStore(KEY_VALUE_STORE);
    await clearStore(FILES_STORE);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('retains simultaneous uploads in metadata and the payload store', async () => {
    await Promise.all([addStandaloneLibraryFiles([file('a')]), addStandaloneLibraryFiles([file('b')])]);
    expect((await getStandaloneLibraryFiles()).map(({ id }) => id).sort()).toEqual(['a', 'b']);
    expect((await getAll<{ id: string }>(FILES_STORE)).map(({ id }) => id).sort()).toEqual(['a', 'b']);
    expect((await getItem<{ rawFile: Blob }>(FILES_STORE, 'a'))?.rawFile).toBeInstanceOf(Blob);
  });

  it('does not resurrect a deleted file when another file is renamed concurrently', async () => {
    await saveStandaloneLibraryFiles([file('a'), file('b')]);
    await Promise.all([deleteStandaloneLibraryFiles(['a']), renameStandaloneLibraryFile('b', 'renamed.txt')]);
    expect((await getStandaloneLibraryFiles()).map(({ id, name }) => ({ id, name }))).toEqual([
      { id: 'b', name: 'renamed.txt' },
    ]);
    expect(await getItem(FILES_STORE, 'a')).toBeUndefined();
    expect(await getItem(FILES_STORE, 'b')).toMatchObject({ name: 'renamed.txt' });
  });

  it('retains concurrent tombstones', async () => {
    await Promise.all([addDeletedLibraryFileIds(['a']), addDeletedLibraryFileIds(['b'])]);
    expect((await getDeletedLibraryFileIds()).sort()).toEqual(['a', 'b']);
  });
});
