import { describe, expect, it } from 'vitest';
import { extractMarkdownToc } from './markdownToc';

describe('extractMarkdownToc', () => {
  it('extracts headings with levels and source line numbers', () => {
    const content = '# Title\n\n## Section\n\nBody\n\n### Details';

    expect(extractMarkdownToc(content)).toEqual([
      { id: 'title', text: 'Title', level: 1, line: 0, index: 0 },
      { id: 'section', text: 'Section', level: 2, line: 2, index: 1 },
      { id: 'details', text: 'Details', level: 3, line: 6, index: 2 },
    ]);
  });

  it('ignores non-heading lines and trims trailing markdown markers', () => {
    const content = '## Heading with suffix ##\n\nNot a heading';

    expect(extractMarkdownToc(content)).toEqual([
      { id: 'heading-with-suffix', text: 'Heading with suffix', level: 2, line: 0, index: 0 },
    ]);
  });

  it('ignores comments inside code blocks', () => {
    const content = '# Title\n\n```python\n# This is a comment, not a heading\ncode = 1\n```\n\n## Section 2';

    expect(extractMarkdownToc(content)).toEqual([
      { id: 'title', text: 'Title', level: 1, line: 0, index: 0 },
      { id: 'section-2', text: 'Section 2', level: 2, line: 7, index: 1 },
    ]);
  });

  it('cleans inline markdown syntax from heading text', () => {
    const content = '## 1. **Bold Feature** and `code_fn()`';

    expect(extractMarkdownToc(content)).toEqual([
      { id: '1-bold-feature-and-code_fn', text: '1. Bold Feature and code_fn()', level: 2, line: 0, index: 0 },
    ]);
  });
});
