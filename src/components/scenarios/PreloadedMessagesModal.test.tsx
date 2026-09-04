import React, { act } from 'react';
import { setupTestRenderer } from '@/test/render/renderer';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PreloadedMessagesModal } from './PreloadedMessagesModal';

const { loadableScenario, scenarioManagerState } = vi.hoisted(() => ({
  loadableScenario: {
    id: 'scenario-1',
    title: 'Loadable scenario',
    messages: [{ id: 'message-1', role: 'user' as const, content: 'Hello' }],
  },
  scenarioManagerState: {
    scenarios: [],
    view: 'list' as const,
    editingScenario: null,
    searchQuery: '',
    setSearchQuery: vi.fn(),
    importInputRef: { current: null },
    systemScenarioIds: [],
    builtInScenarioIds: [],
    hasUnsavedChanges: true,
    actions: {
      handleStartAddNew: vi.fn(),
      handleStartEdit: vi.fn(),
      handleDuplicateScenario: vi.fn(),
      handleCancelEdit: vi.fn(),
      handleSaveScenario: vi.fn(),
      handleDeleteScenario: vi.fn(),
      handleExportScenarios: vi.fn(),
      handleExportSingleScenario: vi.fn(),
      handleImportScenarios: vi.fn(),
    },
  },
}));

vi.mock('@/hooks/scenarios/useScenarioManager', () => ({
  useScenarioManager: () => scenarioManagerState,
}));

vi.mock('@/stores/toastStore', () => ({
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
}));

vi.mock('@/components/shared/Modal', () => ({
  Modal: ({ children, contentClassName }: { children: React.ReactNode; contentClassName?: string }) => (
    <div data-testid="modal-shell" className={contentClassName}>
      {children}
    </div>
  ),
}));

vi.mock('./ScenarioList', () => ({
  ScenarioList: ({ onLoad }: { onLoad: (scenario: typeof loadableScenario) => void }) => (
    <button data-testid="scenario-list" type="button" onClick={() => onLoad(loadableScenario)}>
      Load scenario
    </button>
  ),
}));

vi.mock('./ScenarioEditor', () => ({
  ScenarioEditor: () => <div data-testid="scenario-editor" />,
}));

describe('PreloadedMessagesModal', () => {
  const renderer = setupTestRenderer();

  beforeEach(() => {
    vi.clearAllMocks();
    scenarioManagerState.view = 'list';
    scenarioManagerState.hasUnsavedChanges = true;
  });

  it('closes immediately when there are no unsaved changes', () => {
    scenarioManagerState.hasUnsavedChanges = false;
    const onClose = vi.fn();

    act(() => {
      renderer.root.render(
        <PreloadedMessagesModal
          isOpen
          onClose={onClose}
          savedScenarios={[]}
          onSaveAllScenarios={vi.fn()}
          onLoadScenario={vi.fn()}
        />,
      );
    });

    const closeButton = Array.from(renderer.container.querySelectorAll('button')).find(
      (button) => button.getAttribute('aria-label') === 'Close scenarios manager',
    );

    expect(closeButton).not.toBeUndefined();

    act(() => {
      closeButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('asks for confirmation before closing with unsaved editor changes', () => {
    const onClose = vi.fn();

    act(() => {
      renderer.root.render(
        <PreloadedMessagesModal
          isOpen
          onClose={onClose}
          savedScenarios={[]}
          onSaveAllScenarios={vi.fn()}
          onLoadScenario={vi.fn()}
        />,
      );
    });

    const closeButton = Array.from(renderer.container.querySelectorAll('button')).find(
      (button) => button.getAttribute('aria-label') === 'Close scenarios manager',
    );

    expect(closeButton).not.toBeUndefined();

    act(() => {
      closeButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(onClose).not.toHaveBeenCalled();

    const discardButton = Array.from(renderer.container.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('Discard and close'),
    );

    expect(discardButton).not.toBeUndefined();

    act(() => {
      discardButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('does not render a deferred save-all action', () => {
    act(() => {
      renderer.root.render(
        <PreloadedMessagesModal
          isOpen
          onClose={vi.fn()}
          savedScenarios={[]}
          onSaveAllScenarios={vi.fn()}
          onLoadScenario={vi.fn()}
        />,
      );
    });

    const saveAllButton = Array.from(renderer.container.querySelectorAll('button')).find((button) =>
      /save all|全部保存/i.test(button.textContent ?? ''),
    );

    expect(saveAllButton).toBeUndefined();
  });

  it('uses compact desktop spacing in the scenario list content area', () => {
    act(() => {
      renderer.root.render(
        <PreloadedMessagesModal
          isOpen
          onClose={vi.fn()}
          savedScenarios={[]}
          onSaveAllScenarios={vi.fn()}
          onLoadScenario={vi.fn()}
        />,
      );
    });

    const scenarioList = renderer.container.querySelector('[data-testid="scenario-list"]');
    const contentArea = scenarioList?.parentElement;

    expect(contentArea?.className).toContain('md:px-6');
    expect(contentArea?.className).toContain('md:py-5');
    expect(contentArea?.className).not.toContain('md:p-8');
  });

  it('matches the settings modal desktop shell', () => {
    act(() => {
      renderer.root.render(
        <PreloadedMessagesModal
          isOpen
          onClose={vi.fn()}
          savedScenarios={[]}
          onSaveAllScenarios={vi.fn()}
          onLoadScenario={vi.fn()}
        />,
      );
    });

    const modalShell = renderer.container.querySelector('[data-testid="modal-shell"]');

    expect(modalShell?.className).toContain('sm:rounded-xl');
    expect(modalShell?.className).toContain('sm:h-[85vh]');
    expect(modalShell?.className).toContain('sm:max-h-[800px]');
    expect(modalShell?.className).toContain('max-w-6xl');
    expect(modalShell?.className).not.toContain('sm:rounded-3xl');
    expect(modalShell?.className).not.toContain('sm:max-w-7xl');
    expect(modalShell?.className).not.toContain('sm:h-[90vh]');
  });

  it('keeps the list title at the settings heading scale', () => {
    act(() => {
      renderer.root.render(
        <PreloadedMessagesModal
          isOpen
          onClose={vi.fn()}
          savedScenarios={[]}
          onSaveAllScenarios={vi.fn()}
          onLoadScenario={vi.fn()}
        />,
      );
    });

    const title = renderer.container.querySelector('#scenarios-title');
    expect(title?.className).toContain('text-xl');
    expect(title?.className).toContain('font-semibold');
    expect(title?.className).not.toContain('text-2xl');
    expect(title?.className).not.toContain('font-bold');
  });

  it('cleans up the delayed close when a loaded scenario is dismissed before the timeout fires', () => {
    vi.useFakeTimers();

    try {
      const onClose = vi.fn();
      const onLoadScenario = vi.fn();

      act(() => {
        renderer.root.render(
          <PreloadedMessagesModal
            isOpen
            onClose={onClose}
            savedScenarios={[]}
            onSaveAllScenarios={vi.fn()}
            onLoadScenario={onLoadScenario}
          />,
        );
      });

      const loadButton = renderer.container.querySelector('[data-testid="scenario-list"]');
      expect(loadButton).not.toBeNull();

      act(() => {
        loadButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });

      expect(onLoadScenario).toHaveBeenCalledTimes(1);

      act(() => {
        renderer.unmount();
        vi.advanceTimersByTime(300);
      });

      expect(onClose).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });
});
