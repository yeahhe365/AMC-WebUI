import { createRef } from 'react';
import { act, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ChatWidthControls } from './ChatWidthControls';
import { CHAT_WIDTH_PREF_KEY, readChatWidthPreference, resolveChatContentWidth } from './chatWidthState';

describe('ChatWidthControls', () => {
  let origOffsetWidth: PropertyDescriptor | undefined;

  beforeEach(() => {
    localStorage.clear();
    origOffsetWidth = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetWidth');
    Object.defineProperty(HTMLElement.prototype, 'offsetWidth', {
      configurable: true,
      value: 1400,
    });
  });

  afterEach(() => {
    if (origOffsetWidth) {
      Object.defineProperty(HTMLElement.prototype, 'offsetWidth', origOffsetWidth);
    } else {
      delete (HTMLElement.prototype as { offsetWidth?: number }).offsetWidth;
    }
    localStorage.clear();
    vi.clearAllMocks();
  });

  it('calculates width correctly using resolveChatContentWidth', () => {
    // Adaptive default with 680 floor and 920 max: 1400 * 0.64 = 896
    expect(resolveChatContentWidth(1400, null)).toBe(896);
    // User preference applied
    expect(resolveChatContentWidth(1400, 1000)).toBe(1000);
    // User preference clamped to container max (1400 - 176 = 1224)
    expect(resolveChatContentWidth(1400, 1500)).toBe(1224);
    // Clamped to min 640
    expect(resolveChatContentWidth(1400, 500)).toBe(640);
  });

  it('reads preference from localStorage correctly', () => {
    expect(readChatWidthPreference()).toBeNull();
    localStorage.setItem(CHAT_WIDTH_PREF_KEY, '850');
    expect(readChatWidthPreference()).toBe(850);
    localStorage.setItem(CHAT_WIDTH_PREF_KEY, 'invalid');
    expect(readChatWidthPreference()).toBeNull();
  });

  it('renders handles and sets initial --chat-content-width on container', () => {
    const containerRef = createRef<HTMLDivElement>();
    const { container } = render(
      <div ref={containerRef}>
        <ChatWidthControls containerRef={containerRef} />
      </div>,
    );

    const root = container.firstElementChild as HTMLDivElement;
    const leftHandle = root.querySelector('[data-width-handle="left"]');
    const rightHandle = root.querySelector('[data-width-handle="right"]');

    expect(leftHandle).not.toBeNull();
    expect(rightHandle).not.toBeNull();
    expect(leftHandle?.getAttribute('title')).toBeNull();
    expect(rightHandle?.getAttribute('title')).toBeNull();
    expect(root.style.getPropertyValue('--chat-content-width')).toBe('896px');
  });

  it('does not render handles when enabled is false but still publishes width', () => {
    const containerRef = createRef<HTMLDivElement>();
    const { container } = render(
      <div ref={containerRef}>
        <ChatWidthControls containerRef={containerRef} enabled={false} />
      </div>,
    );

    const root = container.firstElementChild as HTMLDivElement;
    expect(root.querySelector('[data-width-handle="left"]')).toBeNull();
    expect(root.querySelector('[data-width-handle="right"]')).toBeNull();
    expect(root.style.getPropertyValue('--chat-content-width')).toBe('896px');
  });

  it('supports symmetric dragging and persists to localStorage on commit', () => {
    const containerRef = createRef<HTMLDivElement>();
    const { container } = render(
      <div ref={containerRef}>
        <ChatWidthControls containerRef={containerRef} />
      </div>,
    );

    const root = container.firstElementChild as HTMLDivElement;
    const rightHandle = root.querySelector('[data-width-handle="right"]') as HTMLElement;
    expect(rightHandle).not.toBeNull();

    // Mock pointer capture methods
    const captured = new Set<Element>();
    const origSetCapture = Element.prototype.setPointerCapture;
    const origRelCapture = Element.prototype.releasePointerCapture;
    const origHasCapture = Element.prototype.hasPointerCapture;
    Element.prototype.setPointerCapture = function () {
      captured.add(this);
    };
    Element.prototype.releasePointerCapture = function () {
      captured.delete(this);
    };
    Element.prototype.hasPointerCapture = function () {
      return captured.has(this);
    };

    try {
      // Base is 896. Pointer down at 800, drag inward by 30px to 770 -> narrows by 2 * 30 = 60 -> 836px
      fireEvent.pointerDown(rightHandle, { pointerId: 1, clientX: 800, clientY: 200, button: 0 });
      expect(rightHandle.dataset.dragging).toBe('true');

      fireEvent.pointerMove(rightHandle, { pointerId: 1, clientX: 770, clientY: 200 });
      fireEvent.pointerUp(rightHandle, { pointerId: 1, clientX: 770, clientY: 200 });

      expect(rightHandle.dataset.dragging).toBeUndefined();
      expect(root.style.getPropertyValue('--chat-content-width')).toBe('836px');
      expect(localStorage.getItem(CHAT_WIDTH_PREF_KEY)).toBe('836');
    } finally {
      Element.prototype.setPointerCapture = origSetCapture;
      Element.prototype.releasePointerCapture = origRelCapture;
      Element.prototype.hasPointerCapture = origHasCapture;
    }
  });

  it('resets preference on double click', () => {
    localStorage.setItem(CHAT_WIDTH_PREF_KEY, '1200');
    const containerRef = createRef<HTMLDivElement>();
    const { container } = render(
      <div ref={containerRef}>
        <ChatWidthControls containerRef={containerRef} />
      </div>,
    );

    const root = container.firstElementChild as HTMLDivElement;
    expect(root.style.getPropertyValue('--chat-content-width')).toBe('1200px');

    const leftHandle = root.querySelector('[data-width-handle="left"]') as HTMLElement;
    fireEvent.doubleClick(leftHandle);

    expect(localStorage.getItem(CHAT_WIDTH_PREF_KEY)).toBeNull();
    // Reverts to adaptive default: 896px
    expect(root.style.getPropertyValue('--chat-content-width')).toBe('896px');
  });

  it('forwards wheel scrolling to scroller element', () => {
    const containerRef = createRef<HTMLDivElement>();
    const { container } = render(
      <div ref={containerRef}>
        <div className="chat-message-list-scroller" />
        <ChatWidthControls containerRef={containerRef} />
      </div>,
    );

    const root = container.firstElementChild as HTMLDivElement;
    const scroller = root.querySelector('.chat-message-list-scroller') as HTMLDivElement;
    scroller.scrollBy = vi.fn();

    const rightHandle = root.querySelector('[data-width-handle="right"]') as HTMLElement;
    fireEvent.wheel(rightHandle, { deltaY: 120, deltaMode: 0 });

    expect(scroller.scrollBy).toHaveBeenCalledWith({ top: 120 });
  });

  it('updates published width on ResizeObserver callback', () => {
    let resizeCallback: (() => void) | null = null;
    class MockResizeObserver {
      constructor(cb: () => void) {
        resizeCallback = cb;
      }
      observe = vi.fn();
      disconnect = vi.fn();
      unobserve = vi.fn();
    }
    const origResizeObserver = window.ResizeObserver;
    window.ResizeObserver = MockResizeObserver as unknown as typeof ResizeObserver;

    try {
      localStorage.setItem(CHAT_WIDTH_PREF_KEY, '1000');
      const containerRef = createRef<HTMLDivElement>();
      const { container } = render(
        <div ref={containerRef}>
          <ChatWidthControls containerRef={containerRef} />
        </div>,
      );

      const root = container.firstElementChild as HTMLDivElement;
      expect(root.style.getPropertyValue('--chat-content-width')).toBe('1000px');

      // Now container width shrinks to 900px (max allowed = 900 - 176 = 724px)
      Object.defineProperty(root, 'offsetWidth', { value: 900, configurable: true });
      act(() => {
        resizeCallback?.();
      });

      expect(root.style.getPropertyValue('--chat-content-width')).toBe('724px');
      // Stored preference remains intact
      expect(localStorage.getItem(CHAT_WIDTH_PREF_KEY)).toBe('1000');
    } finally {
      window.ResizeObserver = origResizeObserver;
    }
  });
});
