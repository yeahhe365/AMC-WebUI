import { describe, expect, it } from 'vitest';
import type { Root } from 'hast';
import { normalizeCodeBlockLanguages, rehypeNormalizeCodeLanguages } from './markdownConfigBase';

describe('markdownConfigBase normalizeCodeBlockLanguages', () => {
  it('normalizes code block classes with filename colon syntax', () => {
    const tree: Root = {
      type: 'root',
      children: [
        {
          type: 'element',
          tagName: 'pre',
          properties: {},
          children: [
            {
              type: 'element',
              tagName: 'code',
              properties: {
                className: ['language-python:server.py'],
              },
              children: [{ type: 'text', value: 'def hello():\n    return 1' }],
            },
          ],
        },
      ],
    };

    normalizeCodeBlockLanguages(tree);

    const codeNode = (tree.children[0] as any).children[0];
    expect(codeNode.properties.className).toEqual(['language-python', 'language-python:server.py']);
  });

  it('normalizes HTML, TSX, and other languages with filename colon syntax', () => {
    const tree: Root = {
      type: 'root',
      children: [
        {
          type: 'element',
          tagName: 'pre',
          properties: {},
          children: [
            {
              type: 'element',
              tagName: 'code',
              properties: {
                className: ['language-html:index.html'],
              },
              children: [{ type: 'text', value: '<div>test</div>' }],
            },
          ],
        },
      ],
    };

    const plugin = rehypeNormalizeCodeLanguages();
    plugin(tree);

    const codeNode = (tree.children[0] as any).children[0];
    expect(codeNode.properties.className).toEqual(['language-html', 'language-html:index.html']);
  });

  it('leaves clean language classes untouched', () => {
    const tree: Root = {
      type: 'root',
      children: [
        {
          type: 'element',
          tagName: 'pre',
          properties: {},
          children: [
            {
              type: 'element',
              tagName: 'code',
              properties: {
                className: ['language-javascript'],
              },
              children: [{ type: 'text', value: 'console.log("hello");' }],
            },
          ],
        },
      ],
    };

    normalizeCodeBlockLanguages(tree);

    const codeNode = (tree.children[0] as any).children[0];
    expect(codeNode.properties.className).toEqual(['language-javascript']);
  });
});
