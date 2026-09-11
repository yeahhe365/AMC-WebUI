import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import {
  ContextMenu,
  ContextMenuTrigger,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuShortcut,
} from './ContextMenu';

describe('ContextMenu', () => {
  it('opens context menu content on right click', () => {
    render(
      <ContextMenu>
        <ContextMenuTrigger asChild>
          <div data-testid="context-target">Right Click Me</div>
        </ContextMenuTrigger>
        <ContextMenuContent>
          <ContextMenuItem>
            Context Item 1<ContextMenuShortcut>⌘C</ContextMenuShortcut>
          </ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem variant="danger">Danger Item</ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>,
    );

    const target = screen.getByTestId('context-target');
    expect(target).toBeInTheDocument();

    fireEvent.contextMenu(target);

    expect(screen.getByText('Context Item 1')).toBeInTheDocument();
    expect(screen.getByText('⌘C')).toBeInTheDocument();
    expect(screen.getByText('Danger Item')).toBeInTheDocument();
  });
});
