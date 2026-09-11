import { act, type ComponentProps } from 'react';
import type { SupportedLanguage } from '@/i18n/languageRegistry';
import { setupProviderTestRenderer as setupTestRenderer } from '@/test/render/providerRenderer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useSettingsStore } from '@/stores/settingsStore';
import { useSettingsUiStore } from '@/stores/settingsUiStore';
import { setupStoreStateReset } from '@/test/stores/reset';
import type { AppSettings } from '@/types';
import { SERVER_MANAGED_API_KEY } from '@/utils/apiKeySelection';
import { ApiConfigSection } from './ApiConfigSection';

const { getClientMock, generateContentMock } = vi.hoisted(() => ({
  getClientMock: vi.fn(),
  generateContentMock: vi.fn(),
}));

vi.mock('@/hooks/useDevice', () => ({
  useResponsiveValue: vi.fn(() => 18),
}));

vi.mock('@/services/api/apiClient', () => ({
  getClient: getClientMock,
}));

describe('ApiConfigSection', () => {
  const renderer = setupTestRenderer();
  setupStoreStateReset();
  const settingsFixture: AppSettings = {
    ...useSettingsStore.getState().appSettings,
  };

  const createApiConfigProps = (
    overrides: Partial<ComponentProps<typeof ApiConfigSection>> = {},
  ): ComponentProps<typeof ApiConfigSection> => ({
    useCustomApiConfig: true,
    setUseCustomApiConfig: vi.fn(),
    apiKey: null,
    setApiKey: vi.fn(),
    apiProxyUrl: null,
    setApiProxyUrl: vi.fn(),
    useApiProxy: false,
    setUseApiProxy: vi.fn(),
    serverManagedApi: false,
    settings: settingsFixture,
    onUpdate: vi.fn(),
    ...overrides,
  });

  const renderApiConfigSection = async (
    overrides: Partial<ComponentProps<typeof ApiConfigSection>> & { language?: SupportedLanguage } = {},
  ) => {
    const { language = 'en', ...props } = overrides;

    await act(async () => {
      useSettingsStore.setState({ language });
      renderer.root.render(<ApiConfigSection {...createApiConfigProps(props)} />);
    });
  };

  const findButton = (label: string) =>
    Array.from(renderer.container.querySelectorAll('button')).find((button) => button.textContent?.includes(label));

  beforeEach(() => {
    vi.clearAllMocks();
    generateContentMock.mockResolvedValue({});
    getClientMock.mockReturnValue({
      models: {
        generateContent: generateContentMock,
      },
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('allows running connection test in server-managed mode without a browser-held key', async () => {
    await renderApiConfigSection({
      apiProxyUrl: 'https://proxy.example.com/v1beta',
      useApiProxy: true,
      serverManagedApi: true,
    });

    expect(renderer.container.textContent).not.toContain('API & Connections');

    const testButton = Array.from(renderer.container.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('Test Connection'),
    );

    expect(testButton).toBeDefined();
    expect(testButton?.hasAttribute('disabled')).toBe(false);

    await act(async () => {
      testButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    await vi.waitFor(() => {
      expect(getClientMock).toHaveBeenCalled();
    });
    expect(getClientMock).toHaveBeenCalledWith(SERVER_MANAGED_API_KEY, 'https://proxy.example.com/v1beta');

    await vi.waitFor(() => {
      expect(generateContentMock).toHaveBeenCalledWith({
        model: 'gemini-3.8-flash',
        contents: 'Hello',
      });
    });
  });

  it('updates translated labels when the global language changes', async () => {
    await renderApiConfigSection();

    expect(renderer.container.textContent).not.toContain('API & Connections');
    expect(renderer.container.textContent).toContain('Test Connection');
    expect(renderer.container.textContent).toContain('Manage Providers');

    act(() => {
      useSettingsStore.setState({ language: 'zh' });
    });

    expect(renderer.container.textContent).not.toContain('API 与连接');
    expect(renderer.container.textContent).toContain('测试连通性');
    expect(renderer.container.textContent).toContain('前往服务商设置');
  });

  it('shows the providers redirect card and navigates to the providers tab', async () => {
    await renderApiConfigSection();

    expect(renderer.container.textContent).toContain('Providers');
    expect(renderer.container.textContent).toContain('Manage Providers');

    const manageButton = Array.from(renderer.container.querySelectorAll('button')).find((btn) =>
      btn.textContent?.includes('Manage Providers'),
    );
    expect(manageButton).toBeDefined();

    act(() => {
      manageButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(useSettingsUiStore.getState().activeTab).toBe('providers');
  });

  it('explains that Live uses the browser API key directly without token endpoint settings', async () => {
    await renderApiConfigSection({
      apiKey: 'browser-key',
    });

    expect(renderer.container.textContent).toContain('Live API Dedicated Key (Optional)');
    expect(renderer.container.textContent).toContain('Currently using the general Gemini API key above by default.');
    expect(renderer.container.textContent).not.toContain('/api/live-token');
    expect(renderer.container.textContent).not.toContain('Advanced Live Settings');
    expect(renderer.container.querySelector('#live-token-endpoint-input')).toBeNull();

    // Clicking expands the dedicated key input
    const toggleButton = findButton('Live API Dedicated Key');
    expect(toggleButton).toBeDefined();

    act(() => {
      toggleButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(renderer.container.querySelector('#live-api-key-input')).not.toBeNull();
  });
});
