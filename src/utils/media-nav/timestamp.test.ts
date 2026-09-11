import { describe, expect, it } from 'vitest';
import { formatTimestamp, parseTimestamp } from './timestamp';

describe('parseTimestamp', () => {
  it('parses mm:ss', () => {
    expect(parseTimestamp('03:25')).toBe(205);
    expect(parseTimestamp('0:00')).toBe(0);
  });

  it('parses h:mm:ss', () => {
    expect(parseTimestamp('1:02:03')).toBe(3723);
    expect(parseTimestamp('10:00:00')).toBe(36000);
  });

  it('passes raw seconds through', () => {
    expect(parseTimestamp(90)).toBe(90);
    expect(parseTimestamp(90.7)).toBe(90);
    expect(parseTimestamp('120')).toBe(120);
    expect(parseTimestamp('120.5')).toBe(120);
  });

  it('rejects unparsable values', () => {
    expect(parseTimestamp('abc')).toBeNull();
    expect(parseTimestamp('1:2:3:4')).toBeNull();
    expect(parseTimestamp('')).toBeNull();
    expect(parseTimestamp(undefined)).toBeNull();
    expect(parseTimestamp(-5)).toBeNull();
    expect(parseTimestamp('12:88')).toBeNull();
    expect(parseTimestamp('01:99')).toBeNull();
    expect(parseTimestamp('1:65:20')).toBeNull();
  });
});

describe('formatTimestamp', () => {
  it('formats below an hour as mm:ss', () => {
    expect(formatTimestamp(205)).toBe('03:25');
    expect(formatTimestamp(0)).toBe('00:00');
  });

  it('formats an hour or more as h:mm:ss', () => {
    expect(formatTimestamp(3723)).toBe('1:02:03');
  });

  it('floors fractional seconds', () => {
    expect(formatTimestamp(59.9)).toBe('00:59');
  });

  it('supports unpadded minutes when padMinutes is false', () => {
    expect(formatTimestamp(205, { padMinutes: false })).toBe('3:25');
    expect(formatTimestamp(0, { padMinutes: false })).toBe('0:00');
    expect(formatTimestamp(59, { padMinutes: false })).toBe('0:59');
    expect(formatTimestamp(3723, { padMinutes: false })).toBe('1:02:03');
  });

  it('handles negative or invalid values gracefully', () => {
    expect(formatTimestamp(-10)).toBe('00:00');
    expect(formatTimestamp(-10, { padMinutes: false })).toBe('0:00');
    expect(formatTimestamp(NaN)).toBe('00:00');
    expect(formatTimestamp(undefined)).toBe('00:00');
    expect(formatTimestamp(null)).toBe('00:00');
  });
});
