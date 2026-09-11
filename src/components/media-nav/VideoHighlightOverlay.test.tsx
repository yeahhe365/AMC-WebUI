import { render, fireEvent, act } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { VideoHighlightOverlay } from './VideoHighlightOverlay';

describe('VideoHighlightOverlay', () => {
  it('renders box2d annotation with percentage positioning and viewfinder style', () => {
    const { container } = render(
      <VideoHighlightOverlay visible={true} annotation={{ box2d: [100, 200, 500, 800], snippet: '关键物体' }} />,
    );
    const overlay = container.querySelector('[data-testid="video-highlight-overlay"]');
    expect(overlay).not.toBeNull();

    const box = container.querySelector('[data-testid="video-highlight-box"]') as HTMLElement | null;
    expect(box).not.toBeNull();
    expect(box?.style.top).toBe('10%');
    expect(box?.style.left).toBe('20%');
    expect(box?.style.height).toBe('40%');
    expect(box?.style.width).toBe('60%');

    expect(container.textContent).toContain('关键物体');
  });

  it('renders point annotation with focus reticle and ping indicator', () => {
    const { container } = render(
      <VideoHighlightOverlay visible={true} annotation={{ point: [300, 400], snippet: '特定按钮' }} />,
    );
    const overlay = container.querySelector('[data-testid="video-highlight-overlay"]');
    expect(overlay).not.toBeNull();

    const point = container.querySelector('[data-testid="video-highlight-point"]');
    expect(point).not.toBeNull();
    expect(container.textContent).toContain('特定按钮');
  });

  it('renders nothing when not visible or without coordinates', () => {
    const { container: hidden } = render(
      <VideoHighlightOverlay visible={false} annotation={{ box2d: [100, 200, 500, 800] }} />,
    );
    expect(hidden.firstChild).toBeNull();

    const { container: noCoords } = render(<VideoHighlightOverlay visible={true} annotation={{ snippet: '无坐标' }} />);
    expect(noCoords.firstChild).toBeNull();
  });

  it('calls onClose when clicking close button', () => {
    const handleClose = vi.fn();
    const { container } = render(
      <VideoHighlightOverlay
        visible={true}
        annotation={{ point: [100, 100], snippet: '关闭测试' }}
        onClose={handleClose}
      />,
    );
    const closeButton = container.querySelector('button[aria-label="Close annotation"]');
    expect(closeButton).not.toBeNull();
    if (closeButton) {
      fireEvent.click(closeButton);
      expect(handleClose).toHaveBeenCalledTimes(1);
    }
  });

  it('correctly maps to displayRect when provided, eliminating letterbox/pillarbox offset', () => {
    const { container } = render(
      <VideoHighlightOverlay
        visible={true}
        annotation={{ box2d: [100, 200, 500, 800], snippet: '精准定位' }}
        displayRect={{ top: 45, left: 20, width: 440, height: 270 }}
      />,
    );
    const overlay = container.querySelector('[data-testid="video-highlight-overlay"]') as HTMLElement | null;
    expect(overlay).not.toBeNull();
    expect(overlay?.style.top).toBe('45px');
    expect(overlay?.style.left).toBe('20px');
    expect(overlay?.style.width).toBe('440px');
    expect(overlay?.style.height).toBe('270px');
  });

  it('normalizes inverted box2d coordinates safely', () => {
    const { container } = render(
      <VideoHighlightOverlay visible={true} annotation={{ box2d: [500, 800, 100, 200], snippet: '反转坐标' }} />,
    );
    const box = container.querySelector('[data-testid="video-highlight-box"]') as HTMLElement | null;
    expect(box).not.toBeNull();
    expect(box?.style.top).toBe('10%');
    expect(box?.style.left).toBe('20%');
    expect(box?.style.height).toBe('40%');
    expect(box?.style.width).toBe('60%');
  });

  it('applies animate-reticle-pulse on entry', () => {
    const { container } = render(
      <VideoHighlightOverlay visible={true} annotation={{ box2d: [100, 200, 500, 800], snippet: '脉冲测试' }} />,
    );
    const box = container.querySelector('[data-testid="video-highlight-box"]');
    expect(box?.classList.contains('animate-reticle-pulse')).toBe(true);
  });

  it('auto-dims during video playback and restores on hover or pause', () => {
    vi.useFakeTimers();

    const { container, rerender } = render(
      <VideoHighlightOverlay
        visible={true}
        isPlaying={true}
        annotation={{ box2d: [100, 200, 500, 800], snippet: '淡出测试' }}
      />,
    );

    const overlay = container.querySelector('[data-testid="video-highlight-overlay"]') as HTMLElement;
    expect(overlay.className).toContain('opacity-100');

    // Fast-forward 2.5s
    act(() => {
      vi.advanceTimersByTime(2600);
    });
    rerender(
      <VideoHighlightOverlay
        visible={true}
        isPlaying={true}
        annotation={{ box2d: [100, 200, 500, 800], snippet: '淡出测试' }}
      />,
    );

    expect(overlay.className).toContain('opacity-25');

    // Hover over overlay restores full opacity
    fireEvent.mouseEnter(overlay);
    expect(overlay.className).toContain('opacity-100');

    fireEvent.mouseLeave(overlay);
    expect(overlay.className).toContain('opacity-25');

    // Paused restores full opacity
    rerender(
      <VideoHighlightOverlay
        visible={true}
        isPlaying={false}
        annotation={{ box2d: [100, 200, 500, 800], snippet: '淡出测试' }}
      />,
    );
    expect(overlay.className).toContain('opacity-100');

    vi.useRealTimers();
  });
});
