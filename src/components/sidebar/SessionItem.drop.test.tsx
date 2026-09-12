import { act } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { setupProviderTestRenderer } from '@/test/render/providerRenderer';
import type { SavedChatSession } from '@/types';
import { createChatSettings } from '@/test/data/factories';
import { SessionItem } from './SessionItem';

const makeSession = (id: string, isPinned = false): SavedChatSession => ({
  id,
  title: `Chat ${id}`,
  timestamp: 1_000,
  messages: [],
  settings: createChatSettings(),
  isPinned,
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
  onSessionDragStart: vi.fn(),
  onSessionDragEnd: vi.fn(),
};

/** DragEvent 在 jsdom 里不完整，用 MouseEvent（DragEvent 的父类）承载 clientY，再挂上 dataTransfer。 */
const createDropEvent = (draggedId: string, clientY: number) => {
  const event = new MouseEvent('drop', { bubbles: true, cancelable: true, clientY });
  Object.defineProperty(event, 'dataTransfer', {
    configurable: true,
    value: {
      types: ['sessionid'],
      getData: (type: string) => (type === 'sessionid' || type === 'text/plain' ? draggedId : ''),
    },
  });
  return event;
};

describe('SessionItem reorder drop', () => {
  const renderer = setupProviderTestRenderer({ providers: { language: 'en' } });

  it('reports before/after resolved from the pointer position', () => {
    const onReorderSession = vi.fn();
    act(() => {
      renderer.render(
        <SessionItem
          {...baseProps}
          session={makeSession('session-b')}
          draggingSessionId="session-a"
          onReorderSession={onReorderSession}
        />,
      );
    });

    const item = renderer.container.querySelector('li') as HTMLLIElement;
    item.getBoundingClientRect = () => ({ top: 0, height: 40 }) as DOMRect;

    act(() => {
      item.dispatchEvent(createDropEvent('session-a', 30));
    });
    expect(onReorderSession).toHaveBeenLastCalledWith('session-a', 'session-b', 'after');

    act(() => {
      item.dispatchEvent(createDropEvent('session-a', 5));
    });
    expect(onReorderSession).toHaveBeenLastCalledWith('session-a', 'session-b', 'before');
  });

  it('ignores a drop of the row onto itself', () => {
    const onReorderSession = vi.fn();
    act(() => {
      renderer.render(
        <SessionItem
          {...baseProps}
          session={makeSession('session-a')}
          draggingSessionId="session-a"
          onReorderSession={onReorderSession}
        />,
      );
    });

    const item = renderer.container.querySelector('li') as HTMLLIElement;
    act(() => {
      item.dispatchEvent(createDropEvent('session-a', 30));
    });

    expect(onReorderSession).not.toHaveBeenCalled();
  });

  it('shows the pin hint only when the drop lands in the pinned zone', () => {
    act(() => {
      renderer.render(
        <SessionItem
          {...baseProps}
          session={makeSession('session-b', true)}
          draggingSessionId="session-a"
          dropIndicator={{ id: 'session-b', position: 'before', willPin: true }}
        />,
      );
    });
    expect(renderer.container.textContent).toContain('Drop to pin');

    act(() => {
      renderer.render(
        <SessionItem
          {...baseProps}
          session={makeSession('session-b', true)}
          draggingSessionId="session-a"
          dropIndicator={{ id: 'session-b', position: 'before', willPin: false }}
        />,
      );
    });
    expect(renderer.container.textContent).not.toContain('Drop to pin');
  });

  it('disables dragging and dropping in the time view', () => {
    const onReorderSession = vi.fn();
    act(() => {
      renderer.render(
        <SessionItem
          {...baseProps}
          session={makeSession('session-b')}
          draggingSessionId="session-a"
          disableNativeDrag
          onReorderSession={onReorderSession}
        />,
      );
    });

    const item = renderer.container.querySelector('li') as HTMLLIElement;
    expect(renderer.container.querySelector('a')?.getAttribute('draggable')).toBe('false');

    act(() => {
      item.dispatchEvent(createDropEvent('session-a', 30));
    });
    expect(onReorderSession).not.toHaveBeenCalled();
  });
});
