import { describe, expect, it } from 'vitest';
import { REQUIRED_THINKING_MODEL_IDS, ROBOTICS_MODEL, THINKING_BUDGET_RANGES } from './modelConfiguration';

describe('THINKING_BUDGET_RANGES', () => {
  it('defines thinking budget for ROBOTICS_MODEL', () => {
    expect(THINKING_BUDGET_RANGES[ROBOTICS_MODEL]).toEqual({ min: 128, max: 24576 });
    expect(THINKING_BUDGET_RANGES[`models/${ROBOTICS_MODEL}`]).toEqual({ min: 128, max: 24576 });
  });

  it('removes deprecated gemini-robotics-er-1.6-preview from budget ranges', () => {
    expect(THINKING_BUDGET_RANGES['gemini-robotics-er-1.6-preview']).toBeUndefined();
    expect(THINKING_BUDGET_RANGES['models/gemini-robotics-er-1.6-preview']).toBeUndefined();
  });

  it('drops budget ranges for the shut-down Gemini 2.5 Pro, 2.5 Flash and 2.5 Flash-Lite', () => {
    expect(THINKING_BUDGET_RANGES['gemini-2.5-pro']).toBeUndefined();
    expect(THINKING_BUDGET_RANGES['models/gemini-2.5-pro']).toBeUndefined();
    expect(THINKING_BUDGET_RANGES['gemini-2.5-flash']).toBeUndefined();
    expect(THINKING_BUDGET_RANGES['models/gemini-2.5-flash']).toBeUndefined();
    expect(THINKING_BUDGET_RANGES['gemini-2.5-flash-lite']).toBeUndefined();
    expect(THINKING_BUDGET_RANGES['models/gemini-2.5-flash-lite']).toBeUndefined();
  });

  it('only carries models that the app still ships, so no orphan entries linger', () => {
    // The map once held a gemini-2.5-flash-lite budget for an id that had no
    // catalog entry and no selector group: dead configuration nobody could reach.
    const allowed = new Set([...REQUIRED_THINKING_MODEL_IDS, ROBOTICS_MODEL, `models/${ROBOTICS_MODEL}`]);

    expect(Object.keys(THINKING_BUDGET_RANGES).filter((modelId) => !allowed.has(modelId))).toEqual([]);
  });
});
