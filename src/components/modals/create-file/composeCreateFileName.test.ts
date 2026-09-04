import { describe, expect, it } from 'vitest';
import { composeCreateFileName } from './composeCreateFileName';

describe('composeCreateFileName', () => {
  it('appends the selected extension to a stem', () => {
    expect(composeCreateFileName('notes', null, '.md', 'file')).toBe('notes.md');
  });

  it('uses the derived filename when the stem is blank', () => {
    expect(composeCreateFileName('  ', 'Quarterly Report', '.md', 'file')).toBe('Quarterly Report.md');
  });

  it('does not double-append when the stem already includes the extension', () => {
    expect(composeCreateFileName('notes.md', null, '.md', 'file')).toBe('notes.md');
    expect(composeCreateFileName('notes.MD', null, '.md', 'file')).toBe('notes.md');
  });

  it('lets the selected extension win when the stem includes a different known extension', () => {
    expect(composeCreateFileName('notes.md', null, '.txt', 'file')).toBe('notes.txt');
    expect(composeCreateFileName('article.pdf', null, '.pdf', 'document')).toBe('article.pdf');
  });

  it('falls back when stripping a typed extension leaves an empty stem', () => {
    expect(composeCreateFileName('.md', null, '.txt', 'file')).toBe('file.txt');
  });
});
