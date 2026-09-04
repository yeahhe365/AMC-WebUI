import { act } from 'react';
import { setupTestRenderer } from '@/test/render/renderer';
import { describe, expect, it, vi } from 'vitest';
import { HelpModal } from './HelpModal';

vi.mock('@/hooks/useCopyToClipboard', () => ({
  useCopyToClipboard: () => ({
    copyToClipboard: vi.fn(),
  }),
}));

describe('HelpModal', () => {
  const renderer = setupTestRenderer();

  it('localizes the search, copy, and empty-state text', async () => {
    await act(async () => {
      renderer.root.render(<HelpModal isOpen onClose={vi.fn()} commands={[]} />);
    });

    const searchInput = document.querySelector('input');
    expect(searchInput?.getAttribute('placeholder')).toBe('Search commands...');
    expect(document.body.textContent).toContain('No commands found');
    expect(document.body.textContent).toContain('Tip');
  });

  it('adds visible keyboard focus styles to close and copy actions', async () => {
    await act(async () => {
      renderer.root.render(
        <HelpModal
          isOpen
          onClose={vi.fn()}
          commands={[{ name: '/artifacts', description: 'Toggle Live Artifacts', icon: 'artifacts' }]}
        />,
      );
    });

    const closeButton = document.body.querySelector('button[aria-label="Close help modal"]');
    const copyButton = Array.from(document.body.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('/artifacts'),
    );

    expect(closeButton?.className).toContain('focus-visible:ring-2');
    expect(copyButton?.className).toContain('focus-visible:ring-2');
  });

  it('uses a quiet search field and command rows', async () => {
    await act(async () => {
      renderer.root.render(
        <HelpModal
          isOpen
          onClose={vi.fn()}
          commands={[{ name: '/artifacts', description: 'Toggle Live Artifacts', icon: 'artifacts' }]}
        />,
      );
    });

    const searchInput = document.querySelector('input');
    const html = document.body.innerHTML;

    expect(searchInput?.getAttribute('type')).toBe('search');
    expect(searchInput?.className).toContain('border-transparent');
    expect(html).not.toContain('w-10 h-10');
    expect(html).not.toContain('text-[var(--theme-text-link)]');
  });
});
