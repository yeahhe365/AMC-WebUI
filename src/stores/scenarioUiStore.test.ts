import { beforeEach, describe, expect, it, vi } from 'vitest';

const importFreshScenarioUiStore = async () => {
  vi.resetModules();
  return import('./scenarioUiStore');
};

describe('scenarioUiStore', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('initializes with default state', async () => {
    const { useScenarioUiStore } = await importFreshScenarioUiStore();
    const state = useScenarioUiStore.getState();

    expect(state.ownerScope).toBe('builtin');
    expect(state.activeCategory).toBe('all');
    expect(state.searchQuery).toBe('');
    expect(state.scrollPositions).toEqual({});
  });

  it('updates and persists ownerScope, activeCategory, searchQuery, and scrollPositions', async () => {
    const { useScenarioUiStore } = await importFreshScenarioUiStore();

    useScenarioUiStore.getState().setOwnerScope('mine');
    useScenarioUiStore.getState().setActiveCategory('roleplay');
    useScenarioUiStore.getState().setSearchQuery('girlfriend');
    useScenarioUiStore.getState().setScrollPosition('mine', 150);

    const state = useScenarioUiStore.getState();
    expect(state.ownerScope).toBe('mine');
    expect(state.activeCategory).toBe('roleplay');
    expect(state.searchQuery).toBe('girlfriend');
    expect(state.scrollPositions.mine).toBe(150);
  });

  it('resets state to defaults', async () => {
    const { useScenarioUiStore } = await importFreshScenarioUiStore();

    useScenarioUiStore.getState().setOwnerScope('mine');
    useScenarioUiStore.getState().setActiveCategory('coding');
    useScenarioUiStore.getState().setSearchQuery('test');
    useScenarioUiStore.getState().setScrollPosition('mine', 200);

    useScenarioUiStore.getState().resetScenarioUiState();

    const state = useScenarioUiStore.getState();
    expect(state.ownerScope).toBe('builtin');
    expect(state.activeCategory).toBe('all');
    expect(state.searchQuery).toBe('');
    expect(state.scrollPositions).toEqual({});
  });
});
