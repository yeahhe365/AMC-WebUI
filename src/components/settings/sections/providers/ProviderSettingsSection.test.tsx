import { act, type ComponentProps } from 'react';
import { setupProviderTestRenderer as setupTestRenderer } from '@/test/render/providerRenderer';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { setupStoreStateReset } from '@/test/stores/reset';
import { useSettingsStore } from '@/stores/settingsStore';
import { useProviderUiStore } from '@/stores/providerUiStore';
import { createThirdPartyConnection } from '@/test/data/factories';
import { GEMINI_PROVIDER_ID, type AppSettings } from '@/types';
import { ProviderSettingsSection } from './ProviderSettingsSection';

describe('ProviderSettingsSection', () => {
  const renderer = setupTestRenderer({ providers: { language: 'zh' } });
  setupStoreStateReset();

  afterEach(() => {
    vi.clearAllMocks();
  });

  const createProps = (
    overrides: Partial<ComponentProps<typeof ProviderSettingsSection>> = {},
  ): ComponentProps<typeof ProviderSettingsSection> => {
    const base: AppSettings = useSettingsStore.getState().appSettings;
    return {
      settings: base,
      onUpdateSettings: vi.fn(),
      ...overrides,
    };
  };

  it('renders empty state when no third party connections exist', () => {
    const emptySettings: AppSettings = {
      ...useSettingsStore.getState().appSettings,
      thirdPartyApi: { connections: [] },
    };

    act(() => {
      renderer.root.render(<ProviderSettingsSection {...createProps({ settings: emptySettings })} />);
    });

    expect(renderer.container.textContent).toContain('尚未添加任何第三方模型服务商');
  });

  it('renders provider list and details when connections exist', () => {
    const connection1 = createThirdPartyConnection({
      id: 'conn-muse',
      name: 'Muse',
      templateId: 'custom-openai',
      models: [
        {
          id: 'muse-spark-1.3',
          name: 'Muse Spark 1.3 Contributor',
          visibleInSelector: true,
          enableThinking: true,
          enableTools: true,
        },
      ],
      enabled: true,
    });

    const settingsWithConn: AppSettings = {
      ...useSettingsStore.getState().appSettings,
      thirdPartyApi: {
        connections: [connection1],
      },
    };

    act(() => {
      renderer.root.render(<ProviderSettingsSection {...createProps({ settings: settingsWithConn })} />);
    });

    expect(renderer.container.textContent).toContain('Muse');
    expect(renderer.container.textContent).toContain('Muse Spark 1.3 Contributor');
    expect(renderer.container.textContent).toContain('API 密钥');
    expect(renderer.container.textContent).toContain('API 地址');
    expect(renderer.container.textContent).toContain('检测');
  });

  it('persists selectedConnectionId and restores it on render', () => {
    const conn1 = createThirdPartyConnection({
      id: 'conn-1',
      name: 'Provider One',
      models: [{ id: 'p1-m1', name: 'Model 1', visibleInSelector: true }],
    });
    const conn2 = createThirdPartyConnection({
      id: 'conn-2',
      name: 'Provider Two',
      models: [{ id: 'p2-m1', name: 'Model 2', visibleInSelector: true }],
    });

    const settingsWithTwoConns: AppSettings = {
      ...useSettingsStore.getState().appSettings,
      thirdPartyApi: {
        connections: [conn1, conn2],
      },
    };

    // Pre-select conn-2 in providerUiStore
    useProviderUiStore.getState().setSelectedConnectionId('conn-2');

    act(() => {
      renderer.root.render(<ProviderSettingsSection {...createProps({ settings: settingsWithTwoConns })} />);
    });

    expect(renderer.container.textContent).toContain('Provider Two');
    expect(renderer.container.textContent).toContain('Model 2');
  });

  it('switches to Gemini and persists selection when Gemini provider is clicked', () => {
    const conn1 = createThirdPartyConnection({
      id: 'conn-1',
      name: 'Provider One',
      models: [{ id: 'p1-m1', name: 'Model 1', visibleInSelector: true }],
    });

    const settingsWithConn: AppSettings = {
      ...useSettingsStore.getState().appSettings,
      thirdPartyApi: {
        connections: [conn1],
      },
    };

    act(() => {
      renderer.root.render(<ProviderSettingsSection {...createProps({ settings: settingsWithConn })} />);
    });

    // Find and click Google Gemini in the list
    const geminiItem = Array.from(renderer.container.querySelectorAll('span')).find((el) =>
      el.textContent?.includes('Google Gemini'),
    );
    expect(geminiItem).toBeDefined();

    act(() => {
      geminiItem?.closest('div[class*="cursor-pointer"]')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(useProviderUiStore.getState().selectedConnectionId).toBe(GEMINI_PROVIDER_ID);
  });
});
