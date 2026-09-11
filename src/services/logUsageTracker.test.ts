import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createLogUsageTracker, maskApiKeyForStorage } from './logUsageTracker';
import { API_USAGE_STORAGE_KEY, TOKEN_USAGE_STORAGE_KEY } from '@/constants/storageKeys';

describe('logUsageTracker', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  describe('maskApiKeyForStorage', () => {
    it('handles empty strings and sentinel keys', () => {
      expect(maskApiKeyForStorage('')).toBe('');
      expect(maskApiKeyForStorage('__SERVER_MANAGED__')).toBe('__SERVER_MANAGED__');
    });

    it('masks short keys', () => {
      expect(maskApiKeyForStorage('short-key')).toBe('sh••••');
    });

    it('masks longer keys preserving prefix and suffix', () => {
      expect(maskApiKeyForStorage('AIzaSyD1234567890abcdef')).toBe('AIzaSy••••cdef');
    });
  });

  describe('createLogUsageTracker', () => {
    it('persists and loads API key usage via persistent storage', () => {
      const reportError = vi.fn();
      const tracker = createLogUsageTracker(reportError);

      tracker.recordApiKeyUsage('AIzaSySecretApiKey123456');

      const raw = localStorage.getItem(API_USAGE_STORAGE_KEY);
      expect(raw).toBeTruthy();
      const parsed = JSON.parse(raw!);
      expect(parsed).toEqual([['AIzaSy••••3456', 1]]);

      // Create new tracker to verify loaded state
      const tracker2 = createLogUsageTracker(reportError);
      let loadedUsage: Map<string, number> | null = null;
      tracker2.subscribeToApiKeys((usage) => {
        loadedUsage = usage;
      });

      expect((loadedUsage as Map<string, number> | null)?.get('AIzaSy••••3456')).toBe(1);
    });

    it('persists and loads token usage via persistent storage', () => {
      const reportError = vi.fn();
      const tracker = createLogUsageTracker(reportError);

      tracker.recordTokenUsage('gemini-2.5-flash', {
        promptTokens: 100,
        completionTokens: 50,
      });

      const raw = localStorage.getItem(TOKEN_USAGE_STORAGE_KEY);
      expect(raw).toBeTruthy();
      const parsed = JSON.parse(raw!);
      expect(parsed).toEqual([['gemini-2.5-flash', { input: 100, output: 50 }]]);

      const tracker2 = createLogUsageTracker(reportError);
      let loadedUsage: Map<string, { input: number; output: number }> | null = null;
      tracker2.subscribeToTokenUsage((usage) => {
        loadedUsage = usage;
      });

      expect((loadedUsage as Map<string, { input: number; output: number }> | null)?.get('gemini-2.5-flash')).toEqual({
        input: 100,
        output: 50,
      });
    });
  });
});
