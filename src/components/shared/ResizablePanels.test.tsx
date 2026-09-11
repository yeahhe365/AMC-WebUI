import { act } from 'react';
import { fireEvent } from '@testing-library/react';
import { setupProviderTestRenderer as setupTestRenderer } from '@/test/render/providerRenderer';
import { describe, expect, it, vi } from 'vitest';
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from './ResizablePanels';

describe('ResizablePanels', () => {
  const renderer = setupTestRenderer({ providers: { language: 'en' } });

  it('renders panels and resize handle with accessibility attributes', () => {
    act(() => {
      renderer.root.render(
        <ResizablePanelGroup orientation="horizontal">
          <ResizablePanel id="left" defaultSize={30}>
            <div>Left Content</div>
          </ResizablePanel>
          <ResizableHandle ariaLabel="Resize sidebar" title="Drag to resize" />
          <ResizablePanel id="right" defaultSize={70}>
            <div>Right Content</div>
          </ResizablePanel>
        </ResizablePanelGroup>,
      );
    });

    expect(renderer.container.textContent).toContain('Left Content');
    expect(renderer.container.textContent).toContain('Right Content');

    const separator = renderer.container.querySelector('[role="separator"]');
    expect(separator).not.toBeNull();
    expect(separator?.getAttribute('aria-label')).toBe('Resize sidebar');
    expect(separator?.getAttribute('title')).toBe('Drag to resize');

    const grip = renderer.container.querySelector('[data-testid="resize-grip"]');
    expect(grip).not.toBeNull();
  });

  it('triggers onDoubleClick when separator is double-clicked', () => {
    const onDoubleClick = vi.fn();

    act(() => {
      renderer.root.render(
        <ResizablePanelGroup orientation="horizontal">
          <ResizablePanel id="left" defaultSize={50}>
            <div>Pane 1</div>
          </ResizablePanel>
          <ResizableHandle onDoubleClick={onDoubleClick} />
          <ResizablePanel id="right" defaultSize={50}>
            <div>Pane 2</div>
          </ResizablePanel>
        </ResizablePanelGroup>,
      );
    });

    const separator = renderer.container.querySelector('[role="separator"]');
    expect(separator).not.toBeNull();

    act(() => {
      fireEvent.doubleClick(separator!);
    });

    expect(onDoubleClick).toHaveBeenCalledTimes(1);
  });
});
