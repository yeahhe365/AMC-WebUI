import { act, type TouchEvent } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAppUi } from './useAppUi';
import { useUIStore } from '@/stores/uiStore';
import { renderHook } from '@/test/render/renderer';

const createTouchEvent = (target: EventTarget, x: number, y: number): TouchEvent =>
  ({
    target,
    touches: [{ clientX: x, clientY: y }],
    changedTouches: [{ clientX: x, clientY: y }],
  }) as unknown as TouchEvent;

const flushRafCallbacks = () => {
  act(() => {
    vi.runOnlyPendingTimers();
  });
};

describe('useAppUi', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
    window.history.replaceState({}, '', '/');
    Object.defineProperty(window, 'innerWidth', {
      configurable: true,
      value: 375,
      writable: true,
    });
    useUIStore.setState({
      isSettingsModalOpen: false,
      isPreloadedMessagesModalOpen: false,
      isHistorySidebarOpen: false,
      desktopHistorySidebarOpen: true,
      mobileHistorySidebarOpen: false,
      isLogViewerOpen: false,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('does not close the sidebar when a left swipe starts outside the sidebar', () => {
    useUIStore.setState({ isHistorySidebarOpen: true });
    const { result, unmount } = renderHook(() => useAppUi());

    const mainContent = document.createElement('div');
    document.body.appendChild(mainContent);

    act(() => {
      result.current.handleTouchStart(createTouchEvent(mainContent, 240, 12));
      result.current.handleTouchEnd(createTouchEvent(mainContent, 120, 12));
    });

    expect(useUIStore.getState().isHistorySidebarOpen).toBe(true);

    unmount();
  });

  it('closes the sidebar when a left swipe starts inside the sidebar on mobile', () => {
    useUIStore.setState({ isHistorySidebarOpen: true });
    const { result, unmount } = renderHook(() => useAppUi());

    const sidebar = document.createElement('aside');
    sidebar.setAttribute('data-history-sidebar-root', 'true');
    document.body.appendChild(sidebar);

    act(() => {
      result.current.handleTouchStart(createTouchEvent(sidebar, 240, 12));
      result.current.handleTouchEnd(createTouchEvent(sidebar, 120, 12));
    });

    expect(useUIStore.getState().isHistorySidebarOpen).toBe(false);

    unmount();
  });

  it('ignores swipe gestures on desktop widths', () => {
    Object.defineProperty(window, 'innerWidth', {
      configurable: true,
      value: 1024,
      writable: true,
    });
    useUIStore.setState({ isHistorySidebarOpen: false });
    const { result, unmount } = renderHook(() => useAppUi());

    const edge = document.createElement('div');
    document.body.appendChild(edge);

    act(() => {
      result.current.handleTouchStart(createTouchEvent(edge, 12, 10));
      result.current.handleTouchEnd(createTouchEvent(edge, 100, 10));
    });

    expect(useUIStore.getState().isHistorySidebarOpen).toBe(false);

    unmount();
  });

  it('restores the remembered sidebar visibility for each breakpoint', () => {
    useUIStore.setState({
      isHistorySidebarOpen: false,
      desktopHistorySidebarOpen: false,
      mobileHistorySidebarOpen: true,
    });
    const { unmount } = renderHook(() => useAppUi());

    act(() => {
      window.innerWidth = 1024;
      window.dispatchEvent(new Event('resize'));
    });

    flushRafCallbacks();
    expect(useUIStore.getState().isHistorySidebarOpen).toBe(false);

    act(() => {
      window.innerWidth = 375;
      window.dispatchEvent(new Event('resize'));
    });

    flushRafCallbacks();
    expect(useUIStore.getState().isHistorySidebarOpen).toBe(true);

    unmount();
  });

  it('coalesces resize handling into the next animation frame', () => {
    useUIStore.setState({
      isHistorySidebarOpen: false,
      desktopHistorySidebarOpen: true,
      mobileHistorySidebarOpen: false,
    });
    const { unmount } = renderHook(() => useAppUi());

    act(() => {
      window.innerWidth = 375;
      window.dispatchEvent(new Event('resize'));
      window.innerWidth = 1024;
      window.dispatchEvent(new Event('resize'));
    });

    expect(useUIStore.getState().isHistorySidebarOpen).toBe(false);

    flushRafCallbacks();
    expect(useUIStore.getState().isHistorySidebarOpen).toBe(true);

    unmount();
  });

  it('closes mobile settings when the browser back button is pressed', () => {
    const pushStateSpy = vi.spyOn(window.history, 'pushState');
    useUIStore.setState({ isSettingsModalOpen: true });
    const { unmount } = renderHook(() => useAppUi());

    expect(pushStateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ amcModal: 'settings' }),
      '',
      expect.any(String),
    );

    act(() => {
      window.dispatchEvent(new PopStateEvent('popstate', { state: {} }));
    });

    expect(useUIStore.getState().isSettingsModalOpen).toBe(false);

    unmount();
  });

  it('collapses the mobile sidebar when browser history returns to the home page', () => {
    useUIStore.setState({ isHistorySidebarOpen: true });
    const { unmount } = renderHook(() => useAppUi());

    act(() => {
      window.history.replaceState({}, '', '/');
      window.dispatchEvent(new PopStateEvent('popstate', { state: {} }));
    });

    expect(useUIStore.getState().isHistorySidebarOpen).toBe(false);

    unmount();
  });

  it('opens the sidebar on a high velocity flick from the edge', () => {
    useUIStore.setState({ isHistorySidebarOpen: false });
    const { result, unmount } = renderHook(() => useAppUi());

    const edge = document.createElement('div');
    document.body.appendChild(edge);

    act(() => {
      result.current.handleTouchStart(createTouchEvent(edge, 10, 10));
      // Fast flick with 30px displacement
      result.current.handleTouchEnd(createTouchEvent(edge, 40, 10));
    });

    expect(useUIStore.getState().isHistorySidebarOpen).toBe(true);

    unmount();
  });

  it('ignores swipe gestures originating inside an input form element', () => {
    useUIStore.setState({ isHistorySidebarOpen: false });
    const { result, unmount } = renderHook(() => useAppUi());

    const input = document.createElement('input');
    document.body.appendChild(input);

    act(() => {
      result.current.handleTouchStart(createTouchEvent(input, 10, 10));
      result.current.handleTouchEnd(createTouchEvent(input, 120, 10));
    });

    expect(useUIStore.getState().isHistorySidebarOpen).toBe(false);

    unmount();
  });
});
