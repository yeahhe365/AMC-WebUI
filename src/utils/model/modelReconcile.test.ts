import { describe, it, expect } from 'vitest';
import type { ModelOption } from '@/types';
import { reconcileModels, applyModelReconcile } from './modelReconcile';

describe('modelReconcile', () => {
  const existingA: ModelOption = {
    id: 'gpt-4o',
    name: 'My Custom GPT 4o',
    isPinned: true,
    visibleInSelector: true,
    parameters: { temperature: 0.7 },
  };

  const existingStale: ModelOption = {
    id: 'old-deprecated-model',
    name: 'Old Model',
  };

  const remoteA: ModelOption = {
    id: 'gpt-4o',
    name: 'GPT-4o',
    contextWindow: 128000,
    capabilities: { vision: true, tools: true },
  };

  const remoteB: ModelOption = {
    id: 'deepseek-r1',
    name: 'DeepSeek R1',
    contextWindow: 64000,
    capabilities: { thinking: true },
  };

  it('correctly categorizes new, existing, and stale models', () => {
    const result = reconcileModels([remoteA, remoteB], [existingA, existingStale]);

    expect(result.stats.totalRemote).toBe(2);
    expect(result.stats.newCount).toBe(1);
    expect(result.stats.existingCount).toBe(1);
    expect(result.stats.staleCount).toBe(1);

    expect(result.newModels.map((m) => m.id)).toEqual(['deepseek-r1']);
    expect(result.staleModels.map((m) => m.id)).toEqual(['old-deprecated-model']);

    // Existing model should retain user customizations while absorbing metadata
    const merged = result.existingModels[0];
    expect(merged.id).toBe('gpt-4o');
    expect(merged.name).toBe('My Custom GPT 4o');
    expect(merged.isPinned).toBe(true);
    expect(merged.parameters?.temperature).toBe(0.7);
    expect(merged.contextWindow).toBe(128000);
    expect(merged.capabilities?.vision).toBe(true);
  });

  it('applies reconcile selections to create new model list', () => {
    const reconciled = applyModelReconcile({
      existingModels: [existingA, existingStale],
      selectedNewModels: [remoteB],
      removeStaleModelIds: new Set(['old-deprecated-model']),
      updateMetadataFromRemote: new Map([['gpt-4o', remoteA]]),
    });

    expect(reconciled.length).toBe(2);
    expect(reconciled.find((m) => m.id === 'old-deprecated-model')).toBeUndefined();

    const gpt = reconciled.find((m) => m.id === 'gpt-4o');
    expect(gpt).toBeDefined();
    expect(gpt?.name).toBe('My Custom GPT 4o');
    expect(gpt?.contextWindow).toBe(128000);

    const ds = reconciled.find((m) => m.id === 'deepseek-r1');
    expect(ds).toBeDefined();
    expect(ds?.capabilities?.thinking).toBe(true);
  });
});
