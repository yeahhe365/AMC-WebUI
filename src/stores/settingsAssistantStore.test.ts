import { beforeEach, describe, expect, it } from 'vitest';
import { useSettingsAssistantStore } from './settingsAssistantStore';

describe('settingsAssistantStore', () => {
  beforeEach(() => {
    useSettingsAssistantStore.setState({ status: 'idle', items: [], pendingKeyRequest: null });
  });

  it('appends items in order', () => {
    const store = useSettingsAssistantStore.getState();
    store.appendItem({ kind: 'user', id: 'u1', text: 'hi' });
    store.appendItem({ kind: 'assistant', id: 'a1', text: 'ok' });

    expect(useSettingsAssistantStore.getState().items.map((item) => item.id)).toEqual(['u1', 'a1']);
  });

  it('patches a tool item in place', () => {
    const store = useSettingsAssistantStore.getState();
    store.appendItem({ kind: 'tool', id: 't1', name: 'create_connection', status: 'running', detail: null });
    store.updateToolItem('t1', { status: 'done', detail: 'created' });

    const item = useSettingsAssistantStore.getState().items[0];
    expect(item).toMatchObject({ kind: 'tool', status: 'done', detail: 'created' });
  });

  it('resolves the key request with the submitted key and returns to running', async () => {
    const store = useSettingsAssistantStore.getState();
    const pending = store.requestApiKey({ connectionId: 'c1', connectionName: 'DeepSeek' });

    expect(useSettingsAssistantStore.getState().status).toBe('awaiting-key');
    expect(useSettingsAssistantStore.getState().items[0]).toMatchObject({
      kind: 'key-request',
      connectionId: 'c1',
      connectionName: 'DeepSeek',
    });

    useSettingsAssistantStore.getState().submitApiKey('sk-typed');

    await expect(pending).resolves.toBe('sk-typed');
    expect(useSettingsAssistantStore.getState().pendingKeyRequest).toBeNull();
    expect(useSettingsAssistantStore.getState().status).toBe('running');
  });

  it('resolves the key request with null on cancel', async () => {
    const store = useSettingsAssistantStore.getState();
    const pending = store.requestApiKey({ connectionId: 'c1', connectionName: 'DeepSeek' });
    useSettingsAssistantStore.getState().cancelApiKey();

    await expect(pending).resolves.toBeNull();
    expect(useSettingsAssistantStore.getState().pendingKeyRequest).toBeNull();
  });

  it('reset cancels an in-flight key request so no await dangles', async () => {
    const store = useSettingsAssistantStore.getState();
    const pending = store.requestApiKey({ connectionId: 'c1', connectionName: 'DeepSeek' });
    useSettingsAssistantStore.getState().reset();

    await expect(pending).resolves.toBeNull();
    expect(useSettingsAssistantStore.getState().items).toEqual([]);
    expect(useSettingsAssistantStore.getState().status).toBe('idle');
  });
});
