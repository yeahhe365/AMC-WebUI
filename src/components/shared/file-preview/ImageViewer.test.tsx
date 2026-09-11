import { act, fireEvent, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { setupProviderTestRenderer } from '@/test/render/providerRenderer';
import type { UploadedFile } from '@/types';
import { ImageViewer } from './ImageViewer';
import type { ImageNavHighlight } from '@/stores/mediaNavStore';

describe('ImageViewer', () => {
  const renderer = setupProviderTestRenderer();

  const mockImageFile: UploadedFile = {
    id: 'test-img-1',
    name: 'photo.png',
    type: 'image/png',
    size: 1024,
    dataUrl:
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  };

  const mockSvgFile: UploadedFile = {
    id: 'test-svg-1',
    name: 'diagram.svg',
    type: 'image/svg+xml',
    size: 512,
    dataUrl: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"></svg>',
  };

  it('renders image preview and floating toolbar with initial controls', async () => {
    await act(async () => {
      renderer.render(<ImageViewer file={mockImageFile} />);
    });

    const img = screen.getByAltText('Zoomed view of photo.png') as HTMLImageElement;
    expect(img).toBeInTheDocument();
    expect(img.src).toBe(mockImageFile.dataUrl);
    expect(screen.getByText('100%')).toBeInTheDocument();
  });

  it('rotates image 90 degrees clockwise on each click', async () => {
    await act(async () => {
      renderer.render(<ImageViewer file={mockImageFile} />);
    });

    const rotateBtn = screen.getByTitle('Rotate 90°');
    const img = screen.getByAltText('Zoomed view of photo.png');
    const container = img.parentElement as HTMLElement;

    expect(container.style.transform).toBe('rotate(0deg)');

    await act(async () => {
      fireEvent.click(rotateBtn);
    });
    expect(container.style.transform).toBe('rotate(90deg)');

    await act(async () => {
      fireEvent.click(rotateBtn);
    });
    expect(container.style.transform).toBe('rotate(180deg)');

    await act(async () => {
      fireEvent.click(rotateBtn);
    });
    expect(container.style.transform).toBe('rotate(270deg)');

    await act(async () => {
      fireEvent.click(rotateBtn);
    });
    expect(container.style.transform).toBe('rotate(0deg)');
  });

  it('rotates image 90 degrees counterclockwise on left rotate click', async () => {
    await act(async () => {
      renderer.render(<ImageViewer file={mockImageFile} />);
    });

    const rotateLeftBtn = screen.getByTitle('Rotate left 90°');
    const img = screen.getByAltText('Zoomed view of photo.png');
    const container = img.parentElement as HTMLElement;

    expect(container.style.transform).toBe('rotate(0deg)');

    await act(async () => {
      fireEvent.click(rotateLeftBtn);
    });
    expect(container.style.transform).toBe('rotate(270deg)');

    await act(async () => {
      fireEvent.click(rotateLeftBtn);
    });
    expect(container.style.transform).toBe('rotate(180deg)');
  });

  it('resets rotation when reset button is clicked', async () => {
    await act(async () => {
      renderer.render(<ImageViewer file={mockImageFile} />);
    });

    const rotateBtn = screen.getByTitle('Rotate 90°');
    const resetBtn = screen.getAllByTitle('Reset View')[0];
    const img = screen.getByAltText('Zoomed view of photo.png');
    const container = img.parentElement as HTMLElement;

    await act(async () => {
      fireEvent.click(rotateBtn);
    });
    expect(container.style.transform).toBe('rotate(90deg)');

    await act(async () => {
      fireEvent.click(resetBtn);
    });
    expect(container.style.transform).toBe('rotate(0deg)');
  });

  it('handles zoom in and zoom out toolbar actions', async () => {
    await act(async () => {
      renderer.render(<ImageViewer file={mockImageFile} />);
    });

    const zoomInBtn = screen.getByTitle('Zoom In');
    const zoomOutBtn = screen.getByTitle('Zoom Out');

    expect(zoomInBtn).toBeInTheDocument();
    expect(zoomOutBtn).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(zoomInBtn);
    });

    await act(async () => {
      fireEvent.click(zoomOutBtn);
    });
  });

  it('renders image highlight overlay for bounding box and point coordinates', async () => {
    const boxHighlight: ImageNavHighlight = {
      box2d: [150, 200, 450, 600],
      label: 'Object Detection BBox',
    };

    await act(async () => {
      renderer.render(<ImageViewer file={mockImageFile} highlight={boxHighlight} />);
    });

    expect(screen.getByTestId('image-highlight-overlay')).toBeInTheDocument();
    expect(screen.getByTestId('image-highlight-box')).toBeInTheDocument();

    const pointHighlight: ImageNavHighlight = {
      point: [300, 400],
      label: 'Grounded Point',
    };

    await act(async () => {
      renderer.render(<ImageViewer file={mockImageFile} highlight={pointHighlight} />);
    });

    expect(screen.getByTestId('image-highlight-overlay')).toBeInTheDocument();
    expect(screen.getByTestId('image-highlight-point')).toBeInTheDocument();
  });

  it('applies white background and rounded style for SVG mermaid diagrams', async () => {
    await act(async () => {
      renderer.render(<ImageViewer file={mockSvgFile} />);
    });

    const img = screen.getByAltText('Zoomed view of diagram.svg') as HTMLImageElement;
    expect(img.style.backgroundColor).toBe('white');
    expect(img.style.borderRadius).toBe('4px');
  });

  it('toggles visual select cropper mode from toolbar', async () => {
    await act(async () => {
      renderer.render(<ImageViewer file={mockImageFile} />);
    });

    const visualSelectBtn = screen.getByTestId('image-visual-select-btn');
    expect(visualSelectBtn).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(visualSelectBtn);
    });

    expect(screen.getByTestId('visual-cropper-surface')).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(visualSelectBtn);
    });

    expect(screen.queryByTestId('visual-cropper-surface')).toBeNull();
  });

  it('renders export annotated image button in toolbar', async () => {
    await act(async () => {
      renderer.render(<ImageViewer file={mockImageFile} />);
    });

    const exportBtn = screen.getByTestId('image-export-annotated-btn');
    expect(exportBtn).toBeInTheDocument();
  });

  it('does not render highlight belonging to a different image', async () => {
    const foreignHighlight: ImageNavHighlight = {
      imageName: 'other.png',
      box2d: [150, 200, 450, 600],
      label: 'Other Image Detection',
    };

    await act(async () => {
      renderer.render(<ImageViewer file={mockImageFile} highlight={foreignHighlight} />);
    });

    expect(screen.queryByTestId('image-highlight-overlay')).toBeNull();
  });
});
