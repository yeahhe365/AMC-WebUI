import { describe, expect, it } from 'vitest';
import { formatClockTime } from './formatClockTime';

describe('formatClockTime', () => {
  it('formats seconds below an hour as m:ss', () => {
    expect(formatClockTime(0)).toBe('0:00');
    expect(formatClockTime(5)).toBe('0:05');
    expect(formatClockTime(65)).toBe('1:05');
    expect(formatClockTime(599)).toBe('9:59');
    expect(formatClockTime(600)).toBe('10:00');
  });

  it('formats an hour or more as h:mm:ss', () => {
    expect(formatClockTime(3600)).toBe('1:00:00');
    expect(formatClockTime(3665)).toBe('1:01:05');
    expect(formatClockTime(7325)).toBe('2:02:05');
  });

  it('handles invalid or non-positive values gracefully', () => {
    expect(formatClockTime(0)).toBe('0:00');
    expect(formatClockTime(-10)).toBe('0:00');
    expect(formatClockTime(NaN)).toBe('0:00');
    expect(formatClockTime(Infinity)).toBe('0:00');
  });
});
