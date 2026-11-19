import { describe, expect, it } from 'vitest';
import { getDefaultModelOptions } from './defaultModelOptions';
import { getModelSpecification } from './modelSpecifications';
import { getDefaultThinkingLevelForModel, normalizeThinkingLevelForModel } from './modelCapabilities';
import { estimateMessageCostUsd } from '@/utils/pricing/usagePricing';

describe('Gemini 4 Neon support', () => {
  it('offers Neon and the official legacy migration target', () => {
    const models = getDefaultModelOptions();
    expect(models.find((model) => model.id === 'gemini-4-neon')).toMatchObject({ isPinned: true });
    expect(models.some((model) => model.id === 'gemini-3.8-flash')).toBe(true);
  });

  it('exposes its synchronous limits and full thinking levels', () => {
    const spec = getModelSpecification({ id: 'gemini-4-neon', name: 'Gemini 4 Neon' });
    expect(spec.contextWindow).toContain('1M');
    expect(spec.maxOutput).toContain('65,536');
    expect(spec.thinkingLevelSpec).toMatchObject({ min: 'LOW', max: 'XHIGH', defaultLevel: 'HIGH' });
    expect(getDefaultThinkingLevelForModel('gemini-4-neon')).toBe('HIGH');
    expect(normalizeThinkingLevelForModel('gemini-4-neon', 'XHIGH')).toBe('XHIGH');
  });

  it('estimates the published input, cached input and output rates', () => {
    expect(
      estimateMessageCostUsd('gemini-4-neon', {
        promptTokens: 1_000_000,
        cachedPromptTokens: 500_000,
        completionTokens: 1_000_000,
      }),
    ).toBeCloseTo(16.575);
  });
});
