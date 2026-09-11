import { describe, expect, it } from 'vitest';
import { createLocateTagPatterns, linkifyLocateTags } from './locateTagTransform';

describe('locateTagTransform', () => {
  const customPatterns = createLocateTagPatterns('custom-locate');
  const dummyBuilder = (attrs: Record<string, string>, inner: string) => {
    if (!attrs.id) return null;
    return `[${inner || 'target'}](#custom?id=${attrs.id})`;
  };

  it('returns original text if tag is not present', () => {
    expect(linkifyLocateTags('hello world', 'custom-locate', customPatterns, dummyBuilder)).toBe('hello world');
    expect(linkifyLocateTags('', 'custom-locate', customPatterns, dummyBuilder)).toBe('');
  });

  it('converts inline tags into links', () => {
    const input = 'See <custom-locate id="123">details</custom-locate> here.';
    const result = linkifyLocateTags(input, 'custom-locate', customPatterns, dummyBuilder);
    expect(result).toBe('See [details](#custom?id=123) here.');
  });

  it('handles empty or skipped link builder by stripping tag', () => {
    const input = 'See <custom-locate other="val">details</custom-locate> here.';
    const result = linkifyLocateTags(input, 'custom-locate', customPatterns, dummyBuilder);
    expect(result).toBe('See here.');
  });

  it('converts trailing locate blocks into bottom rows', () => {
    const input =
      'Summary text.\n\n<custom-locate id="1">one</custom-locate>\n<custom-locate id="2">two</custom-locate>';
    const result = linkifyLocateTags(input, 'custom-locate', customPatterns, dummyBuilder);
    expect(result).toContain('Summary text.\n\n[one](#custom?id=1) [two](#custom?id=2)');
  });

  it('cleans up mid-stream partial tags', () => {
    const input = 'Generating text <custom-locate id="12';
    const result = linkifyLocateTags(input, 'custom-locate', customPatterns, dummyBuilder);
    expect(result).toBe('Generating text ');
  });

  it('omits trailing locate tags that are already converted in body', () => {
    const input = [
      'Body has <custom-locate id="1">item 1</custom-locate> and <custom-locate id="2">item 2</custom-locate>.',
      '',
      '<custom-locate id="1">item 1</custom-locate>',
      '<custom-locate id="3">item 3</custom-locate>',
    ].join('\n');
    const result = linkifyLocateTags(input, 'custom-locate', customPatterns, dummyBuilder);

    expect(result).toContain('Body has [item 1](#custom?id=1) and [item 2](#custom?id=2).');
    // Trailing row should only contain item 3 because item 1 was already in the body
    expect(result).toContain('[item 3](#custom?id=3)');
    expect(result).not.toContain('\n\n[item 1](#custom?id=1)');
  });

  it('cleans up spaces before punctuation marks when tags are converted', () => {
    const input =
      'This is point <custom-locate id="1">one</custom-locate> 。 And another <custom-locate id="2">two</custom-locate> ！';
    const result = linkifyLocateTags(input, 'custom-locate', customPatterns, dummyBuilder);
    expect(result).toContain('[one](#custom?id=1)。');
    expect(result).toContain('[two](#custom?id=2)！');
  });
});
