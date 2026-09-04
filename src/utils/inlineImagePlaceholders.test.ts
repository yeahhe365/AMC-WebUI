import { describe, expect, it } from 'vitest';
import {
  createInlineImagePlaceholder,
  extractInlineImagePlaceholders,
  resolveInlineImagePlaceholders,
} from './inlineImagePlaceholders';

describe('inlineImagePlaceholders', () => {
  it('extracts data-URL images starting from a caller-provided index', () => {
    const content = 'intro ![one](data:image/png;base64,YQ==) ![two](data:image/png;base64,Yg==)';

    const extracted = extractInlineImagePlaceholders(content, 4);

    expect(extracted.editorContent).toBe('intro ![one](内嵌图片-4) ![two](内嵌图片-5)');
    expect(extracted.nextIndex).toBe(6);
    expect(extracted.placeholders.get(createInlineImagePlaceholder(4))).toBe('data:image/png;base64,YQ==');
    expect(extracted.placeholders.get(createInlineImagePlaceholder(5))).toBe('data:image/png;base64,Yg==');
  });

  it('resolves placeholders back to their data URLs', () => {
    const placeholders = new Map([['内嵌图片-4', 'data:image/png;base64,YQ==']]);

    expect(resolveInlineImagePlaceholders('![one](内嵌图片-4)', placeholders)).toBe(
      '![one](data:image/png;base64,YQ==)',
    );
  });
});
