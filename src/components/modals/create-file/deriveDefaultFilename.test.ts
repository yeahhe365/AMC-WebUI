import { describe, expect, it } from 'vitest';
import { formatTimestampFilename, deriveDefaultFilename } from './deriveDefaultFilename';

describe('formatTimestampFilename', () => {
  it('formats a date into YYYY-MM-DD_HH-mm-ss format', () => {
    const testDate = new Date(2026, 8, 10, 20, 15, 30); // Month is 0-indexed: 8 is September
    expect(formatTimestampFilename(testDate)).toBe('2026-09-10_20-15-30');
  });

  it('pads single-digit month, day, hours, minutes, and seconds with zero', () => {
    const testDate = new Date(2026, 0, 5, 4, 3, 2); // 2026-01-05 04:03:02
    expect(formatTimestampFilename(testDate)).toBe('2026-01-05_04-03-02');
  });

  it('generates a valid timestamp string when called without arguments', () => {
    const result = formatTimestampFilename();
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}$/);
  });

  it('gracefully handles invalid Date instances by falling back to a valid timestamp', () => {
    const invalidDate = new Date('invalid');
    const result = formatTimestampFilename(invalidDate);
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}$/);
  });
});

describe('deriveDefaultFilename', () => {
  it('returns timestamp format and does not extract titles from content', () => {
    const result = deriveDefaultFilename('# 季度报告\n\n正文内容');
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}$/);
    expect(result).not.toContain('季度报告');
  });

  it('formats a provided Date object', () => {
    const testDate = new Date(2026, 8, 10, 12, 0, 0);
    expect(deriveDefaultFilename(testDate)).toBe('2026-09-10_12-00-00');
  });
});
