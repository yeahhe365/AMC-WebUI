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
      { id: 'gemini-robotics-er-2-preview', name: 'Gemini Robotics-ER 2 Preview' },
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
    expect(getEntry(entries, 'gemini-robotics-er-2-preview')).toMatchObject({
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
    { id: 'gemini-3.1-flash-image-preview', name: 'Nano Banana 2' },
  ]);

  it('matches name, id, and capability tags', () => {
    expect(filterModelCatalog(entries, 'tts').map((entry) => entry.id)).toEqual(['gemini-3.1-flash-tts-preview']);
    expect(filterModelCatalog(entries, 'live').map((entry) => entry.id)).toEqual(['gemini-3.1-flash-live-preview']);
    expect(filterModelCatalog(entries, 'nano').map((entry) => entry.id)).toEqual(['gemini-3.1-flash-image-preview']);
  });
});

describe('buildModelCatalogSections', () => {
  it('groups mixed provider catalogs by provider instead of duplicating section assembly in pickers', () => {
    const entries = buildModelCatalog([
      { id: 'gemini-3.1-pro-preview', name: 'Gemini 3.1 Pro', apiMode: 'gemini-native' },
      { id: 'gpt-5.6-sol', name: 'GPT-5.6 Sol', apiMode: 'third-party' },
    ]);

    expect(buildModelCatalogSections(entries)).toMatchObject([
      {
        key: 'gemini-native',
        providerKey: 'gemini-native',
        entries: [{ id: 'gemini-3.1-pro-preview' }],
      },
      {
        key: 'third-party',
        providerKey: 'third-party',
        entries: [{ id: 'gpt-5.6-sol' }],
      },
    ]);
  });

  it('groups providerless catalogs into pinned and category sections', () => {
    const entries = buildModelCatalog([
      { id: 'gemini-3-flash-preview', name: 'Gemini 3 Flash', isPinned: true },
      { id: 'gemini-3.1-flash-tts-preview', name: 'Gemini 3.1 Flash TTS' },
      { id: 'gemini-3.1-flash-image-preview', name: 'Nano Banana 2' },
    ]);

    expect(buildModelCatalogSections(entries).map((section) => section.key)).toEqual(['pinned', 'tts', 'image']);
  });

  it('splits third-party models into per-provider subsections', () => {
    const entries = buildModelCatalog([
      { id: 'gemini-3-flash-preview', name: 'Gemini 3 Flash', apiMode: 'gemini-native' },
      { id: 'gpt-5.6-sol', name: 'GPT-5.6 Sol', apiMode: 'third-party', providerId: 'openai' },
      { id: 'claude-fable-5', name: 'Claude Fable 5', apiMode: 'third-party', providerId: 'anthropic' },
      { id: 'qwen3.7-max', name: 'Qwen3.7 Max', apiMode: 'third-party', providerId: 'qwen' },
    ]);

    const sections = buildModelCatalogSections(entries);

    expect(sections.map((section) => ({ key: section.key, label: section.label }))).toEqual([
      { key: 'gemini-native', label: undefined },
      { key: 'third-party:anthropic', label: 'Anthropic' },
      { key: 'third-party:openai', label: 'OpenAI' },
      { key: 'third-party:qwen', label: 'Qwen' },
    ]);
    expect(
      sections.find((section) => section.key === 'third-party:anthropic')?.entries.map((entry) => entry.id),
    ).toEqual(['claude-fable-5']);
  });

  it('flags unavailable and missing-key connection sections for picker chrome', () => {
    const entries = buildModelCatalog([
      {
        id: 'gpt-4o',
        name: 'GPT-4o',
        apiMode: 'third-party',
        providerId: 'openai',
        connectionName: 'OpenAI',
        missingApiKey: true,
      },
      {
        id: 'old-model',
        name: 'Old Model',
        apiMode: 'third-party',
        providerId: 'removed',
        connectionName: 'Removed',
        unavailable: true,
      },
    ]);

    const sections = buildModelCatalogSections(entries);
    expect(sections.find((section) => section.key === 'third-party:openai')).toMatchObject({
      missingApiKey: true,
      unavailable: false,
    });
    expect(sections.find((section) => section.key === 'third-party:removed')).toMatchObject({
      unavailable: true,
      missingApiKey: false,
    });
  });
});

describe('getQuickSwitchModelIds', () => {
  it('uses the shared sorted catalog order instead of a hard-coded subset', () => {
    const models: ModelOption[] = [
      { id: 'gemini-3.5-flash-lite', name: 'Gemini 3.5 Flash-Lite' },
      { id: 'gemma-4-31b-it', name: 'Gemma 4 31B IT', isPinned: true },
      { id: 'gemini-3-flash-preview', name: 'Gemini 3 Flash Preview', isPinned: true },
      { id: 'gemini-3.6-flash', name: 'Gemini 3.6 Flash', isPinned: true },
      { id: 'gemini-3.1-pro-preview', name: 'Gemini 3.1 Pro Preview' },
    ];

    expect(getQuickSwitchModelIds(models)).toEqual([
      'gemini-3.6-flash',
      'gemini-3-flash-preview',
      'gemma-4-31b-it',
      'gemini-3.1-pro-preview',
      'gemini-3.5-flash-lite',
    ]);
  });
});

describe('getTabCycleModelIds', () => {
  const models: ModelOption[] = [
    { id: 'gemini-3.1-pro-preview', name: 'Gemini 3.1 Pro Preview', isPinned: true },
    { id: 'gemini-3.8-flash', name: 'Gemini 3.8 Flash', isPinned: true },
    { id: 'gemini-3.7-flash', name: 'Gemini 3.7 Flash', isPinned: true },
    { id: 'gemini-3.6-flash', name: 'Gemini 3.6 Flash', isPinned: true },
    { id: 'gemini-3-flash-preview', name: 'Gemini 3 Flash Preview', isPinned: true },
    { id: 'gemini-3.5-flash-lite', name: 'Gemini 3.5 Flash-Lite', isPinned: true },
    { id: 'gemini-3.1-flash-tts-preview', name: 'Gemini 3.1 Flash TTS Preview', isPinned: true },
  ];

  it('falls back to the default quick-switch order when no manual selection is set', () => {
    expect(getTabCycleModelIds(models)).toEqual(['gemini-3.1-pro-preview', 'gemini-3.8-flash']);
  });

  it('filters the cycle order down to the manually selected models while preserving picker order', () => {
    expect(getTabCycleModelIds(models, ['gemini-3.5-flash-lite', 'gemini-3.1-pro-preview'])).toEqual([
      'gemini-3.1-pro-preview',
      'gemini-3.5-flash-lite',
    ]);
  });

  it('falls back to the default order when the stored selection is fully stale', () => {
    expect(getTabCycleModelIds(models, ['missing-model'])).toEqual(['gemini-3.1-pro-preview', 'gemini-3.8-flash']);
  });
});
