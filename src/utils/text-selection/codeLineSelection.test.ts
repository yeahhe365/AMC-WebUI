import { describe, expect, it } from 'vitest';
import { findNodeAndOffset, getLineRanges, selectCodeLines } from './codeLineSelection';

describe('codeLineSelection', () => {
  describe('getLineRanges', () => {
    it('handles single line text without newline', () => {
      const ranges = getLineRanges('hello world');
      expect(ranges).toEqual([{ start: 0, end: 11 }]);
    });

    it('splits multiline text correctly', () => {
      const text = 'line 1\nline 2\nline 3';
      const ranges = getLineRanges(text);
      expect(ranges).toEqual([
        { start: 0, end: 6 },
        { start: 7, end: 13 },
        { start: 14, end: 20 },
      ]);
    });

    it('handles CRLF windows newlines', () => {
      const text = 'line 1\r\nline 2';
      const ranges = getLineRanges(text);
      expect(ranges).toEqual([
        { start: 0, end: 6 },
        { start: 8, end: 14 },
      ]);
    });

    it('handles empty lines and trailing newlines', () => {
      const text = 'line 1\n\nline 3\n';
      const ranges = getLineRanges(text);
      expect(ranges).toEqual([
        { start: 0, end: 6 },
        { start: 7, end: 7 },
        { start: 8, end: 14 },
        { start: 15, end: 15 },
      ]);
    });
  });

  describe('findNodeAndOffset', () => {
    it('finds offset in single text node', () => {
      const div = document.createElement('div');
      div.textContent = 'hello world';
      const res = findNodeAndOffset(div, 6);
      expect(res.node.textContent).toBe('hello world');
      expect(res.offset).toBe(6);
    });

    it('finds offset across multiple nested spans', () => {
      const div = document.createElement('div');
      const span1 = document.createElement('span');
      span1.textContent = 'const ';
      const span2 = document.createElement('span');
      span2.textContent = 'x = 42;';
      div.appendChild(span1);
      div.appendChild(span2);

      // Index 8 is ' = 42;' inside span2, offset 2 ('=')
      const res = findNodeAndOffset(div, 8);
      expect(res.node).toBe(span2.firstChild);
      expect(res.offset).toBe(2);
    });
  });

  describe('selectCodeLines', () => {
    it('selects a single line range in DOM', () => {
      const code = document.createElement('code');
      code.textContent = 'def foo():\n    return 42\n';
      document.body.appendChild(code);

      const success = selectCodeLines(code, 2, 2);
      expect(success).toBe(true);

      const selection = window.getSelection();
      expect(selection?.toString()).toBe('    return 42');

      document.body.removeChild(code);
    });

    it('selects multiple lines across lines with newline', () => {
      const code = document.createElement('code');
      code.textContent = 'line 1\nline 2\nline 3';
      document.body.appendChild(code);

      const success = selectCodeLines(code, 1, 2);
      expect(success).toBe(true);

      const selection = window.getSelection();
      expect(selection?.toString()).toBe('line 1\nline 2');

      document.body.removeChild(code);
    });
  });
});
