import { act } from 'react';
import { beforeEach, describe, expect, it } from 'vitest';
import { useModels } from './useModels';
import { renderHook } from '@/test/render/renderer';
import { useModelPreferencesStore } from '@/stores/modelPreferencesStore';

const readPersistedCustomModels = () => {
  for (let index = 0; index < localStorage.length; index += 1) {
    const key = localStorage.key(index);
    if (!key) {
      continue;
    }

    const value = localStorage.getItem(key);
    if (!value) {
      continue;
    }

    const parsed = JSON.parse(value) as { state?: { customModels?: unknown } };
    if (parsed.state?.customModels) {
      return parsed.state.customModels;
    }
  }

  return undefined;
};

describe('useModels', () => {
  beforeEach(() => {
    localStorage.clear();
    useModelPreferencesStore.setState({
      customModels: null,
      modelSettingsCache: {},
      legacyModelPreferencesHydrated: false,
    });
  });

  it('keeps legacy Gemini 2.5 Flash preview models in persisted custom lists and reconciles new defaults', () => {
    localStorage.setItem(
      'custom_model_list_v1',
      JSON.stringify([
        { id: 'gemini-2.5-flash-preview-09-2025', name: 'Removed Flash' },
        { id: 'gemini-3-flash-preview', name: 'Gemini 3 Flash' },
      ]),
    );

    const { result, unmount } = renderHook(() => useModels());

    expect(result.current.apiModels.some((model) => model.id === 'gemini-2.5-flash-preview-09-2025')).toBe(true);
    expect(result.current.apiModels.some((model) => model.id === 'gemini-3.5-transcribe')).toBe(true);
    unmount();
  });

  it('automatically reconciles newly added official models into user custom model list', () => {
    useModelPreferencesStore.setState({
      customModels: [
        { id: 'gemini-3.7-flash', name: 'Gemini 3.7 Flash', isPinned: true },
        { id: 'custom-gpt-4o', name: 'Custom GPT-4o' },
      ],
      legacyModelPreferencesHydrated: true,
    });

    const { result, unmount } = renderHook(() => useModels());

    expect(result.current.apiModels.some((m) => m.id === 'gemini-3.5-transcribe')).toBe(true);
    expect(result.current.apiModels.some((m) => m.id === 'custom-gpt-4o')).toBe(true);
    expect(result.current.apiModels.some((m) => m.id === 'gemini-3.7-flash')).toBe(true);
    unmount();
  });

  it('deduplicates duplicate model ids when saving custom lists', () => {
    const { result, unmount } = renderHook(() => useModels());

    act(() => {
      result.current.setApiModels([
        { id: 'gemini-3-flash-preview', name: 'Gemini 3 Flash' },
        { id: 'gemini-3-flash-preview', name: 'Duplicate Gemini 3 Flash' },
        { id: 'gemma-4-31b-it', name: 'Gemma 4 31B IT' },
      ]);
    });

    expect(result.current.apiModels.map((model) => model.id)).toEqual(['gemini-3-flash-preview', 'gemma-4-31b-it']);
    expect(readPersistedCustomModels()).toEqual([
      { id: 'gemini-3-flash-preview', name: 'Gemini 3 Flash' },
      { id: 'gemma-4-31b-it', name: 'Gemma 4 31B IT' },
    ]);
    unmount();
  });

  it('updates models when the persisted model store changes', () => {
    const { result, unmount } = renderHook(() => useModels());

    act(() => {
      useModelPreferencesStore
        .getState()
        .setCustomModels([{ id: 'gemini-3.1-pro-preview', name: 'Gemini 3.1 Pro Preview' }]);
    });

    expect(result.current.apiModels).toEqual([{ id: 'gemini-3.1-pro-preview', name: 'Gemini 3.1 Pro Preview' }]);
    unmount();
  });

  it('omits Gemini 3.7 Flash by default but retains it when manually added by the user', () => {
    const { result, unmount } = renderHook(() => useModels());

    expect(result.current.apiModels.some((m) => m.id === 'gemini-3.7-flash')).toBe(false);
    expect(result.current.apiModels.some((m) => m.id === 'gemini-3.8-flash')).toBe(true);

    act(() => {
      result.current.setApiModels([
        ...result.current.apiModels,
        { id: 'gemini-3.7-flash', name: 'Gemini 3.7 Flash', isPinned: true },
      ]);
    });

    expect(result.current.apiModels.some((m) => m.id === 'gemini-3.7-flash')).toBe(true);
    unmount();
  });
});
