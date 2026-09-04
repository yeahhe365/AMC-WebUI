import { useRef, useState, useCallback, useEffect } from 'react';
import { type VirtuosoHandle } from 'react-virtuoso';
import { type ChatMessage } from '@/types';

interface UseMessageListScrollProps {
  messages: ChatMessage[];
  setScrollContainerRef: (node: HTMLDivElement | null) => void;
  activeSessionId: string | null;
}

const CURRENT_TURN_VIEWPORT_OFFSET_PX = 96;
const SCROLL_BOTTOM_THRESHOLD_PX = 150;
const ANCHOR_SCROLL_DELAY_MS = 50;
const RESTORE_SCROLL_DELAY_MS = 50;
// After a bottom jump, Virtuoso keeps re-measuring items (lazy markdown,
// estimate replacement) and the real bottom drifts. Re-assert the bottom on
// each total-height change for this long, unless the user scrolls away.
const BOTTOM_LOCK_MS = 2500;

type StoredMessageScrollSnapshot = {
  messageId: string;
  scrollTop: number;
  topOffset: number;
};

type StoredBottomScrollSnapshot = {
  atBottom: true;
  scrollTop: number;
};

type StoredScrollSnapshot = StoredMessageScrollSnapshot | StoredBottomScrollSnapshot;

const getScrollStorageKey = (sessionId: string) => `chat_scroll_pos_${sessionId}`;

const parseStoredScrollSnapshot = (rawValue: string | null): StoredScrollSnapshot | number | null => {
  if (rawValue === null) {
    return null;
  }

  const legacyTop = Number(rawValue);
  if (Number.isFinite(legacyTop)) {
    return legacyTop;
  }

  try {
    const parsed = JSON.parse(rawValue) as Partial<StoredMessageScrollSnapshot & StoredBottomScrollSnapshot>;
    if (parsed.atBottom === true && Number.isFinite(parsed.scrollTop)) {
      return {
        atBottom: true,
        scrollTop: Number(parsed.scrollTop),
      };
    }
    if (
      typeof parsed.messageId === 'string' &&
      Number.isFinite(parsed.scrollTop) &&
      Number.isFinite(parsed.topOffset)
    ) {
      return {
        messageId: parsed.messageId,
        scrollTop: Number(parsed.scrollTop),
        topOffset: Number(parsed.topOffset),
      };
    }
    if (Number.isFinite(parsed.scrollTop)) {
      return Number(parsed.scrollTop);
    }
  } catch {
    return null;
  }

  return null;
};

const isNearScrollBottom = (container: HTMLElement) =>
  container.scrollHeight - container.clientHeight - container.scrollTop <= SCROLL_BOTTOM_THRESHOLD_PX;

const createScrollSnapshot = (container: HTMLElement): StoredScrollSnapshot | null => {
  if (isNearScrollBottom(container)) {
    return {
      atBottom: true,
      scrollTop: Math.max(0, Math.round(container.scrollTop)),
    };
  }

  const containerRect = container.getBoundingClientRect();
  const renderedMessages = Array.from(container.querySelectorAll<HTMLElement>('[data-message-id]'));
  const firstVisibleMessage =
    renderedMessages.find((element) => element.getBoundingClientRect().top >= containerRect.top) ??
    renderedMessages.find((element) => element.getBoundingClientRect().bottom > containerRect.top);

  const messageId = firstVisibleMessage?.dataset.messageId;
  if (!firstVisibleMessage || !messageId) {
    return null;
  }

  return {
    messageId,
    scrollTop: Math.max(0, Math.round(container.scrollTop)),
    topOffset: Math.round(firstVisibleMessage.getBoundingClientRect().top - containerRect.top),
  };
};

export const useMessageListScroll = ({
  messages,
  setScrollContainerRef,
  activeSessionId,
}: UseMessageListScrollProps) => {
  const virtuosoRef = useRef<VirtuosoHandle>(null);
  // Mirrors the scroller element for imperative access from callbacks without
  // re-creating them; the scroller state below still drives React consumers.
  const scrollerElementRef = useRef<HTMLElement | null>(null);
  const [atBottom, setAtBottomState] = useState(true);
  // Mirrors `atBottom` for reads inside effects/timers without a render round-trip.
  // Only the anchor effect consumes it, so a ref avoids re-running on every toggle.
  const atBottomRef = useRef(true);
  const setAtBottom = useCallback((value: boolean) => {
    atBottomRef.current = value;
    setAtBottomState(value);
  }, []);
  const [visibleStartIndex, setVisibleStartIndex] = useState(0);
  const [scrollerRef, setInternalScrollerRef] = useState<HTMLElement | null>(null);
  const visibleRangeRef = useRef({ startIndex: 0, endIndex: 0 });

  const scrollSaveTimeoutRef = useRef<number | null>(null);
  const lastPersistedSnapshotJsonRef = useRef<string | null>(null);
  const anchorTimeoutRef = useRef<number | null>(null);
  const restoreTimeoutRef = useRef<number | null>(null);
  const lastRestoredSessionIdRef = useRef<string | null>(null);
  const activeSessionIdRef = useRef(activeSessionId);

  const lastScrollTarget = useRef<number | null>(null);
  const prevMsgCount = useRef(messages.length);
  const prevSessionIdForAnchor = useRef(activeSessionId);
  const bottomLockUntilRef = useRef(0);
  const detachBottomLockListenersRef = useRef<(() => void) | null>(null);
  const bottomLockPrevScrollTopRef = useRef(0);

  const cancelBottomLock = useCallback(() => {
    bottomLockUntilRef.current = 0;
  }, []);

  // Scroll events can also express escape intent (keyboard, scrollbar drag
  // without a mousedown on the scroller, external anchors): moving notably
  // upward while away from the bottom cancels the lock. The lock's own
  // corrections only ever move the view down toward the bottom, so they never
  // trip this.
  const handleBottomLockScroll = useCallback(() => {
    const scroller = scrollerElementRef.current;
    if (!scroller) return;
    const { scrollTop } = scroller;
    const movedUp = bottomLockPrevScrollTopRef.current - scrollTop > 10;
    bottomLockPrevScrollTopRef.current = scrollTop;
    if (!movedUp) return;
    if (scroller.scrollHeight - scroller.clientHeight - scrollTop > 40) {
      cancelBottomLock();
    }
  }, [cancelBottomLock]);

  // User scroll intent during a lock window comes from real input events —
  // not from atBottom, which itself flickers while the height settles.
  const activateBottomLockListeners = useCallback(() => {
    const scroller = scrollerElementRef.current;
    if (!scroller || detachBottomLockListenersRef.current) return;
    const options: AddEventListenerOptions = { capture: true, passive: true };
    scroller.addEventListener('wheel', cancelBottomLock, options);
    scroller.addEventListener('touchmove', cancelBottomLock, options);
    scroller.addEventListener('mousedown', cancelBottomLock, options);
    scroller.addEventListener('scroll', handleBottomLockScroll, options);
    detachBottomLockListenersRef.current = () => {
      scroller.removeEventListener('wheel', cancelBottomLock, options);
      scroller.removeEventListener('touchmove', cancelBottomLock, options);
      scroller.removeEventListener('mousedown', cancelBottomLock, options);
      scroller.removeEventListener('scroll', handleBottomLockScroll, options);
    };
  }, [cancelBottomLock, handleBottomLockScroll]);

  useEffect(() => {
    activeSessionIdRef.current = activeSessionId;
    // The persisted-snapshot dedup is per-session; a session switch must not
    // suppress the first save of the new session's position.
    lastPersistedSnapshotJsonRef.current = null;
    // A stale bottom lock must not yank the incoming session's restore.
    bottomLockUntilRef.current = 0;
  }, [activeSessionId]);

  const clearAnchorTimeout = useCallback(() => {
    if (anchorTimeoutRef.current !== null) {
      clearTimeout(anchorTimeoutRef.current);
      anchorTimeoutRef.current = null;
    }
  }, []);

  const clearRestoreTimeout = useCallback(() => {
    if (restoreTimeoutRef.current !== null) {
      clearTimeout(restoreTimeoutRef.current);
      restoreTimeoutRef.current = null;
    }
  }, []);

  const onRangeChanged = useCallback(({ startIndex, endIndex }: { startIndex: number; endIndex: number }) => {
    visibleRangeRef.current = { startIndex, endIndex };
    setVisibleStartIndex(startIndex);
  }, []);

  const handleScrollerRef = useCallback(
    (ref: Window | HTMLElement | null) => {
      if (ref === null || ref instanceof HTMLElement) {
        if (scrollerElementRef.current !== ref) {
          detachBottomLockListenersRef.current?.();
          detachBottomLockListenersRef.current = null;
        }
        scrollerElementRef.current = ref;
        setInternalScrollerRef(ref);
        setScrollContainerRef(ref as HTMLDivElement | null);
      }
    },
    [setScrollContainerRef],
  );

  // react-virtuoso derives scrollToIndex({ index: 'LAST', align: 'end' })
  // targets from its internal size tree, which settles slightly below the real
  // DOM height, leaving the tail of the last message hidden behind the
  // composer. Scrolling the scroller element itself lands on the true bottom;
  // scrollToIndex remains as a fallback for before the scroller mounts.
  const scrollToRealBottom = useCallback(
    (behavior?: 'auto' | 'smooth') => {
      const scroller = scrollerElementRef.current;
      bottomLockUntilRef.current = Date.now() + BOTTOM_LOCK_MS;
      if (scroller) {
        bottomLockPrevScrollTopRef.current = scroller.scrollTop;
      }
      activateBottomLockListeners();
      if (scroller) {
        scroller.scrollTo(behavior ? { top: scroller.scrollHeight, behavior } : { top: scroller.scrollHeight });
        return;
      }
      virtuosoRef.current?.scrollToIndex(
        behavior ? { index: 'LAST', align: 'end', behavior } : { index: 'LAST', align: 'end' },
      );
    },
    [activateBottomLockListeners],
  );

  // Wired to Virtuoso's totalListHeightChanged: while a bottom jump settles,
  // keep the view pinned to the (moving) true bottom.
  const handleTotalListHeightChanged = useCallback(() => {
    if (Date.now() > bottomLockUntilRef.current) return;
    const scroller = scrollerElementRef.current;
    if (!scroller) return;
    if (scroller.scrollHeight - scroller.clientHeight - scroller.scrollTop > 1) {
      scroller.scrollTo({ top: scroller.scrollHeight });
    }
  }, []);

  useEffect(() => {
    const sessionChanged = prevSessionIdForAnchor.current !== activeSessionId;
    const restorationPending = lastRestoredSessionIdRef.current !== activeSessionId;

    // Let history restoration settle before applying new-turn anchoring.
    if (sessionChanged || restorationPending) {
      prevSessionIdForAnchor.current = activeSessionId;
      prevMsgCount.current = messages.length;
      return;
    }

    if (messages.length > prevMsgCount.current) {
      let targetIndex = -1;
      for (let i = messages.length - 1; i >= Math.max(0, prevMsgCount.current - 1); i--) {
        if (messages[i].role === 'model') {
          targetIndex = i;
          break;
        }
      }

      if (targetIndex !== -1) {
        // Anchor newly appended model turns only when the user is already at
        // the bottom. Reading history, a queued auto-resend, or cross-tab
        // session sync appending mid-list must not yank the view to the latest
        // message. The ref is re-checked inside the timer so scrolling away
        // during the debounce window cancels the pending anchor.
        if (atBottomRef.current) {
          const sessionIdForScroll = activeSessionId;
          clearAnchorTimeout();
          anchorTimeoutRef.current = window.setTimeout(() => {
            anchorTimeoutRef.current = null;
            if (activeSessionIdRef.current !== sessionIdForScroll) return;
            if (!atBottomRef.current) return;
            virtuosoRef.current?.scrollToIndex({
              index: targetIndex,
              align: 'start',
              behavior: 'smooth',
            });
            lastScrollTarget.current = targetIndex;
          }, ANCHOR_SCROLL_DELAY_MS);
        }
      }
    }
    prevMsgCount.current = messages.length;
  }, [messages, activeSessionId, clearAnchorTimeout]);

  const scrollToPrevTurn = useCallback(() => {
    clearAnchorTimeout();

    const currentStartIndex = visibleRangeRef.current.startIndex;
    let targetIndex = -1;

    for (let i = Math.max(0, currentStartIndex - 1); i >= 0; i--) {
      if (messages[i].role === 'user') {
        targetIndex = i;
        break;
      }
    }

    if (targetIndex !== -1) {
      lastScrollTarget.current = targetIndex;
      virtuosoRef.current?.scrollToIndex({ index: targetIndex, align: 'start', behavior: 'smooth' });
    } else {
      virtuosoRef.current?.scrollToIndex({ index: 0, align: 'start', behavior: 'smooth' });
    }
  }, [messages, clearAnchorTimeout]);

  const scrollToNextTurn = useCallback(() => {
    clearAnchorTimeout();

    const renderedTurnNavigation = (() => {
      if (!scrollerRef) {
        return null;
      }

      const messageIndexById = new Map(messages.map((message, index) => [message.id, index]));
      const viewportTop = scrollerRef.getBoundingClientRect().top;
      const currentTurnThreshold = viewportTop + CURRENT_TURN_VIEWPORT_OFFSET_PX;
      const renderedUserTurns = Array.from(
        scrollerRef.querySelectorAll<HTMLElement>('[data-message-role="user"][data-message-id]'),
      );

      let currentUserTurnIndex: number | null = null;
      let nextUserTurnIndex: number | null = null;

      for (const userTurnElement of renderedUserTurns) {
        const messageId = userTurnElement.dataset.messageId;
        if (!messageId) continue;

        const messageIndex = messageIndexById.get(messageId);
        if (messageIndex === undefined) continue;

        if (userTurnElement.getBoundingClientRect().top <= currentTurnThreshold) {
          currentUserTurnIndex = messageIndex;
          continue;
        }

        nextUserTurnIndex = messageIndex;
        break;
      }

      return { currentUserTurnIndex, nextUserTurnIndex };
    })();

    let targetIndex = -1;

    if (renderedTurnNavigation?.nextUserTurnIndex !== null && renderedTurnNavigation?.nextUserTurnIndex !== undefined) {
      targetIndex = renderedTurnNavigation.nextUserTurnIndex;
    } else {
      const currentStartIndex = visibleRangeRef.current.startIndex;
      const cursorIndex =
        renderedTurnNavigation?.currentUserTurnIndex ??
        (lastScrollTarget.current !== null && lastScrollTarget.current >= currentStartIndex
          ? lastScrollTarget.current
          : currentStartIndex);

      for (let i = cursorIndex + 1; i < messages.length; i++) {
        if (messages[i].role === 'user') {
          targetIndex = i;
          break;
        }
      }

      if (targetIndex === -1) {
        return;
      }
    }

    lastScrollTarget.current = targetIndex;
    virtuosoRef.current?.scrollToIndex({ index: targetIndex, align: 'start', behavior: 'smooth' });
  }, [messages, scrollerRef, clearAnchorTimeout]);

  const scrollToTop = useCallback(() => {
    if (messages.length === 0) {
      return;
    }

    clearAnchorTimeout();
    lastScrollTarget.current = 0;
    virtuosoRef.current?.scrollToIndex({ index: 0, align: 'start', behavior: 'smooth' });
  }, [messages.length, clearAnchorTimeout]);

  const scrollToBottom = useCallback(() => {
    if (messages.length === 0) {
      return;
    }

    clearAnchorTimeout();
    lastScrollTarget.current = messages.length - 1;
    scrollToRealBottom('smooth');
  }, [messages.length, clearAnchorTimeout, scrollToRealBottom]);

  const handleScroll = useCallback(() => {
    if (document.hidden) return;

    const container = scrollerRef;
    if (!container) return;
    if (!activeSessionId || lastRestoredSessionIdRef.current !== activeSessionId || messages.length === 0) return;

    const { scrollTop } = container;
    const snapshot = createScrollSnapshot(container) ?? { scrollTop: Math.max(0, Math.round(scrollTop)) };

    // Skip scheduling when the snapshot is byte-identical to the last one
    // persisted (a repeated scroll event over the same content), so a burst of
    // same-position scrolls does not restart the debounce timer pointlessly.
    const serialized = JSON.stringify(snapshot);
    if (lastPersistedSnapshotJsonRef.current === serialized) {
      return;
    }

    if (scrollSaveTimeoutRef.current) {
      clearTimeout(scrollSaveTimeoutRef.current);
    }
    scrollSaveTimeoutRef.current = window.setTimeout(() => {
      scrollSaveTimeoutRef.current = null;
      lastPersistedSnapshotJsonRef.current = serialized;
      localStorage.setItem(getScrollStorageKey(activeSessionId), serialized);
    }, 300);
  }, [scrollerRef, activeSessionId, messages.length]);

  useEffect(() => {
    return () => {
      if (scrollSaveTimeoutRef.current) {
        clearTimeout(scrollSaveTimeoutRef.current);
      }
      clearAnchorTimeout();
      clearRestoreTimeout();
      detachBottomLockListenersRef.current?.();
      detachBottomLockListenersRef.current = null;
    };
  }, [clearAnchorTimeout, clearRestoreTimeout]);

  useEffect(() => {
    if (!activeSessionId) return;

    if (lastRestoredSessionIdRef.current !== activeSessionId) {
      if (messages.length > 0) {
        const savedSnapshot = parseStoredScrollSnapshot(localStorage.getItem(getScrollStorageKey(activeSessionId)));
        const sessionIdForRestore = activeSessionId;
        clearRestoreTimeout();

        restoreTimeoutRef.current = window.setTimeout(() => {
          restoreTimeoutRef.current = null;
          if (activeSessionIdRef.current !== sessionIdForRestore) return;

          if (typeof savedSnapshot === 'number') {
            virtuosoRef.current?.scrollTo({ top: savedSnapshot });
          } else if (savedSnapshot) {
            if ('atBottom' in savedSnapshot) {
              scrollToRealBottom();
              lastRestoredSessionIdRef.current = sessionIdForRestore;
              return;
            }

            const targetIndex = messages.findIndex((message) => message.id === savedSnapshot.messageId);
            if (targetIndex >= 0) {
              virtuosoRef.current?.scrollToIndex({
                index: targetIndex,
                align: 'start',
                offset: -savedSnapshot.topOffset,
              });
            } else {
              virtuosoRef.current?.scrollTo({ top: savedSnapshot.scrollTop });
            }
          } else {
            scrollToRealBottom();
          }
          lastRestoredSessionIdRef.current = sessionIdForRestore;
        }, RESTORE_SCROLL_DELAY_MS);
      }
    }
  }, [activeSessionId, messages, clearRestoreTimeout, scrollToRealBottom]);

  const showScrollDown =
    !atBottom && messages.some((message, index) => index > visibleStartIndex && message.role === 'user');
  const showScrollUp = visibleStartIndex > 0;

  return {
    virtuosoRef,
    handleScrollerRef,
    setAtBottom,
    onRangeChanged,
    handleTotalListHeightChanged,
    scrollToPrevTurn,
    scrollToNextTurn,
    scrollToTop,
    scrollToBottom,
    showScrollDown,
    showScrollUp,
    scrollerRef,
    handleScroll,
  };
};
