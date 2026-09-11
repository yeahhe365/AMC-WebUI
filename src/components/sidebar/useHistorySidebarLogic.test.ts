import { describe, expect, it, vi } from 'vitest';
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

const renderHistoryLogic = (sessions: SavedChatSession[]) => {
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
    }),
  );
};

describe('categorizeSessionsByDate', () => {
  it('places yesterday into its own category before previous 7 days', () => {
    const { result, unmount } = renderHistoryLogic([
      createSession('today', 0),
      createSession('yesterday', 1),
      createSession('previous', 2),
    ]);
    const { categoryOrder, categories } = result.current.categorizedUngroupedSessions;

    expect(categoryOrder).toEqual(['Today', 'Yesterday', 'Previous 7 Days']);
    expect(categories.Yesterday.map((session) => session.id)).toEqual(['yesterday']);
    unmount();
  });

  it('keeps previous 30 days separate from the new yesterday and previous 7 days buckets', () => {
    const { result, unmount } = renderHistoryLogic([createSession('older', 20)]);
    const { categoryOrder, categories } = result.current.categorizedUngroupedSessions;

    expect(categoryOrder).toEqual(['Previous 30 Days']);
    expect(categories['Previous 30 Days'].map((session) => session.id)).toEqual(['older']);
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
