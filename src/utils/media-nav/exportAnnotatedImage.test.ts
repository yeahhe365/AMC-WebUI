import { describe, expect, it, vi, beforeEach } from 'vitest';
import { exportAnnotatedImage } from './exportAnnotatedImage';

describe('exportAnnotatedImage', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('renders annotations to canvas and triggers download', async () => {
    const mockClick = vi.fn();
    const createElementSpy = vi.spyOn(document, 'createElement');

    // Mock HTMLImageElement loading
    const originalImage = global.Image;
    global.Image = class MockImage {
      naturalWidth = 1000;
      naturalHeight = 800;
      onload: (() => void) | null = null;
      set src(_val: string) {
        setTimeout(() => this.onload?.(), 0);
      }
    } as any;

    // Mock canvas context
    const mockCtx = {
      save: vi.fn(),
      restore: vi.fn(),
      translate: vi.fn(),
      rotate: vi.fn(),
      drawImage: vi.fn(),
      fillRect: vi.fn(),
      strokeRect: vi.fn(),
      rect: vi.fn(),
      beginPath: vi.fn(),
      arc: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      closePath: vi.fn(),
      fill: vi.fn(),
      stroke: vi.fn(),
      measureText: vi.fn().mockReturnValue({ width: 60 }),
      fillText: vi.fn(),
    };

    const mockCanvas = {
      width: 0,
      height: 0,
      getContext: vi.fn().mockReturnValue(mockCtx),
      toBlob: vi.fn((callback) => {
        callback(new Blob(['mock-png'], { type: 'image/png' }));
      }),
    };

    createElementSpy.mockImplementation((tag: string) => {
      if (tag === 'canvas') return mockCanvas as any;
      if (tag === 'a') {
        return {
          click: mockClick,
          set href(_val: string) {},
          set download(_val: string) {},
        } as any;
      }
      return document.createElement(tag);
    });

    global.URL.createObjectURL = vi.fn().mockReturnValue('blob:mock-url');
    global.URL.revokeObjectURL = vi.fn();

    await exportAnnotatedImage({
      imageSrc: 'data:image/png;base64,mock',
      fileName: 'test-diagram.png',
      highlights: [
        {
          box2d: [100, 200, 400, 600],
          label: 'Header Section',
          index: 1,
        },
      ],
      rotation: 0,
    });

    expect(mockCtx.drawImage).toHaveBeenCalled();
    expect(mockCtx.stroke).toHaveBeenCalled();
    expect(mockClick).toHaveBeenCalled();

    global.Image = originalImage;
  });
});
