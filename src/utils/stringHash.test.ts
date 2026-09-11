import { describe, expect, it } from 'vitest';
import { hashString } from './stringHash';

describe('hashString', () => {
  it('computes stable hashes for strings', () => {
    const hash1 = hashString('test-string-input');
    const hash2 = hashString('test-string-input');
    expect(hash1).toBe(hash2);
    expect(typeof hash1).toBe('string');
  });

  it('produces distinct hashes for different inputs', () => {
    expect(hashString('alpha')).not.toBe(hashString('beta'));
  });

  it('handles empty string gracefully', () => {
    expect(hashString('')).toBe('0');
  });
});
