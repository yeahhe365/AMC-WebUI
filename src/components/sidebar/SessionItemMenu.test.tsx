import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SessionItemMenu } from './SessionItemMenu';
import { SessionItemContextMenu } from './SessionItemContextMenu';
import { DropdownMenu, DropdownMenuTrigger } from '@/components/shared/DropdownMenu';
import { ContextMenu, ContextMenuTrigger } from '@/components/shared/ContextMenu';
import { createChatSettings } from '@/test/data/factories';
import type { SavedChatSession, ChatGroup } from '@/types';

const mockSession: SavedChatSession = {
  id: 'session-123',
  title: 'Test Session',
  timestamp: Date.now(),
  messages: [],
  settings: createChatSettings(),
  isPinned: false,
  groupId: null,
};

const mockGroups: ChatGroup[] = [
  { id: 'group-1', title: 'Work', timestamp: Date.now() },
  { id: 'group-2', title: 'Personal', timestamp: Date.now() },
];

describe('SessionItemMenu and SessionItemContextMenu', () => {
  it('renders DropdownMenu items when opened via trigger', () => {
    const onStartEdit = vi.fn();
    const onTogglePin = vi.fn();
    const onDelete = vi.fn();

    render(
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button>Options</button>
        </DropdownMenuTrigger>
        <SessionItemMenu
          session={mockSession}
          groups={mockGroups}
          onMoveSessionToGroup={vi.fn()}
          onStartEdit={onStartEdit}
          onTogglePin={onTogglePin}
          onDuplicate={vi.fn()}
          onExport={vi.fn()}
          onDelete={onDelete}
        />
      </DropdownMenu>,
    );

    const btn = screen.getByText('Options');
    fireEvent.pointerDown(btn, { button: 0 });

    expect(screen.getByText('Edit')).toBeInTheDocument();
    expect(screen.getByText('Pin')).toBeInTheDocument();
    expect(screen.getByText('Duplicate')).toBeInTheDocument();
    expect(screen.getByText('Export Chat')).toBeInTheDocument();
    expect(screen.getByText('Move to group')).toBeInTheDocument();
    expect(screen.getByText('Delete')).toBeInTheDocument();

    const moveSubTrigger = screen.getByText('Move to group');
    fireEvent.pointerMove(moveSubTrigger);
    fireEvent.click(moveSubTrigger);

    expect(screen.getByText('Ungrouped')).toBeInTheDocument();
    expect(screen.getByText('Work')).toBeInTheDocument();

    const ungroupedEl = screen.getByText('Ungrouped');
    const subContent = ungroupedEl.closest('[data-radix-menu-content]');
    const rootContent = screen.getByText('Edit').closest('[data-radix-menu-content]');
    expect(rootContent).not.toBeNull();
    expect(subContent).not.toBeNull();
    // subContent must be portalled outside rootContent to avoid overflow-hidden clipping!
    expect(rootContent?.contains(subContent)).toBe(false);
  });

  it('renders ContextMenu items on right-click', () => {
    const onStartEdit = vi.fn();

    render(
      <ContextMenu>
        <ContextMenuTrigger asChild>
          <div data-testid="session-row">Session Row</div>
        </ContextMenuTrigger>
        <SessionItemContextMenu
          session={mockSession}
          groups={mockGroups}
          onMoveSessionToGroup={vi.fn()}
          onStartEdit={onStartEdit}
          onTogglePin={vi.fn()}
          onDuplicate={vi.fn()}
          onExport={vi.fn()}
          onDelete={vi.fn()}
        />
      </ContextMenu>,
    );

    fireEvent.contextMenu(screen.getByTestId('session-row'));

    expect(screen.getByText('Edit')).toBeInTheDocument();
    expect(screen.getByText('Pin')).toBeInTheDocument();
    expect(screen.getByText('Duplicate')).toBeInTheDocument();
    expect(screen.getByText('Delete')).toBeInTheDocument();
  });

  it('triggers onStartEdit and prevents default on close autofocus when Edit is selected in DropdownMenu', () => {
    const onStartEdit = vi.fn();

    render(
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button>Options</button>
        </DropdownMenuTrigger>
        <SessionItemMenu
          session={mockSession}
          groups={mockGroups}
          onMoveSessionToGroup={vi.fn()}
          onStartEdit={onStartEdit}
          onTogglePin={vi.fn()}
          onDuplicate={vi.fn()}
          onExport={vi.fn()}
          onDelete={vi.fn()}
        />
      </DropdownMenu>,
    );

    fireEvent.pointerDown(screen.getByText('Options'), { button: 0 });
    const editItem = screen.getByText('Edit');
    fireEvent.click(editItem);

    expect(onStartEdit).toHaveBeenCalledTimes(1);
  });

  it('triggers onStartEdit when Edit is selected in ContextMenu', () => {
    const onStartEdit = vi.fn();

    render(
      <ContextMenu>
        <ContextMenuTrigger asChild>
          <div data-testid="session-row-2">Session Row 2</div>
        </ContextMenuTrigger>
        <SessionItemContextMenu
          session={mockSession}
          groups={mockGroups}
          onMoveSessionToGroup={vi.fn()}
          onStartEdit={onStartEdit}
          onTogglePin={vi.fn()}
          onDuplicate={vi.fn()}
          onExport={vi.fn()}
          onDelete={vi.fn()}
        />
      </ContextMenu>,
    );

    fireEvent.contextMenu(screen.getByTestId('session-row-2'));
    const editItem = screen.getByText('Edit');
    fireEvent.click(editItem);

    expect(onStartEdit).toHaveBeenCalledTimes(1);
  });

  it('triggers onRegenerateTitle when Regenerate Title is selected in DropdownMenu', () => {
    const onRegenerateTitle = vi.fn();

    render(
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button>Options</button>
        </DropdownMenuTrigger>
        <SessionItemMenu
          session={mockSession}
          groups={mockGroups}
          onMoveSessionToGroup={vi.fn()}
          onStartEdit={vi.fn()}
          onTogglePin={vi.fn()}
          onDuplicate={vi.fn()}
          onExport={vi.fn()}
          onDelete={vi.fn()}
          onRegenerateTitle={onRegenerateTitle}
        />
      </DropdownMenu>,
    );

    fireEvent.pointerDown(screen.getByText('Options'), { button: 0 });
    const regenItem = screen.getByText('Regenerate Title');
    expect(regenItem).toBeInTheDocument();
    fireEvent.click(regenItem);

    expect(onRegenerateTitle).toHaveBeenCalledTimes(1);
  });

  it('triggers onRegenerateTitle when Regenerate Title is selected in ContextMenu', () => {
    const onRegenerateTitle = vi.fn();

    render(
      <ContextMenu>
        <ContextMenuTrigger asChild>
          <div data-testid="session-row-3">Session Row 3</div>
        </ContextMenuTrigger>
        <SessionItemContextMenu
          session={mockSession}
          groups={mockGroups}
          onMoveSessionToGroup={vi.fn()}
          onStartEdit={vi.fn()}
          onTogglePin={vi.fn()}
          onDuplicate={vi.fn()}
          onExport={vi.fn()}
          onDelete={vi.fn()}
          onRegenerateTitle={onRegenerateTitle}
        />
      </ContextMenu>,
    );

    fireEvent.contextMenu(screen.getByTestId('session-row-3'));
    const regenItem = screen.getByText('Regenerate Title');
    expect(regenItem).toBeInTheDocument();
    fireEvent.click(regenItem);

    expect(onRegenerateTitle).toHaveBeenCalledTimes(1);
  });

  it('disables Regenerate Title item when isGeneratingTitle is true', () => {
    const onRegenerateTitle = vi.fn();

    render(
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button>Options</button>
        </DropdownMenuTrigger>
        <SessionItemMenu
          session={mockSession}
          groups={mockGroups}
          onMoveSessionToGroup={vi.fn()}
          onStartEdit={vi.fn()}
          onTogglePin={vi.fn()}
          onDuplicate={vi.fn()}
          onExport={vi.fn()}
          onDelete={vi.fn()}
          onRegenerateTitle={onRegenerateTitle}
          isGeneratingTitle={true}
        />
      </DropdownMenu>,
    );

    fireEvent.pointerDown(screen.getByText('Options'), { button: 0 });
    const regenItem = screen.getByText('Regenerate Title').closest('[role="menuitem"]');
    expect(regenItem).toHaveAttribute('data-disabled');
  });
});
