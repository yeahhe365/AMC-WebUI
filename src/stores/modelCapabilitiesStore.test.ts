import { describe, expect, it } from 'vitest';
import { getCachedModelCapabilities } from './modelCapabilitiesStore';

describe('modelCapabilitiesStore', () => {
  it('computes and caches capabilities by model id', () => {
    const first = getCachedModelCapabilities('gemini-3-pro-image');
    const second = getCachedModelCapabilities('gemini-3-pro-image');

    expect(first).toBe(second);
    expect(first.isGemini3ImageModel).toBe(true);
    expect(first.supportedImageSizes).toEqual(['1K', '2K', '4K']);
  });

  it('normalizes empty model ids into a stable cache key', () => {
    const capabilities = getCachedModelCapabilities('');
    const sameCapabilities = getCachedModelCapabilities(null);

    expect(capabilities.isGemini3).toBe(false);
    expect(sameCapabilities).toBe(capabilities);
  });
});
