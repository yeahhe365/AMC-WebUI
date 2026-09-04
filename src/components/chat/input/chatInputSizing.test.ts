import { describe, expect, it } from 'vitest';
import { getChatInputMinHeight, getCompactChatInputMinHeight } from './chatInputSizing';

describe('chatInputSizing', () => {
  it('computes min heights like Cherry', () => {
    expect(getChatInputMinHeight(14)).toBe(Math.ceil(14 * 1.4 * 2 + 6)); // 46
    expect(getCompactChatInputMinHeight(14)).toBe(Math.ceil(14 * 1.4 + 6)); // 26
    expect(getChatInputMinHeight(16)).toBe(Math.ceil(16 * 1.4 * 2 + 6));
  });
});
