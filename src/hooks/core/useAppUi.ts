import { type TouchEvent, useCallback, useEffect, useRef } from 'react';
import { DESKTOP_BREAKPOINT_PX } from '@/constants/layout';
import { useUIStore } from '@/stores/uiStore';

const SETTINGS_MODAL_HISTORY_STATE = 'settings';

const isSidebarElement = (target: EventTarget | null) =>
  target instanceof Element && target.closest('[data-history-sidebar-root="true"]') !== null;

const isPlainHistoryState = (state: unknown): state is Record<string, unknown> =>
  state !== null && typeof state === 'object' && !Array.isArray(state);

const isSettingsModalHistoryState = (state: unknown) =>
  isPlainHistoryState(state) && state.amcModal === SETTINGS_MODAL_HISTORY_STATE;

const getCurrentRelativeUrl = () => `${window.location.pathname}${window.location.search}${window.location.hash}`;

const isInteractiveFormElement = (target: EventTarget | null) =>
  target instanceof Element &&
  (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || (target as HTMLElement).isContentEditable);

const triggerHapticFeedback = () => {
  if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
    try {
      navigator.vibrate(10);
    } catch {
      // Ignore non-supporting environments
    }
  }
};

export const useAppUi = () => {
  const isSettingsModalOpen = useUIStore((state) => state.isSettingsModalOpen);
  const isPreloadedMessagesModalOpen = useUIStore((state) => state.isPreloadedMessagesModalOpen);
  const isHistorySidebarOpen = useUIStore((state) => state.isHistorySidebarOpen);
  const isLogViewerOpen = useUIStore((state) => state.isLogViewerOpen);
  const setIsSettingsModalOpen = useUIStore((state) => state.setIsSettingsModalOpen);
  const setIsPreloadedMessagesModalOpen = useUIStore((state) => state.setIsPreloadedMessagesModalOpen);
  const setIsHistorySidebarOpen = useUIStore((state) => state.setIsHistorySidebarOpen);
  const setIsHistorySidebarOpenTransient = useUIStore((state) => state.setIsHistorySidebarOpenTransient);
  const syncHistorySidebarForViewport = useUIStore((state) => state.syncHistorySidebarForViewport);
  const setIsLogViewerOpen = useUIStore((state) => state.setIsLogViewerOpen);

  const touchStartRef = useRef<{
    x: number;
    y: number;
    time: number;
    startedInSidebar: boolean;
    isIgnoredElement: boolean;
  }>({ x: 0, y: 0, time: 0, startedInSidebar: false, isIgnoredElement: false });
  const wasDesktopRef = useRef(window.innerWidth >= DESKTOP_BREAKPOINT_PX);
  const settingsHistoryPushedRef = useRef(false);
  const wasSettingsModalOpenRef = useRef(isSettingsModalOpen);
  const resizeFrameRef = useRef<number | null>(null);

  useEffect(() => {
    const syncSidebarForCurrentViewport = () => {
      resizeFrameRef.current = null;
      const isDesktop = window.innerWidth >= DESKTOP_BREAKPOINT_PX;
      if (isDesktop !== wasDesktopRef.current) {
        wasDesktopRef.current = isDesktop;
        syncHistorySidebarForViewport();
      }
    };

    const handleResize = () => {
      if (resizeFrameRef.current !== null) {
        return;
      }

      resizeFrameRef.current = window.requestAnimationFrame(syncSidebarForCurrentViewport);
    };

    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
      if (resizeFrameRef.current !== null) {
        window.cancelAnimationFrame(resizeFrameRef.current);
        resizeFrameRef.current = null;
      }
    };
  }, [syncHistorySidebarForViewport]);

  useEffect(() => {
    if (!isSettingsModalOpen || window.innerWidth >= DESKTOP_BREAKPOINT_PX || settingsHistoryPushedRef.current) {
      return;
    }

    const currentState = window.history.state;

    if (isSettingsModalHistoryState(currentState)) {
      settingsHistoryPushedRef.current = true;
      return;
    }

    try {
      window.history.pushState(
        {
          ...(isPlainHistoryState(currentState) ? currentState : {}),
          amcModal: SETTINGS_MODAL_HISTORY_STATE,
        },
        '',
        getCurrentRelativeUrl(),
      );
      settingsHistoryPushedRef.current = true;
    } catch {
      settingsHistoryPushedRef.current = false;
    }
  }, [isSettingsModalOpen]);

  useEffect(() => {
    if (!isSettingsModalOpen || !settingsHistoryPushedRef.current) {
      return;
    }

    const handlePopState = () => {
      if (!settingsHistoryPushedRef.current) {
        return;
      }

      settingsHistoryPushedRef.current = false;
      setIsSettingsModalOpen(false);
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [isSettingsModalOpen, setIsSettingsModalOpen]);

  useEffect(() => {
    const wasSettingsModalOpen = wasSettingsModalOpenRef.current;
    wasSettingsModalOpenRef.current = isSettingsModalOpen;

    if (!wasSettingsModalOpen || isSettingsModalOpen || !settingsHistoryPushedRef.current) {
      return;
    }

    settingsHistoryPushedRef.current = false;

    if (isSettingsModalHistoryState(window.history.state)) {
      try {
        window.history.back();
      } catch {
        // Ignore browsers that reject synthetic history navigation.
      }
    }
  }, [isSettingsModalOpen]);

  useEffect(() => {
    const handleHomeRoutePopState = () => {
      if (window.innerWidth >= DESKTOP_BREAKPOINT_PX || window.location.pathname !== '/') {
        return;
      }

      setIsHistorySidebarOpenTransient(false);
    };

    window.addEventListener('popstate', handleHomeRoutePopState);
    return () => window.removeEventListener('popstate', handleHomeRoutePopState);
  }, [setIsHistorySidebarOpenTransient]);

  const handleTouchStart = useCallback((e: TouchEvent) => {
    if (window.innerWidth >= DESKTOP_BREAKPOINT_PX) {
      return;
    }

    const firstTouch = e.touches[0];
    if (firstTouch) {
      touchStartRef.current = {
        x: firstTouch.clientX,
        y: firstTouch.clientY,
        time: Date.now(),
        startedInSidebar: isSidebarElement(e.target),
        isIgnoredElement: isInteractiveFormElement(e.target),
      };
    }
  }, []);

  const handleTouchEnd = useCallback(
    (e: TouchEvent) => {
      if (window.innerWidth >= DESKTOP_BREAKPOINT_PX) {
        return;
      }

      const lastTouch = e.changedTouches[0];
      if (!lastTouch || touchStartRef.current.isIgnoredElement) return;

      const deltaX = lastTouch.clientX - touchStartRef.current.x;
      const deltaY = lastTouch.clientY - touchStartRef.current.y;
      const timeElapsed = Math.max(1, Date.now() - touchStartRef.current.time);
      const velocityX = Math.abs(deltaX) / timeElapsed;

      // Minimum swipe distance or high velocity flick
      const isFlick = velocityX > 0.45 && Math.abs(deltaX) > 25;
      const swipeThreshold = isFlick ? 25 : 45;
      const edgeThreshold = 48;

      // Ensure primarily horizontal intent (horizontal delta dominates vertical delta)
      if (Math.abs(deltaX) <= Math.abs(deltaY) * 1.15) {
        return;
      }

      if (deltaX > swipeThreshold && !isHistorySidebarOpen && touchStartRef.current.x < edgeThreshold) {
        setIsHistorySidebarOpen(true);
        triggerHapticFeedback();
      } else if (deltaX < -swipeThreshold && isHistorySidebarOpen && touchStartRef.current.startedInSidebar) {
        setIsHistorySidebarOpen(false);
        triggerHapticFeedback();
      }
    },
    [isHistorySidebarOpen, setIsHistorySidebarOpen],
  );

  return {
    isSettingsModalOpen,
    setIsSettingsModalOpen,
    isPreloadedMessagesModalOpen,
    setIsPreloadedMessagesModalOpen,
    isHistorySidebarOpen,
    setIsHistorySidebarOpen,
    setIsHistorySidebarOpenTransient,
    isLogViewerOpen,
    setIsLogViewerOpen,
    handleTouchStart,
    handleTouchEnd,
  };
};
