import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GEMINI_PROVIDER_ID } from '@/types';
import { DEFAULT_LIVE_ARTIFACTS_MODEL_ID } from '@/constants/modelConfiguration';
import type { ConnectionHealthProbeResult } from '@/utils/thirdPartyDiagnostics';

const importFreshProviderUiStore = async () => {
  vi.resetModules();
  return import('./providerUiStore');
};

describe('providerUiStore', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('initializes with default state', async () => {
    const { useProviderUiStore } = await importFreshProviderUiStore();
    const state = useProviderUiStore.getState();

    expect(state.selectedConnectionId).toBeNull();
    expect(state.listFilterMode).toBe('all');
    expect(state.listSearchQuery).toBe('');
    expect(state.groupsCollapsedByConnection).toEqual({});
    expect(state.modelSearchByConnection).toEqual({});
    expect(state.isModelSearchOpenByConnection).toEqual({});
    expect(state.isBatchModeByConnection).toEqual({});
    expect(state.modelProbeResultsByConnection).toEqual({});
    expect(state.healthResultByConnection).toEqual({});
    expect(state.geminiTestModelId).toBe(DEFAULT_LIVE_ARTIFACTS_MODEL_ID);
    expect(state.geminiTestResult).toBeNull();
  });

  it('updates provider list filter and search states', async () => {
    const { useProviderUiStore } = await importFreshProviderUiStore();

    useProviderUiStore.getState().setSelectedConnectionId('conn-1');
    useProviderUiStore.getState().setListFilterMode('enabled');
    useProviderUiStore.getState().setListSearchQuery('deepseek');

    const state = useProviderUiStore.getState();
    expect(state.selectedConnectionId).toBe('conn-1');
    expect(state.listFilterMode).toBe('enabled');
    expect(state.listSearchQuery).toBe('deepseek');
  });

  it('toggles and collapses model groups by connection', async () => {
    const { useProviderUiStore } = await importFreshProviderUiStore();

    useProviderUiStore.getState().setGroupCollapsed('conn-1', 'openai', true);
    expect(useProviderUiStore.getState().groupsCollapsedByConnection['conn-1']?.['openai']).toBe(true);

    useProviderUiStore.getState().toggleGroupCollapse('conn-1', 'openai');
    expect(useProviderUiStore.getState().groupsCollapsedByConnection['conn-1']?.['openai']).toBe(false);

    useProviderUiStore.getState().setAllGroupsCollapsed('conn-1', { openai: true, anthropic: true });
    expect(useProviderUiStore.getState().groupsCollapsedByConnection['conn-1']).toEqual({
      openai: true,
      anthropic: true,
    });
  });

  it('updates model search and search bar open state by connection', async () => {
    const { useProviderUiStore } = await importFreshProviderUiStore();

    useProviderUiStore.getState().setModelSearch('conn-1', 'gpt-4o');
    useProviderUiStore.getState().setIsModelSearchOpen('conn-1', true);

    expect(useProviderUiStore.getState().modelSearchByConnection['conn-1']).toBe('gpt-4o');
    expect(useProviderUiStore.getState().isModelSearchOpenByConnection['conn-1']).toBe(true);
  });

  it('manages batch mode state by connection', async () => {
    const { useProviderUiStore } = await importFreshProviderUiStore();

    useProviderUiStore.getState().setIsBatchMode('conn-1', true);
    expect(useProviderUiStore.getState().isBatchModeByConnection['conn-1']).toBe(true);

    useProviderUiStore.getState().setIsBatchMode('conn-1', false);
    expect(useProviderUiStore.getState().isBatchModeByConnection['conn-1']).toBe(false);
  });

  it('manages model probe results and connection health result', async () => {
    const { useProviderUiStore } = await importFreshProviderUiStore();

    const dummyProbeResult: ConnectionHealthProbeResult = {
      connectionId: 'conn-1',
      modelId: 'm1',
      status: 'success',
      latencyMs: 120,
      timestamp: Date.now(),
      grade: 'fast',
    };

    useProviderUiStore.getState().setModelProbeResult('conn-1', 'm1', dummyProbeResult);
    expect(useProviderUiStore.getState().modelProbeResultsByConnection['conn-1']?.['m1']).toEqual(dummyProbeResult);

    useProviderUiStore.getState().setConnectionHealthResult('conn-1', dummyProbeResult);
    expect(useProviderUiStore.getState().healthResultByConnection['conn-1']).toEqual(dummyProbeResult);

    useProviderUiStore.getState().clearModelProbeResults('conn-1');
    expect(useProviderUiStore.getState().modelProbeResultsByConnection['conn-1']).toBeUndefined();
  });

  it('manages gemini test model and test result', async () => {
    const { useProviderUiStore } = await importFreshProviderUiStore();

    useProviderUiStore.getState().setGeminiTestModelId('gemini-2.5-flash');
    useProviderUiStore.getState().setGeminiTestResult({
      status: 'success',
      latencyMs: 88,
      grade: 'fast',
      message: null,
    });

    const state = useProviderUiStore.getState();
    expect(state.geminiTestModelId).toBe('gemini-2.5-flash');
    expect(state.geminiTestResult).toEqual({
      status: 'success',
      latencyMs: 88,
      grade: 'fast',
      message: null,
    });
  });

  it('cleans up connection ui state when a connection is deleted', async () => {
    const { useProviderUiStore } = await importFreshProviderUiStore();

    useProviderUiStore.getState().setSelectedConnectionId('conn-to-delete');
    useProviderUiStore.getState().setGroupCollapsed('conn-to-delete', 'group-1', true);
    useProviderUiStore.getState().setModelSearch('conn-to-delete', 'query');
    useProviderUiStore.getState().setIsModelSearchOpen('conn-to-delete', true);
    useProviderUiStore.getState().setIsBatchMode('conn-to-delete', true);

    const dummyProbe: ConnectionHealthProbeResult = {
      connectionId: 'conn-to-delete',
      modelId: 'm1',
      status: 'success',
      latencyMs: 100,
      timestamp: Date.now(),
      grade: 'fast',
    };
    useProviderUiStore.getState().setModelProbeResult('conn-to-delete', 'm1', dummyProbe);
    useProviderUiStore.getState().setConnectionHealthResult('conn-to-delete', dummyProbe);

    // Clean up
    useProviderUiStore.getState().cleanupConnectionUi('conn-to-delete');

    const state = useProviderUiStore.getState();
    expect(state.selectedConnectionId).toBeNull();
    expect(state.groupsCollapsedByConnection['conn-to-delete']).toBeUndefined();
    expect(state.modelSearchByConnection['conn-to-delete']).toBeUndefined();
    expect(state.isModelSearchOpenByConnection['conn-to-delete']).toBeUndefined();
    expect(state.isBatchModeByConnection['conn-to-delete']).toBeUndefined();
    expect(state.modelProbeResultsByConnection['conn-to-delete']).toBeUndefined();
    expect(state.healthResultByConnection['conn-to-delete']).toBeUndefined();
  });

  it('resets all provider ui state to defaults', async () => {
    const { useProviderUiStore } = await importFreshProviderUiStore();

    useProviderUiStore.getState().setSelectedConnectionId(GEMINI_PROVIDER_ID);
    useProviderUiStore.getState().setListFilterMode('disabled');
    useProviderUiStore.getState().setListSearchQuery('test');
    useProviderUiStore.getState().setGeminiTestModelId('custom-test-model');

    useProviderUiStore.getState().resetProviderUiState();

    const state = useProviderUiStore.getState();
    expect(state.selectedConnectionId).toBeNull();
    expect(state.listFilterMode).toBe('all');
    expect(state.listSearchQuery).toBe('');
    expect(state.geminiTestModelId).toBe(DEFAULT_LIVE_ARTIFACTS_MODEL_ID);
  });
});
