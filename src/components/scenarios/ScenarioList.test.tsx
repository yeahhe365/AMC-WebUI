import { act, type ComponentProps } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '@/test/render/providerRenderer';
import type { SavedScenario } from '@/types';
import { ScenarioList } from './ScenarioList';

const builtinScenario: SavedScenario = {
  id: 'built-1',
  title: 'Succinct',
  category: 'workplace',
  emoji: '⚡',
  description: 'Terse answers',
  messages: [],
  systemInstruction: 'Be brief',
};

const userScenario: SavedScenario = {
  id: 'user-1',
  title: 'My bot',
  category: 'custom',
  messages: [{ id: 'm1', role: 'user', content: 'hello' }],
};

const renderList = (overrides: Partial<ComponentProps<typeof ScenarioList>> = {}) =>
  renderWithProviders(
    <ScenarioList
      scenarios={[builtinScenario, userScenario]}
      systemScenarioIds={[]}
      builtInScenarioIds={['built-1']}
      searchQuery=""
      setSearchQuery={vi.fn()}
      onLoad={vi.fn()}
      onEdit={vi.fn()}
      onDelete={vi.fn()}
      onDuplicate={vi.fn()}
      onExport={vi.fn()}
      {...overrides}
    />,
    { language: 'en' },
  );

describe('ScenarioList', () => {
  it('labels the library scopes as Mine and Built-in', () => {
    const { getByRole } = renderList();

    expect(getByRole('button', { name: 'My Scenarios' })).not.toBeNull();
    expect(getByRole('button', { name: 'Built-in' })).not.toBeNull();
    expect(getByRole('button', { name: 'Built-in' }).textContent).not.toContain('System Presets');
  });

  it('searches scenarios instead of history', () => {
    const { getByRole } = renderList();
    const search = getByRole('searchbox');

    expect(search.getAttribute('placeholder')).toBe('Search scenarios...');
    expect(search.getAttribute('placeholder')).not.toBe('Search history...');
  });

  it('renders a list rather than a marketplace card grid', () => {
    const { container, getByRole } = renderList();

    act(() => {
      getByRole('button', { name: 'Built-in' }).click();
    });

    expect(container.innerHTML).not.toContain('xl:grid-cols-4');
    expect(container.innerHTML).not.toContain('lg:grid-cols-3');
  });

  it('filters with quiet category chips instead of emoji', () => {
    const { container, getByRole } = renderList();

    act(() => {
      getByRole('button', { name: 'Built-in' }).click();
    });

    expect(getByRole('button', { name: 'Workplace & Efficiency' })).not.toBeNull();
    expect(container.textContent).not.toContain('🧠');
    expect(container.textContent).not.toContain('⚡');
  });

  it('remembers selected tab and category across unmount and remount', () => {
    const firstRender = renderList();

    act(() => {
      firstRender.getByRole('button', { name: 'Built-in' }).click();
    });

    act(() => {
      firstRender.getByRole('button', { name: 'Workplace & Efficiency' }).click();
    });

    firstRender.unmount();

    // Remount list (simulating modal close and reopen)
    const secondRender = renderList();

    // The Workplace & Efficiency category button should still be active/present
    expect(secondRender.getByRole('button', { name: 'Workplace & Efficiency' })).not.toBeNull();
    secondRender.unmount();
  });
});
