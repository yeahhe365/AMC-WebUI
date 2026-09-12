import { describe, expect, it } from 'vitest';
import { createChatSettings, createSavedChatSession } from '@/test/data/factories';
import { useChatStore } from './chatStore';

describe('chatStore session order integration', () => {
  it('places a brand new session at the top of its bucket and after existing manual order', () => {
    const existing = createSavedChatSession({
      id: 'existing',
      title: 'existing',
      timestamp: 1_000,
      messages: [],
      settings: createChatSettings(),
      sortOrder: 1_048_576,
    });
    useChatStore.setState({ savedSessions: [existing], activeSessionId: null, activeMessages: [] });

    useChatStore.getState().updateAndPersistSessions((prev) => [
      createSavedChatSession({
        id: 'fresh',
        title: 'fresh',
        timestamp: 2_000,
        messages: [],
        settings: createChatSettings(),
      }),
      ...prev,
    ]);

    const sessions = useChatStore.getState().savedSessions;
    expect(sessions.map((session) => session.id)).toEqual(['fresh', 'existing']);
    // 新会话必须拿到显式的 sortOrder，否则刷新后会被排序规则踢到未编号区段的末尾。
    expect(typeof sessions[0].sortOrder).toBe('number');
  });
});
