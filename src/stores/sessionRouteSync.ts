import { ACTIVE_CHAT_SESSION_ID_KEY } from '@/constants/storageKeys';

export type SessionHistoryMode = 'auto' | 'push' | 'replace' | 'none';

type ActiveViewGetter = () => 'chat' | 'library';
let activeViewGetter: ActiveViewGetter | null = null;

export const registerActiveViewGetter = (getter: ActiveViewGetter) => {
  activeViewGetter = getter;
};

const isCurrentlyLibraryRoute = (): boolean => {
  if (typeof window === 'undefined') {
    return false;
  }
  if (window.location.pathname === '/library') {
    if (activeViewGetter) {
      try {
        return activeViewGetter() === 'library';
      } catch {
        return true;
      }
    }
    return true;
  }
  return false;
};

export const syncLibraryRoute = (historyMode: SessionHistoryMode = 'auto') => {
  if (historyMode === 'none' || typeof window === 'undefined') {
    return;
  }

  const targetPath = '/library';
  try {
    if (window.location.pathname !== targetPath) {
      const method = historyMode === 'push' ? 'pushState' : historyMode === 'replace' ? 'replaceState' : 'pushState';
      window.history[method]({ view: 'library' }, '', targetPath);
    }
  } catch {
    // Ignore history sync failures.
  }
};

export const syncActiveSessionRoute = (
  activeSessionId: string | null,
  historyMode: SessionHistoryMode = 'auto',
  options?: { force?: boolean },
) => {
  if (typeof window === 'undefined') {
    return;
  }

  if (activeSessionId) {
    try {
      sessionStorage.setItem(ACTIVE_CHAT_SESSION_ID_KEY, activeSessionId);
    } catch {
      // Ignore sessionStorage sync failures.
    }

    if (historyMode === 'none') {
      return;
    }

    if (!options?.force && isCurrentlyLibraryRoute()) {
      return;
    }

    const targetPath = `/chat/${activeSessionId}`;
    try {
      if (window.location.pathname !== targetPath) {
        const method =
          historyMode === 'push'
            ? 'pushState'
            : historyMode === 'replace'
              ? 'replaceState'
              : window.location.pathname.startsWith('/chat/')
                ? 'replaceState'
                : 'pushState';
        window.history[method]({ sessionId: activeSessionId }, '', targetPath);
      }
    } catch {
      // Ignore history sync failures.
    }
    return;
  }

  try {
    sessionStorage.removeItem(ACTIVE_CHAT_SESSION_ID_KEY);
  } catch {
    // Ignore sessionStorage sync failures.
  }

  if (historyMode === 'none') {
    return;
  }

  if (!options?.force && isCurrentlyLibraryRoute()) {
    return;
  }

  try {
    if (window.location.pathname !== '/') {
      const method = historyMode === 'replace' ? 'replaceState' : 'pushState';
      window.history[method]({}, '', '/');
    }
  } catch {
    // Ignore history sync failures.
  }
};
