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

  it('keeps token budgets for the Gemini 2.5 models, which are still served', () => {
    // 2.5 Pro and 2.5 Flash shut down on December 1, 2026 (Google auto-routes
    // them afterwards) and 2.5 Flash-Lite has no shutdown date, so all three
    // still accept a thinking token budget today.
    expect(THINKING_BUDGET_RANGES['gemini-2.5-pro']).toEqual({ min: 128, max: 32768 });
    expect(THINKING_BUDGET_RANGES['gemini-2.5-flash']).toEqual({ min: 0, max: 24576 });
    expect(THINKING_BUDGET_RANGES['gemini-2.5-flash-lite']).toEqual({ min: 512, max: 24576 });
    expect(THINKING_BUDGET_RANGES['models/gemini-2.5-pro']).toEqual({ min: 128, max: 32768 });
    expect(THINKING_BUDGET_RANGES['models/gemini-2.5-flash']).toEqual({ min: 0, max: 24576 });
    expect(THINKING_BUDGET_RANGES['models/gemini-2.5-flash-lite']).toEqual({ min: 512, max: 24576 });
  });

  it('does not carry shut-down Gemini 2.0 models', () => {
    expect(THINKING_BUDGET_RANGES['gemini-2.0-flash']).toBeUndefined();
    expect(THINKING_BUDGET_RANGES['gemini-2.0-flash-lite']).toBeUndefined();
  });
});
