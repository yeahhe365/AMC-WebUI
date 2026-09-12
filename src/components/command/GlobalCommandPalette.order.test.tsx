import { describe, expect, it } from 'vitest';
import { sortSessionsByRecency } from './sessionRecency';
import { createChatSettings } from '@/test/data/factories';

const session = (id: string, timestamp: number, sortOrder: number) => ({
  id,
  title: id,
  timestamp,
  messages: [],
  settings: createChatSettings(),
  sortOrder,
});

describe('sortSessionsByRecency', () => {
  it('ignores manual order and keeps the most recently active sessions first', () => {
    const result = sortSessionsByRecency([session('old-but-top', 1_000, 1), session('new-but-bottom', 9_000, 2)]);

    expect(result.map((item) => item.id)).toEqual(['new-but-bottom', 'old-but-top']);
  });
});
