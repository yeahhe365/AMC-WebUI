import { describe, expect, it } from 'vitest';
import { computeContainedVideoRect } from './videoGeometry';

describe('computeContainedVideoRect', () => {
  it('handles wide video in square container (letterboxing on top & bottom)', () => {
    // 16:9 video (1920x1080) in 400x400 container
    const rect = computeContainedVideoRect(400, 400, 1920, 1080);
    expect(rect.width).toBe(400);
    expect(rect.height).toBe(225);
    expect(rect.left).toBe(0);
    expect(rect.top).toBe((400 - 225) / 2); // 87.5
  });

  it('handles tall/portrait video in widescreen container (pillarboxing on left & right)', () => {
    // 9:16 video (1080x1920) in 1600x900 container
    const rect = computeContainedVideoRect(1600, 900, 1080, 1920);
    expect(rect.height).toBe(900);
    expect(rect.width).toBe(900 * (9 / 16)); // 506.25
    expect(rect.top).toBe(0);
    expect(rect.left).toBe((1600 - 506.25) / 2); // 546.875
  });

  it('handles exact aspect ratio match', () => {
    const rect = computeContainedVideoRect(1920, 1080, 1920, 1080);
    expect(rect).toEqual({ top: 0, left: 0, width: 1920, height: 1080 });
  });

  it('safely handles missing or zero dimensions', () => {
    expect(computeContainedVideoRect(0, 400, 1920, 1080)).toEqual({ top: 0, left: 0, width: 0, height: 400 });
    expect(computeContainedVideoRect(400, 0, 1920, 1080)).toEqual({ top: 0, left: 0, width: 400, height: 0 });
    expect(computeContainedVideoRect(400, 400, 0, 1080)).toEqual({ top: 0, left: 0, width: 400, height: 400 });
  });
});
