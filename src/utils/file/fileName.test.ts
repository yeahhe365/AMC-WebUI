import { describe, expect, it } from 'vitest';
import { formatDisplayFileName } from './fileName';

describe('formatDisplayFileName', () => {
  it('formats recording file names to human readable rec-HH:MM:SS format', () => {
    expect(formatDisplayFileName('recording-2026-09-06-195030.wav')).toBe('rec-19:50:30.wav');
    expect(formatDisplayFileName('recording-2025-12-31-080512.webm')).toBe('rec-08:05:12.webm');
  });

  it('leaves standard file names unchanged', () => {
    expect(formatDisplayFileName('document.pdf')).toBe('document.pdf');
    expect(formatDisplayFileName('recording.mp3')).toBe('recording.mp3');
    expect(formatDisplayFileName('photo.png')).toBe('photo.png');
  });
});
