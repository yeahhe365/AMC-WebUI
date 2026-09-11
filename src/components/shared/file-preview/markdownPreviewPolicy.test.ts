import { describe, expect, it } from 'vitest';
import { LARGE_FILE_PREVIEW_LENGTH_THRESHOLD, shouldDeferMarkdownPreview } from './markdownPreviewPolicy';

describe('markdownPreviewPolicy', () => {
  it('keeps small markdown eligible for immediate preview', () => {
    expect(shouldDeferMarkdownPreview('# Notes\n\nShort body')).toBe(false);
  });

  it('defers markdown preview for large content, many lines, or many code fences', () => {
    expect(shouldDeferMarkdownPreview('x'.repeat(LARGE_FILE_PREVIEW_LENGTH_THRESHOLD + 1))).toBe(true);
    expect(shouldDeferMarkdownPreview('line\n'.repeat(2501))).toBe(true);
    expect(shouldDeferMarkdownPreview('```\ncode\n```\n'.repeat(40))).toBe(false);
    expect(shouldDeferMarkdownPreview('```\ncode\n```\n'.repeat(150))).toBe(true);
  });
});
