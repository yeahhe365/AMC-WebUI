import React, { act } from 'react';
import { setupTestRenderer } from '@/test/render/renderer';
import { setTestMatchMedia } from '@/test/browser/environment';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createChatAreaProviderValue,
  applyChatAreaProviderValue,
  ChatRuntimeTestProvider,
} from '@/test/layout/fixtures';
import { useChatStore } from '@/stores/chatStore';
import { ChatArea } from './ChatArea';

const dispatchTouchEvent = (
  node: Element,
  type: 'touchstart' | 'touchend',
  touches: Array<{ clientX: number; clientY: number }>,
) => {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'touches', {
    configurable: true,
    value: type === 'touchend' ? [] : touches,
  });
  Object.defineProperty(event, 'changedTouches', {
    configurable: true,
    value: touches,
  });
  node.dispatchEvent(event);
};

vi.mock('@/components/header/Header', () => ({
  Header: ({ currentModelName }: { currentModelName: string }) => (
    <div data-testid="header">{currentModelName || 'no-model'}</div>
  ),
}));

vi.mock('@/components/chat/overlays/DragDropOverlay', () => ({
  DragDropOverlay: ({ isDraggingOver }: { isDraggingOver: boolean }) => (
    <div data-testid="drag-overlay">{String(isDraggingOver)}</div>
  ),
}));

vi.mock('@/components/chat/overlays/ModelsErrorDisplay', () => ({
  ModelsErrorDisplay: ({ error }: { error: string | null }) => <div data-testid="models-error">{error}</div>,
}));

vi.mock('@/components/chat/message-list/MessageList', () => ({
  MessageList: React.memo(() => {
    const messages = useChatStore((state) => state.activeMessages);
    return <div data-testid="message-list">{messages.length}</div>;
  }),
}));

vi.mock('@/components/chat/input/ChatInput', () => ({
  ChatInput: React.memo(() => {
    const commandedInput = useChatStore((state) => state.commandedInput);
    return <div data-testid="chat-input">{commandedInput?.text ?? 'empty'}</div>;
  }),
}));

describe('ChatArea', () => {
  const renderer = setupTestRenderer();
  let matchMediaMatches = false;
  let windowInnerWidth = 1024;
  const virtualKeyboardShow = vi.fn();

  beforeEach(() => {
    vi.stubGlobal(
      'ResizeObserver',
      class ResizeObserver {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    );
    Object.defineProperty(window, 'innerWidth', {
      configurable: true,
      writable: true,
      value: windowInnerWidth,
    });
    setTestMatchMedia(matchMediaMatches);
    Object.defineProperty(window.navigator, 'virtualKeyboard', {
      configurable: true,
      value: {
        show: virtualKeyboardShow,
      },
    });
    virtualKeyboardShow.mockClear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
    renderer.root.unmount();
  });

  const renderChatArea = (providerValue = createChatAreaProviderValue()) => {
    act(() => {
      applyChatAreaProviderValue(providerValue);
      renderer.root.render(
        <ChatRuntimeTestProvider value={providerValue}>
          <ChatArea />
        </ChatRuntimeTestProvider>,
      );
    });
  };

  it('renders layout data from stores and runtime actions without ChatArea props', () => {
    renderChatArea(
      createChatAreaProviderValue({
        messageList: {
          messages: [
            {
              id: 'message-1',
              role: 'user',
              content: 'hello',
              timestamp: new Date('2026-04-12T00:00:00.000Z'),
            },
          ],
        },
        input: {
          commandedInput: {
            id: 1,
            mode: 'replace',
            text: 'store input',
          },
        },
      }),
    );

    expect(renderer.container.querySelector('[data-testid="message-list"]')?.textContent).toBe('1');
    expect(renderer.container.querySelector('[data-testid="chat-input"]')?.textContent).toBe('store input');
  });

  it('keeps the pointer-enabled composer layer constrained so the message scrollbar remains reachable', () => {
    renderChatArea();

    const input = renderer.container.querySelector('[data-testid="chat-input"]');
    const pointerLayer = input?.parentElement;

    expect(pointerLayer?.className).toContain('pointer-events-auto');
    expect(pointerLayer?.className).toContain('max-w-[var(--chat-content-width,44.35rem)]');
    expect(pointerLayer?.className).toContain('mx-auto');
  });

  it('hides width handles on empty welcome page and shows them when messages exist', () => {
    // 1. Empty messages -> blank welcome page -> width handles hidden
    renderChatArea();
    expect(renderer.container.querySelector('[data-width-handle="left"]')).toBeNull();
    expect(renderer.container.querySelector('[data-width-handle="right"]')).toBeNull();

    // 2. Active messages -> width handles rendered
    renderChatArea(
      createChatAreaProviderValue({
        messageList: {
          messages: [
            {
              id: 'message-1',
              role: 'user',
              content: 'hello',
              timestamp: new Date('2026-04-12T00:00:00.000Z'),
            },
          ],
        },
      }),
    );
    expect(renderer.container.querySelector('[data-width-handle="left"]')).not.toBeNull();
    expect(renderer.container.querySelector('[data-width-handle="right"]')).not.toBeNull();
  });

  it('does not focus the composer after a downward swipe in the chat area on mobile', () => {
    matchMediaMatches = true;
    windowInnerWidth = 390;
    Object.defineProperty(window, 'innerWidth', {
      configurable: true,
      writable: true,
      value: windowInnerWidth,
    });
    const providerValue = createChatAreaProviderValue();

    const composer = document.createElement('textarea');
    composer.dataset.chatInputTextarea = 'true';
    composer.value = 'Draft message';
    document.body.appendChild(composer);
    const focusSpy = vi.spyOn(composer, 'focus');
    const selectionSpy = vi.spyOn(composer, 'setSelectionRange');

    renderChatArea(providerValue);

    const chatArea = renderer.container.querySelector('.chat-bg-enhancement');
    expect(chatArea).not.toBeNull();

    act(() => {
      dispatchTouchEvent(chatArea!, 'touchstart', [{ clientX: 100, clientY: 160 }]);
      dispatchTouchEvent(chatArea!, 'touchend', [{ clientX: 102, clientY: 250 }]);
    });

    expect(focusSpy).not.toHaveBeenCalled();
    expect(selectionSpy).not.toHaveBeenCalled();
    expect(virtualKeyboardShow).not.toHaveBeenCalled();
  });
});
