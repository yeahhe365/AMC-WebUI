import { render, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ImageHighlightOverlay } from './ImageHighlightOverlay';
import { useMediaNavStore } from '@/stores/mediaNavStore';

describe('ImageHighlightOverlay', () => {
  it('renders box2d annotation with percentage positioning and HUD corner brackets', () => {
    const { container } = render(
      <ImageHighlightOverlay
        visible={true}
        highlight={{
          box2d: [100, 200, 500, 800],
          label: '关键物体',
        }}
      />,
    );
    const overlay = container.querySelector('[data-testid="image-highlight-overlay"]');
    expect(overlay).not.toBeNull();

    const box = container.querySelector('[data-testid="image-highlight-box"]') as HTMLElement | null;
    expect(box).not.toBeNull();
    expect(box?.style.top).toBe('10%');
    expect(box?.style.left).toBe('20%');
    expect(box?.style.height).toBe('40%');
    expect(box?.style.width).toBe('60%');

    expect(container.textContent).toContain('关键物体');
  });

  it('renders point annotation with target reticle and guide arrow', () => {
    const { container } = render(
      <ImageHighlightOverlay
        visible={true}
        highlight={{
          point: [300, 400],
          label: '目标按钮',
          arrow: 'top-left',
        }}
      />,
    );
    const overlay = container.querySelector('[data-testid="image-highlight-overlay"]');
    expect(overlay).not.toBeNull();

    const point = container.querySelector('[data-testid="image-highlight-point"]') as HTMLElement | null;
    expect(point).not.toBeNull();
    expect(point?.style.top).toBe('30%');
    expect(point?.style.left).toBe('40%');
    expect(container.textContent).toContain('目标按钮');
  });

  it('renders nothing when not visible or without coordinates', () => {
    const { container: hidden } = render(
      <ImageHighlightOverlay visible={false} highlight={{ box2d: [100, 200, 500, 800] }} />,
    );
    expect(hidden.firstChild).toBeNull();

    const { container: noCoords } = render(
      <ImageHighlightOverlay visible={true} highlight={{ label: '无坐标' } as any} />,
    );
    expect(noCoords.firstChild).toBeNull();
  });

  it('calls onClose or clears store when clicking close button', () => {
    const handleClose = vi.fn();
    const { container } = render(
      <ImageHighlightOverlay
        visible={true}
        highlight={{ point: [100, 100], label: '关闭测试' }}
        onClose={handleClose}
      />,
    );
    const closeBtn = container.querySelector('[data-testid="image-highlight-close"]');
    expect(closeBtn).not.toBeNull();
    if (closeBtn) {
      fireEvent.click(closeBtn);
      expect(handleClose).toHaveBeenCalledTimes(1);
    }
  });

  it('clears imageHighlight in mediaNavStore when onClose is not provided', () => {
    useMediaNavStore.setState({
      imageHighlight: { point: [100, 100], label: '默认关闭' },
    });

    const { container } = render(
      <ImageHighlightOverlay visible={true} highlight={{ point: [100, 100], label: '默认关闭' }} />,
    );
    const closeBtn = container.querySelector('[data-testid="image-highlight-close"]');
    expect(closeBtn).not.toBeNull();
    if (closeBtn) {
      fireEvent.click(closeBtn);
      expect(useMediaNavStore.getState().imageHighlight).toBeNull();
    }
  });

  it('normalizes inverted box2d coordinates safely', () => {
    const { container } = render(
      <ImageHighlightOverlay visible={true} highlight={{ box2d: [500, 800, 100, 200], label: '反转坐标' }} />,
    );
    const box = container.querySelector('[data-testid="image-highlight-box"]') as HTMLElement | null;
    expect(box).not.toBeNull();
    expect(box?.style.top).toBe('10%');
    expect(box?.style.left).toBe('20%');
    expect(box?.style.height).toBe('40%');
    expect(box?.style.width).toBe('60%');
  });

  it('prioritizes bounding box and avoids duplicate point reticle unless arrow is explicitly requested', () => {
    // 1. Both box2d and point, but NO arrow: only box is rendered
    const { container: boxOnlyContainer } = render(
      <ImageHighlightOverlay
        visible={true}
        highlight={{
          box2d: [100, 200, 300, 400],
          point: [200, 300],
          label: '无箭头时优先选框',
        }}
      />,
    );
    expect(boxOnlyContainer.querySelector('[data-testid="image-highlight-box"]')).not.toBeNull();
    expect(boxOnlyContainer.querySelector('[data-testid="image-highlight-point"]')).toBeNull();

    // 2. Both box2d and point WITH arrow: both box and arrow are rendered
    const { container: bothContainer } = render(
      <ImageHighlightOverlay
        visible={true}
        highlight={{
          box2d: [100, 200, 300, 400],
          point: [200, 300],
          arrow: 'bottom',
          label: '显式指定箭头',
        }}
      />,
    );
    expect(bothContainer.querySelector('[data-testid="image-highlight-box"]')).not.toBeNull();
    expect(bothContainer.querySelector('[data-testid="image-highlight-point"]')).not.toBeNull();
  });

  it('rotates guide arrow correctly towards target', () => {
    // Arrow from bottom pointing UP (rotation: 0deg)
    const { container: bottomContainer } = render(
      <ImageHighlightOverlay visible={true} highlight={{ point: [500, 500], arrow: 'bottom', label: '向上指' }} />,
    );
    const bottomArrow = bottomContainer.querySelector(
      '[data-testid="image-highlight-point"] > div:nth-child(2)',
    ) as HTMLElement;
    expect(bottomArrow?.style.transform).toContain('rotate(0deg)');

    // Arrow from top pointing DOWN (rotation: 180deg)
    const { container: topContainer } = render(
      <ImageHighlightOverlay visible={true} highlight={{ point: [500, 500], arrow: 'top', label: '向下指' }} />,
    );
    const topArrow = topContainer.querySelector(
      '[data-testid="image-highlight-point"] > div:nth-child(2)',
    ) as HTMLElement;
    expect(topArrow?.style.transform).toContain('rotate(180deg)');

    // Arrow from right pointing LEFT (rotation: -90deg)
    const { container: rightContainer } = render(
      <ImageHighlightOverlay visible={true} highlight={{ point: [500, 500], arrow: 'right', label: '向左指' }} />,
    );
    const rightArrow = rightContainer.querySelector(
      '[data-testid="image-highlight-point"] > div:nth-child(2)',
    ) as HTMLElement;
    expect(rightArrow?.style.transform).toContain('rotate(-90deg)');

    // Arrow from left pointing RIGHT (rotation: 90deg)
    const { container: leftContainer } = render(
      <ImageHighlightOverlay visible={true} highlight={{ point: [500, 500], arrow: 'left', label: '向右指' }} />,
    );
    const leftArrow = leftContainer.querySelector(
      '[data-testid="image-highlight-point"] > div:nth-child(2)',
    ) as HTMLElement;
    expect(leftArrow?.style.transform).toContain('rotate(90deg)');
  });

  it('applies inverse scale compensation to corner brackets, reticle, and badge', () => {
    const { container } = render(
      <ImageHighlightOverlay
        visible={true}
        scale={2}
        highlight={{
          box2d: [100, 200, 500, 800],
          label: '缩放补偿测试',
        }}
      />,
    );

    const box = container.querySelector('[data-testid="image-highlight-box"]') as HTMLElement;
    const corner = box.querySelector('div') as HTMLElement;
    // 1 / 2 = 0.5
    expect(corner.style.transform).toContain('scale(0.5)');

    const badge = container.querySelector('.inline-flex')?.parentElement as HTMLElement;
    expect(badge.style.transform).toContain('scale(0.5)');
  });

  it('renders multi-target highlights with switcher pill and allows switching targets', () => {
    const onSelectHighlight = vi.fn();
    const highlights = [
      { box2d: [100, 100, 300, 300] as [number, number, number, number], label: 'Item 1', index: 1, isActive: true },
      { box2d: [400, 400, 600, 600] as [number, number, number, number], label: 'Item 2', index: 2, isActive: false },
    ];

    const { container } = render(
      <ImageHighlightOverlay visible={true} highlights={highlights} onSelectHighlight={onSelectHighlight} />,
    );

    const switcher = container.querySelector('[data-testid="image-multi-highlight-switcher"]');
    expect(switcher).not.toBeNull();
    expect(switcher?.textContent).toContain('1/2');

    const inactiveBox = container.querySelector('[data-testid="image-inactive-box"]');
    expect(inactiveBox).not.toBeNull();

    // Click inactive box to switch
    fireEvent.click(inactiveBox!);
    expect(onSelectHighlight).toHaveBeenCalledWith(1);

    // Click next button on switcher
    const nextBtn = container.querySelector('[data-testid="image-highlight-next"]');
    fireEvent.click(nextBtn!);
    expect(onSelectHighlight).toHaveBeenCalledWith(1);
  });
});
