import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMarkdownPdfBlob } from './markdownPdf';

const outputMock = vi.fn(() => new Blob(['pdf'], { type: 'application/pdf' }));
const textMock = vi.fn();
const addImageMock = vi.fn();
const setFontMock = vi.fn();
const setTextColorMock = vi.fn();
const setDrawColorMock = vi.fn();
const setLineWidthMock = vi.fn();
const addFileToVFSMock = vi.fn();
const addFontMock = vi.fn();
const setFillColorMock = vi.fn();
const rectMock = vi.fn();
const addPageMock = vi.fn();
const splitTextToSizeMock = vi.fn((text: string) => [text]);
const getTextWidthMock = vi.fn((text: string) => String(text).length * 3);
const expectPdfBodyText = (text: string, renderingMode: 'fill' | 'fillThenStroke' = 'fillThenStroke') => {
  expect(textMock).toHaveBeenCalledWith(
    text,
    expect.any(Number),
    expect.any(Number),
    expect.objectContaining({ renderingMode }),
  );
};

vi.mock('jspdf', () => ({
  jsPDF: vi.fn().mockImplementation(function MockJsPdf() {
    return {
      internal: {
        pageSize: {
          getWidth: () => 210,
          getHeight: () => 297,
        },
      },
      addPage: addPageMock,
      addImage: addImageMock,
      addFileToVFS: addFileToVFSMock,
      addFont: addFontMock,
      setFont: setFontMock,
      setFontSize: vi.fn(),
      setTextColor: setTextColorMock,
      setDrawColor: setDrawColorMock,
      setFillColor: setFillColorMock,
      setLineWidth: setLineWidthMock,
      line: vi.fn(),
      rect: rectMock,
      text: textMock,
      splitTextToSize: splitTextToSizeMock,
      getTextWidth: getTextWidthMock,
      output: outputMock,
    };
  }),
}));

describe('createMarkdownPdfBlob', () => {
  beforeEach(() => {
    outputMock.mockClear();
    textMock.mockClear();
    addImageMock.mockClear();
    setFontMock.mockClear();
    setTextColorMock.mockClear();
    setDrawColorMock.mockClear();
    setLineWidthMock.mockClear();
    setFillColorMock.mockClear();
    rectMock.mockClear();
    addPageMock.mockClear();
    addFileToVFSMock.mockClear();
    addFontMock.mockClear();
    splitTextToSizeMock.mockClear();
    getTextWidthMock.mockClear();
  });

  it('renders Markdown text into a PDF blob without html2canvas/html2pdf', async () => {
    const blob = await createMarkdownPdfBlob('# Title\n\nHello **world**.', {
      filename: 'article.pdf',
      themeId: 'pearl',
    });

    expect(blob.type).toBe('application/pdf');
    expect(outputMock).toHaveBeenCalledWith('blob');
    expectPdfBodyText('Title');
    expectPdfBodyText('Hello world.');
  });

  it('uses pure black body text in light PDF exports', async () => {
    await createMarkdownPdfBlob('Readable text', {
      filename: 'article.pdf',
      themeId: 'pearl',
    });

    expect(setTextColorMock).toHaveBeenCalledWith(0, 0, 0);
  });

  it('adds a light text stroke so PDF body text reads darker', async () => {
    await createMarkdownPdfBlob('Readable text', {
      filename: 'article.pdf',
      themeId: 'pearl',
    });

    const bodyTextCall = textMock.mock.calls.find(([text]) => text === 'Readable text');
    expect(bodyTextCall).toBeDefined();
    expect(bodyTextCall?.[3]).toMatchObject({ renderingMode: 'fillThenStroke' });
    expect(setDrawColorMock).toHaveBeenCalledWith(0, 0, 0);
    expect(setLineWidthMock).toHaveBeenCalledWith(0.06);
  });

  it('loads the split CJK font before writing Chinese text', async () => {
    const originalFetch = globalThis.fetch;
    const fontChunks = [new Uint8Array([1, 2]).buffer, new Uint8Array([3]).buffer];
    const fetchMock = vi.fn().mockImplementation(async () => ({
      ok: true,
      arrayBuffer: async () => fontChunks.shift() ?? new Uint8Array([]).buffer,
    }));
    globalThis.fetch = fetchMock;

    try {
      await createMarkdownPdfBlob('# 中文标题\n\n你好，世界。', {
        filename: 'article.pdf',
        themeId: 'pearl',
      });
    } finally {
      globalThis.fetch = originalFetch;
    }

    expect(fetchMock).toHaveBeenNthCalledWith(1, '/fonts/NotoSansCJKsc-VF.ttf.part-00');
    expect(fetchMock).toHaveBeenNthCalledWith(2, '/fonts/NotoSansCJKsc-VF.ttf.part-01');
    expect(addFileToVFSMock).toHaveBeenCalledWith('NotoSansCJKsc-VF.ttf', expect.any(String));
    expect(addFontMock).toHaveBeenCalledWith('NotoSansCJKsc-VF.ttf', 'NotoSansCJKsc', 'normal', 'Identity-H');
    expect(setFontMock).toHaveBeenCalledWith('NotoSansCJKsc', 'normal');
    expectPdfBodyText('中文标题', 'fill');
    expectPdfBodyText('你好，世界。', 'fill');
  });

  it('keeps an unreachable external image as link text instead of drawing an empty block', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('blocked by CORS'));

    try {
      await createMarkdownPdfBlob('![diagram](https://example.invalid/diagram.png)', {
        filename: 'article.pdf',
        themeId: 'pearl',
      });
    } finally {
      globalThis.fetch = originalFetch;
    }

    expectPdfBodyText('Image: diagram (https://example.invalid/diagram.png)');
  });

  it('uses the same-origin image proxy for external images', async () => {
    const originalFetch = globalThis.fetch;
    const imageBlob = new Blob(['png'], { type: 'image/png' });
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      blob: async () => imageBlob,
    });
    globalThis.fetch = fetchMock;

    try {
      await createMarkdownPdfBlob('![diagram](https://cdn.example.com/diagram.png)', {
        filename: 'article.pdf',
        themeId: 'pearl',
      });
    } finally {
      globalThis.fetch = originalFetch;
    }

    expect(fetchMock).toHaveBeenCalledWith('/api/image-proxy?url=https%3A%2F%2Fcdn.example.com%2Fdiagram.png');
    expect(fetchMock).not.toHaveBeenCalledWith('https://cdn.example.com/diagram.png');
    expect(addImageMock).toHaveBeenCalledWith(
      expect.stringMatching(/^data:image\/png;base64,/),
      'PNG',
      expect.any(Number),
      expect.any(Number),
      expect.any(Number),
      expect.any(Number),
    );
  });

  it('renders images embedded inside a paragraph instead of flattening them to text', async () => {
    const originalFetch = globalThis.fetch;
    const imageBlob = new Blob(['png'], { type: 'image/png' });
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      blob: async () => imageBlob,
    });
    globalThis.fetch = fetchMock;

    try {
      await createMarkdownPdfBlob('Intro ![diagram](https://cdn.example.com/diagram.png) Outro', {
        filename: 'article.pdf',
        themeId: 'pearl',
      });
    } finally {
      globalThis.fetch = originalFetch;
    }

    expectPdfBodyText('Intro');
    expect(addImageMock).toHaveBeenCalledWith(
      expect.stringMatching(/^data:image\/png;base64,/),
      'PNG',
      expect.any(Number),
      expect.any(Number),
      expect.any(Number),
      expect.any(Number),
    );
    expectPdfBodyText('Outro');
    expect(textMock).not.toHaveBeenCalledWith(
      'Intro Image: diagram (https://cdn.example.com/diagram.png) Outro',
      expect.any(Number),
      expect.any(Number),
    );
  });

  it('expands images to the PDF content width while preserving aspect ratio', async () => {
    const originalFetch = globalThis.fetch;
    const originalImage = globalThis.Image;

    class MockImage {
      naturalWidth = 400;
      naturalHeight = 200;
      width = 400;
      height = 200;
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;

      set src(_value: string) {
        queueMicrotask(() => this.onload?.());
      }
    }

    const imageBlob = new Blob(['png'], { type: 'image/png' });
    globalThis.Image = MockImage as unknown as typeof Image;
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      blob: async () => imageBlob,
    });

    try {
      await createMarkdownPdfBlob('![tall](https://cdn.example.com/tall.png)', {
        filename: 'article.pdf',
        themeId: 'pearl',
      });
    } finally {
      globalThis.fetch = originalFetch;
      globalThis.Image = originalImage;
    }

    const imageCall = addImageMock.mock.calls.at(-1);
    expect(imageCall).toBeDefined();
    if (!imageCall) {
      throw new Error('Expected PDF export to draw an image');
    }

    const width = imageCall[4] as number;
    const height = imageCall[5] as number;
    expect(width).toBeCloseTo(174, 2);
    expect(height).toBeCloseTo(87, 2);
  });

  it('paints a dark page background so dark-theme text stays readable', async () => {
    await createMarkdownPdfBlob('Readable text', {
      filename: 'article.pdf',
      themeId: 'onyx',
    });

    expect(setTextColorMock).toHaveBeenCalledWith(255, 255, 255);
    expect(setFillColorMock).toHaveBeenCalledWith(12, 12, 14);
    expect(rectMock).toHaveBeenCalledWith(0, 0, 210, 297, 'F');
  });

  it('scales oversized images down so they fit on a page', async () => {
    const originalFetch = globalThis.fetch;
    const originalImage = globalThis.Image;

    class MockImage {
      naturalWidth = 400;
      naturalHeight = 4000;
      width = 400;
      height = 4000;
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;

      set src(_value: string) {
        queueMicrotask(() => this.onload?.());
      }
    }

    globalThis.Image = MockImage as unknown as typeof Image;
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      blob: async () => new Blob(['png'], { type: 'image/png' }),
    });

    try {
      await createMarkdownPdfBlob('![tall](https://cdn.example.com/tall.png)', {
        filename: 'article.pdf',
        themeId: 'pearl',
      });
    } finally {
      globalThis.fetch = originalFetch;
      globalThis.Image = originalImage;
    }

    const imageCall = addImageMock.mock.calls.at(-1);
    expect(imageCall).toBeDefined();
    const width = imageCall![4] as number;
    const height = imageCall![5] as number;
    expect(height).toBeLessThanOrEqual(255);
    expect(width).toBeCloseTo(height * (400 / 4000), 2);
  });

  it('draws list images instead of dumping data URLs as body text', async () => {
    const originalImage = globalThis.Image;

    class MockImage {
      naturalWidth = 100;
      naturalHeight = 50;
      width = 100;
      height = 50;
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;

      set src(_value: string) {
        queueMicrotask(() => this.onload?.());
      }
    }

    globalThis.Image = MockImage as unknown as typeof Image;

    try {
      await createMarkdownPdfBlob('- ![shot](data:image/png;base64,ZmFrZQ==)', {
        filename: 'article.pdf',
        themeId: 'pearl',
      });
    } finally {
      globalThis.Image = originalImage;
    }

    expect(addImageMock).toHaveBeenCalled();
    expect(textMock.mock.calls.some(([text]) => String(text).includes('data:image/png;base64'))).toBe(false);
  });

  it('loads the CJK font for Japanese kana as well as Han characters', async () => {
    const originalFetch = globalThis.fetch;
    const fontChunks = [new Uint8Array([1, 2]).buffer, new Uint8Array([3]).buffer];
    const fetchMock = vi.fn().mockImplementation(async () => ({
      ok: true,
      arrayBuffer: async () => fontChunks.shift() ?? new Uint8Array([]).buffer,
    }));
    globalThis.fetch = fetchMock;

    try {
      await createMarkdownPdfBlob('ひらがなとカタカナ', {
        filename: 'article.pdf',
        themeId: 'pearl',
      });
    } finally {
      globalThis.fetch = originalFetch;
    }

    expect(addFontMock).toHaveBeenCalledWith('NotoSansCJKsc-VF.ttf', 'NotoSansCJKsc', 'normal', 'Identity-H');
    expectPdfBodyText('ひらがなとカタカナ', 'fill');
  });

  it('renders markdown link labels without dumping the raw URL', async () => {
    await createMarkdownPdfBlob('[Anthropic 自曝安全漏洞](https://linux.do/t/topic/2763210)', {
      filename: 'article.pdf',
      themeId: 'pearl',
    });

    expectPdfBodyText('Anthropic 自曝安全漏洞', 'fill');
    expect(textMock.mock.calls.some(([text]) => String(text).includes('https://linux.do'))).toBe(false);
  });

  it('draws linked images instead of flattening them to Image: label (url)', async () => {
    const originalFetch = globalThis.fetch;
    const originalImage = globalThis.Image;

    class MockImage {
      naturalWidth = 400;
      naturalHeight = 200;
      width = 400;
      height = 200;
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;

      set src(_value: string) {
        queueMicrotask(() => this.onload?.());
      }
    }

    globalThis.Image = MockImage as unknown as typeof Image;
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      blob: async () => new Blob(['png'], { type: 'image/png' }),
    });

    try {
      await createMarkdownPdfBlob('[![diagram](https://cdn.example.com/diagram.png)](https://example.com/page)', {
        filename: 'article.pdf',
        themeId: 'pearl',
      });
    } finally {
      globalThis.fetch = originalFetch;
      globalThis.Image = originalImage;
    }

    expect(addImageMock).toHaveBeenCalled();
    expect(textMock.mock.calls.some(([text]) => String(text).includes('example.com/page'))).toBe(false);
    expect(textMock.mock.calls.some(([text]) => String(text).includes('Image: diagram'))).toBe(false);
  });

  it('strips lightbox size metadata before rendering a broken image wrapper', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('blocked by CORS'));

    try {
      await createMarkdownPdfBlob(
        `[![] (https://cdn.example.com/optimized.avif)

1440x418 67.2 KB

](https://cdn.example.com/original.avif)`,
        {
          filename: 'article.pdf',
          themeId: 'pearl',
        },
      );
    } finally {
      globalThis.fetch = originalFetch;
    }

    expect(textMock.mock.calls.some(([text]) => String(text).includes('1440x418'))).toBe(false);
  });

  it('rasterizes AVIF images to PNG before embedding them', async () => {
    const originalFetch = globalThis.fetch;
    const originalImage = globalThis.Image;
    const originalCreateElement = document.createElement.bind(document);

    class MockImage {
      naturalWidth = 80;
      naturalHeight = 40;
      width = 80;
      height = 40;
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;

      set src(_value: string) {
        queueMicrotask(() => this.onload?.());
      }
    }

    globalThis.Image = MockImage as unknown as typeof Image;
    document.createElement = ((tagName: string, options?: ElementCreationOptions) => {
      if (tagName === 'canvas') {
        return {
          width: 0,
          height: 0,
          getContext: () => ({ drawImage: vi.fn() }),
          toDataURL: () => 'data:image/png;base64,ZmFrZQ==',
        } as unknown as HTMLCanvasElement;
      }

      return originalCreateElement(tagName, options);
    }) as typeof document.createElement;

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      blob: async () => new Blob(['avif'], { type: 'image/avif' }),
    });

    try {
      await createMarkdownPdfBlob('![chart](https://cdn.example.com/chart.avif)', {
        filename: 'article.pdf',
        themeId: 'pearl',
      });
    } finally {
      globalThis.fetch = originalFetch;
      globalThis.Image = originalImage;
      document.createElement = originalCreateElement;
    }

    expect(addImageMock).toHaveBeenCalledWith(
      'data:image/png;base64,ZmFrZQ==',
      'PNG',
      expect.any(Number),
      expect.any(Number),
      expect.any(Number),
      expect.any(Number),
    );
  });
});
