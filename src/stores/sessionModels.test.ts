import { describe, expect, it } from 'vitest';
import { DEFAULT_MODEL_ID } from '@/constants/modelConfiguration';
import type { SavedChatSession } from '@/types';
import { createSavedChatSessionMetadata } from '@/test/data/factories';
import { sanitizeSessionModel, shouldRetainRuntimeMessages, sortSessionsInPlace } from './sessionModels';

describe('sessionModels', () => {
  it('sorts pinned sessions first, then by newest timestamp', () => {
    const sessions = [
      createSavedChatSessionMetadata({ id: 'old', timestamp: 1 }),
      createSavedChatSessionMetadata({ id: 'pinned-old', timestamp: 2, isPinned: true }),
      createSavedChatSessionMetadata({ id: 'new', timestamp: 4 }),
      createSavedChatSessionMetadata({ id: 'pinned-new', timestamp: 3, isPinned: true }),
    ];

    const sorted = sortSessionsInPlace(sessions);

    expect(sorted).toBe(sessions);
    expect(sorted.map((session) => session.id)).toEqual(['pinned-new', 'pinned-old', 'new', 'old']);
  });

  it('keeps runtime messages for the active session and loading sessions only', () => {
    const loadingSessionIds = new Set(['loading-session']);

    expect(shouldRetainRuntimeMessages('active-session', 'active-session', loadingSessionIds)).toBe(true);
    expect(shouldRetainRuntimeMessages('loading-session', 'active-session', loadingSessionIds)).toBe(true);
    expect(shouldRetainRuntimeMessages('inactive-session', 'active-session', loadingSessionIds)).toBe(false);
  });

  it('sanitizes missing model IDs to the default supported model', () => {
    const sanitized = sanitizeSessionModel(
      createSavedChatSessionMetadata({
        settings: {
          temperature: 1,
        } as SavedChatSession['settings'],
      }),
    );

    expect(sanitized.settings.modelId).toBe(DEFAULT_MODEL_ID);
  });

  it('folds legacy third-party session routing into the (providerId, modelId) key', () => {
    const sanitized = sanitizeSessionModel(
      createSavedChatSessionMetadata({
        settings: {
          modelId: 'kimi-k3-turbo',
          apiMode: 'third-party',
          thirdPartyProviderId: 'kimi',
          thirdPartyModelId: 'kimi-k3-turbo',
          temperature: 1,
        } as unknown as SavedChatSession['settings'],
      }),
    );

    expect(sanitized.settings.modelId).toBe('kimi-k3-turbo');
    expect(sanitized.settings.providerId).toBe('kimi');
    // The legacy routing toggles are dropped from the persisted shape.
    expect('apiMode' in sanitized.settings).toBe(false);
    expect('thirdPartyProviderId' in sanitized.settings).toBe(false);
    expect('thirdPartyModelId' in sanitized.settings).toBe(false);
  });

  it('keeps a legacy gemini-native session on gemini', () => {
    const sanitized = sanitizeSessionModel(
      createSavedChatSessionMetadata({
        settings: {
          modelId: 'gemini-3.1-pro-preview',
          apiMode: 'gemini-native',
          temperature: 1,
        } as unknown as SavedChatSession['settings'],
      }),
    );

    expect(sanitized.settings.modelId).toBe('gemini-3.1-pro-preview');
    // Gemini is the implicit default — no providerId is pinned, and the legacy
    // apiMode toggle is gone.
    expect(sanitized.settings.providerId).toBeUndefined();
    expect('apiMode' in sanitized.settings).toBe(false);
  });

  it('is idempotent: a migrated session with providerId stays unchanged', () => {
    const migrated = createSavedChatSessionMetadata({
      settings: {
        modelId: 'kimi-k3',
        providerId: 'kimi',
        temperature: 1,
      } as SavedChatSession['settings'],
    });

    const once = sanitizeSessionModel(migrated);
    const twice = sanitizeSessionModel(once);
    expect(twice.settings).toEqual(once.settings);
  });
});
