import { act } from 'react';
import { setupTestRenderer } from '@/test/render/renderer';
import { describe, expect, it, vi } from 'vitest';
import { CodeBlock } from './CodeBlock';

const writeTextMock = vi.fn().mockResolvedValue(undefined);
Object.assign(navigator, {
  clipboard: {
    writeText: writeTextMock,
  },
});

describe('CodeBlock', () => {
  const renderer = setupTestRenderer();

  it('renders code block with line count badge in header and line numbers gutter by default', () => {
    act(() => {
      renderer.root.render(
        <CodeBlock
          onOpenHtmlPreview={vi.fn()}
          onOpenSidePanel={vi.fn()}
          expandCodeBlocksByDefault={false}
          className="language-python"
        >
          <code className="language-python">{'def hello():\n    print("world")\n    return True'}</code>
        </CodeBlock>,
      );
    });

    const badge = renderer.container.querySelector('[data-code-line-count]');
    expect(badge).not.toBeNull();
    expect(badge?.textContent).toBe('3 lines');

    // Line numbers gutter is visible by default with interactive line numbers
    const gutter = renderer.container.querySelector('[data-code-gutter]') as HTMLElement | null;
    expect(gutter).not.toBeNull();
    expect(gutter?.getAttribute('aria-hidden')).toBe('true');
    expect(gutter?.className).toContain('select-none');
    const lineItems = gutter?.querySelectorAll('[data-line-number]');
    expect(lineItems?.length).toBe(3);
    expect(lineItems?.[0]?.textContent).toBe('1');
    expect(lineItems?.[1]?.textContent).toBe('2');
    expect(lineItems?.[2]?.textContent).toBe('3');

    // Gutter is rendered in flex row with code
    expect(gutter?.parentElement?.className).toContain('flex');
  });

  it('does not apply overflow-hidden to root container to enable sticky header scrolling', () => {
    act(() => {
      renderer.root.render(
        <CodeBlock
          onOpenHtmlPreview={vi.fn()}
          onOpenSidePanel={vi.fn()}
          expandCodeBlocksByDefault={false}
          className="language-python"
        >
          <code className="language-python">{'print("hello")'}</code>
        </CodeBlock>,
      );
    });

    const root = renderer.container.firstElementChild as HTMLElement | null;
    expect(root).not.toBeNull();
    expect(root?.className).toContain('rounded-lg');
    expect(root?.className).toContain('border');
    expect(root?.className).not.toContain('overflow-hidden');
  });

  it('selects line content when line number in gutter is clicked', () => {
    act(() => {
      renderer.root.render(
        <CodeBlock
          onOpenHtmlPreview={vi.fn()}
          onOpenSidePanel={vi.fn()}
          expandCodeBlocksByDefault={false}
          className="language-python"
        >
          <code className="language-python">{'def hello():\n    print("world")\n    return True'}</code>
        </CodeBlock>,
      );
    });

    const line2 = renderer.container.querySelector('[data-line-number="2"]') as HTMLElement | null;
    expect(line2).not.toBeNull();

    act(() => {
      line2?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
    });

    const selection = window.getSelection();
    expect(selection?.toString()).toBe('    print("world")');

    // Shift-click to select lines 2 through 3
    const line3 = renderer.container.querySelector('[data-line-number="3"]') as HTMLElement | null;
    expect(line3).not.toBeNull();

    act(() => {
      line3?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0, shiftKey: true }));
    });

    expect(selection?.toString()).toBe('    print("world")\n    return True');
  });

  it('does not render a line numbers toggle button in the header toolbar', () => {
    act(() => {
      renderer.root.render(
        <CodeBlock
          onOpenHtmlPreview={vi.fn()}
          onOpenSidePanel={vi.fn()}
          expandCodeBlocksByDefault={false}
          className="language-python"
        >
          <code className="language-python">{'line 1\nline 2'}</code>
        </CodeBlock>,
      );
    });

    expect(renderer.container.querySelector('[title="Show line numbers"]')).toBeNull();
    expect(renderer.container.querySelector('[title="Hide line numbers"]')).toBeNull();
  });

  it('copies code without line numbers from the gutter', async () => {
    writeTextMock.mockClear();

    act(() => {
      renderer.root.render(
        <CodeBlock
          onOpenHtmlPreview={vi.fn()}
          onOpenSidePanel={vi.fn()}
          expandCodeBlocksByDefault={false}
          className="language-python"
        >
          <code className="language-python">{'line A\nline B'}</code>
        </CodeBlock>,
      );
    });

    expect(renderer.container.querySelector('[data-code-gutter]')).not.toBeNull();

    // Click copy button
    const copyBtn = renderer.container.querySelector('[title="Copy content"]') as HTMLButtonElement | null;
    expect(copyBtn).not.toBeNull();

    await act(async () => {
      copyBtn?.click();
    });

    expect(writeTextMock).toHaveBeenCalledWith('line A\nline B');
  });

  it('renders expand more button without displaying numbers when overflowing', () => {
    const originalScrollHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollHeight');
    Object.defineProperty(HTMLElement.prototype, 'scrollHeight', {
      configurable: true,
      get() {
        return 1000;
      },
    });

    try {
      act(() => {
        renderer.root.render(
          <CodeBlock
            onOpenHtmlPreview={vi.fn()}
            onOpenSidePanel={vi.fn()}
            expandCodeBlocksByDefault={false}
            className="language-python"
          >
            <code className="language-python">{'line 1\nline 2\nline 3\nline 4'}</code>
          </CodeBlock>,
        );
      });

      const expandOverlay = renderer.container.querySelector('.code-block-expand-overlay');
      expect(expandOverlay).not.toBeNull();
      // The button text should be "Show more" without any numbers like "(4)"
      expect(expandOverlay?.textContent).toBe('Show more');
      expect(expandOverlay?.textContent).not.toMatch(/\d+/);
    } finally {
      if (originalScrollHeight) {
        Object.defineProperty(HTMLElement.prototype, 'scrollHeight', originalScrollHeight);
      }
    }
  });

  it('renders filename in header when className contains language-name:filename syntax', () => {
    act(() => {
      renderer.root.render(
        <CodeBlock
          onOpenHtmlPreview={vi.fn()}
          onOpenSidePanel={vi.fn()}
          expandCodeBlocksByDefault={false}
          className="language-python:main.py"
        >
          <code className="language-python language-python:main.py">
            <span className="hljs-keyword">def</span> hello():
          </code>
        </CodeBlock>,
      );
    });

    expect(renderer.container.textContent).toContain('main.py');
    const keyword = renderer.container.querySelector('.hljs-keyword');
    expect(keyword).not.toBeNull();
    expect(keyword?.textContent).toBe('def');
  });

  it('does not apply pb-14 bottom padding to gutter and code when expanded, and renders collapse footer below pre', () => {
    const originalScrollHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollHeight');
    Object.defineProperty(HTMLElement.prototype, 'scrollHeight', {
      configurable: true,
      get() {
        return 1000;
      },
    });

    try {
      act(() => {
        renderer.root.render(
          <CodeBlock
            onOpenHtmlPreview={vi.fn()}
            onOpenSidePanel={vi.fn()}
            expandCodeBlocksByDefault={true}
            className="language-python"
          >
            <code className="language-python">{'line 1\nline 2\nline 3\nline 4'}</code>
          </CodeBlock>,
        );
      });

      const gutter = renderer.container.querySelector('[data-code-gutter]') as HTMLElement;
      expect(gutter).not.toBeNull();
      expect(gutter.className).not.toContain('pb-14');

      const codeContent = renderer.container.querySelector('[data-code-content]') as HTMLElement;
      expect(codeContent).not.toBeNull();
      expect(codeContent.className).not.toContain('pb-14');

      const collapseButton = renderer.container.querySelector('.code-block-expand-overlay button');
      expect(collapseButton).not.toBeNull();
      expect(collapseButton?.textContent).toContain('Show less');

      const pre = renderer.container.querySelector('pre');
      const footer = renderer.container.querySelector('.code-block-expand-overlay');
      expect(footer).not.toBeNull();
      expect(pre?.contains(footer)).toBe(false);
    } finally {
      if (originalScrollHeight) {
        Object.defineProperty(HTMLElement.prototype, 'scrollHeight', originalScrollHeight);
      }
    }
  });
});
