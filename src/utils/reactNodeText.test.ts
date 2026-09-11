import React from 'react';
import { describe, expect, it } from 'vitest';
import { extractTextFromNode, findCodeElement } from './reactNodeText';

describe('reactNodeText', () => {
  describe('extractTextFromNode', () => {
    it('extracts text from strings and numbers', () => {
      expect(extractTextFromNode('hello')).toBe('hello');
      expect(extractTextFromNode(123)).toBe('123');
      expect(extractTextFromNode(null)).toBe('');
      expect(extractTextFromNode(undefined)).toBe('');
    });

    it('extracts text recursively from arrays and React elements', () => {
      const element = React.createElement('div', null, 'Hello ', React.createElement('span', null, 'World'));
      expect(extractTextFromNode(element)).toBe('Hello World');
    });
  });

  describe('findCodeElement', () => {
    it('finds code element by element tag', () => {
      const codeEl = React.createElement('code', { className: 'language-js' }, 'console.log(1)');
      const preChildren = [codeEl];
      const found = findCodeElement(preChildren);
      expect(found?.type).toBe('code');
      expect(found?.props.className).toBe('language-js');
    });

    it('finds element with language- class even if tag is not code', () => {
      const customEl = React.createElement('span', { className: 'language-python' }, 'print(1)');
      const found = findCodeElement([customEl]);
      expect(found?.type).toBe('span');
      expect(found?.props.className).toBe('language-python');
    });

    it('returns undefined if no code element is present', () => {
      const regularSpan = React.createElement('span', null, 'just text');
      expect(findCodeElement([regularSpan])).toBeUndefined();
      expect(findCodeElement(null)).toBeUndefined();
    });
  });
});
