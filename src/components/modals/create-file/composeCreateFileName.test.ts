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

  it('strips activeExtension even when it is not in default options', () => {
    expect(composeCreateFileName('App.custom', null, '.custom', 'file')).toBe('App.custom');
    expect(composeCreateFileName('Component.tsx', null, '.tsx', 'file')).toBe('Component.tsx');
    expect(composeCreateFileName('Component.tsx', null, '.ts', 'file')).toBe('Component.ts');
  });

  it('strips trailing dots from stem', () => {
    expect(composeCreateFileName('notes...', null, '.md', 'file')).toBe('notes.md');
    expect(composeCreateFileName('...', null, '.md', 'file')).toBe('file.md');
  });

  it('sanitizes illegal path and filename characters', () => {
    expect(composeCreateFileName('2026/09/10: Report', null, '.md', 'file')).toBe('2026_09_10_ Report.md');
    expect(composeCreateFileName('<invalid>*?"|', null, '.txt', 'file')).toBe('_invalid_.txt');
    expect(composeCreateFileName('<>*?"|', null, '.txt', 'file')).toBe('file.txt');
    expect(composeCreateFileName('///', null, '.txt', 'file')).toBe('file.txt');
  });

  it('defaults to formatted timestamp stem when filenameBase and derivedFilename are omitted', () => {
    const result = composeCreateFileName('', null, '.md');
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}\.md$/);
  });
});
