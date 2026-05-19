import { describe, expect, it } from 'vitest';
import { type ModelOption } from '@/types';
import { resolveSupportedModelId, sanitizeModelOptions, sortModels } from './modelSorting';

describe('sortModels', () => {
  it('sorts pinned models before unpinned', () => {
    const models: ModelOption[] = [
      { id: 'model-b', name: 'B' },
      { id: 'model-a', name: 'A', isPinned: true },
    ];
    const result = sortModels(models);
    expect(result[0].id).toBe('model-a');
  });

  it('sorts by name when both are unpinned', () => {
    const models: ModelOption[] = [
      { id: 'z-model', name: 'Z Model' },
      { id: 'a-model', name: 'A Model' },
    ];
    const result = sortModels(models);
    expect(result[0].name).toBe('A Model');
  });

  it('sorts pinned by category weight: standard < native-audio < tts < image < imagen', () => {
    const models: ModelOption[] = [
      { id: 'gemini-tts', name: 'TTS', isPinned: true },
      { id: 'gemini-imagen', name: 'Imagen', isPinned: true },
      { id: 'gemini-flash', name: 'Flash', isPinned: true },
      { id: 'gemini-image', name: 'Image', isPinned: true },
      { id: 'gemini-native-audio', name: 'Audio', isPinned: true },
    ];
    const result = sortModels(models);
    expect(result.map((m) => m.id)).toEqual([
      'gemini-flash',
      'gemini-native-audio',
      'gemini-tts',
      'gemini-image',
      'gemini-imagen',
    ]);
  });

  it('prioritizes gemini-3 among pinned models of same category', () => {
    const models: ModelOption[] = [
      { id: 'gemini-2.5-flash', name: '2.5 Flash', isPinned: true },
      { id: 'gemini-3-flash', name: '3 Flash', isPinned: true },
    ];
    const result = sortModels(models);
    expect(result[0].id).toBe('gemini-3-flash');
  });

  it('keeps the preferred pinned Gemini text model order for the model picker', () => {
    const models: ModelOption[] = [
      { id: 'gemini-3-flash-preview', name: 'Gemini 3 Flash Preview', isPinned: true },
      { id: 'gemini-3.5-flash', name: 'Gemini 3.5 Flash', isPinned: true },
      { id: 'gemini-3.1-flash-lite', name: 'Gemini 3.1 Flash Lite Preview', isPinned: true },
      { id: 'gemini-3.1-pro-preview', name: 'Gemini 3.1 Pro Preview', isPinned: true },
    ];

    const result = sortModels(models);

    expect(result.map((model) => model.id)).toEqual([
      'gemini-3.1-pro-preview',
      'gemini-3.5-flash',
      'gemini-3-flash-preview',
      'gemini-3.1-flash-lite',
    ]);
  });

  it('does not mutate original array', () => {
    const models: ModelOption[] = [
      { id: 'b', name: 'B' },
      { id: 'a', name: 'A' },
    ];
    sortModels(models);
    expect(models[0].id).toBe('b');
  });
});

describe('model option sanitization', () => {
  it('keeps legacy Gemini 2.5 preview and TTS ids in custom model lists', () => {
    const models: ModelOption[] = [
      { id: 'gemini-2.5-flash-preview-09-2025', name: 'Old Flash' },
      { id: 'gemini-2.5-flash-preview-tts', name: 'Removed Flash TTS' },
      { id: 'gemini-2.5-pro-preview-tts', name: 'Removed Pro TTS' },
      { id: 'gemini-3.1-pro-preview', name: 'Gemini 3.1 Pro' },
    ];

    expect(sanitizeModelOptions(models).map((model) => model.id)).toEqual([
      'gemini-2.5-flash-preview-09-2025',
      'gemini-2.5-flash-preview-tts',
      'gemini-2.5-pro-preview-tts',
      'gemini-3.1-pro-preview',
    ]);
  });

  it('does not auto-fallback legacy preview and TTS ids', () => {
    expect(resolveSupportedModelId('gemini-2.5-flash-preview-09-2025', 'gemini-3-flash-preview')).toBe(
      'gemini-2.5-flash-preview-09-2025',
    );
    expect(resolveSupportedModelId('gemini-2.5-flash-preview-tts', 'gemini-3.1-flash-tts-preview')).toBe(
      'gemini-2.5-flash-preview-tts',
    );
    expect(resolveSupportedModelId('gemini-2.5-pro-preview-tts', 'gemini-3.1-flash-tts-preview')).toBe(
      'gemini-2.5-pro-preview-tts',
    );
  });
});
