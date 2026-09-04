import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import PdfHighlightOverlay from './PdfHighlightOverlay';

describe('PdfHighlightOverlay', () => {
  it('converts 0-1000 box2d coordinates to percentages', () => {
    const { container } = render(
      <PdfHighlightOverlay highlight={{ pageNumber: 2, box2d: [100, 200, 500, 800], snippet: '营收' }} />,
    );
    const box = container.querySelector('.absolute.rounded-lg') as HTMLElement | null;
    expect(box).not.toBeNull();
    expect(box?.style.top).toBe('10%');
    expect(box?.style.left).toBe('20%');
    expect(box?.style.height).toBe('40%');
    expect(box?.style.width).toBe('60%');
  });

  it('renders nothing without a box', () => {
    const { container } = render(<PdfHighlightOverlay highlight={{ pageNumber: 2, snippet: 'x' }} />);
    expect(container.firstChild).toBeNull();
  });
});
