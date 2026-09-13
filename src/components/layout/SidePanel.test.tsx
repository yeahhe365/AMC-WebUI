import { act } from 'react';
import { fireEvent } from '@testing-library/react';
import { setupProviderTestRenderer as setupTestRenderer } from '@/test/render/providerRenderer';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { SidePanel } from './SidePanel';

vi.mock('@/utils/lazyNamedComponent', () => ({
  lazyNamedComponent: () => () => <div data-testid="mock-lazy">Mock Component</div>,
}));

vi.mock('@/hooks/ui/useHtmlPreviewGraphvizRelay', () => ({
  useHtmlPreviewGraphvizRelay: vi.fn(),
}));

describe('SidePanel resize functionality', () => {
  const renderer = setupTestRenderer({ providers: { language: 'en' } });

  beforeEach(() => {
    localStorage.clear();
  });

  it('renders resize handle with accessibility attributes and initial width', () => {
    act(() => {
      renderer.root.render(
        <SidePanel
          content={{
            type: 'html',
            content: 'console.log("hello");',
            language: 'javascript',
            title: 'Test Code',
          }}
          onClose={vi.fn()}
          themeId="light"
        />,
      );
    });

    const handle = renderer.container.querySelector('[data-testid="sidepanel-resize-handle"]');
    expect(handle).not.toBeNull();
    expect(handle?.getAttribute('role')).toBe('separator');
    expect(handle?.getAttribute('aria-orientation')).toBe('vertical');
    expect(handle?.getAttribute('aria-valuenow')).toBe('600');
  });

  it('adjusts width using keyboard arrow keys', () => {
    act(() => {
      renderer.root.render(
        <SidePanel
          content={{
            type: 'html',
            content: 'console.log("hello");',
            language: 'javascript',
            title: 'Test Code',
          }}
          onClose={vi.fn()}
          themeId="light"
        />,
      );
    });

    const handle = renderer.container.querySelector<HTMLElement>('[data-testid="sidepanel-resize-handle"]');
    expect(handle).not.toBeNull();

    act(() => {
      fireEvent.keyDown(handle!, { key: 'ArrowLeft' });
    });

    expect(handle?.getAttribute('aria-valuenow')).toBe('620');
    expect(localStorage.getItem('amc-sidepanel-width')).toBe('620');

    act(() => {
      fireEvent.keyDown(handle!, { key: 'ArrowRight' });
    });

    expect(handle?.getAttribute('aria-valuenow')).toBe('600');
  });

  it('resets to default width on double click', () => {
    localStorage.setItem('amc-sidepanel-width', '750');

    act(() => {
      renderer.root.render(
        <SidePanel
          content={{
            type: 'html',
            content: 'console.log("hello");',
            language: 'javascript',
            title: 'Test Code',
          }}
          onClose={vi.fn()}
          themeId="light"
        />,
      );
    });

    const handle = renderer.container.querySelector<HTMLElement>('[data-testid="sidepanel-resize-handle"]');
    expect(handle?.getAttribute('aria-valuenow')).toBe('750');

    act(() => {
      fireEvent.doubleClick(handle!);
    });

    expect(handle?.getAttribute('aria-valuenow')).toBe('600');
    expect(localStorage.getItem('amc-sidepanel-width')).toBeNull();
  });

  it('renders fixed full-screen without relative class on mobile', async () => {
    const useDeviceModule = await import('@/hooks/useDevice');
    const isMobileSpy = vi.spyOn(useDeviceModule, 'useIsMobile').mockReturnValue(true);

    try {
      act(() => {
        renderer.root.render(
          <SidePanel
            content={{
              type: 'html',
              content: 'console.log("hello");',
              language: 'javascript',
              title: 'Test Code',
            }}
            onClose={vi.fn()}
            themeId="light"
          />,
        );
      });

      const panel = renderer.container.querySelector<HTMLElement>('.slide-in-right-animate');
      expect(panel).not.toBeNull();
      expect(panel?.className).toContain('fixed');
      expect(panel?.className).toContain('inset-0');
      expect(panel?.className).not.toContain('relative');
    } finally {
      isMobileSpy.mockRestore();
    }
  });
});
