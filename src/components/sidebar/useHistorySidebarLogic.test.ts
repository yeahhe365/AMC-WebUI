import { describe, expect, it, vi } from 'vitest';
import { act, type DragEvent } from 'react';
import type { SavedChatSession } from '@/types';
import { createChatSettings } from '@/test/data/factories';
import { renderHook } from '@/test/render/renderer';
import { useSettingsStore } from '@/stores/settingsStore';
import { useHistorySidebarLogic } from './useHistorySidebarLogic';

const createSession = (id: string, daysAgo: number): SavedChatSession => {
  const timestamp = new Date();
  timestamp.setHours(12, 0, 0, 0);
  timestamp.setDate(timestamp.getDate() - daysAgo);

  return {
    id,
    title: id,
    timestamp: timestamp.getTime(),
    messages: [],
    settings: createChatSettings(),
  };
};

const renderHistoryLogic = (
  sessions: SavedChatSession[],
  overrides: Partial<Parameters<typeof useHistorySidebarLogic>[0]> = {},
) => {
  useSettingsStore.setState({ language: 'en' });

  return renderHook(() =>
    useHistorySidebarLogic({
      isOpen: true,
      onToggle: () => {},
      onAutoClose: () => {},
      sessions,
      groups: [],
      generatingTitleSessionIds: new Set(),
      onRenameSession: () => {},
      onRenameGroup: () => {},
      onMoveSessionToGroup: () => {},
      onSelectSession: () => {},
      ...overrides,
    }),
  );
};

const createDragOverEvent = (clientY: number) =>
  ({
    preventDefault: () => {},
    stopPropagation: () => {},
    clientY,
    currentTarget: { getBoundingClientRect: () => ({ top: 0, height: 40 }) },
    dataTransfer: { types: ['sessionid'], dropEffect: 'none' },
  }) as unknown as DragEvent;

describe('sidebar date grouping', () => {
  it('only categorizes by date in time mode', () => {
    const sessions = [createSession('today', 0), createSession('yesterday', 1), createSession('previous', 2)];

    const grouped = renderHistoryLogic(sessions);
    expect(grouped.result.current.categorizedUngroupedSessions.categoryOrder).toEqual([]);
    grouped.unmount();

    const timed = renderHistoryLogic(sessions, { displayMode: 'time' });
    const { categoryOrder, categories } = timed.result.current.categorizedUngroupedSessions;
    expect(categoryOrder).toEqual(['Today', 'Yesterday', 'Previous 7 Days']);
    expect(categories.Yesterday.map((session) => session.id)).toEqual(['yesterday']);
    timed.unmount();
  });

  it('exposes a flat unpinned ungrouped list in group mode', () => {
    const sessions = [
      { ...createSession('plain-newer', 0), sortOrder: 2_097_152 },
      { ...createSession('pinned', 1), isPinned: true, sortOrder: 1_048_576 },
      { ...createSession('plain-older', 2), sortOrder: 1_048_576 },
    ];

    const { result, unmount } = renderHistoryLogic(sessions);

    expect(result.current.unpinnedUngroupedSessions.map((session) => session.id)).toEqual([
      'plain-older',
      'plain-newer',
    ]);
    unmount();
  });
});

describe('handleSessionDragOver', () => {
  it('resolves the drop position from the pointer and keeps willPin false over an unpinned row', () => {
    const sessions = [createSession('a', 0), createSession('b', 1)];
    const { result, unmount } = renderHistoryLogic(sessions);

    act(() => {
      result.current.handleSessionDragStart('a');
    });
    act(() => {
      result.current.handleSessionDragOver(createDragOverEvent(5), 'b');
    });

    expect(result.current.sessionDropIndicator).toEqual({ id: 'b', position: 'before', willPin: false });
    unmount();
  });

  it('flags willPin when an unpinned session is dragged over a pinned row', () => {
    const sessions = [createSession('a', 0), { ...createSession('b', 1), isPinned: true }];
    const { result, unmount } = renderHistoryLogic(sessions);

    act(() => {
      result.current.handleSessionDragStart('a');
    });
    act(() => {
      result.current.handleSessionDragOver(createDragOverEvent(35), 'b');
    });

    expect(result.current.sessionDropIndicator).toEqual({ id: 'b', position: 'after', willPin: true });
    unmount();
  });
});

describe('handleRegenerateTitle', () => {
  it('delegates to onRegenerateTitleSession prop when provided', async () => {
    const customRegen = vi.fn();
    const { result, unmount } = renderHook(() =>
      useHistorySidebarLogic({
        isOpen: true,
        onToggle: () => {},
        onAutoClose: () => {},
        sessions: [createSession('s1', 0)],
        groups: [],
        generatingTitleSessionIds: new Set(),
        onRenameSession: () => {},
        onRenameGroup: () => {},
        onMoveSessionToGroup: () => {},
        onSelectSession: () => {},
        onRegenerateTitleSession: customRegen,
      }),
    );

    await result.current.handleRegenerateTitle('s1');
    expect(customRegen).toHaveBeenCalledWith('s1');
    unmount();
  });

  it('shows toast when session has no completed exchanges', async () => {
    const { useToastStore } = await import('@/stores/toastStore');
    useToastStore.setState({ toasts: [] });

    const { result, unmount } = renderHistoryLogic([createSession('empty-sess', 0)]);
    await result.current.handleRegenerateTitle('empty-sess');

    const toasts = useToastStore.getState().toasts;
    expect(toasts.length).toBeGreaterThan(0);
    expect(toasts[0].type).toBe('info');
    unmount();
  });
});
