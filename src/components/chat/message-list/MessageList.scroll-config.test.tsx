import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import type { ChatMessage } from '@/types';
import { createChatAreaProviderValue, renderWithChatAreaProviders } from '@/test/layout/fixtures';
import { MessageList } from './MessageList';
import type { VirtuosoMockProps } from '@/test/message-list/doubles';
import { AVAILABLE_THEMES } from '@/constants/themeRegistry';
import { useSettingsStore } from '@/stores/settingsStore';

const virtuosoPropsSpy = vi.hoisted(() => vi.fn());

vi.mock('react-virtuoso', async () => {
  const { createVirtuosoMock } = await import('@/test/message-list/doubles');

  return createVirtuosoMock<ChatMessage>(virtuosoPropsSpy);
});

vi.mock('@/components/message/Message', async () => {
  const { createMessageRowMock } = await import('@/test/message-list/doubles');

  return createMessageRowMock();
});

vi.mock('@/components/modals/FileConfigModal', async () => {
  const { createNullComponentMock } = await import('@/test/message-list/doubles');

  return createNullComponentMock('FileConfigModal');
});

vi.mock('./hooks/useMessageListUi', async () => {
  const { createMessageListUiMock } = await import('@/test/message-list/doubles');

  return createMessageListUiMock();
});

vi.mock('./hooks/useMessageListScroll', async () => {
  const { createMessageListScrollMock } = await import('@/test/message-list/doubles');

  return createMessageListScrollMock({ scrollerRef: null });
});

vi.mock('./ScrollNavigation', async () => {
  const { createNullComponentMock } = await import('@/test/message-list/doubles');

  return createNullComponentMock('ScrollNavigation');
});

vi.mock('./TextSelectionToolbar', async () => {
  const { createNullComponentMock } = await import('@/test/message-list/doubles');

  return createNullComponentMock('TextSelectionToolbar');
});

vi.mock('./MessageListFooter', async () => {
  const { createNullComponentMock } = await import('@/test/message-list/doubles');

  return createNullComponentMock('MessageListFooter');
});

vi.mock('./WelcomeScreen', async () => {
  const { createNullComponentMock } = await import('@/test/message-list/doubles');

  return createNullComponentMock('WelcomeScreen');
});

const messages: ChatMessage[] = [
  {
    id: 'message-1',
    role: 'user',
    content: 'Hello',
    timestamp: new Date('2026-04-10T00:00:00.000Z'),
  },
];

const createProviderValue = () =>
  createChatAreaProviderValue({
    messageList: {
      messages,
      sessionTitle: 'Test',
      currentModelId: 'gemini-2.5-flash',
    },
  });

describe('MessageList scroll configuration', () => {
  let unmount: (() => void) | null;

  beforeEach(() => {
    virtuosoPropsSpy.mockClear();
    unmount = null;
  });

  afterEach(() => {
    unmount?.();
    vi.clearAllMocks();
  });

  it('configures Virtuoso to pre-render around the viewport and use stable message keys', () => {
    ({ unmount } = renderWithChatAreaProviders(<MessageList />, { value: createProviderValue() }));

    expect(virtuosoPropsSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        increaseViewportBy: { bottom: 800, top: 1200 },
        atBottomThreshold: 40,
        computeItemKey: expect.any(Function),
        followOutput: expect.any(Function),
      }),
    );

    const props = virtuosoPropsSpy.mock.calls[0]?.[0] as VirtuosoMockProps<ChatMessage> & {
      className?: string;
      followOutput?: (isAtBottom: boolean) => false | 'auto';
    };
    expect(props.computeItemKey?.(0, messages[0])).toBe('message-1');
    expect(props.followOutput?.(true)).toBe('auto');
    expect(props.followOutput?.(false)).toBe(false);
    expect(props.className).toContain('chat-message-list-scroller');
  });

  it('keeps Virtuoso structural props stable across unrelated rerenders', () => {
    ({ unmount } = renderWithChatAreaProviders(<MessageList />, { value: createProviderValue() }));

    const initialProps = virtuosoPropsSpy.mock.calls[0]?.[0] as VirtuosoMockProps<ChatMessage>;

    act(() => {
      useSettingsStore.setState({ currentTheme: AVAILABLE_THEMES.find((theme) => theme.id !== 'pearl') });
    });

    const latestProps = virtuosoPropsSpy.mock.calls.at(-1)?.[0] as VirtuosoMockProps<ChatMessage>;

    expect(latestProps.components).toBe(initialProps.components);
    expect(latestProps.itemContent).toBe(initialProps.itemContent);
  });
});
