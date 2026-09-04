import { act } from 'react';
import { fireEvent } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { setupProviderTestRenderer as setupTestRenderer } from '@/test/render/providerRenderer';
import { useSettingsUiStore, type SettingsTabDescriptor } from '@/stores/settingsUiStore';
import { SETTINGS_TAB_IDS, SETTINGS_TAB_LABEL_KEYS } from '@/constants/settingsTabs';
import { SettingsSidebar } from './SettingsSidebar';

describe('SettingsSidebar', () => {
  const renderer = setupTestRenderer({ providers: { language: 'en' } });
  const tabs: SettingsTabDescriptor[] = SETTINGS_TAB_IDS.map((id) => ({
    id,
    labelKey: SETTINGS_TAB_LABEL_KEYS[id],
  }));

  beforeEach(() => {
    useSettingsUiStore.setState({ activeTab: 'models', isAdvancedModeEnabled: false, scrollPositions: {} });
  });

  const renderSidebar = async () => {
    await act(async () => {
      renderer.root.render(
        <SettingsSidebar
          tabs={tabs}
          activeTab="models"
          setActiveTab={vi.fn()}
          onClose={vi.fn()}
          searchQuery=""
          onSearchChange={vi.fn()}
        />,
      );
    });
  };

  it('renders the advanced mode control with the shared Toggle component', async () => {
    await renderSidebar();

    const switches = Array.from(renderer.container.querySelectorAll<HTMLInputElement>('input[type="checkbox"]'));
    expect(switches).toHaveLength(1);
    expect(switches[0].getAttribute('aria-label')).toBe('Advanced Mode');
    expect(renderer.container.querySelector('.h-4.w-7')).toBeNull();
  });

  it('toggles advanced mode through the footer control', async () => {
    await renderSidebar();

    const switchInput = renderer.container.querySelector<HTMLInputElement>('input[type="checkbox"]');
    expect(switchInput).not.toBeNull();

    await act(async () => {
      fireEvent.click(switchInput!);
    });

    expect(useSettingsUiStore.getState().isAdvancedModeEnabled).toBe(true);
  });

  it('collapses the tab list into a search status while searching', async () => {
    await act(async () => {
      renderer.root.render(
        <SettingsSidebar
          tabs={tabs}
          activeTab="models"
          setActiveTab={vi.fn()}
          onClose={vi.fn()}
          searchQuery="theme"
          onSearchChange={vi.fn()}
          resultsCount={3}
        />,
      );
    });

    expect(renderer.container.querySelector('[role="tablist"]')).toBeNull();

    const status = renderer.container.querySelector('[data-settings-search-status]');
    expect(status).not.toBeNull();
    expect(status?.textContent).toContain('3 results');
    expect(status?.textContent).toContain('Esc');
  });

  it('keeps the tab list available when not searching', async () => {
    await renderSidebar();

    expect(renderer.container.querySelector('[role="tablist"]')).not.toBeNull();
    expect(renderer.container.querySelector('[data-settings-search-status]')).toBeNull();
  });
});
