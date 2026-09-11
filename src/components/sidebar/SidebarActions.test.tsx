import React, { act, useState } from 'react';
import { setupTestRenderer } from '@/test/render/renderer';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SidebarActions } from './SidebarActions';

const setInputValue = (input: HTMLInputElement, value: string) => {
  const descriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
  descriptor?.set?.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
};

const SidebarActionsHarness = ({
  onNewChat = vi.fn(),
  onCloseSidebar = vi.fn(),
}: {
  onNewChat?: () => void;
  onCloseSidebar?: () => void;
}) => {
  const [isSearching, setIsSearching] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  return (
    <SidebarActions
      onNewChat={onNewChat}
      onCloseSidebar={onCloseSidebar}
      onAddNewGroup={vi.fn()}
      isSearching={isSearching}
      searchQuery={searchQuery}
      setIsSearching={setIsSearching}
      setSearchQuery={setSearchQuery}
    />
  );
};

describe('SidebarActions', () => {
  const renderer = setupTestRenderer();
  const render = (node: React.ReactNode) => {
    act(() => {
      renderer.render(node);
    });

    return renderer.container;
  };

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders New Group as its own full-row action below Search', () => {
    const container = render(
      <SidebarActions
        onNewChat={vi.fn()}
        onAddNewGroup={vi.fn()}
        isSearching={false}
        searchQuery=""
        setIsSearching={vi.fn()}
        setSearchQuery={vi.fn()}
      />,
    );

    const actionLabels = Array.from(container.querySelectorAll('a, button'))
      .map((element) => element.textContent?.trim())
      .filter((value): value is string => Boolean(value));
    const folderIcon = container.querySelector('[data-testid="new-group-folder-icon"]');

    expect(actionLabels.slice(0, 4)).toEqual(['New Chat', 'Library', 'Search', 'New Group']);
    expect(folderIcon).not.toBeNull();
    expect(folderIcon?.getAttribute('viewBox')).toBe('0 0 24 24');
    expect(folderIcon?.getAttribute('width')).toBe('18');
    expect(folderIcon?.getAttribute('height')).toBe('18');
    expect(folderIcon?.getAttribute('stroke-width')).toBe('2.2');
    expect(folderIcon?.querySelectorAll('path').length).toBeGreaterThan(0);
    expect(container.querySelector('[data-testid="new-group-icon"]')).toBeNull();
  });

  it('uses a tighter shared vertical stack for the primary sidebar actions', () => {
    const container = render(
      <SidebarActions
        onNewChat={vi.fn()}
        onAddNewGroup={vi.fn()}
        isSearching={false}
        searchQuery=""
        setIsSearching={vi.fn()}
        setSearchQuery={vi.fn()}
      />,
    );

    const actionStack = container.querySelector('[data-testid="sidebar-actions-stack"]');
    expect(actionStack?.className).toContain('space-y-1');
  });

  it('renders configured shortcuts as hover-revealed action row hints', () => {
    const originalPlatform = Object.getOwnPropertyDescriptor(window.navigator, 'platform')?.value;
    Object.defineProperty(window.navigator, 'platform', { value: 'MacIntel', configurable: true });

    const container = render(
      <SidebarActions
        onNewChat={vi.fn()}
        onAddNewGroup={vi.fn()}
        isSearching={false}
        searchQuery=""
        setIsSearching={vi.fn()}
        setSearchQuery={vi.fn()}
        newChatShortcut="⌘ + Shift + O"
        searchChatsShortcut="⌘ + K"
      />,
    );

    const shortcuts = Array.from(container.querySelectorAll('[data-testid="sidebar-action-shortcut"]'));
    const actionRows = Array.from(container.querySelectorAll('a, button')).slice(0, 3);

    // Cherry Studio KbdGroup 借鉴：每个按键独立胶囊
    const firstKeys = Array.from(shortcuts[0].querySelectorAll('[data-testid="sidebar-shortcut-key"]')).map(
      (el) => el.textContent,
    );
    const secondKeys = Array.from(shortcuts[1].querySelectorAll('[data-testid="sidebar-shortcut-key"]')).map(
      (el) => el.textContent,
    );
    expect(firstKeys).toEqual(['⇧', '⌘', 'O']);
    expect(secondKeys).toEqual(['⌘', 'K']);
    for (const shortcut of shortcuts) {
      expect(shortcut.className).toContain('inline-flex');
      expect(shortcut.className).toContain('gap-1');
      expect(shortcut.className).toContain('opacity-0');
      expect(shortcut.className).toContain('group-hover:opacity-100');
      expect(shortcut.className).toContain('group-focus-visible:opacity-100');
      expect(shortcut.className).toContain('transition-opacity');
      expect(shortcut.getAttribute('title')).toBeTruthy();
      for (const keyEl of Array.from(shortcut.querySelectorAll('[data-testid="sidebar-shortcut-key"]'))) {
        expect(keyEl.className).toContain('h-5');
        expect(keyEl.className).toContain('min-w-5');
        expect(keyEl.className).toContain('rounded-md');
        expect(keyEl.className).toContain('border');
        expect(keyEl.className).toContain('bg-[var(--theme-bg-tertiary)]');
        expect(keyEl.className).toContain('text-[11px]');
        expect(keyEl.className).toContain('font-medium');
      }
    }

    Object.defineProperty(window.navigator, 'platform', {
      value: originalPlatform ?? '',
      configurable: true,
    });
    for (const actionRow of actionRows) {
      expect(actionRow.className).toContain('h-9');
      expect(actionRow.className).toContain('rounded-lg');
      expect(actionRow.className).not.toContain('hover:border');
      expect(actionRow).not.toHaveAttribute('title');
    }
  });

  it('clears the search query when Escape closes the search input', () => {
    const container = render(<SidebarActionsHarness />);

    const openSearchButton = Array.from(container.querySelectorAll('button')).find(
      (element) => element.textContent?.trim() === 'Search',
    );
    expect(openSearchButton).not.toBeUndefined();

    act(() => {
      openSearchButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    const searchInput = container.querySelector('input');
    expect(searchInput).not.toBeNull();

    act(() => {
      setInputValue(searchInput as HTMLInputElement, 'invoice');
    });
    expect((searchInput as HTMLInputElement).value).toBe('invoice');

    act(() => {
      searchInput?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });

    const reopenedSearchButton = Array.from(container.querySelectorAll('button')).find(
      (element) => element.textContent?.trim() === 'Search',
    );
    expect(reopenedSearchButton).not.toBeUndefined();

    act(() => {
      reopenedSearchButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    const reopenedInput = container.querySelector('input');
    expect((reopenedInput as HTMLInputElement).value).toBe('');
  });

  it('only applies the focused search border while the input is actually focused', () => {
    const container = render(<SidebarActionsHarness />);

    const openSearchButton = Array.from(container.querySelectorAll('button')).find(
      (element) => element.textContent?.trim() === 'Search',
    );
    expect(openSearchButton).not.toBeUndefined();

    act(() => {
      openSearchButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    const searchInput = container.querySelector('input');
    const searchShell = searchInput?.parentElement;

    expect(searchShell).not.toBeNull();
    expect(searchShell?.className).toContain('border-[var(--theme-border-secondary)]');
    expect(searchShell?.className).toContain('focus-within:border-[var(--theme-border-focus)]');
    expect(searchShell?.className).not.toContain('border-[var(--theme-border-focus)] rounded-lg');
  });

  it('closes the sidebar after starting a new chat on mobile', () => {
    Object.defineProperty(window, 'innerWidth', {
      configurable: true,
      value: 375,
      writable: true,
    });

    const onNewChat = vi.fn();
    const onCloseSidebar = vi.fn();
    const container = render(<SidebarActionsHarness onNewChat={onNewChat} onCloseSidebar={onCloseSidebar} />);

    const newChatLink = container.querySelector('a');
    expect(newChatLink).not.toBeNull();

    act(() => {
      newChatLink?.dispatchEvent(new MouseEvent('click', { bubbles: true, button: 0 }));
    });

    expect(onNewChat).toHaveBeenCalledTimes(1);
    expect(onCloseSidebar).toHaveBeenCalledTimes(1);
  });
});
