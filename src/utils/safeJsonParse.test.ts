import { describe, expect, it } from 'vitest';
import { safeJsonParse } from './safeJsonParse';

describe('safeJsonParse', () => {
  it('parses valid JSON objects and arrays', () => {
    expect(safeJsonParse('{"a": 1}', {})).toEqual({ a: 1 });
    expect(safeJsonParse('[1, 2, 3]', [])).toEqual([1, 2, 3]);
  });

  it('returns fallback for null, undefined, or empty string', () => {
    const fallback = { fallback: true };
    expect(safeJsonParse(null, fallback)).toBe(fallback);
    expect(safeJsonParse(undefined, fallback)).toBe(fallback);
    expect(safeJsonParse('', fallback)).toBe(fallback);
  });

  it('returns fallback on invalid JSON syntax', () => {
    const fallback = { default: 123 };
    expect(safeJsonParse('{invalid: json', fallback)).toBe(fallback);
  });

  it('preserves falsey primitive values like false, 0, and empty string', () => {
    expect(safeJsonParse('false', true)).toBe(false);
    expect(safeJsonParse('0', 100)).toBe(0);
    expect(safeJsonParse('""', 'fallback')).toBe('');
  });

  it('handles JSON "null" string gracefully with fallback', () => {
    expect(safeJsonParse('null', { default: 'obj' })).toEqual({ default: 'obj' });
    expect(safeJsonParse('null', null)).toBeNull();
  });
});
