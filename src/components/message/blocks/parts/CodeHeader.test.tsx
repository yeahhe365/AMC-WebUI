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

  it('keeps header toolbar visible at all times without desktop sm:opacity-0 hiding', () => {
    act(() => {
      renderer.root.render(
        <CodeHeader
          language="python"
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

    const toolbar = renderer.container.querySelector('[data-code-header-toolbar]') as HTMLElement | null;
    expect(toolbar).not.toBeNull();
    expect(toolbar?.className).not.toContain('sm:opacity-0');
    expect(toolbar?.className).toContain('opacity-90');
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

  it('renders a checkmark and downloaded title when isDownloaded is true', () => {
    act(() => {
      renderer.root.render(
        <CodeHeader
          language="python"
          showPreview={false}
          isOverflowing={false}
          isExpanded={false}
          isCopied={false}
          isDownloaded={true}
          onToggleExpand={vi.fn()}
          onCopy={vi.fn()}
          onDownload={vi.fn()}
          onOpenSide={vi.fn()}
          onOpenPreview={vi.fn()}
        />,
      );
    });

    const downloadedBtn = renderer.container.querySelector('[title="Downloaded"]');
    expect(downloadedBtn).not.toBeNull();
    expect(downloadedBtn?.querySelector('svg')?.getAttribute('width')).toBe('16');
    expect(downloadedBtn?.querySelector('.text-\\[var\\(--theme-text-success\\)\\]')).not.toBeNull();
  });

  it('renders wrap toggle button and handles click correctly', () => {
    const onToggleWrap = vi.fn();

    act(() => {
      renderer.root.render(
        <CodeHeader
          language="python"
          showPreview={false}
          isOverflowing={false}
          isExpanded={false}
          isCopied={false}
          isWrapped={false}
          onToggleWrap={onToggleWrap}
          onToggleExpand={vi.fn()}
          onCopy={vi.fn()}
          onDownload={vi.fn()}
          onOpenSide={vi.fn()}
          onOpenPreview={vi.fn()}
        />,
      );
    });

    const wrapBtn = renderer.container.querySelector('[title="Wrap lines"]') as HTMLButtonElement | null;
    expect(wrapBtn).not.toBeNull();
    expect(wrapBtn?.getAttribute('aria-label')).toBe('Wrap lines');

    act(() => {
      wrapBtn?.click();
    });

    expect(onToggleWrap).toHaveBeenCalledTimes(1);

    // When isWrapped is true
    act(() => {
      renderer.root.render(
        <CodeHeader
          language="python"
          showPreview={false}
          isOverflowing={false}
          isExpanded={false}
          isCopied={false}
          isWrapped={true}
          onToggleWrap={onToggleWrap}
          onToggleExpand={vi.fn()}
          onCopy={vi.fn()}
          onDownload={vi.fn()}
          onOpenSide={vi.fn()}
          onOpenPreview={vi.fn()}
        />,
      );
    });

    const unwrapBtn = renderer.container.querySelector('[title="Unwrap lines"]') as HTMLButtonElement | null;
    expect(unwrapBtn).not.toBeNull();
    expect(unwrapBtn?.getAttribute('aria-label')).toBe('Unwrap lines');
    expect(unwrapBtn?.className).toContain('text-[var(--theme-text-link)]');
  });

  it('renders filename without duplicating language text', () => {
    act(() => {
      renderer.root.render(
        <CodeHeader
          language="python"
          filename="main.py"
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

    const header = renderer.container.firstElementChild as HTMLElement;
    const filenameEl = header.querySelector('span[title="main.py"]');
    expect(filenameEl).not.toBeNull();
    expect(filenameEl?.textContent).toBe('main.py');

    // Language badge shows Python once, not duplicated
    const meta = header.querySelector('[data-language-meta]');
    expect(meta?.textContent?.trim()).toBe('Python');
    // Ensure the left title area does not have a second python label
    const leftTitleArea = header.querySelector('.flex.min-w-0');
    expect(leftTitleArea?.textContent).toBe('Pythonmain.py');
  });

  it('renders line count badge when lineCount is provided and positive', () => {
    act(() => {
      renderer.root.render(
        <CodeHeader
          language="python"
          lineCount={42}
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

    const badge = renderer.container.querySelector('[data-code-line-count]');
    expect(badge).not.toBeNull();
    expect(badge?.textContent).toBe('42 lines');

    // Does not render badge when lineCount is 0
    act(() => {
      renderer.root.render(
        <CodeHeader
          language="python"
          lineCount={0}
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

    expect(renderer.container.querySelector('[data-code-line-count]')).toBeNull();
  });

  it('does not render a line numbers toggle button in the toolbar', () => {
    act(() => {
      renderer.root.render(
        <CodeHeader
          language="python"
          lineCount={42}
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

    expect(renderer.container.querySelector('[title="Show line numbers"]')).toBeNull();
    expect(renderer.container.querySelector('[title="Hide line numbers"]')).toBeNull();
  });

  it('triggers onToggleExpand when clicking anywhere on the header bar if overflowing', () => {
    const onToggleExpand = vi.fn();

    act(() => {
      renderer.root.render(
        <CodeHeader
          language="python"
          lineCount={42}
          showPreview={false}
          isOverflowing={true}
          isExpanded={false}
          isCopied={false}
          onToggleExpand={onToggleExpand}
          onCopy={vi.fn()}
          onDownload={vi.fn()}
          onOpenSide={vi.fn()}
          onOpenPreview={vi.fn()}
        />,
      );
    });

    const header = renderer.container.firstElementChild as HTMLElement;
    expect(header.className).toContain('cursor-pointer');
    expect(header.getAttribute('role')).toBe('button');
    expect(header.getAttribute('aria-expanded')).toBe('false');

    // Click on the header background/title
    act(() => {
      header.click();
    });

    expect(onToggleExpand).toHaveBeenCalledTimes(1);

    // Keyboard trigger (Enter key)
    act(() => {
      header.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    });

    expect(onToggleExpand).toHaveBeenCalledTimes(2);

    // Clicking a toolbar button should not trigger onToggleExpand twice
    const copyBtn = renderer.container.querySelector('[title="Copy content"]') as HTMLElement;
    act(() => {
      copyBtn.click();
    });

    // onToggleExpand should still be 2 (stopPropagation worked)
    expect(onToggleExpand).toHaveBeenCalledTimes(2);
  });
});
