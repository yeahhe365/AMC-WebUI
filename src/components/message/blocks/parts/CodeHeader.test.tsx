import { act } from 'react';
import { setupTestRenderer } from '@/test/render/renderer';
import { describe, expect, it, vi } from 'vitest';
import { CodeHeader } from './CodeHeader';

describe('CodeHeader', () => {
  const renderer = setupTestRenderer();

  it('uses the dedicated code block header chrome and keeps all controls visible', () => {
    act(() => {
      renderer.root.render(
        <CodeHeader
          language="python"
          showPreview
          isOverflowing
          isExpanded={false}
          isCopied={false}
          onToggleExpand={vi.fn()}
          onCopy={vi.fn()}
          onDownload={vi.fn()}
          onOpenSide={vi.fn()}
          onOpenPreview={vi.fn()}
          canRun
          isRunning={false}
          onRun={vi.fn()}
        />,
      );
    });

    const header = renderer.container.firstElementChild as HTMLElement | null;
    const toolbar = renderer.container.querySelector('[data-code-header-toolbar]');

    expect(header).not.toBeNull();
    expect(header?.className).toContain('bg-[var(--theme-bg-code-block-header)]');
    expect(header?.className).not.toContain('backdrop-blur');
    expect(header?.className).toContain('border-b');
    expect(header?.className.split(/\s+/)).toContain('z-10');
    expect(header?.className.split(/\s+/)).not.toContain('z-30');
    expect(header?.className.split(/\s+/)).toContain('select-none');
    expect(header?.className.split(/\s+/)).toContain('py-0');
    expect(toolbar).not.toBeNull();
    expect(toolbar?.className.split(/\s+/)).toContain('gap-0.5');
    expect(toolbar?.className).not.toContain('border');
    expect(renderer.container.querySelector('[title="Run Python Code"]')).not.toBeNull();
    expect(renderer.container.querySelector('[title="Open in Side Panel"]')).not.toBeNull();
    expect(renderer.container.querySelector('[title="Monitor Fullscreen"]')).toBeNull();
    expect(renderer.container.querySelector('[title="Open preview"]')).not.toBeNull();
    expect(renderer.container.querySelector('[title="Download PYTHON"]')).not.toBeNull();
    expect(renderer.container.querySelector('[title="Copy content"]')).not.toBeNull();
    expect(renderer.container.querySelector('[title="Expand"]')).not.toBeNull();
    expect((renderer.container.querySelector('[title="Copy content"]') as HTMLElement | null)?.className).toContain(
      '!min-h-10',
    );
    expect((renderer.container.querySelector('[title="Copy content"]') as HTMLElement | null)?.className).toContain(
      '!min-w-10',
    );
    expect(renderer.container.querySelector('[title="Copy content"] svg')?.getAttribute('width')).toBe('16');
    expect(renderer.container.querySelector('[title="Copy content"] svg')?.getAttribute('height')).toBe('16');
  });

  it('shows the upgraded TSX language badge inside the header', () => {
    act(() => {
      renderer.root.render(
        <CodeHeader
          language="tsx"
          showPreview={false}
          isOverflowing={false}
          isExpanded={false}
          isCopied={false}
          onToggleExpand={vi.fn()}
          onCopy={vi.fn()}
          onDownload={vi.fn()}
          onOpenSide={vi.fn()}
          onOpenPreview={vi.fn()}
        />,
      );
    });

    const badge = renderer.container.querySelector('[data-language-badge="tsx"]');
    const meta = renderer.container.querySelector('[data-language-meta]');

    expect(badge).not.toBeNull();
    expect(meta?.textContent?.trim()).toBe('TSX');
    expect(badge?.textContent).not.toContain('TypeScript React');
  });
});
