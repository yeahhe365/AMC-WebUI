import { act } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { getExportableUserScenarios } from '@/features/scenarios/scenarioLibrary';
import { type translations } from '@/i18n/translations';
import { useToastStore } from '@/stores/toastStore';
import { renderHook } from '@/test/render/renderer';
import type { SavedScenario } from '@/types';
import { useScenarioManager } from './useScenarioManager';

const userScenario: SavedScenario = {
  id: 'user-1',
  title: 'Mine',
  messages: [{ id: 'message-1', role: 'user', content: 'Hello' }],
};

const createHookProps = (overrides: Partial<Parameters<typeof useScenarioManager>[0]> = {}) => ({
  isOpen: true,
  savedScenarios: [userScenario],
  onSaveAllScenarios: vi.fn(),
  t: (key: keyof typeof translations, fallback?: string) => {
    if (key === 'scenariosCopyTitle') return '{title} (Copy)';
    return fallback ?? key;
  },
  ...overrides,
});

describe('useScenarioManager', () => {
  afterEach(() => {
    useToastStore.setState({ toasts: [] });
  });

  it('rejects a save without a title', () => {
    const props = createHookProps();
    const { result, unmount } = renderHook(() => useScenarioManager(props));

    act(() => {
      result.current.actions.handleSaveScenario({ ...userScenario, title: '  ' });
    });

    expect(props.onSaveAllScenarios).not.toHaveBeenCalled();
    expect(useToastStore.getState().toasts[0]).toMatchObject({
      type: 'error',
      message: 'scenariosTitleRequired',
    });
    unmount();
  });

  it('persists immediately when a scenario is saved', () => {
    const props = createHookProps();
    const { result, unmount } = renderHook(() => useScenarioManager(props));

    act(() => {
      result.current.actions.handleSaveScenario({
        ...userScenario,
        title: 'Renamed',
        description: 'Updated',
      });
    });

    expect(props.onSaveAllScenarios).toHaveBeenCalledTimes(1);
    const persisted = vi.mocked(props.onSaveAllScenarios).mock.calls[0][0];
    expect(persisted.find((scenario: SavedScenario) => scenario.id === 'user-1')).toMatchObject({
      title: 'Renamed',
      description: 'Updated',
    });
    expect(result.current.hasUnsavedChanges).toBe(false);
    expect(result.current.view).toBe('list');
    unmount();
  });

  it('persists immediately when a scenario is duplicated or deleted', () => {
    const props = createHookProps();
    const { result, unmount } = renderHook(() => useScenarioManager(props));

    act(() => {
      result.current.actions.handleDuplicateScenario(userScenario);
    });

    expect(props.onSaveAllScenarios).toHaveBeenCalledTimes(1);
    expect(getExportableUserScenarios(vi.mocked(props.onSaveAllScenarios).mock.calls[0][0])).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ title: 'Mine (Copy)' }),
        expect.objectContaining({ id: 'user-1', title: 'Mine' }),
      ]),
    );

    act(() => {
      result.current.actions.handleDeleteScenario('user-1');
    });

    expect(props.onSaveAllScenarios).toHaveBeenCalledTimes(2);
    expect(
      getExportableUserScenarios(vi.mocked(props.onSaveAllScenarios).mock.calls[1][0]).map((scenario) => scenario.id),
    ).not.toContain('user-1');
    unmount();
  });

  it('does not reset search when the parent list updates while the modal stays open', () => {
    const props = createHookProps();
    const nextSavedScenarios: SavedScenario[] = [userScenario, { ...userScenario, id: 'user-2', title: 'Mine (Copy)' }];
    const { result, rerender, unmount } = renderHook(() =>
      useScenarioManager({
        isOpen: true,
        savedScenarios: props.savedScenarios,
        onSaveAllScenarios: props.onSaveAllScenarios,
        t: props.t,
      }),
    );

    act(() => {
      result.current.setSearchQuery('mine');
    });

    rerender(() =>
      useScenarioManager({
        isOpen: true,
        savedScenarios: nextSavedScenarios,
        onSaveAllScenarios: props.onSaveAllScenarios,
        t: props.t,
      }),
    );

    expect(result.current.searchQuery).toBe('mine');
    expect(result.current.view).toBe('list');
    unmount();
  });

  it('flags unsaved changes only while a writable editor is open', () => {
    const props = createHookProps();
    const { result, unmount } = renderHook(() => useScenarioManager(props));

    expect(result.current.hasUnsavedChanges).toBe(false);

    act(() => {
      result.current.actions.handleStartAddNew();
    });

    expect(result.current.view).toBe('editor');
    expect(result.current.hasUnsavedChanges).toBe(true);

    act(() => {
      result.current.actions.handleCancelEdit();
    });

    expect(result.current.hasUnsavedChanges).toBe(false);
    unmount();
  });

  it('preserves search query across modal close and reopen', () => {
    const props = createHookProps();
    let isOpen = true;
    const { result, rerender, unmount } = renderHook(() =>
      useScenarioManager({
        isOpen,
        savedScenarios: props.savedScenarios,
        onSaveAllScenarios: props.onSaveAllScenarios,
        t: props.t,
      }),
    );

    act(() => {
      result.current.setSearchQuery('girlfriend');
    });

    expect(result.current.searchQuery).toBe('girlfriend');

    // Close modal
    isOpen = false;
    rerender();

    // Reopen modal
    isOpen = true;
    rerender();

    expect(result.current.searchQuery).toBe('girlfriend');
    unmount();
  });

  it('does not expose a deferred save-all action', () => {
    const { result, unmount } = renderHook(() => useScenarioManager(createHookProps()));

    expect(result.current.actions).not.toHaveProperty('handleSaveAllAndClose');
    unmount();
  });
});
