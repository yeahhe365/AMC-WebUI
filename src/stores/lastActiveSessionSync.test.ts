import { afterEach, describe, expect, it, vi } from 'vitest';

import { setupLastActiveSessionSync } from './lastActiveSessionSync';
import { LAST_ACTIVE_CHAT_SESSION_ID_KEY } from '@/constants/storageKeys';
import type { ChatSettings } from '@/types';
import { createChatSettings } from '@/test/data/factories';

interface FakeState {
  activeSessionId: string | null;
  savedSessions: Array<{ id: string; settings: ChatSettings }>;
}

const createFakeStore = () => {
  let listener: ((state: FakeState) => void) | null = null;
  let latestState: FakeState = { activeSessionId: null, savedSessions: [] };

  return {
    store: {
      subscribe: (fn: (state: FakeState) => void) => {
        listener = fn;
        return () => {
          listener = null;
        };
      },
    } as { subscribe: (listener: (state: FakeState) => void) => () => void },
    setState: (next: FakeState) => {
      latestState = next;
      listener?.(next);
    },
    getState: () => latestState,
  };
};

const createFakeSettings = (modelId: string): ChatSettings => createChatSettings({ modelId });

const spyOnStorage = () => ({
  setItemSpy: vi.spyOn(localStorage, 'setItem'),
  removeItemSpy: vi.spyOn(localStorage, 'removeItem'),
});

describe('setupLastActiveSessionSync', () => {
  afterEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('writes the snapshot once on the first active-session change', () => {
    const { setItemSpy } = spyOnStorage();
    const fake = createFakeStore();
    const unsubscribe = setupLastActiveSessionSync(fake.store);

    fake.setState({
      activeSessionId: 'sess-1',
      savedSessions: [{ id: 'sess-1', settings: createFakeSettings('gemini-3-flash-preview') }],
    });

    expect(setItemSpy).toHaveBeenCalledTimes(1);
    expect(setItemSpy).toHaveBeenCalledWith(LAST_ACTIVE_CHAT_SESSION_ID_KEY, expect.stringContaining('sess-1'));
    unsubscribe();
  });

  it('does not write again when the settings object is a new reference with the same values', () => {
    const { setItemSpy } = spyOnStorage();
    const fake = createFakeStore();
    const unsubscribe = setupLastActiveSessionSync(fake.store);
    const settings = createFakeSettings('gemini-3-flash-preview');

    fake.setState({ activeSessionId: 'sess-1', savedSessions: [{ id: 'sess-1', settings }] });
    expect(setItemSpy).toHaveBeenCalledTimes(1);

    // A passive refresh rebuilds the settings object (new reference, identical values).
    fake.setState({
      activeSessionId: 'sess-1',
      savedSessions: [{ id: 'sess-1', settings: createFakeSettings('gemini-3-flash-preview') }],
    });

    expect(setItemSpy).toHaveBeenCalledTimes(1);
    unsubscribe();
  });

  it('writes again when the settings value changes', () => {
    const { setItemSpy } = spyOnStorage();
    const fake = createFakeStore();
    const unsubscribe = setupLastActiveSessionSync(fake.store);

    fake.setState({
      activeSessionId: 'sess-1',
      savedSessions: [{ id: 'sess-1', settings: createFakeSettings('gemini-3-flash-preview') }],
    });
    expect(setItemSpy).toHaveBeenCalledTimes(1);

    fake.setState({
      activeSessionId: 'sess-1',
      savedSessions: [{ id: 'sess-1', settings: createFakeSettings('gemini-3-pro-preview') }],
    });

    expect(setItemSpy).toHaveBeenCalledTimes(2);
    unsubscribe();
  });

  it('clears the stored snapshot when the active session is cleared', () => {
    const { setItemSpy, removeItemSpy } = spyOnStorage();
    const fake = createFakeStore();
    const unsubscribe = setupLastActiveSessionSync(fake.store);

    fake.setState({
      activeSessionId: 'sess-1',
      savedSessions: [{ id: 'sess-1', settings: createFakeSettings('gemini-3-flash-preview') }],
    });
    expect(setItemSpy).toHaveBeenCalledTimes(1);

    fake.setState({ activeSessionId: null, savedSessions: [] });

    expect(removeItemSpy).toHaveBeenCalledWith(LAST_ACTIVE_CHAT_SESSION_ID_KEY);
    unsubscribe();
  });
});
