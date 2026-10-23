import { describe, expect, it, vi } from 'vitest';
import type { ChatMessage, SavedChatSession } from '@/types';
import { DEFAULT_CHAT_SETTINGS } from '@/constants/settingsDefaults';
import {
  DEFAULT_MAX_RETAINED_RUNTIME_SESSIONS,
  retainRuntimeSession,
  touchRecentSessionId,
} from './sessionLoaderDrafts';

const createDummyMessage = (id: string, text: string): ChatMessage => ({
  id,
  role: 'user',
  content: text,
  timestamp: new Date(),
});

const createDummySession = (id: string, messageCount = 0): SavedChatSession => ({
  id,
  title: `Session ${id}`,
  timestamp: Date.now(),
  messages: Array.from({ length: messageCount }, (_, i) => createDummyMessage(`msg-${id}-${i}`, `hello ${i}`)),
  settings: { ...DEFAULT_CHAT_SETTINGS, modelId: 'gemini-2.5-flash' },
});

describe('sessionLoaderDrafts LRU eviction', () => {
  it('exports default max retained runtime sessions as 3', () => {
    expect(DEFAULT_MAX_RETAINED_RUNTIME_SESSIONS).toBe(3);
  });

  it('updates recentSessionIds queue placing the most recent item first and deduplicating', () => {
    expect(touchRecentSessionId([], 's1')).toEqual(['s1']);
    expect(touchRecentSessionId(['s1'], 's2')).toEqual(['s2', 's1']);
    expect(touchRecentSessionId(['s2', 's1'], 's1')).toEqual(['s1', 's2']);
    expect(touchRecentSessionId(['s3', 's2', 's1'], 's2')).toEqual(['s2', 's3', 's1']);
  });

  it('retains outgoing session messages when total sessions with messages <= maxRetained', () => {
    const s1 = createDummySession('s1', 0);
    const s2 = createDummySession('s2', 2);
    const runtimeS1 = createDummySession('s1', 3);

    const result = retainRuntimeSession([s1, s2], 's1', runtimeS1, {
      maxRetained: 3,
      recentSessionIds: ['s1', 's2'],
    });

    const resultS1 = result.find((s) => s.id === 's1');
    const resultS2 = result.find((s) => s.id === 's2');

    expect(resultS1?.messages).toHaveLength(3);
    expect(resultS2?.messages).toHaveLength(2);
  });

  it('evicts the least recently used session messages when exceeding maxRetained capacity', () => {
    const revokePreview = vi.spyOn(URL, 'revokeObjectURL');
    const s1 = createDummySession('s1', 2);
    s1.messages[0].files = [
      { id: 'evicted-file', name: 'evicted.txt', type: 'text/plain', size: 1, dataUrl: 'blob:evicted-upload' },
    ];
    const s2 = createDummySession('s2', 2);
    const s3 = createDummySession('s3', 2);
    const s4 = createDummySession('s4', 0);
    const runtimeS4 = createDummySession('s4', 5);

    // Access order from most recent to least recent: s4 (now), s3, s2, s1 (oldest)
    const recentSessionIds = ['s4', 's3', 's2', 's1'];

    const result = retainRuntimeSession([s1, s2, s3, s4], 's4', runtimeS4, {
      maxRetained: 3,
      recentSessionIds,
    });

    const resultS1 = result.find((s) => s.id === 's1');
    const resultS2 = result.find((s) => s.id === 's2');
    const resultS3 = result.find((s) => s.id === 's3');
    const resultS4 = result.find((s) => s.id === 's4');

    // s4 is active/outgoing -> retained
    expect(resultS4?.messages).toHaveLength(5);
    // s3 and s2 are more recent than s1 -> retained
    expect(resultS3?.messages).toHaveLength(2);
    expect(resultS2?.messages).toHaveLength(2);
    // s1 is the LRU -> evicted to []
    expect(resultS1?.messages).toEqual([]);
    expect(revokePreview).toHaveBeenCalledWith('blob:evicted-upload');
    revokePreview.mockRestore();
  });

  it('protects sessions in protectedSessionIds (such as loadingSessionIds) from eviction', () => {
    const s1 = createDummySession('s1', 2);
    const s2 = createDummySession('s2', 2);
    const s3 = createDummySession('s3', 2);
    const s4 = createDummySession('s4', 0);
    const runtimeS4 = createDummySession('s4', 5);

    // s1 is the oldest in LRU, BUT s1 is currently streaming (in protectedSessionIds).
    // s2 is the next oldest non-protected session.
    const recentSessionIds = ['s4', 's3', 's2', 's1'];

    const result = retainRuntimeSession([s1, s2, s3, s4], 's4', runtimeS4, {
      maxRetained: 3,
      recentSessionIds,
      protectedSessionIds: new Set(['s1']),
    });

    const resultS1 = result.find((s) => s.id === 's1');
    const resultS2 = result.find((s) => s.id === 's2');
    const resultS3 = result.find((s) => s.id === 's3');
    const resultS4 = result.find((s) => s.id === 's4');

    expect(resultS4?.messages).toHaveLength(5);
    expect(resultS3?.messages).toHaveLength(2);
    expect(resultS1?.messages).toHaveLength(2); // protected!
    expect(resultS2?.messages).toEqual([]); // s2 evicted instead
  });
});
