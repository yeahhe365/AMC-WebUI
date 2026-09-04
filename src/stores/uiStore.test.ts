import { beforeEach, describe, expect, it, vi } from 'vitest';

const UI_PREFERENCES_STORAGE_KEY = 'all_model_chat_ui_preferences_v1';
const LEGACY_HISTORY_SIDEBAR_STORAGE_KEY = 'all_model_chat_history_sidebar_v1';

const setViewportWidth = (width: number) => {
  Object.defineProperty(window, 'innerWidth', {
    configurable: true,
    value: width,
    writable: true,
  });
};

const importFreshUIStore = async () => {
  vi.resetModules();
  return import('./uiStore');
};

describe('uiStore history sidebar preferences', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('hydrates the current sidebar state from the desktop preference', async () => {
    localStorage.setItem(LEGACY_HISTORY_SIDEBAR_STORAGE_KEY, JSON.stringify({ desktopOpen: false, mobileOpen: true }));
    setViewportWidth(1024);

    const { useUIStore } = await importFreshUIStore();

    expect(useUIStore.getState().isHistorySidebarOpen).toBe(false);
    expect(useUIStore.getState().desktopHistorySidebarOpen).toBe(false);
    expect(useUIStore.getState().mobileHistorySidebarOpen).toBe(true);
  });

  it('hydrates the current sidebar state from the mobile preference', async () => {
    localStorage.setItem(LEGACY_HISTORY_SIDEBAR_STORAGE_KEY, JSON.stringify({ desktopOpen: true, mobileOpen: true }));
    setViewportWidth(375);

    const { useUIStore } = await importFreshUIStore();

    expect(useUIStore.getState().isHistorySidebarOpen).toBe(true);
    expect(useUIStore.getState().desktopHistorySidebarOpen).toBe(true);
    expect(useUIStore.getState().mobileHistorySidebarOpen).toBe(true);
  });

  it('persists only the current viewport preference when the user toggles the sidebar', async () => {
    setViewportWidth(1024);
    const { useUIStore } = await importFreshUIStore();

    useUIStore.setState({
      isHistorySidebarOpen: true,
      desktopHistorySidebarOpen: true,
      mobileHistorySidebarOpen: false,
    });

    useUIStore.getState().setIsHistorySidebarOpen(false);

    expect(useUIStore.getState().isHistorySidebarOpen).toBe(false);
    expect(useUIStore.getState().desktopHistorySidebarOpen).toBe(false);
    expect(useUIStore.getState().mobileHistorySidebarOpen).toBe(false);
    expect(JSON.parse(localStorage.getItem(UI_PREFERENCES_STORAGE_KEY) || '{}').state).toEqual({
      desktopHistorySidebarOpen: false,
      mobileHistorySidebarOpen: false,
      historyDisplayMode: 'group',
    });
  });

  it('does not overwrite remembered preferences when the sidebar is changed transiently', async () => {
    setViewportWidth(1024);
    const { useUIStore } = await importFreshUIStore();

    useUIStore.setState({
      isHistorySidebarOpen: true,
      desktopHistorySidebarOpen: true,
      mobileHistorySidebarOpen: false,
    });
    localStorage.clear();

    useUIStore.getState().setIsHistorySidebarOpenTransient(false);

    expect(useUIStore.getState().isHistorySidebarOpen).toBe(false);
    expect(useUIStore.getState().desktopHistorySidebarOpen).toBe(true);
    expect(useUIStore.getState().mobileHistorySidebarOpen).toBe(false);
    expect(JSON.parse(localStorage.getItem(UI_PREFERENCES_STORAGE_KEY) || '{}').state).toEqual({
      desktopHistorySidebarOpen: true,
      mobileHistorySidebarOpen: false,
      historyDisplayMode: 'group',
    });

    useUIStore.getState().syncHistorySidebarForViewport();

    expect(useUIStore.getState().isHistorySidebarOpen).toBe(true);
  });
});
