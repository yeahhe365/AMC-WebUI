import { describe, expect, it } from 'vitest';
import { collapseOnlyTextContent, hasNonEmptyMessageContent } from './chatMessageContent';

describe('chatMessageContent', () => {
  describe('hasNonEmptyMessageContent', () => {
    it('returns false for empty string or whitespace-only string', () => {
      expect(hasNonEmptyMessageContent('')).toBe(false);
      expect(hasNonEmptyMessageContent('   ')).toBe(false);
    });

    it('returns true for non-empty strings', () => {
      expect(hasNonEmptyMessageContent('hello')).toBe(true);
      expect(hasNonEmptyMessageContent('  a  ')).toBe(true);
    });

    it('returns false for empty array', () => {
      expect(hasNonEmptyMessageContent([])).toBe(false);
    });

    it('returns true for non-empty array', () => {
      expect(hasNonEmptyMessageContent([{ type: 'text', text: 'hi' }])).toBe(true);
    });
  });

  describe('collapseOnlyTextContent', () => {
    type TestItem = { type: 'text' | 'image'; text?: string };

    it('joins text blocks when all items are text', () => {
      const items: TestItem[] = [
        { type: 'text', text: 'line 1' },
        { type: 'text', text: '' },
        { type: 'text', text: 'line 2' },
      ];
      const result = collapseOnlyTextContent(items, (item) => (item.type === 'text' ? item.text : null));
      expect(result).toBe('line 1\nline 2');
    });

    it('returns original items array when non-text blocks are present', () => {
      const items: TestItem[] = [{ type: 'text', text: 'look at this' }, { type: 'image' }];
      const result = collapseOnlyTextContent(items, (item) => (item.type === 'text' ? item.text : null));
      expect(result).toBe(items);
    });
  });
});
