import { act } from 'react';
import { fireEvent } from '@testing-library/react';
import { setupProviderTestRenderer as setupTestRenderer } from '@/test/render/providerRenderer';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { createHistorySidebarProps } from '@/test/sidebar/historySidebar';
import { HistorySidebar } from './HistorySidebar';

vi.mock('@formkit/auto-animate/react', () => ({
  useAutoAnimate: () => [vi.fn()],
}));

describe('HistorySidebar resize functionality', () => {
  const renderer = setupTestRenderer({ providers: { language: 'en' } });

  beforeEach(() => {
    localStorage.clear();
  });

  it('renders resize handle when sidebar is open and has accessibility attributes', async () => {
    await act(async () => {
      renderer.root.render(<HistorySidebar {...createHistorySidebarProps({ isOpen: true })} />);
    });

    const handle = renderer.container.querySelector('[data-testid="sidebar-resize-handle"]');
    expect(handle).not.toBeNull();
    expect(handle?.getAttribute('role')).toBe('separator');
    expect(handle?.getAttribute('aria-orientation')).toBe('vertical');
    expect(handle?.getAttribute('aria-valuenow')).toBe('259');
  });

  it('does not render desktop resize handle when sidebar is closed', async () => {
    await act(async () => {
      renderer.root.render(<HistorySidebar {...createHistorySidebarProps({ isOpen: false })} />);
    });

    const handle = renderer.container.querySelector('[data-testid="sidebar-resize-handle"]');
    expect(handle).toBeNull();
  });

  it('adjusts width using keyboard arrow keys', async () => {
    await act(async () => {
      renderer.root.render(<HistorySidebar {...createHistorySidebarProps({ isOpen: true })} />);
    });

    const handle = renderer.container.querySelector<HTMLElement>('[data-testid="sidebar-resize-handle"]');
    expect(handle).not.toBeNull();

    act(() => {
      fireEvent.keyDown(handle!, { key: 'ArrowRight' });
    });

    expect(handle?.getAttribute('aria-valuenow')).toBe('269');
    expect(localStorage.getItem('amc-history-sidebar-width')).toBe('269');

    act(() => {
      fireEvent.keyDown(handle!, { key: 'ArrowLeft' });
    });

    expect(handle?.getAttribute('aria-valuenow')).toBe('259');
  });

  it('resets to default width on double click', async () => {
    localStorage.setItem('amc-history-sidebar-width', '350');

    await act(async () => {
      renderer.root.render(<HistorySidebar {...createHistorySidebarProps({ isOpen: true })} />);
    });

    const handle = renderer.container.querySelector<HTMLElement>('[data-testid="sidebar-resize-handle"]');
    expect(handle?.getAttribute('aria-valuenow')).toBe('350');

    act(() => {
      fireEvent.doubleClick(handle!);
    });

    expect(handle?.getAttribute('aria-valuenow')).toBe('259');
    expect(localStorage.getItem('amc-history-sidebar-width')).toBeNull();
  });
});
