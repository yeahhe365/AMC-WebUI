import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import {
  Command,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandShortcut,
  CommandDialog,
} from './Command';

describe('Command Component', () => {
  it('renders command menu and allows typing to filter items', () => {
    const onSelect = vi.fn();

    render(
      <Command>
        <CommandInput placeholder="Type a command..." />
        <CommandList>
          <CommandEmpty>No results found.</CommandEmpty>
          <CommandGroup heading="Suggestions">
            <CommandItem onSelect={onSelect} value="calendar">
              <span>Calendar</span>
              <CommandShortcut>⌘C</CommandShortcut>
            </CommandItem>
            <CommandItem value="settings">
              <span>Settings</span>
              <CommandShortcut>⌘S</CommandShortcut>
            </CommandItem>
          </CommandGroup>
        </CommandList>
      </Command>,
    );

    expect(screen.getByPlaceholderText('Type a command...')).toBeInTheDocument();
    expect(screen.getByText('Calendar')).toBeInTheDocument();
    expect(screen.getByText('Settings')).toBeInTheDocument();
    expect(screen.getByText('⌘C')).toBeInTheDocument();

    const calendarItem = screen.getByText('Calendar');
    fireEvent.click(calendarItem);
    expect(onSelect).toHaveBeenCalled();
  });

  it('renders CommandDialog when open is true', () => {
    render(
      <CommandDialog open={true} onOpenChange={vi.fn()}>
        <CommandInput placeholder="Search everything..." />
        <CommandList>
          <CommandItem value="test">Test Item</CommandItem>
        </CommandList>
      </CommandDialog>,
    );

    expect(screen.getByPlaceholderText('Search everything...')).toBeInTheDocument();
    expect(screen.getByText('Test Item')).toBeInTheDocument();
  });
});
