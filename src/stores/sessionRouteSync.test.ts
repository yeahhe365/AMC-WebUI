import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ACTIVE_CHAT_SESSION_ID_KEY } from '@/constants/storageKeys';
import { syncActiveSessionRoute } from './sessionRouteSync';

describe('syncActiveSessionRoute', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    sessionStorage.clear();
    window.history.replaceState({}, '', '/');
  });

  it('stores the active session and pushes a chat route for a new active session', () => {
    const pushStateSpy = vi.spyOn(window.history, 'pushState');
    const replaceStateSpy = vi.spyOn(window.history, 'replaceState');

    syncActiveSessionRoute('sess-1', 'auto');

    expect(sessionStorage.getItem(ACTIVE_CHAT_SESSION_ID_KEY)).toBe('sess-1');
    expect(pushStateSpy).toHaveBeenCalledWith({ sessionId: 'sess-1' }, '', '/chat/sess-1');
    expect(replaceStateSpy).not.toHaveBeenCalledWith({ sessionId: 'sess-1' }, '', '/chat/sess-1');
  });

  it('replaces the route when switching between chat routes in auto mode', () => {
    window.history.replaceState({}, '', '/chat/sess-1');
    const pushStateSpy = vi.spyOn(window.history, 'pushState');
    const replaceStateSpy = vi.spyOn(window.history, 'replaceState');

    syncActiveSessionRoute('sess-2', 'auto');

    expect(replaceStateSpy).toHaveBeenCalledWith({ sessionId: 'sess-2' }, '', '/chat/sess-2');
    expect(pushStateSpy).not.toHaveBeenCalledWith({ sessionId: 'sess-2' }, '', '/chat/sess-2');
  });

  it('updates session storage without touching browser history when history mode is none', () => {
    const pushStateSpy = vi.spyOn(window.history, 'pushState');
    const replaceStateSpy = vi.spyOn(window.history, 'replaceState');

    syncActiveSessionRoute('sess-3', 'none');

    expect(sessionStorage.getItem(ACTIVE_CHAT_SESSION_ID_KEY)).toBe('sess-3');
    expect(pushStateSpy).not.toHaveBeenCalled();
    expect(replaceStateSpy).not.toHaveBeenCalled();
  });

  it('preserves /library route when syncActiveSessionRoute is called without force flag', () => {
    window.history.replaceState({}, '', '/library');
    const pushStateSpy = vi.spyOn(window.history, 'pushState');
    const replaceStateSpy = vi.spyOn(window.history, 'replaceState');

    syncActiveSessionRoute('sess-1', 'auto');

    expect(sessionStorage.getItem(ACTIVE_CHAT_SESSION_ID_KEY)).toBe('sess-1');
    expect(pushStateSpy).not.toHaveBeenCalled();
    expect(replaceStateSpy).not.toHaveBeenCalled();
  });

  it('updates route when force flag is set even on /library', () => {
    window.history.replaceState({}, '', '/library');
    const pushStateSpy = vi.spyOn(window.history, 'pushState');

    syncActiveSessionRoute('sess-1', 'push', { force: true });

    expect(sessionStorage.getItem(ACTIVE_CHAT_SESSION_ID_KEY)).toBe('sess-1');
    expect(pushStateSpy).toHaveBeenCalledWith({ sessionId: 'sess-1' }, '', '/chat/sess-1');
  });
});

describe('syncLibraryRoute', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    window.history.replaceState({}, '', '/');
  });

  it('pushes /library route when called with push or auto mode', async () => {
    const { syncLibraryRoute } = await import('./sessionRouteSync');
    const pushStateSpy = vi.spyOn(window.history, 'pushState');

    syncLibraryRoute('push');

    expect(pushStateSpy).toHaveBeenCalledWith({ view: 'library' }, '', '/library');
  });

  it('does nothing when history mode is none', async () => {
    const { syncLibraryRoute } = await import('./sessionRouteSync');
    const pushStateSpy = vi.spyOn(window.history, 'pushState');
    const replaceStateSpy = vi.spyOn(window.history, 'replaceState');

    syncLibraryRoute('none');

    expect(pushStateSpy).not.toHaveBeenCalled();
    expect(replaceStateSpy).not.toHaveBeenCalled();
  });
});
