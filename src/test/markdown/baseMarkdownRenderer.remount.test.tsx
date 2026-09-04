import { act, type ComponentProps } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setupTestRenderer } from '@/test/render/renderer';
import { BasicMarkdownRenderer } from '@/components/message/BasicMarkdownRenderer';

// jsdom reports scrollHeight as 0, so a long code block would never measure as
// overflowing and the expand control would never render. Mock the measurement
// on Element.prototype (where jsdom actually defines it) so every <pre> reports
// enough height to cross the 320px collapse threshold (useCodeBlock
// COLLAPSE_THRESHOLD_PX).
const SCROLL_HEIGHT_VALUE = 500;

const originalScrollHeightDescriptor = Object.getOwnPropertyDescriptor(Element.prototype, 'scrollHeight');

const LONG_CODE_BLOCK = `\`\`\`js
function longFunction() {
  const values = [];
  for (let i = 0; i < 200; i++) {
    values.push(i * i);
  }
  return values.reduce((sum, value) => sum + value, 0);
}

function anotherLongFunction() {
  const result = [];
  for (let i = 0; i < 200; i++) {
    result.push({ index: i, label: 'item-' + i, squared: i * i, cubed: i * i * i });
  }
  return result;
}

const data = anotherLongFunction();
console.log(data.length, longFunction());
\`\`\``;

type BasicMarkdownRendererProps = ComponentProps<typeof BasicMarkdownRenderer>;

const baseProps: BasicMarkdownRendererProps = {
  content: LONG_CODE_BLOCK,
  isLoading: false,
  onImageClick: vi.fn(),
  onOpenHtmlPreview: vi.fn(),
  expandCodeBlocksByDefault: false,
  isMermaidRenderingEnabled: false,
  isGraphvizRenderingEnabled: false,
  themeId: 'pearl',
  onOpenSidePanel: vi.fn(),
};

describe('BaseMarkdownRenderer CodeBlock remount regression', () => {
  const renderer = setupTestRenderer();

  beforeEach(() => {
    Object.defineProperty(Element.prototype, 'scrollHeight', {
      configurable: true,
      get: () => SCROLL_HEIGHT_VALUE,
    });
  });

  afterEach(() => {
    if (originalScrollHeightDescriptor) {
      Object.defineProperty(Element.prototype, 'scrollHeight', originalScrollHeightDescriptor);
    }
  });

  const collapseButton = () => renderer.container.querySelector<HTMLElement>('.code-block-expand-overlay button');

  const renderBlock = (props: BasicMarkdownRendererProps) => {
    act(() => {
      renderer.render(<BasicMarkdownRenderer {...props} />);
    });
  };

  it('keeps the code block expanded when the same content re-renders with fresh callback identities', () => {
    renderBlock({ ...baseProps });

    // The block measures as overflowing and is collapsed, so the expand overlay
    // renders with no button yet.
    expect(collapseButton()).toBeNull();

    act(() => {
      renderer.container.querySelector<HTMLElement>('.code-block-expand-overlay')!.click();
    });

    // Expanding mounts a collapse button.
    expect(collapseButton()).not.toBeNull();

    // Simulate the background churn that previously caused a remount: same
    // content, but every callback prop is a fresh identity (a new useChat
    // render with an unchanged chatState object produces this).
    renderBlock({ ...baseProps, onImageClick: vi.fn(), onOpenHtmlPreview: vi.fn(), onOpenSidePanel: vi.fn() });

    // The collapse button must survive the rerender — a remount would reset
    // useCodeBlock's expandedOverride back to null and collapse the block.
    expect(collapseButton()).not.toBeNull();
  });

  it('still collapses the block when the collapse button is clicked', () => {
    renderBlock({ ...baseProps });

    act(() => {
      renderer.container.querySelector<HTMLElement>('.code-block-expand-overlay')!.click();
    });

    expect(collapseButton()).not.toBeNull();

    act(() => {
      collapseButton()!.click();
    });

    // Collapsing removes the button again (the overlay is now a plain gradient).
    expect(collapseButton()).toBeNull();
  });
});
