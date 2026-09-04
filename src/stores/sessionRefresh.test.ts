import { describe, expect, it } from 'vitest';
import { DEFAULT_MODEL_ID } from '@/constants/modelConfiguration';
import type { SavedChatSession } from '@/types';
import { createSavedChatSessionMetadata } from '@/test/data/factories';
import { mergeSessionMetadata } from './sessionRefresh';

describe('sessionRefresh', () => {
  it('merges refreshed metadata: DB fields win while active runtime messages are preserved', () => {
    const runtimeMessage = {
      id: 'runtime-message',
      role: 'model' as const,
      content: 'streaming',
      timestamp: new Date(),
    };
    const previousSession = createSavedChatSessionMetadata({
      id: 'active',
      title: 'Local Title',
      timestamp: 1,
      messages: [runtimeMessage],
      settings: { temperature: 0.7 } as SavedChatSession['settings'],
    });
    const incomingMetadata = createSavedChatSessionMetadata({
      id: 'active',
      title: 'Persisted Title',
      timestamp: 2,
      messages: [],
      settings: {} as SavedChatSession['settings'],
    });

    const merged = mergeSessionMetadata([previousSession], [incomingMetadata], {
      activeSessionId: 'active',
      loadingSessionIds: new Set(),
    });

    expect(merged).toHaveLength(1);
    expect(merged[0].messages).toEqual([runtimeMessage]);
    expect(merged[0].title).toBe('Persisted Title');
    expect(merged[0].settings.modelId).toBe(DEFAULT_MODEL_ID);
    expect(merged[0].settings.temperature).toBe(0.7);
  });

  it('prefers refreshed DB metadata over stale in-memory values for groupId, pin and title', () => {
    const previous = createSavedChatSessionMetadata({
      id: 's1',
      title: 'Old Title',
      groupId: null,
      isPinned: false,
    });
    const refreshed = createSavedChatSessionMetadata({
      id: 's1',
      title: 'New Title',
      groupId: 'group-1',
      isPinned: true,
    });

    const [merged] = mergeSessionMetadata([previous], [refreshed], {
      activeSessionId: null,
      loadingSessionIds: new Set(),
    });

    expect(merged.groupId).toBe('group-1');
    expect(merged.title).toBe('New Title');
    expect(merged.isPinned).toBe(true);
  });

  it('prefers refreshed DB settings over stale in-memory settings for non-active sessions', () => {
    const previous = createSavedChatSessionMetadata({
      id: 's1',
      settings: { modelId: 'model-a' } as SavedChatSession['settings'],
    });
    const refreshed = createSavedChatSessionMetadata({
      id: 's1',
      settings: { modelId: 'model-b' } as SavedChatSession['settings'],
    });

    const [merged] = mergeSessionMetadata([previous], [refreshed], {
      activeSessionId: null,
      loadingSessionIds: new Set(),
    });

    expect(merged.settings.modelId).toBe('model-b');
  });

  it('keeps active runtime messages while applying the refreshed groupId', () => {
    const runtimeMessage = {
      id: 'm1',
      role: 'user' as const,
      content: 'hi',
      timestamp: new Date(),
    };
    const previous = createSavedChatSessionMetadata({
      id: 's1',
      messages: [runtimeMessage],
      groupId: 'old-group',
    });
    const refreshed = createSavedChatSessionMetadata({ id: 's1', groupId: 'new-group' });

    const [merged] = mergeSessionMetadata([previous], [refreshed], {
      activeSessionId: 's1',
      loadingSessionIds: new Set(),
    });

    expect(merged.messages).toEqual([runtimeMessage]);
    expect(merged.groupId).toBe('new-group');
  });

  it('keeps loading session messages and strips inactive non-loading messages', () => {
    const loadingMessage = {
      id: 'loading-message',
      role: 'model' as const,
      content: 'partial',
      timestamp: new Date(),
    };
    const inactiveMessage = {
      id: 'inactive-message',
      role: 'user' as const,
      content: 'archived',
      timestamp: new Date(),
    };

    const merged = mergeSessionMetadata(
      [
        createSavedChatSessionMetadata({ id: 'loading', messages: [loadingMessage], timestamp: 1 }),
        createSavedChatSessionMetadata({ id: 'inactive', messages: [inactiveMessage], timestamp: 2 }),
      ],
      [
        createSavedChatSessionMetadata({ id: 'inactive', timestamp: 2 }),
        createSavedChatSessionMetadata({ id: 'loading', timestamp: 1 }),
      ],
      {
        activeSessionId: null,
        loadingSessionIds: new Set(['loading']),
      },
    );

    expect(merged.find((session) => session.id === 'loading')?.messages).toEqual([loadingMessage]);
    expect(merged.find((session) => session.id === 'inactive')?.messages).toEqual([]);
  });

  it('drops sessions deleted remotely unless they have in-flight runtime work', () => {
    const previous = [
      createSavedChatSessionMetadata({ id: 'inactive' }),
      createSavedChatSessionMetadata({ id: 'active' }),
      createSavedChatSessionMetadata({ id: 'loading' }),
    ];

    const merged = mergeSessionMetadata(previous, [], {
      activeSessionId: 'active',
      loadingSessionIds: new Set(['loading']),
    });

    expect(merged.map((session) => session.id)).toEqual(['active', 'loading']);
  });

  it('sorts merged sessions and drops local-only sessions without in-flight runtime work', () => {
    const merged = mergeSessionMetadata(
      [createSavedChatSessionMetadata({ id: 'local-only', timestamp: 3 })],
      [
        createSavedChatSessionMetadata({ id: 'old', timestamp: 1 }),
        createSavedChatSessionMetadata({ id: 'pinned', timestamp: 2, isPinned: true }),
      ],
      {
        activeSessionId: null,
        loadingSessionIds: new Set(),
      },
    );

    expect(merged.map((session) => session.id)).toEqual(['pinned', 'old']);
  });

  it('adds sessions that exist only in the refreshed metadata', () => {
    const merged = mergeSessionMetadata([], [createSavedChatSessionMetadata({ id: 's9' })], {
      activeSessionId: null,
      loadingSessionIds: new Set(),
    });

    expect(merged.map((session) => session.id)).toEqual(['s9']);
  });
});
