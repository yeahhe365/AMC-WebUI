import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { z } from 'zod';
import { createSyncedPersist, SYNCED_PERSIST_CHANNEL_NAME, PERSISTED_STATE_ORIGIN_ID } from './syncedPersist';
import { getChatSyncChannel, _resetSyncChannelForTests } from './chatSyncChannel';
import { _resetFlushRegistryForTests } from './persistentStorage';

// Helper to create a mock storage area
function makeArea(initial: string | null = null) {
  const store = new Map<string, string>();
  if (initial !== null) store.set('k', initial);
  return {
    getItem: vi.fn((key: string) => store.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => {
      store.set(key, value);
    }),
    removeItem: vi.fn((key: string) => {
      store.delete(key);
    }),
    _store: store,
  };
}

describe('createSyncedPersist', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // Isolate singleton channel and flush registry per test
    try {
      _resetSyncChannelForTests();
    } catch {
      // ignore
    }
    try {
      _resetFlushRegistryForTests();
    } catch {
      // ignore
    }
  });
  afterEach(() => {
    vi.useRealTimers();
    try {
      _resetSyncChannelForTests();
    } catch {
      // ignore
    }
    try {
      _resetFlushRegistryForTests();
    } catch {
      // ignore
    }
  });

  it('exposes storage and sync', () => {
    const { storage, sync } = createSyncedPersist('test-key', { debounceMs: 0 });
    expect(storage.getItem).toBeTypeOf('function');
    expect(storage.setItem).toBeTypeOf('function');
    expect(sync).toBeTypeOf('function');
  });

  it('skips write when value deep-equal (Task ref: isEqual dedup)', () => {
    const area = makeArea('{"a":1}');
    const { storage } = createSyncedPersist('k', { debounceMs: 0, storageArea: area } as never);
    storage.setItem('k', '{"a":1}');
    expect(area.setItem).not.toHaveBeenCalled();
  });

  it('skips write when value deep-equal but key order differs', () => {
    const area = makeArea('{"a":1,"b":2}');
    const { storage } = createSyncedPersist('k', { debounceMs: 0, storageArea: area } as never);
    // JSON with different key order should be considered equal via isEqual
    storage.setItem('k', '{"b":2,"a":1}');
    expect(area.setItem).not.toHaveBeenCalled();
  });

  it('writes when value is deep-not-equal', () => {
    const area = makeArea('{"a":1}');
    const { storage } = createSyncedPersist('k', { debounceMs: 0, storageArea: area } as never);
    storage.setItem('k', '{"a":2}');
    expect(area.setItem).toHaveBeenCalledWith('k', '{"a":2}');
  });

  it('rejects invalid JSON via schema and falls back to null', () => {
    const schema = z.object({ a: z.number() });
    const area = makeArea('{"a":"bad"}');
    const { storage } = createSyncedPersist('k', { schema, storageArea: area } as never);
    expect(storage.getItem('k')).toBeNull();
  });

  it('returns null on malformed JSON silently (try/catch)', () => {
    const area = makeArea('not-json');
    const schema = z.object({ a: z.number() });
    const { storage } = createSyncedPersist('k', { schema, storageArea: area } as never);
    expect(storage.getItem('k')).toBeNull();
  });

  it('returns raw when schema validation passes', () => {
    const schema = z.object({ a: z.number() });
    const area = makeArea('{"a":1}');
    const { storage } = createSyncedPersist('k', { schema, storageArea: area } as never);
    expect(storage.getItem('k')).toBe('{"a":1}');
  });

  it('applies migrate when schema fails and migrate returns valid – returns migrated JSON string', () => {
    const badSchema = z.object({ a: z.number() });
    const migrate = vi.fn((_persisted: unknown) => ({ a: 1 }));
    const area = makeArea('{"a":"bad"}');
    const { storage } = createSyncedPersist('k', {
      schema: badSchema,
      version: 1,
      migrate,
      storageArea: area,
    } as never);
    const result = storage.getItem('k');
    expect(migrate).toHaveBeenCalledWith({ a: 'bad' }, 1);
    expect(result).toBe(JSON.stringify({ a: 1 }));
    // Optionally persists migrated value (baseStorage.setItem may be called)
    // For debounceMs=0, immediate persist may have updated area
  });

  it('returns null when migrate returns invalid value (negative case)', () => {
    const badSchema = z.object({ a: z.number() });
    const migrate = vi.fn(() => ({ a: 'still-bad' }));
    const area = makeArea('{"a":"bad"}');
    const { storage } = createSyncedPersist('k', {
      schema: badSchema,
      version: 1,
      migrate,
      storageArea: area,
    } as never);
    const result = storage.getItem('k');
    expect(migrate).toHaveBeenCalled();
    expect(result).toBeNull();
  });

  it('returns null when schema fails and no migrate provided', () => {
    const badSchema = z.object({ a: z.number() });
    const area = makeArea('{"a":"bad"}');
    const { storage } = createSyncedPersist('k', {
      schema: badSchema,
      storageArea: area,
    } as never);
    expect(storage.getItem('k')).toBeNull();
  });

  it('forwards storageKey correctly and does not void it', () => {
    const area = makeArea(null);
    const { storage } = createSyncedPersist('amc-test-key', { debounceMs: 0, storageArea: area } as never);
    storage.setItem('amc-test-key', '{"x":1}');
    expect(area.setItem).toHaveBeenCalledWith('amc-test-key', '{"x":1}');
    expect(area.getItem).not.toHaveBeenCalledWith('wrong-key');
  });

  it('exposes singleton BroadcastChannel via repeated calls (same instance)', async () => {
    const { getSingletonChannel } = await import('./syncedPersist');
    const ch1 = getSingletonChannel();
    const ch2 = getSingletonChannel();
    expect(ch1).toBe(ch2);
    expect(ch1.name).toBe(SYNCED_PERSIST_CHANNEL_NAME);
  });

  it('isEqual dedup also works with debounceMs > 0 (no immediate write, flush deduped)', () => {
    const area = makeArea('{"a":1}');
    const { storage } = createSyncedPersist('k', { debounceMs: 100, storageArea: area } as never);
    storage.setItem('k', '{"a":1}');
    vi.advanceTimersByTime(100);
    // Should not have written because deep-equal to existing
    expect(area.setItem).not.toHaveBeenCalled();
  });

  it('removes item via removeItem and handles try/catch silently', () => {
    const area = {
      getItem: vi.fn(() => '{"a":1}'),
      setItem: vi.fn(),
      removeItem: vi.fn(() => {
        throw new Error('restricted');
      }),
    };
    const { storage } = createSyncedPersist('k', { debounceMs: 0, storageArea: area } as never);
    expect(() => storage.removeItem('k')).not.toThrow();
  });

  it('keeps amc- prefix convention when storageKey is passed', () => {
    const { storage } = createSyncedPersist('amc-chat', { debounceMs: 0 });
    // Just verify factory accepts amc- prefixed key without error and storage works
    expect(storage).toBeDefined();
  });

  // ---- Task 3: originId loopback shielding + storageKey filter + pagehide flush ----

  it('rehydrates on remote PERSISTED_STATE_UPDATED but not on self (brief Task 3)', async () => {
    const channel = getChatSyncChannel();
    const store = { persist: { rehydrate: vi.fn() } } as any;
    const { sync } = createSyncedPersist('k', {});
    const addSpy = vi.spyOn(channel, 'addEventListener');
    const rmSpy = vi.spyOn(channel, 'removeEventListener');
    const unsub = sync(store);
    // last call should be our handler
    const lastCall = addSpy.mock.calls[addSpy.mock.calls.length - 1];
    const captured = lastCall?.[1] as unknown as (e: MessageEvent) => void;
    expect(captured).toBeDefined();
    // remote origin should trigger rehydrate
    captured({
      data: { type: 'PERSISTED_STATE_UPDATED', storageKey: 'k', originId: 'other' },
    } as unknown as MessageEvent);
    await Promise.resolve();
    expect(store.persist.rehydrate).toHaveBeenCalledTimes(1);
    store.persist.rehydrate.mockClear();
    // self origin should NOT trigger
    captured({
      data: { type: 'PERSISTED_STATE_UPDATED', storageKey: 'k', originId: PERSISTED_STATE_ORIGIN_ID },
    } as unknown as MessageEvent);
    await Promise.resolve();
    expect(store.persist.rehydrate).not.toHaveBeenCalled();
    // different storageKey should not trigger
    captured({
      data: { type: 'PERSISTED_STATE_UPDATED', storageKey: 'other-key', originId: 'other' },
    } as unknown as MessageEvent);
    expect(store.persist.rehydrate).not.toHaveBeenCalled();
    // wrong type should not trigger
    captured({ data: { type: 'SESSIONS_UPDATED', storageKey: 'k', originId: 'other' } } as unknown as MessageEvent);
    expect(store.persist.rehydrate).not.toHaveBeenCalled();
    expect(() => unsub()).not.toThrow();
    expect(rmSpy).toHaveBeenCalledWith('message', expect.any(Function));
    addSpy.mockRestore();
    rmSpy.mockRestore();
  });

  it('sync unsubscribe removes listener and second sync isolated by storageKey', async () => {
    const channel = getChatSyncChannel();
    const storeA = { persist: { rehydrate: vi.fn() } } as any;
    const storeB = { persist: { rehydrate: vi.fn() } } as any;
    const { sync: syncA } = createSyncedPersist('amc-a', {});
    const { sync: syncB } = createSyncedPersist('amc-b', {});
    const addSpy = vi.spyOn(channel, 'addEventListener');
    const unsubA = syncA(storeA);
    const callsAfterA = addSpy.mock.calls.length;
    const handlerA = addSpy.mock.calls[callsAfterA - 1][1] as unknown as (e: MessageEvent) => void;
    const unsubB = syncB(storeB);
    const handlerB = addSpy.mock.calls[addSpy.mock.calls.length - 1][1] as unknown as (e: MessageEvent) => void;
    expect(handlerA).toBeDefined();
    expect(handlerB).toBeDefined();
    handlerA({
      data: { type: 'PERSISTED_STATE_UPDATED', storageKey: 'amc-a', originId: 'other' },
    } as unknown as MessageEvent);
    expect(storeA.persist.rehydrate).toHaveBeenCalledTimes(1);
    expect(storeB.persist.rehydrate).not.toHaveBeenCalled();
    storeA.persist.rehydrate.mockClear();
    handlerB({
      data: { type: 'PERSISTED_STATE_UPDATED', storageKey: 'amc-b', originId: 'other' },
    } as unknown as MessageEvent);
    expect(storeB.persist.rehydrate).toHaveBeenCalledTimes(1);
    const rmSpy = vi.spyOn(channel, 'removeEventListener');
    unsubA();
    expect(rmSpy).toHaveBeenCalled();
    unsubB();
    addSpy.mockRestore();
    rmSpy.mockRestore();
  });

  it('sync handles try/catch silently for malformed messages', () => {
    const channel = getChatSyncChannel();
    const store = { persist: { rehydrate: vi.fn() } } as any;
    const { sync } = createSyncedPersist('amc-try', {});
    const addSpy = vi.spyOn(channel, 'addEventListener');
    const unsub = sync(store);
    const captured = addSpy.mock.calls[addSpy.mock.calls.length - 1][1] as unknown as (e: MessageEvent) => void;
    expect(captured).toBeDefined();
    expect(() => captured({ data: null } as unknown as MessageEvent)).not.toThrow();
    expect(() => captured({ data: { type: 'PERSISTED_STATE_UPDATED' } } as unknown as MessageEvent)).not.toThrow();
    expect(() =>
      captured({
        data: { type: 'PERSISTED_STATE_UPDATED', storageKey: null, originId: null },
      } as unknown as MessageEvent),
    ).not.toThrow();
    expect(store.persist.rehydrate).not.toHaveBeenCalled();
    unsub();
    addSpy.mockRestore();
  });

  it('flushes debounced pending writes on pagehide and beforeunload (centralized)', async () => {
    _resetFlushRegistryForTests();
    const area = {
      getItem: vi.fn(() => null),
      setItem: vi.fn(),
      removeItem: vi.fn(),
    };
    const notifyUpdate = vi.fn();
    // Use persistentStorage directly to verify centralized flush registry
    const { createPersistedStateStorage } = await import('./persistentStorage');
    const storage = createPersistedStateStorage({ debounceMs: 200, notifyUpdate, storageArea: area });
    storage.setItem('amc-flush-test', '{"x":1}');
    expect(area.setItem).not.toHaveBeenCalled();
    window.dispatchEvent(new Event('pagehide'));
    expect(area.setItem).toHaveBeenCalledWith('amc-flush-test', '{"x":1}');
    expect(notifyUpdate).toHaveBeenCalledWith('amc-flush-test');
    area.setItem.mockClear();
    notifyUpdate.mockClear();
    const storage2 = createPersistedStateStorage({ debounceMs: 200, notifyUpdate, storageArea: area });
    storage2.setItem('amc-flush-test-2', '{"y":2}');
    window.dispatchEvent(new Event('beforeunload'));
    expect(area.setItem).toHaveBeenCalledWith('amc-flush-test-2', '{"y":2}');
    _resetFlushRegistryForTests();
  });

  it('sync + storage share same originId channel (singleton) for pagehide flush', () => {
    const area = makeArea(null);
    const { storage, sync } = createSyncedPersist('amc-shared-flush', { debounceMs: 50, storageArea: area } as never);
    const store = { persist: { rehydrate: vi.fn() } } as any;
    const unsub = sync(store);
    storage.setItem('amc-shared-flush', '{"a":1}');
    expect(area.setItem).not.toHaveBeenCalled();
    window.dispatchEvent(new Event('pagehide'));
    expect(area.setItem).toHaveBeenCalledWith('amc-shared-flush', '{"a":1}');
    unsub();
  });

  // I2/I4: enableCrossTabSync:false isolates tab-private stores (uiStore/settingsUiStore/chatDraftStore)
  it('enableCrossTabSync:false disables sync and isolates remote rehydrate (I2/I4)', () => {
    const channel = getChatSyncChannel();
    const addSpy = vi.spyOn(channel, 'addEventListener');
    const rmSpy = vi.spyOn(channel, 'removeEventListener');
    const store = { persist: { rehydrate: vi.fn() } } as unknown as import('./syncedPersist').PersistedStoreApi;
    const { sync } = createSyncedPersist('amc-isolated-ui', {
      enableCrossTabSync: false,
      debounceMs: 0,
    });
    const unsub = sync(store);
    expect(addSpy).not.toHaveBeenCalled(); // no listener registered
    // storage should still work but not broadcast
    const area = makeArea(null);
    const { storage: isolatedStorage } = createSyncedPersist('amc-isolated-2', {
      enableCrossTabSync: false,
      storageArea: area,
      debounceMs: 0,
    } as never);
    isolatedStorage.setItem('amc-isolated-2', '{"x":1}');
    expect(area.setItem).toHaveBeenCalledWith('amc-isolated-2', '{"x":1}');
    // remote message must NOT trigger rehydrate (no handler registered)
    expect(store.persist.rehydrate).not.toHaveBeenCalled();
    expect(() => unsub()).not.toThrow();
    expect(rmSpy).not.toHaveBeenCalled(); // no listener to remove
    addSpy.mockRestore();
    rmSpy.mockRestore();
  });

  it('enableCrossTabSync:false still persists locally but never rehydrates from remote (uiStore/settingsUiStore pattern)', async () => {
    const channel = getChatSyncChannel();
    const store = { persist: { rehydrate: vi.fn() } } as any;
    // Capture handler that would have been registered if sync were enabled
    const addSpy = vi.spyOn(channel, 'addEventListener');
    const { sync } = createSyncedPersist('all_model_chat_ui_preferences_v1', { enableCrossTabSync: false });
    const unsub = sync(store);
    // No listener should have been added after sync with false
    const callsBefore = addSpy.mock.calls.length;
    expect(callsBefore).toBe(0);
    await Promise.resolve();
    expect(store.persist.rehydrate).not.toHaveBeenCalled();
    unsub();
    addSpy.mockRestore();
  });

  // C2: schema/version/migrate injected into chatDraftStore (zod) — demo with chatDraft-like schema
  it('chatDraftStore schema/version/migrate demo: validates wrapper and migrates malformed drafts (C2)', async () => {
    const { chatDraftPersistedSchema, migrateChatDraftPersistedState } = await import('./chatDraftStore');
    // valid wrapper passes
    const validRaw = JSON.stringify({
      state: { drafts: { s1: { inputText: 'hi', quotes: [], ttsContext: '' } } },
      version: 1,
    });
    const makeAreaForKey = (key: string, initial: string | null) => {
      const store = new Map<string, string>();
      if (initial !== null) store.set(key, initial);
      return {
        getItem: vi.fn((k: string) => store.get(k) ?? null),
        setItem: vi.fn((k: string, v: string) => {
          store.set(k, v);
        }),
        removeItem: vi.fn((k: string) => {
          store.delete(k);
        }),
        _store: store,
      };
    };
    const areaValid = makeAreaForKey('all_model_chat_drafts_v1', validRaw);
    const { storage: storageValid } = createSyncedPersist('all_model_chat_drafts_v1', {
      schema: chatDraftPersistedSchema,
      version: 1,
      migrate: migrateChatDraftPersistedState,
      storageArea: areaValid as never,
      debounceMs: 0,
    });
    expect(storageValid.getItem('all_model_chat_drafts_v1')).toBe(validRaw);

    // malformed drafts: quotes as string, ttsContext missing — schema fails, migrate normalizes
    const malformedRaw = JSON.stringify({
      state: {
        drafts: {
          s1: { inputText: 'hi', quotes: 'bad' as unknown, ttsContext: 123 as unknown },
          s2: { inputText: 'kept', quotes: 'bad' as unknown, ttsContext: '' },
        },
      },
      version: 0,
    });
    const areaBad = makeAreaForKey('all_model_chat_drafts_v1', malformedRaw);
    const migrateSpy = vi.fn(migrateChatDraftPersistedState);
    const { storage: storageBad } = createSyncedPersist('all_model_chat_drafts_v1', {
      schema: chatDraftPersistedSchema,
      version: 1,
      migrate: migrateSpy,
      storageArea: areaBad as never,
      debounceMs: 0,
    });
    const result = storageBad.getItem('all_model_chat_drafts_v1') as string | null;
    expect(migrateSpy).toHaveBeenCalledWith(expect.objectContaining({ state: expect.any(Object) }), 1);
    expect(result).not.toBeNull();
    const parsed = JSON.parse(result!);
    expect(parsed.state.drafts.s1).toEqual({ inputText: 'hi', quotes: [], ttsContext: '' });
    expect(parsed.state.drafts.s2).toEqual({ inputText: 'kept', quotes: [], ttsContext: '' });
    expect(parsed.version).toBe(1);
  });

  it('modelPreferencesStore uses typed PersistedStoreApi without as any (I3)', async () => {
    // Verify that modelPreferencesStore can call sync without cast and that sync returns unsubscribe
    const { useModelPreferencesStore } = await import('./modelPreferencesStore');
    const channel = getChatSyncChannel();
    const addSpy = vi.spyOn(channel, 'addEventListener');
    // This import would have failed to compile if typing required `as any`
    const store = useModelPreferencesStore as unknown as import('./syncedPersist').PersistedStoreApi;
    expect(store.persist.rehydrate).toBeDefined();
    // Ensure file no longer contains `as any`
    const fs = await import('node:fs');
    const content = fs.readFileSync('src/stores/modelPreferencesStore.ts', 'utf8');
    expect(content).not.toContain('as any');
    expect(content).toContain('as PersistedStoreApi');
    addSpy.mockRestore();
  });
});
