import { act, type ComponentProps } from 'react';
import { setupProviderTestRenderer as setupTestRenderer } from '@/test/render/providerRenderer';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { setupStoreStateReset } from '@/test/stores/reset';
import { useSettingsStore } from '@/stores/settingsStore';
import { createThirdPartyConnection } from '@/test/data/factories';
import type { AppSettings } from '@/types';
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
});
