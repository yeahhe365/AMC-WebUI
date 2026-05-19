import { beforeEach, describe, expect, it } from 'vitest';
import { useModelPreferencesStore } from '@/stores/modelPreferencesStore';
import { MediaResolution, type ThinkingLevel } from '@/types';
import { resolveModelSwitchSettings } from './modelSwitchSettings';

beforeEach(() => {
  localStorage.clear();
  useModelPreferencesStore.setState({
    customModels: null,
    modelSettingsCache: {},
    legacyModelPreferencesHydrated: false,
  });
});

const resolveModelSwitchForTarget = (
  targetModelId: string,
  overrides: Partial<{
    thinkingBudget: number;
    thinkingLevel: ThinkingLevel;
  }> = {},
) =>
  resolveModelSwitchSettings({
    currentSettings: {
      mediaResolution: undefined,
      thinkingBudget: overrides.thinkingBudget ?? 4096,
      thinkingLevel: overrides.thinkingLevel ?? 'HIGH',
    },
    sourceSettings: {
      mediaResolution: undefined,
      thinkingBudget: overrides.thinkingBudget ?? 4096,
      thinkingLevel: overrides.thinkingLevel ?? 'HIGH',
    },
    targetModelId,
  });

describe('thinking budget adjustment', () => {
  it('leaves budgets unchanged for models without a configured range', () => {
    expect(
      resolveModelSwitchForTarget('gemini-2.5-flash-native-audio-preview-12-2025', { thinkingBudget: 50000 })
        .thinkingBudget,
    ).toBe(50000);
  });

  it('clamps Gemini Robotics-ER 1.6 budgets to the documented max', () => {
    expect(
      resolveModelSwitchForTarget('gemini-robotics-er-1.6-preview', { thinkingBudget: 50000 }).thinkingBudget,
    ).toBe(24576);
  });

  it('clamps to min when budget is below range', () => {
    expect(resolveModelSwitchForTarget('gemini-3.1-pro-preview', { thinkingBudget: 10 }).thinkingBudget).toBe(128);
  });

  it('returns budget unchanged for unknown models', () => {
    expect(resolveModelSwitchForTarget('unknown-model', { thinkingBudget: 5000 }).thinkingBudget).toBe(5000);
  });

  it('leaves auto (-1) unchanged for models without a configured range', () => {
    expect(
      resolveModelSwitchForTarget('gemini-2.5-flash-native-audio-preview-12-2025', { thinkingBudget: -1 })
        .thinkingBudget,
    ).toBe(-1);
  });

  it('keeps auto (-1) for Gemini Robotics-ER 1.6', () => {
    expect(resolveModelSwitchForTarget('gemini-robotics-er-1.6-preview', { thinkingBudget: -1 }).thinkingBudget).toBe(
      -1,
    );
  });

  it('keeps auto (-1) for Gemini 3 models', () => {
    expect(resolveModelSwitchForTarget('gemini-3-flash-preview', { thinkingBudget: -1 }).thinkingBudget).toBe(-1);
    expect(resolveModelSwitchForTarget('gemini-3.5-flash', { thinkingBudget: -1 }).thinkingBudget).toBe(-1);
  });

  it('forces Gemini 3 mandatory thinking models with 0 budget to auto', () => {
    expect(resolveModelSwitchForTarget('gemini-3-flash-preview', { thinkingBudget: 0 }).thinkingBudget).toBe(-1);
    expect(resolveModelSwitchForTarget('gemini-3.5-flash', { thinkingBudget: 0 }).thinkingBudget).toBe(-1);
  });

  it('clamps Gemini 3.5 Flash budgets to the same range as Gemini 3 Flash', () => {
    expect(resolveModelSwitchForTarget('gemini-3.5-flash', { thinkingBudget: 10 }).thinkingBudget).toBe(128);
    expect(resolveModelSwitchForTarget('gemini-3.5-flash', { thinkingBudget: 50000 }).thinkingBudget).toBe(32768);
  });

  it('keeps valid budget within range', () => {
    expect(resolveModelSwitchForTarget('gemini-3.1-pro-preview', { thinkingBudget: 1000 }).thinkingBudget).toBe(1000);
  });
});

describe('resolveModelSwitchSettings', () => {
  it('caches the current model settings and restores clamped settings for the target model', () => {
    localStorage.setItem(
      'model_settings_cache',
      JSON.stringify({
        'gemini-3.1-pro-preview': {
          mediaResolution: MediaResolution.MEDIA_RESOLUTION_HIGH,
          thinkingBudget: 50000,
          thinkingLevel: 'MEDIUM',
        },
      }),
    );

    const result = resolveModelSwitchSettings({
      currentSettings: {
        modelId: 'gemini-2.5-flash',
        mediaResolution: MediaResolution.MEDIA_RESOLUTION_LOW,
        thinkingBudget: 2048,
        thinkingLevel: 'LOW',
      },
      sourceSettings: {
        mediaResolution: MediaResolution.MEDIA_RESOLUTION_MEDIUM,
        thinkingBudget: 4096,
        thinkingLevel: 'HIGH',
      },
      targetModelId: 'gemini-3.1-pro-preview',
    });

    expect(result).toEqual({
      modelId: 'gemini-3.1-pro-preview',
      mediaResolution: MediaResolution.MEDIA_RESOLUTION_HIGH,
      thinkingBudget: 32768,
      thinkingLevel: 'MEDIUM',
    });
    expect(useModelPreferencesStore.getState().modelSettingsCache).toEqual(
      expect.objectContaining({
        'gemini-2.5-flash': {
          mediaResolution: MediaResolution.MEDIA_RESOLUTION_LOW,
          thinkingBudget: 2048,
          thinkingLevel: 'LOW',
        },
      }),
    );
  });

  it('uses source settings and model-specific thinking defaults when no target cache exists', () => {
    const result = resolveModelSwitchSettings({
      currentSettings: {
        modelId: 'gemini-3-flash-preview',
        mediaResolution: undefined,
        thinkingBudget: 0,
        thinkingLevel: 'HIGH',
      },
      sourceSettings: {
        mediaResolution: undefined,
        thinkingBudget: 0,
        thinkingLevel: 'HIGH',
      },
      targetModelId: 'gemini-3.1-flash-image-preview',
    });

    expect(result).toEqual({
      modelId: 'gemini-3.1-flash-image-preview',
      mediaResolution: MediaResolution.MEDIA_RESOLUTION_UNSPECIFIED,
      thinkingBudget: 0,
      thinkingLevel: 'MINIMAL',
    });
  });
});
