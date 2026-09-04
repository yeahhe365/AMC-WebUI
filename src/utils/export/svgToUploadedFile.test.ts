import { describe, expect, it } from 'vitest';
import { svgToDataUrl, svgToUploadedFile } from './svgToUploadedFile';

describe('svgToDataUrl', () => {
  it('encodes ASCII SVG as a base64 image/svg+xml URL', () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg"/>';
    expect(svgToDataUrl(svg)).toBe(`data:image/svg+xml;base64,${btoa(svg)}`);
  });

  it('round-trips non-ASCII content through UTF-8 encoding', () => {
    const svg = '<svg><text>流程图 ✓</text></svg>';
    const payload = svgToDataUrl(svg).replace('data:image/svg+xml;base64,', '');
    const decoded = decodeURIComponent(escape(atob(payload)));
    expect(decoded).toBe(svg);
  });
});

describe('svgToUploadedFile', () => {
  it('builds an active SVG UploadedFile sized from the SVG string', () => {
    const svg = '<svg width="10" height="10"></svg>';
    const file = svgToUploadedFile(svg, { id: 'graphviz-svg-abc123', name: 'graphviz-diagram.svg' });

    expect(file).toEqual({
      id: 'graphviz-svg-abc123',
      name: 'graphviz-diagram.svg',
      type: 'image/svg+xml',
      size: svg.length,
      dataUrl: svgToDataUrl(svg),
      uploadState: 'active',
    });
  });

  it('honors an explicit size override', () => {
    const file = svgToUploadedFile('<svg/>', { id: 'mermaid-svg-xyz', name: 'mermaid-diagram.svg', size: 42 });
    expect(file.size).toBe(42);
    expect(file.dataUrl).toBe(svgToDataUrl('<svg/>'));
  });
});
