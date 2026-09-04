import { describe, expect, it } from 'vitest';
import { readMarkdownCss } from './projectFiles';

describe('markdown table styling', () => {
  it('sizes columns to content and lets the wrapper scroll wide tables', () => {
    const css = readMarkdownCss();

    expect(css).toContain('.markdown-body table:not(.rich-html-table)');
    expect(css).toContain('table-layout: auto;');
    expect(css).toContain('min-width: 100%;');
    // No forced even-width grid and no eager word-breaking: the Linear style
    // relies on content-sized columns, with header nowrap driving overflow.
    expect(css).not.toContain('table-layout: fixed;');
    expect(css).toContain('overflow-wrap: break-word;');
    expect(css).not.toContain('width: max-content;');
    expect(css).not.toContain('.markdown-body tbody td:first-child');
  });

  it('does not apply standard table resets to rich raw html tables', () => {
    const css = readMarkdownCss();

    expect(css).toContain('.markdown-body table:not(.rich-html-table) thead th');
    expect(css).toContain('.markdown-body table:not(.rich-html-table) tbody td');
    expect(css).toContain('.markdown-body table.rich-html-table');
    expect(css).not.toContain('.markdown-body thead th {');
    expect(css).not.toContain('.markdown-body tbody td {');
  });
});
