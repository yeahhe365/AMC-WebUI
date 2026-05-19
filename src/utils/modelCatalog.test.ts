import { describe, expect, it } from 'vitest';
import type { ModelOption } from '@/types';
import {
  buildModelCatalog,
  buildModelCatalogSections,
  filterModelCatalog,
  getQuickSwitchModelIds,
  getTabCycleModelIds,
} from './modelCatalog';

type ModelCatalogEntry = ReturnType<typeof buildModelCatalog>[number];

const getEntry = (entries: ModelCatalogEntry[], id: string) => {
  const entry = entries.find((candidate) => candidate.id === id);
  expect(entry).toBeDefined();
  return entry!;
};

describe('buildModelCatalog', () => {
  it('adds category and badge metadata for shared picker rendering', () => {
    const models: ModelOption[] = [
      { id: 'gemini-3.1-flash-live-preview', name: 'Gemini 3.1 Flash Live Preview', isPinned: true },
      { id: 'gemini-3.1-flash-tts-preview', name: 'Gemini 3.1 Flash TTS Preview' },
      { id: 'gemini-3-pro-image-preview', name: 'Gemini 3 Pro Image Preview' },
      { id: 'gemma-4-31b-it', name: 'Gemma 4 31B IT' },
      { id: 'gemini-robotics-er-1.6-preview', name: 'Gemini Robotics-ER 1.6 Preview' },
    ];

    const entries = buildModelCatalog(models);

    expect(getEntry(entries, 'gemini-3.1-flash-live-preview')).toMatchObject({
      category: 'live',
      group: 'pinned',
      badgeKeys: expect.arrayContaining(['pinned', 'live', 'flash']),
    });
    expect(getEntry(entries, 'gemini-3.1-flash-tts-preview')).toMatchObject({
      category: 'tts',
      group: 'standard',
      badgeKeys: expect.arrayContaining(['tts', 'flash']),
    });
    expect(getEntry(entries, 'gemini-3-pro-image-preview')).toMatchObject({
      category: 'image',
      group: 'standard',
      badgeKeys: expect.arrayContaining(['image', 'pro']),
    });
    expect(getEntry(entries, 'gemma-4-31b-it')).toMatchObject({
      category: 'text',
      group: 'standard',
      badgeKeys: expect.arrayContaining(['gemma']),
    });
    expect(getEntry(entries, 'gemini-robotics-er-1.6-preview')).toMatchObject({
      category: 'robotics',
      group: 'standard',
      badgeKeys: expect.arrayContaining(['robotics']),
    });
  });
});

describe('filterModelCatalog', () => {
  const entries = buildModelCatalog([
    { id: 'gemini-3.1-flash-live-preview', name: 'Gemini 3.1 Flash Live Preview' },
    { id: 'gemini-3.1-flash-tts-preview', name: 'Gemini 3.1 Flash TTS Preview' },
    { id: 'imagen-4.0-generate-001', name: 'Imagen 4.0' },
  ]);

  it('matches name, id, and capability tags', () => {
    expect(filterModelCatalog(entries, 'tts').map((entry) => entry.id)).toEqual(['gemini-3.1-flash-tts-preview']);
    expect(filterModelCatalog(entries, 'live').map((entry) => entry.id)).toEqual(['gemini-3.1-flash-live-preview']);
    expect(filterModelCatalog(entries, 'imagen').map((entry) => entry.id)).toEqual(['imagen-4.0-generate-001']);
  });
});

describe('buildModelCatalogSections', () => {
  it('groups mixed provider catalogs by provider instead of duplicating section assembly in pickers', () => {
    const entries = buildModelCatalog([
      { id: 'gemini-3.1-pro-preview', name: 'Gemini 3.1 Pro', apiMode: 'gemini-native' },
      { id: 'gpt-5.5', name: 'GPT-5.5', apiMode: 'openai-compatible' },
    ]);

    expect(buildModelCatalogSections(entries)).toMatchObject([
      {
        key: 'gemini-native',
        providerKey: 'gemini-native',
        entries: [{ id: 'gemini-3.1-pro-preview' }],
      },
      {
        key: 'openai-compatible',
        providerKey: 'openai-compatible',
        entries: [{ id: 'gpt-5.5' }],
      },
    ]);
  });

  it('groups providerless catalogs into pinned and category sections', () => {
    const entries = buildModelCatalog([
      { id: 'gemini-3-flash-preview', name: 'Gemini 3 Flash', isPinned: true },
      { id: 'gemini-3.1-flash-tts-preview', name: 'Gemini 3.1 Flash TTS' },
      { id: 'imagen-4.0-generate-001', name: 'Imagen 4.0' },
    ]);

    expect(buildModelCatalogSections(entries).map((section) => section.key)).toEqual(['pinned', 'tts', 'image']);
  });
});

describe('getQuickSwitchModelIds', () => {
  it('uses the shared sorted catalog order instead of a hard-coded subset', () => {
    const models: ModelOption[] = [
      { id: 'gemini-3.1-flash-lite', name: 'Gemini 3.1 Flash Lite Preview' },
      { id: 'gemma-4-31b-it', name: 'Gemma 4 31B IT', isPinned: true },
      { id: 'gemini-3-flash-preview', name: 'Gemini 3 Flash Preview', isPinned: true },
      { id: 'gemini-3.5-flash', name: 'Gemini 3.5 Flash', isPinned: true },
      { id: 'gemini-3.1-pro-preview', name: 'Gemini 3.1 Pro Preview' },
    ];

    expect(getQuickSwitchModelIds(models)).toEqual([
      'gemini-3.5-flash',
      'gemini-3-flash-preview',
      'gemma-4-31b-it',
      'gemini-3.1-flash-lite',
      'gemini-3.1-pro-preview',
    ]);
  });
});

describe('getTabCycleModelIds', () => {
  const models: ModelOption[] = [
    { id: 'gemini-3.1-pro-preview', name: 'Gemini 3.1 Pro Preview', isPinned: true },
    { id: 'gemini-3.5-flash', name: 'Gemini 3.5 Flash', isPinned: true },
    { id: 'gemini-3-flash-preview', name: 'Gemini 3 Flash Preview', isPinned: true },
    { id: 'gemini-3.1-flash-lite', name: 'Gemini 3.1 Flash Lite Preview', isPinned: true },
    { id: 'gemini-3.1-flash-tts-preview', name: 'Gemini 3.1 Flash TTS Preview', isPinned: true },
  ];

  it('falls back to the default quick-switch order when no manual selection is set', () => {
    expect(getTabCycleModelIds(models)).toEqual(['gemini-3.1-pro-preview', 'gemini-3.5-flash']);
  });

  it('filters the cycle order down to the manually selected models while preserving picker order', () => {
    expect(getTabCycleModelIds(models, ['gemini-3.1-flash-lite', 'gemini-3.1-pro-preview'])).toEqual([
      'gemini-3.1-pro-preview',
      'gemini-3.1-flash-lite',
    ]);
  });

  it('falls back to the default order when the stored selection is fully stale', () => {
    expect(getTabCycleModelIds(models, ['missing-model'])).toEqual(['gemini-3.1-pro-preview', 'gemini-3.5-flash']);
  });
});
