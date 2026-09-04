import { act, type ComponentProps } from 'react';
import { setupProviderTestRenderer as setupTestRenderer } from '@/test/render/providerRenderer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_APP_SETTINGS } from '@/constants/settingsDefaults';
import { SETTINGS_SEARCH_CATALOG } from '@/constants/settingsSearchCatalog';
import { SETTINGS_TAB_IDS } from '@/constants/settingsTabs';
import { ensureFeatureTranslations } from '@/i18n/featureTranslations';
import { setupStoreStateReset } from '@/test/stores/reset';
import { useSettingsUiStore } from '@/stores/settingsUiStore';
import type { McpServerConfig } from '@/types';
import { SettingsModal } from './SettingsModal';

// Every catalog entry promises "navigate + highlight" via its
// data-settings-item anchor. This guard renders each tab and fails when a
// catalog id silently loses its anchor, which would degrade the result to a
// bare tab switch.
const TEST_MCP_SERVER: McpServerConfig = {
  id: 'mcp-anchor-test',
  name: 'anchor-test',
  enabled: true,
  transport: 'stdio',
  command: '',
  args: [],
  env: {},
};

describe('settings search anchors', () => {
  const renderer = setupTestRenderer({ providers: { language: 'en' } });
  setupStoreStateReset();

  const renderSettingsModal = async (lastTab: string) => {
    localStorage.setItem('chatSettingsLastTab', lastTab);
    await act(async () => {
      const props: ComponentProps<typeof SettingsModal> = {
        isOpen: true,
        onClose: vi.fn(),
        currentSettings: { ...DEFAULT_APP_SETTINGS, mcpServers: [TEST_MCP_SERVER] },
        currentThemeId: 'pearl',
        availableModels: [],
        onSave: vi.fn(),
        onClearAllHistory: vi.fn(),
        onClearCache: vi.fn(),
        onOpenLogViewer: vi.fn(),
        setAvailableModels: vi.fn(),
        onInstallPwa: vi.fn(),
        installState: 'installed',
        onImportScenarios: vi.fn(),
        onExportScenarios: vi.fn(),
      };
      renderer.root.render(<SettingsModal {...props} />);
    });
  };

  beforeEach(async () => {
    // A few generation controls (media resolution, always-keep-thinking) only
    // render in advanced mode; anchors must exist there as well.
    useSettingsUiStore.setState({ isAdvancedModeEnabled: true });
    await ensureFeatureTranslations('settings');
  });

  afterEach(() => {
    localStorage.clear();
  });

  it.each(SETTINGS_TAB_IDS)('resolves every %s catalog entry to a rendered anchor', async (tab) => {
    await renderSettingsModal(tab);

    const missing = SETTINGS_SEARCH_CATALOG.filter((entry) => entry.tab === tab)
      .filter((entry) => !document.querySelector(`[data-settings-item="${CSS.escape(entry.id)}"]`))
      .map((entry) => entry.id);

    expect(missing).toEqual([]);
  });
});
