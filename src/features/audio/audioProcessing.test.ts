import { describe, expect, it } from 'vitest';
import { float32ToPCM16Base64 } from './audioProcessing';

describe('float32ToPCM16Base64', () => {
  it('clamps full-scale +1.0 to 32767 instead of wrapping Int16 to -32768', () => {
    // Regression: a full-scale positive sample multiplied by 32768 overflows
    // Int16 (32768 -> -32768), producing a sign-flipped click/pop. 0x7fff keeps
    // it at the true positive maximum.
    const pcm = new Int16Array(
      Uint8Array.from(atob(float32ToPCM16Base64(new Float32Array([1, -1, 0]))), (c) => c.charCodeAt(0)).buffer,
    );
    expect(pcm[0]).toBe(32767);
    expect(pcm[1]).toBe(-32767);
    expect(pcm[2]).toBe(0);
  });
});
