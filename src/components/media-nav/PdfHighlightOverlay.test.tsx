import { render, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useMediaNavStore } from '@/stores/mediaNavStore';
import { PdfHighlightOverlay } from './PdfHighlightOverlay';

describe('PdfHighlightOverlay', () => {
  it('converts 0-1000 box2d coordinates to percentages with viewfinder style', () => {
    const { container } = render(
      <PdfHighlightOverlay highlight={{ pageNumber: 2, box2d: [100, 200, 500, 800], snippet: '营收' }} />,
    );
    const box = container.querySelector('[data-testid="pdf-highlight-box"]') as HTMLElement | null;
    expect(box).not.toBeNull();
    expect(box?.style.top).toBe('10%');
    expect(box?.style.left).toBe('20%');
    expect(box?.style.height).toBe('40%');
    expect(box?.style.width).toBe('60%');
    expect(container.textContent).toContain('营收');
  });

  it('normalizes inverted box2d coordinates safely', () => {
    const { container } = render(
      <PdfHighlightOverlay highlight={{ pageNumber: 2, box2d: [500, 800, 100, 200], snippet: '反转坐标' }} />,
    );
    const box = container.querySelector('[data-testid="pdf-highlight-box"]') as HTMLElement | null;
    expect(box).not.toBeNull();
    expect(box?.style.top).toBe('10%');
    expect(box?.style.left).toBe('20%');
    expect(box?.style.height).toBe('40%');
    expect(box?.style.width).toBe('60%');
  });

  it('renders point annotation with focus reticle and radar indicator', () => {
    const { container } = render(
      <PdfHighlightOverlay highlight={{ pageNumber: 2, point: [350, 450], snippet: '关键图表点' }} />,
    );
    const point = container.querySelector('[data-testid="pdf-highlight-point"]') as HTMLElement | null;
    expect(point).not.toBeNull();
    expect(point?.style.top).toBe('35%');
    expect(point?.style.left).toBe('45%');
    expect(container.textContent).toContain('关键图表点');
  });

  it('renders nothing without a box or point, or when visible is false', () => {
    const { container: noCoords } = render(<PdfHighlightOverlay highlight={{ pageNumber: 2, snippet: 'x' }} />);
    expect(noCoords.firstChild).toBeNull();

    const { container: hidden } = render(
      <PdfHighlightOverlay visible={false} highlight={{ pageNumber: 2, box2d: [100, 100, 200, 200] }} />,
    );
    expect(hidden.firstChild).toBeNull();
  });

  it('calls onClose when clicking close button if provided', () => {
    const handleClose = vi.fn();
    const { container } = render(
      <PdfHighlightOverlay
        highlight={{ pageNumber: 2, box2d: [200, 200, 400, 400], snippet: '测试关闭' }}
        onClose={handleClose}
      />,
    );
    const closeBtn = container.querySelector('[data-testid="pdf-highlight-close"]');
    expect(closeBtn).not.toBeNull();
    if (closeBtn) {
      fireEvent.click(closeBtn);
      expect(handleClose).toHaveBeenCalledTimes(1);
    }
  });

  it('clears highlight in store when clicking close without onClose prop', () => {
    useMediaNavStore.getState().setHighlight({ pageNumber: 2, box2d: [100, 100, 200, 200] });
    expect(useMediaNavStore.getState().highlight).not.toBeNull();

    const { container } = render(
      <PdfHighlightOverlay highlight={{ pageNumber: 2, box2d: [100, 100, 200, 200], snippet: '测试Store关闭' }} />,
    );
    const closeBtn = container.querySelector('[data-testid="pdf-highlight-close"]');
    expect(closeBtn).not.toBeNull();
    if (closeBtn) {
      fireEvent.click(closeBtn);
      expect(useMediaNavStore.getState().highlight).toBeNull();
    }
  });

  it('positions HUD bubble downwards when near top edge', () => {
    const { container } = render(
      <PdfHighlightOverlay highlight={{ pageNumber: 1, box2d: [50, 200, 100, 400], snippet: '顶部元素' }} />,
    );
    const hud = container.querySelector('.inline-flex')?.parentElement;
    expect(hud).not.toBeNull();
    expect(hud?.style.transform).toContain('translateY(8px)');
  });

  it('rotates coordinates correctly when rotation prop is provided', () => {
    const { container } = render(
      <PdfHighlightOverlay
        highlight={{ pageNumber: 2, box2d: [100, 200, 500, 800], snippet: '旋转测试' }}
        rotation={90}
      />,
    );
    const box = container.querySelector('[data-testid="pdf-highlight-box"]') as HTMLElement | null;
    expect(box).not.toBeNull();
    // 90 deg clockwise: y' = xmin=200, x' = 1000-ymax=500, h' = xmax-xmin=600, w' = ymax-ymin=400
    expect(box?.style.top).toBe('20%');
    expect(box?.style.left).toBe('50%');
    expect(box?.style.height).toBe('60%');
    expect(box?.style.width).toBe('40%');
  });
});
