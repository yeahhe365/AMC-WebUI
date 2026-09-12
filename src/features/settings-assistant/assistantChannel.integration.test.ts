import { describe, expect, it } from 'vitest';
import { DEFAULT_APP_SETTINGS } from '@/constants/settingsDefaults';
import { resolveAssistantChannel } from './assistantChannel';

/**
 * Deliberately unmocked: the unit test mocks apiKeySelection, which would hide a
 * broken assumption about the minimal ChatSettings the Gemini route needs. This
 * exercises the real getGeminiKeyForRequest path.
 */
describe('resolveAssistantChannel against the real key resolver', () => {
  it('reports no-gemini-key instead of throwing when nothing is configured', () => {
    const channel = resolveAssistantChannel(DEFAULT_APP_SETTINGS);
    expect(channel.ok).toBe(false);
    if (!channel.ok) {
      expect(channel.reason).toBe('no-gemini-key');
    }
  });

  it('resolves a usable channel for a BYOK key', () => {
    // useCustomApiConfig is what makes the app read the user's own Gemini key
    // (otherwise it falls back to the build-time VITE_GEMINI_API_KEY).
    const channel = resolveAssistantChannel({
      ...DEFAULT_APP_SETTINGS,
      useCustomApiConfig: true,
      apiKey: 'gemini-test-key',
    });
    expect(channel.ok).toBe(true);
    if (channel.ok) {
      expect(channel.key).toBe('gemini-test-key');
      expect(channel.modelId.length).toBeGreaterThan(0);
    }
  });

  it('does not advance the key rotation just by resolving the channel', () => {
    const settings = { ...DEFAULT_APP_SETTINGS, useCustomApiConfig: true, apiKey: 'key-a\nkey-b' };

    // Resolving is a render-time capability check, so it must be side-effect
    // free: with rotation enabled the second call would return the next key.
    const first = resolveAssistantChannel(settings);
    const second = resolveAssistantChannel(settings);

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    if (first.ok && second.ok) {
      expect(second.key).toBe(first.key);
    }
  });
});
