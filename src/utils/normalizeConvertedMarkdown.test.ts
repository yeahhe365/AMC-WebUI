import { describe, expect, it } from 'vitest';
import { normalizeConvertedMarkdown } from './normalizeConvertedMarkdown';

describe('normalizeConvertedMarkdown', () => {
  it('closes the space that breaks CommonMark image parsing', () => {
    expect(normalizeConvertedMarkdown('![] (https://cdn.example.com/shot.avif)')).toBe(
      '![](https://cdn.example.com/shot.avif)',
    );
  });

  it('unwraps a lightbox image that still contains size metadata', () => {
    const markdown = `[![](https://cdn.example.com/optimized.avif)

1440x418 67.2 KB

](https://cdn.example.com/original.avif)`;

    expect(normalizeConvertedMarkdown(markdown)).toBe('![](https://cdn.example.com/optimized.avif)');
    expect(normalizeConvertedMarkdown(markdown)).not.toContain('1440x418');
  });

  it('repairs Turndown-escaped leftover image markdown', () => {
    expect(
      normalizeConvertedMarkdown(
        '\\[!\\[\\] (https://cdn.example.com/optimized.avif)\\](https://cdn.example.com/original.avif)',
      ),
    ).toBe('![](https://cdn.example.com/optimized.avif)');
  });
});
