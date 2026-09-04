import { beforeEach, describe, expect, it } from 'vitest';

import { LAST_ACTIVE_CHAT_SESSION_ID_KEY } from '@/constants/storageKeys';
import type { ChatSettings } from '@/types';

import { buildNewTabHref, readLastActiveSessionSnapshot, writeLastActiveSessionSnapshot } from './lastActiveSession';

describe('buildNewTabHref', () => {
  it('encodes the active session id into a ?from query param', () => {
    expect(buildNewTabHref('chat-abc')).toBe('/?from=chat-abc');
  });

  it('returns the bare root path when there is no active session', () => {
    expect(buildNewTabHref(null)).toBe('/');
  });

  it('encodes special characters in the session id', () => {
    expect(buildNewTabHref('a b/c?d')).toBe('/?from=a%20b%2Fc%3Fd');
  });
});

describe('writeLastActiveSessionSnapshot', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('never persists a raw lockedApiKey into localStorage', () => {
    const settings = { temperature: 0.7, lockedApiKey: 'raw-secret-key' } as unknown as ChatSettings;

    writeLastActiveSessionSnapshot({ sessionId: 's1', settings });

    const raw = localStorage.getItem(LAST_ACTIVE_CHAT_SESSION_ID_KEY) ?? '';
    expect(raw).not.toContain('raw-secret-key');
  });

  it('keeps the snapshot readable with the sanitized settings', () => {
    const settings = { temperature: 0.7, lockedApiKey: 'raw-secret-key' } as unknown as ChatSettings;

    writeLastActiveSessionSnapshot({ sessionId: 's1', settings });

    const snapshot = readLastActiveSessionSnapshot();
    expect(snapshot?.sessionId).toBe('s1');
    expect(snapshot?.settings.temperature).toBe(0.7);
    expect(snapshot?.settings.lockedApiKey).toBeNull();
  });

  it('removes the snapshot when called with null', () => {
    const settings = { temperature: 0.7 } as unknown as ChatSettings;
    writeLastActiveSessionSnapshot({ sessionId: 's1', settings });
    writeLastActiveSessionSnapshot(null);
    expect(localStorage.getItem(LAST_ACTIVE_CHAT_SESSION_ID_KEY)).toBeNull();
  });
});
