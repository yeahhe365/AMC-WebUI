import { describe, expect, it } from 'vitest';
import { ROBOTICS_MODEL, THINKING_BUDGET_RANGES } from './modelConfiguration';

describe('THINKING_BUDGET_RANGES', () => {
  it('defines thinking budget for ROBOTICS_MODEL', () => {
    expect(THINKING_BUDGET_RANGES[ROBOTICS_MODEL]).toEqual({ min: 128, max: 24576 });
    expect(THINKING_BUDGET_RANGES[`models/${ROBOTICS_MODEL}`]).toEqual({ min: 128, max: 24576 });
  });

  it('removes deprecated gemini-robotics-er-1.6-preview from budget ranges', () => {
    expect(THINKING_BUDGET_RANGES['gemini-robotics-er-1.6-preview']).toBeUndefined();
    expect(THINKING_BUDGET_RANGES['models/gemini-robotics-er-1.6-preview']).toBeUndefined();
  });

  it('drops budget ranges for the shut-down Gemini 2.5 Pro and 2.5 Flash', () => {
    expect(THINKING_BUDGET_RANGES['gemini-2.5-pro']).toBeUndefined();
    expect(THINKING_BUDGET_RANGES['models/gemini-2.5-pro']).toBeUndefined();
    expect(THINKING_BUDGET_RANGES['gemini-2.5-flash']).toBeUndefined();
    expect(THINKING_BUDGET_RANGES['models/gemini-2.5-flash']).toBeUndefined();
  });
});
