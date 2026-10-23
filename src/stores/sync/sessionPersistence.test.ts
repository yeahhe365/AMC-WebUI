import { describe, expect, it } from 'vitest';
import type { ChatMessage, SavedChatSession } from '@/types';
import { createSavedChatSessionMetadata } from '@/test/data/factories';
import {
  createVirtualFullSessions,
  getSessionPersistenceChanges,
  mergePersistedSessionMessages,
  stripStoredSessionMessages,
} from './sessionPersistence';

const makeMessage = (overrides: Partial<ChatMessage> = {}): ChatMessage => ({
  id: 'message',
  role: 'user',
  content: 'Hello',
  timestamp: new Date(),
  ...overrides,
});

describe('sessionPersistence', () => {
  it('builds a virtual full session list using active messages', () => {
    const activeMessages = [makeMessage({ id: 'active-message' })];
    const inactiveSession = createSavedChatSessionMetadata({
      id: 'inactive',
      messages: [makeMessage({ id: 'inactive-message' })],
    });

    const virtualSessions = createVirtualFullSessions(
      [createSavedChatSessionMetadata({ id: 'active', messages: [] }), inactiveSession],
      'active',
      activeMessages,
    );

    expect(virtualSessions.find((session) => session.id === 'active')?.messages).toBe(activeMessages);
    expect(virtualSessions.find((session) => session.id === 'inactive')).toBe(inactiveSession);
  });

  it('detects modified sessions by reference and removed sessions by id', () => {
    const unchanged = createSavedChatSessionMetadata({ id: 'unchanged' });
    const changedBefore = createSavedChatSessionMetadata({ id: 'changed', title: 'Before' });
    const changedAfter = { ...changedBefore, title: 'After' };
    const removed = createSavedChatSessionMetadata({ id: 'removed' });

    const changes = getSessionPersistenceChanges([unchanged, changedBefore, removed], [changedAfter, unchanged]);

    expect(changes.modifiedSessions).toEqual([changedAfter]);
    expect(changes.deletedSessionIds).toEqual(['removed']);
  });

  it('restores persisted messages when saving a metadata-only inactive session', () => {
    const persistedMessage = makeMessage({ id: 'persisted-message' });
    const metadataUpdate = createSavedChatSessionMetadata({
      id: 'archive',
      title: 'Updated Title',
      messages: [],
      settings: { temperature: 0.3 } as SavedChatSession['settings'],
    });
    const persistedSession = createSavedChatSessionMetadata({
      id: 'archive',
      title: 'Old Title',
      messages: [persistedMessage],
      settings: { topP: 0.9 } as SavedChatSession['settings'],
    });

    const merged = mergePersistedSessionMessages(metadataUpdate, persistedSession);

    expect(merged.title).toBe('Updated Title');
    expect(merged.messages).toEqual([persistedMessage]);
    expect(merged.settings).toEqual({
      topP: 0.9,
      temperature: 0.3,
    });
  });

  it('strips messages from stored sessions except active and loading sessions', () => {
    const activeMessage = makeMessage({ id: 'active-message' });
    const loadingMessage = makeMessage({ id: 'loading-message' });
    const inactiveMessage = makeMessage({ id: 'inactive-message' });

    const stored = stripStoredSessionMessages(
      [
        createSavedChatSessionMetadata({ id: 'active', messages: [activeMessage] }),
        createSavedChatSessionMetadata({ id: 'loading', messages: [loadingMessage] }),
        createSavedChatSessionMetadata({ id: 'inactive', messages: [inactiveMessage] }),
      ],
      'active',
      new Set(['loading']),
    );

    expect(stored.find((session) => session.id === 'active')?.messages).toEqual([activeMessage]);
    expect(stored.find((session) => session.id === 'loading')?.messages).toEqual([loadingMessage]);
    expect(stored.find((session) => session.id === 'inactive')?.messages).toEqual([]);
  });
  it('does a bounded number of id reads when comparing a large unchanged history', () => {
    let idReads = 0;
    const sessions = Array.from({ length: 1000 }, (_, index) => ({
      ...createSavedChatSessionMetadata(),
      get id() {
        idReads += 1;
        return `session-${index}`;
      },
    }));
    const changes = getSessionPersistenceChanges(sessions, [...sessions]);
    expect(changes).toEqual({ modifiedSessions: [], deletedSessionIds: [] });
    expect(idReads).toBeLessThanOrEqual(sessions.length * 8);
  });
});
