import { act, type ComponentProps } from 'react';
import type { SupportedLanguage } from '@/i18n/languageRegistry';
import { setupProviderTestRenderer as setupTestRenderer } from '@/test/render/providerRenderer';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useSettingsStore } from '@/stores/settingsStore';
import { setupStoreStateReset } from '@/test/stores/reset';
import { getDefaultAppSettings } from '@/constants/settingsDefaults';
import { DataManagementSection } from './DataManagementSection';

const { estimateAppDataSizeMock } = vi.hoisted(() => ({
  estimateAppDataSizeMock: vi.fn(),
}));

vi.mock('@/services/db/dbService', async () => {
  const { createDbServiceMockModule } = await import('@/test/doubles/moduleMocks');

  return createDbServiceMockModule({
    estimateAppDataSize: estimateAppDataSizeMock,
  });
});

describe('DataManagementSection', () => {
  const renderer = setupTestRenderer();
  setupStoreStateReset();

  const createDataManagementProps = (
    overrides: Partial<ComponentProps<typeof DataManagementSection>> = {},
  ): ComponentProps<typeof DataManagementSection> => ({
    onClearHistory: vi.fn(),
    onClearCache: vi.fn(),
    onOpenLogViewer: vi.fn(),
    onClearLogs: vi.fn(),
    installState: 'installed',
    onInstallPwa: vi.fn(),
    onImportSettings: vi.fn(),
    onExportSettings: vi.fn(),
    onImportHistory: vi.fn(),
    onExportHistory: vi.fn(),
    onImportScenarios: vi.fn(),
    onExportScenarios: vi.fn(),
    onReset: vi.fn(),
    settings: getDefaultAppSettings(),
    onUpdate: vi.fn(),
    ...overrides,
  });

  const renderDataManagementSection = async (
    overrides: Partial<ComponentProps<typeof DataManagementSection>> & { language?: SupportedLanguage } = {},
  ) => {
    const { language = 'en', ...props } = overrides;

    await act(async () => {
      useSettingsStore.setState({ language });
      renderer.root.render(<DataManagementSection {...createDataManagementProps(props)} />);
    });
  };

  beforeEach(() => {
    estimateAppDataSizeMock.mockReset();
  });

  it('updates translated actions from the global i18n context', async () => {
    await renderDataManagementSection();

    expect(renderer.container.textContent).toContain('Open Logs & Usage');
    expect(renderer.container.textContent).toContain('Destructive Actions');
    expect(renderer.container.textContent).toContain('Export');

    act(() => {
      useSettingsStore.setState({ language: 'zh' });
    });

    expect(renderer.container.textContent).toContain('打开日志与用量');
    expect(renderer.container.textContent).toContain('高风险操作');
    expect(renderer.container.textContent).toContain('导出');
  });

  it('keeps the install action enabled when manual browser guidance is needed', async () => {
    await renderDataManagementSection({ installState: 'manual' });

    const installButton = renderer.container.querySelector('button[aria-label="Install Progressive Web App"]');

    expect(installButton?.hasAttribute('disabled')).toBe(false);
    expect(renderer.container.textContent).toContain('Use your browser menu to install this app.');
  });

  it('shows the current local app data size and offers a refresh action', async () => {
    estimateAppDataSizeMock.mockResolvedValue({
      totalBytes: 2048,
      indexedDbBytes: 1536,
      localStorageBytes: 512,
    });

    await renderDataManagementSection();

    await vi.waitFor(() => {
      expect(renderer.container.textContent).toContain('Current Local App Data');
      expect(renderer.container.textContent).toContain('2.0 KB');
    });

    const refreshButtons = Array.from(renderer.container.querySelectorAll('button')).filter((button) =>
      button.textContent?.includes('Refresh'),
    );

    expect(refreshButtons).toHaveLength(1);
  });

  it('renders the logging toggle off by default and reports toggles via onUpdate', async () => {
    const onUpdate = vi.fn();
    await renderDataManagementSection({ settings: getDefaultAppSettings(), onUpdate });

    expect(renderer.container.textContent).toContain('Enable Logging');

    const toggle = renderer.container.querySelector('input[type="checkbox"]') as HTMLInputElement;
    expect(toggle).not.toBeNull();
    expect(toggle.checked).toBe(false);

    toggle.click();

    expect(onUpdate).toHaveBeenCalledWith('isLoggingEnabled', true);
  });

  it('reflects an enabled logging setting on the toggle', async () => {
    await renderDataManagementSection({
      settings: { ...getDefaultAppSettings(), isLoggingEnabled: true },
    });

    const toggle = renderer.container.querySelector('input[type="checkbox"]') as HTMLInputElement;
    expect(toggle.checked).toBe(true);
  });

  it('grades danger zone actions by severity using theme tokens', async () => {
    await renderDataManagementSection();

    const zone = renderer.container.querySelector<HTMLElement>('[data-settings-item="data-danger"]');
    expect(zone).not.toBeNull();
    expect(zone!.className).not.toContain('from-red-600');
    expect(zone!.className).toContain('var(--theme-text-danger)');

    const findZoneButton = (label: string) => {
      const button = Array.from(zone!.querySelectorAll('button')).find((b) => b.textContent?.trim() === label);
      expect(button).toBeDefined();
      return button!;
    };

    const resetButton = findZoneButton('Reset Settings Only');
    const clearHistoryButton = findZoneButton('Delete Chats and Groups');
    const clearCacheButton = findZoneButton('Delete All App Data');

    // Severity escalates: neutral reset < danger-outline history < solid danger wipe.
    expect(resetButton.className).not.toContain('text-[var(--theme-text-danger)]');
    expect(clearHistoryButton.className).toContain('text-[var(--theme-text-danger)]');
    expect(clearHistoryButton.className).toContain('bg-transparent');
    expect(clearCacheButton.className).toContain('bg-[var(--theme-bg-danger)]');
  });
});
