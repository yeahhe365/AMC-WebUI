import { describe, expect, it } from 'vitest';
import type { ChatMessage } from '@/types';
import {
  buildMessageTokenStatsView,
  buildTokenStatsCopyText,
  formatCompactTokens,
  formatExactTokens,
} from './tokenStats';

const base: ChatMessage = {
  id: 'm1',
  role: 'model',
  content: 'hi',
  timestamp: new Date('2026-04-17T00:00:00.000Z'),
};

describe('buildMessageTokenStatsView', () => {
  it('derives U = P - C and prefers the stored total', () => {
    const view = buildMessageTokenStatsView({
      ...base,
      promptTokens: 120,
      cachedPromptTokens: 40,
      completionTokens: 80,
      totalTokens: 200,
    });

    expect(view.uncachedInputTokens).toBe(80);
    expect(view.totalTokens).toBe(200);
    expect(view.hasAnyTokens).toBe(true);
  });

  it('falls back to the summed total when no stored total exists', () => {
    const view = buildMessageTokenStatsView({
      ...base,
      promptTokens: 100,
      cachedPromptTokens: 20,
      completionTokens: 30,
      thoughtTokens: 10,
    });

    expect(view.totalTokens).toBe(80 + 20 + 30 + 10);
  });

  it('treats missing usage as no data, not as zeros', () => {
    const view = buildMessageTokenStatsView(base);

    expect(view.hasAnyTokens).toBe(false);
    expect(view.totalTokens).toBe(0);
    expect(view.cumulativeTotalTokens).toBeUndefined();
  });

  it('exposes the cumulative session total only when positive', () => {
    expect(buildMessageTokenStatsView({ ...base, cumulativeTotalTokens: 5000 }).cumulativeTotalTokens).toBe(5000);
    expect(buildMessageTokenStatsView({ ...base, cumulativeTotalTokens: 0 }).cumulativeTotalTokens).toBeUndefined();
  });
});

describe('token formatters', () => {
  it('compacts large counts with K units regardless of locale', () => {
    expect(formatCompactTokens(200)).toBe('200');
    expect(formatCompactTokens(999)).toBe('999');
    expect(formatCompactTokens(128400)).toBe('128.4K');
    expect(formatCompactTokens(2500000)).toBe('2.5M');
  });

  it('renders exact counts for the details card', () => {
    expect(formatExactTokens(128400, 'en')).toBe('128,400');
  });
});

describe('buildTokenStatsCopyText', () => {
  it('summarizes tokens and speed in one line', () => {
    const view = buildMessageTokenStatsView({
      ...base,
      promptTokens: 120,
      cachedPromptTokens: 40,
      completionTokens: 80,
      totalTokens: 200,
      cumulativeTotalTokens: 5000,
    });

    const text = buildTokenStatsCopyText(view, { modelTps: 80, elapsedSeconds: 1 });
    expect(text).toContain('total 200');
    expect(text).toContain('session 5000');
    expect(text).toContain('80.0 t/s');
  });
});
