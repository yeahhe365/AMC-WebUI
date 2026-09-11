import { render, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ImageMinimap } from './ImageMinimap';

describe('ImageMinimap', () => {
  it('renders nothing when scale is <= 1.1', () => {
    const { container } = render(
      <ImageMinimap
        src="data:image/png;base64,demo"
        scale={1.0}
        pan={{ x: 0, y: 0 }}
        imageDimensions={{ width: 800, height: 600 }}
        viewportDimensions={{ width: 800, height: 600 }}
        rotation={0}
        onPanTo={vi.fn()}
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders radar viewport rect when scale > 1.2', () => {
    const { container } = render(
      <ImageMinimap
        src="data:image/png;base64,demo"
        scale={2.0}
        pan={{ x: 0, y: 0 }}
        imageDimensions={{ width: 800, height: 600 }}
        viewportDimensions={{ width: 800, height: 600 }}
        rotation={0}
        highlights={[{ box2d: [100, 200, 300, 400] }]}
        onPanTo={vi.fn()}
      />,
    );
    const minimap = container.querySelector('[data-testid="image-minimap"]');
    expect(minimap).not.toBeNull();

    const radar = container.querySelector('[data-testid="image-minimap-viewport"]');
    expect(radar).not.toBeNull();

    const dot = container.querySelector('[data-testid="image-minimap-dot"]');
    expect(dot).not.toBeNull();
  });

  it('calls onPanTo when clicking on the minimap', () => {
    const onPanTo = vi.fn();
    const { container } = render(
      <ImageMinimap
        src="data:image/png;base64,demo"
        scale={3.0}
        pan={{ x: 0, y: 0 }}
        imageDimensions={{ width: 800, height: 600 }}
        viewportDimensions={{ width: 800, height: 600 }}
        rotation={0}
        onPanTo={onPanTo}
      />,
    );

    const minimap = container.querySelector('[data-testid="image-minimap"]');
    expect(minimap).not.toBeNull();

    // Mock getBoundingClientRect
    vi.spyOn(minimap!, 'getBoundingClientRect').mockReturnValue({
      left: 100,
      top: 100,
      width: 120,
      height: 90,
      right: 220,
      bottom: 190,
      x: 100,
      y: 100,
      toJSON: () => {},
    });

    fireEvent.click(minimap!, { clientX: 160, clientY: 145 });
    expect(onPanTo).toHaveBeenCalled();
  });
});
