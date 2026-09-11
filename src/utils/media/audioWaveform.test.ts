import { describe, expect, it } from 'vitest';
import { generateDeterministicWaveform, readAudioWaveformCache, writeAudioWaveformCache } from './audioWaveform';

describe('audioWaveform', () => {
  it('generates deterministic waveform bars matching requested count', () => {
    const bars1 = generateDeterministicWaveform('track-1.wav', 32);
    const bars2 = generateDeterministicWaveform('track-1.wav', 32);
    const bars3 = generateDeterministicWaveform('other-track.mp3', 32);

    expect(bars1).toHaveLength(32);
    expect(bars1).toEqual(bars2);
    expect(bars1).not.toEqual(bars3);

    // Verify all bars are within normalized [0.1, 1.0] range
    bars1.forEach((val) => {
      expect(val).toBeGreaterThanOrEqual(0.1);
      expect(val).toBeLessThanOrEqual(1.0);
    });
  });

  it('manages waveform LRU cache correctly', () => {
    const id = 'test-audio-id';
    const peaks = [0.2, 0.5, 0.8];

    expect(readAudioWaveformCache(id)).toBeUndefined();
    writeAudioWaveformCache(id, peaks);
    expect(readAudioWaveformCache(id)).toEqual(peaks);
  });
});
