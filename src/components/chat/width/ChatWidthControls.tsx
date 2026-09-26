import React, { useCallback, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import {
  CHAT_DEFAULT_MIN,
  CHAT_WIDTH_PREF_KEY,
  readChatWidthPreference,
  resolveChatContentWidth,
  wheelDeltaY,
} from './chatWidthState';

interface WidthHandleProps {
  side: 'left' | 'right';
  onStart: () => number;
  onDrag: (width: number) => void;
  onCommit: (width: number) => void;
  onEnd: () => void;
  onReset: () => void;
}

const WidthHandle: React.FC<WidthHandleProps> = (props) => {
  const [dragging, setDragging] = useState(false);
  const base = useRef(0);
  const origin = useRef(0);
  const latest = useRef(0);
  const frame = useRef<number | null>(null);
  const callbacks = useRef(props);
  callbacks.current = props;

  const outwardWidth = () => {
    const deltaX = latest.current - origin.current;
    const outward = callbacks.current.side === 'right' ? deltaX : -deltaX;
    return base.current + outward * 2;
  };

  const cancelFrame = () => {
    if (frame.current !== null) {
      cancelAnimationFrame(frame.current);
      frame.current = null;
    }
  };

  const onPointerDown = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    if (typeof event.currentTarget.setPointerCapture === 'function') {
      try {
        event.currentTarget.setPointerCapture(event.pointerId);
      } catch {
        // Ignore environments where pointer capture is unsupported
      }
    }
    origin.current = event.clientX;
    latest.current = event.clientX;
    base.current = callbacks.current.onStart();
    setDragging(true);
  }, []);

  const onPointerMove = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    event.currentTarget.style.setProperty('--chat-width-handle-pointer-y', `${event.clientY - box.top}px`);
    if (typeof event.currentTarget.hasPointerCapture === 'function') {
      try {
        if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
      } catch {
        // Ignore
      }
    }
    latest.current = event.clientX;
    frame.current ??= requestAnimationFrame(() => {
      frame.current = null;
      callbacks.current.onDrag(outwardWidth());
    });
  }, []);

  const onPointerUp = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (typeof event.currentTarget.hasPointerCapture === 'function') {
      try {
        if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
      } catch {
        // Ignore
      }
    }
    if (typeof event.currentTarget.releasePointerCapture === 'function') {
      try {
        event.currentTarget.releasePointerCapture(event.pointerId);
      } catch {
        // Ignore
      }
    }
    cancelFrame();
    latest.current = event.clientX;
    if (latest.current !== origin.current) {
      callbacks.current.onCommit(outwardWidth());
    }
    setDragging(false);
    callbacks.current.onEnd();
  }, []);

  const onPointerCancel = useCallback(() => {
    cancelFrame();
    setDragging(false);
    callbacks.current.onEnd();
  }, []);

  const onWheel = useCallback((event: React.WheelEvent<HTMLDivElement>) => {
    const root = event.currentTarget.parentElement;
    if (!root) return;
    const scroller = root.querySelector<HTMLElement>('.chat-message-list-scroller');
    if (!scroller || event.ctrlKey || event.deltaY === 0) return;
    scroller.scrollBy({ top: wheelDeltaY(event, scroller) });
  }, []);

  const onDoubleClick = useCallback(() => {
    callbacks.current.onReset();
  }, []);

  return (
    <div
      className="chat-width-handle"
      data-side={props.side}
      data-width-handle={props.side}
      data-dragging={dragging ? 'true' : undefined}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      onLostPointerCapture={onPointerCancel}
      onWheel={onWheel}
      onDoubleClick={onDoubleClick}
    />
  );
};

export interface ChatWidthControlsProps {
  containerRef?: RefObject<HTMLElement | null>;
  enabled?: boolean;
}

export const ChatWidthControls: React.FC<ChatWidthControlsProps> = ({ containerRef, enabled = true }) => {
  const markerRef = useRef<HTMLSpanElement>(null);

  const getContainer = useCallback((): HTMLElement | null => {
    return containerRef?.current ?? (markerRef.current?.parentElement as HTMLElement | null);
  }, [containerRef]);

  const publishWidths = useCallback((container: HTMLElement): void => {
    const column = container.offsetWidth;
    if (column <= 0) return;
    container.style.setProperty('--chat-container-width', `${column}px`);
    const preference = readChatWidthPreference();
    const resolved = resolveChatContentWidth(column, preference);
    container.style.setProperty('--chat-content-width', `${resolved}px`);
  }, []);

  useLayoutEffect(() => {
    const container = getContainer();
    if (!container) return;

    publishWidths(container);

    let observer: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver(() => {
        publishWidths(container);
      });
      observer.observe(container);
    }

    return () => {
      observer?.disconnect();
    };
  }, [getContainer, publishWidths]);

  const onStart = useCallback((): number => {
    const container = getContainer();
    if (!container) return CHAT_DEFAULT_MIN;
    return resolveChatContentWidth(container.offsetWidth, readChatWidthPreference());
  }, [getContainer]);

  const onDrag = useCallback(
    (width: number): void => {
      const container = getContainer();
      if (!container) return;
      const resolved = resolveChatContentWidth(container.offsetWidth, width);
      container.style.setProperty('--chat-content-width', `${resolved}px`);
    },
    [getContainer],
  );

  const onCommit = useCallback(
    (width: number): void => {
      const container = getContainer();
      if (!container) return;
      const resolved = resolveChatContentWidth(container.offsetWidth, width);
      try {
        localStorage.setItem(CHAT_WIDTH_PREF_KEY, `${resolved}`);
      } catch {
        // Ignore quota/private mode errors
      }
    },
    [getContainer],
  );

  const onEnd = useCallback((): void => {
    const container = getContainer();
    if (container) publishWidths(container);
  }, [getContainer, publishWidths]);

  const onReset = useCallback((): void => {
    try {
      localStorage.removeItem(CHAT_WIDTH_PREF_KEY);
      localStorage.removeItem('amc.chat.contentWidth.v3');
      localStorage.removeItem('amc.chat.contentWidth.v2');
      localStorage.removeItem('amc.chat.contentWidth');
    } catch {
      // Ignore
    }
    const container = getContainer();
    if (container) publishWidths(container);
  }, [getContainer, publishWidths]);

  if (!enabled) {
    return <span ref={markerRef} style={{ display: 'none' }} aria-hidden="true" />;
  }

  return (
    <>
      <span ref={markerRef} style={{ display: 'none' }} aria-hidden="true" />
      <WidthHandle
        side="left"
        onStart={onStart}
        onDrag={onDrag}
        onCommit={onCommit}
        onEnd={onEnd}
        onReset={onReset}
      />
      <WidthHandle
        side="right"
        onStart={onStart}
        onDrag={onDrag}
        onCommit={onCommit}
        onEnd={onEnd}
        onReset={onReset}
      />
    </>
  );
};
