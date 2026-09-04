import { act } from 'react';
import { setupProviderTestRenderer } from '@/test/render/providerRenderer';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { SavedChatSession } from '@/types';
import { createChatSettings } from '@/test/data/factories';
import { useChatStore } from '@/stores/chatStore';
import { SessionItem } from './SessionItem';

const makeSession = (id: string): SavedChatSession => ({
  id,
  title: `Chat ${id}`,
  timestamp: Date.now(),
  messages: [],
  settings: createChatSettings(),
});

const baseProps = {
  activeSessionId: null,
  editingItem: null,
  activeMenu: null,
  loadingSessionIds: new Set<string>(),
  generatingTitleSessionIds: new Set<string>(),
  newlyTitledSessionIds: new Set<string>(),
  groups: [],
  editInputRef: { current: null },
  menuRef: { current: null },
  onSelectSession: vi.fn(),
  onTogglePinSession: vi.fn(),
  onDeleteSession: vi.fn(),
  onDuplicateSession: vi.fn(),
  onOpenExportModal: vi.fn(),
  onMoveSessionToGroup: vi.fn(),
  handleStartEdit: vi.fn(),
  handleRenameConfirm: vi.fn(),
  handleRenameKeyDown: vi.fn(),
  setEditingItem: vi.fn(),
  toggleMenu: vi.fn(),
  setActiveMenu: vi.fn(),
  setDragOverId: vi.fn(),
  draggingSessionId: null,
  onSessionDragStart: vi.fn(),
  onSessionDragEnd: vi.fn(),
};

describe('SessionItem completed badge', () => {
  const renderer = setupProviderTestRenderer({ providers: { language: 'en' } });

  beforeEach(() => {
    vi.clearAllMocks();
    useChatStore.setState({ completedSessions: {} });
  });

  it('renders a green dot for a successfully completed session', () => {
    useChatStore.setState({ completedSessions: { s1: 'success' } });

    act(() => {
      renderer.render(<SessionItem {...baseProps} session={makeSession('s1')} />);
    });

    const dot = renderer.container.querySelector('.rounded-full.h-2.w-2');
    expect(dot).not.toBeNull();
    expect(dot?.getAttribute('class')).toContain('bg-[#22c55e]');
    expect(dot?.getAttribute('aria-label')).toBe('Completed');
  });

  it('renders a red dot for a failed session', () => {
    useChatStore.setState({ completedSessions: { s1: 'error' } });

    act(() => {
      renderer.render(<SessionItem {...baseProps} session={makeSession('s1')} />);
    });

    const dot = renderer.container.querySelector('.rounded-full.h-2.w-2');
    expect(dot).not.toBeNull();
    expect(dot?.getAttribute('class')).toContain('bg-[#ef4444]');
    expect(dot?.getAttribute('aria-label')).toBe('Generation failed');
  });

  it('renders no dot when the session has no completion record', () => {
    act(() => {
      renderer.render(<SessionItem {...baseProps} session={makeSession('s1')} />);
    });

    expect(renderer.container.querySelector('.rounded-full.h-2.w-2')).toBeNull();
  });

  it('does not render the completion dot while the session is loading (LoadingDots wins)', () => {
    useChatStore.setState({ completedSessions: { s1: 'success' } });

    act(() => {
      renderer.render(<SessionItem {...baseProps} session={makeSession('s1')} loadingSessionIds={new Set(['s1'])} />);
    });

    expect(renderer.container.querySelector('.rounded-full.h-2.w-2')).toBeNull();
  });

  it('clears the dot once the session is marked viewed', () => {
    useChatStore.setState({ completedSessions: { s1: 'success' } });

    act(() => {
      renderer.render(<SessionItem {...baseProps} session={makeSession('s1')} />);
    });
    expect(renderer.container.querySelector('.rounded-full.h-2.w-2')).not.toBeNull();

    act(() => {
      useChatStore.getState().markSessionViewed('s1');
    });

    expect(renderer.container.querySelector('.rounded-full.h-2.w-2')).toBeNull();
  });
});
