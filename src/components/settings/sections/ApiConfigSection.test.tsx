import { act, type ComponentProps } from 'react';
import type { SupportedLanguage } from '@/i18n/languageRegistry';
import { setupProviderTestRenderer as setupTestRenderer } from '@/test/render/providerRenderer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useSettingsStore } from '@/stores/settingsStore';
import { setupStoreStateReset } from '@/test/stores/reset';
import type { AppSettings } from '@/types';
import { SERVER_MANAGED_API_KEY } from '@/utils/apiKeySelection';
import { createThirdPartyConnection } from '@/test/data/factories';
import { ApiConfigSection } from './ApiConfigSection';

const {
  getClientMock,
  generateContentMock,
  sendOpenAICompatibleMessageNonStreamMock,
  sendAnthropicMessageNonStreamMock,
} = vi.hoisted(() => ({
  getClientMock: vi.fn(),
  generateContentMock: vi.fn(),
  sendOpenAICompatibleMessageNonStreamMock: vi.fn(),
  sendAnthropicMessageNonStreamMock: vi.fn(),
}));

vi.mock('@/hooks/useDevice', () => ({
  useResponsiveValue: vi.fn(() => 18),
}));

vi.mock('@/services/api/apiClient', () => ({
  getClient: getClientMock,
}));

vi.mock('@/services/api/openaiCompatibleApi', () => ({
  sendOpenAICompatibleMessageNonStream: sendOpenAICompatibleMessageNonStreamMock,
}));

vi.mock('@/services/api/anthropicApi', () => ({
  sendAnthropicMessageNonStream: sendAnthropicMessageNonStreamMock,
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

  const expandConnection = (name = 'OpenAI') => {
    act(() => {
      findButton(name)?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
  };

  const withOpenaiProvider = (overrides: {
    apiKey?: string | null;
    baseUrl?: string | null;
    modelId?: string;
    models?: Array<{ id: string; name: string; isPinned?: boolean }>;
  }): Partial<AppSettings> => {
    return {
      thirdPartyApi: {
        connections: [
          createThirdPartyConnection({
            id: 'openai',
            apiKey: overrides.apiKey ?? null,
            baseUrl: overrides.baseUrl,
            modelId: overrides.modelId,
            models: overrides.models,
            enabled: true,
          }),
        ],
      },
    };
  };

  beforeEach(() => {
    vi.clearAllMocks();
    generateContentMock.mockResolvedValue({});
    sendOpenAICompatibleMessageNonStreamMock.mockResolvedValue(undefined);
    sendAnthropicMessageNonStreamMock.mockResolvedValue(undefined);
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
    expect(renderer.container.textContent).toContain('File Transfer Method');

    act(() => {
      useSettingsStore.setState({ language: 'zh' });
    });

    expect(renderer.container.textContent).not.toContain('API 与连接');
    expect(renderer.container.textContent).toContain('测试连通性');
    expect(renderer.container.textContent).toContain('文件传输方式');
  });

  it('shows the third-party provider cards without a global mode selector', async () => {
    await renderApiConfigSection();

    // No global mode toggle exists anymore — providers are enabled per-card.
    expect(renderer.container.querySelector('[role="group"][aria-label="API Provider"]')).toBeNull();
    expect(renderer.container.querySelector('#openai-compatible-api-enabled-toggle')).toBeNull();
    expect(renderer.container.textContent).toContain('Add connection');
  });

  it('tests the third-party openai endpoint with the active provider key', async () => {
    await renderApiConfigSection({
      useCustomApiConfig: false,
      settings: {
        ...settingsFixture,
        ...withOpenaiProvider({
          apiKey: 'openai-compatible-key',
          baseUrl: 'https://api.openai.com/v1',
          modelId: 'gpt-5.6-sol',
        }),
      },
    });

    expandConnection();

    // The Gemini tester is always in the DOM (CSS-collapsed when custom config
    // is off). The OpenAI card's tester is the LAST one — the Gemini tester
    // renders first inside the collapsed custom-config block.
    const testButtons = Array.from(renderer.container.querySelectorAll('button')).filter((button) =>
      button.textContent?.includes('Test Connection'),
    );
    const testButton = testButtons[testButtons.length - 1];

    await act(async () => {
      testButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(getClientMock).not.toHaveBeenCalled();
    expect(sendOpenAICompatibleMessageNonStreamMock).toHaveBeenCalledWith(
      'openai-compatible-key',
      'gpt-5.6-sol',
      [],
      [{ text: 'Hello' }],
      {
        baseUrl: 'https://api.openai.com/v1',
        temperature: 0,
        extraHeaders: {},
      },
      expect.any(AbortSignal),
      expect.any(Function),
      expect.any(Function),
      'user',
      'openai',
    );
  });

  it('shows the active provider base url in the third-party settings panel', async () => {
    await renderApiConfigSection({
      settings: {
        ...settingsFixture,
        ...withOpenaiProvider({ baseUrl: 'https://gateway.example.com/v1' }),
      },
    });

    expandConnection();

    const baseUrlInput = renderer.container.querySelector(
      '#connection-openai-base-url-input',
    ) as HTMLInputElement | null;
    expect(baseUrlInput).not.toBeNull();
    expect(baseUrlInput?.value).toBe('https://gateway.example.com/v1');
  });

  it('edits the active provider api key without overwriting the Gemini api key', async () => {
    const setApiKey = vi.fn();
    const onUpdate = vi.fn();

    await renderApiConfigSection({
      useCustomApiConfig: false, // hide the Gemini api key input so #api-key-input is the third-party one
      setApiKey,
      settings: {
        ...settingsFixture,
        ...withOpenaiProvider({ apiKey: null, baseUrl: 'https://api.openai.com/v1' }),
      },
      onUpdate,
    });

    expandConnection();

    // The Gemini api-key input is always in the DOM (CSS-collapsed when custom
    // config is off). The OpenAI card's input is the LAST one.
    const apiKeyInputs = Array.from(
      renderer.container.querySelectorAll<HTMLTextAreaElement>('#connection-openai-api-key-input'),
    );
    const apiKeyInput = apiKeyInputs[apiKeyInputs.length - 1];
    expect(apiKeyInput).not.toBeNull();

    await act(async () => {
      const descriptor = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value');
      descriptor?.set?.call(apiKeyInput, 'sk-openai');
      apiKeyInput!.dispatchEvent(new Event('input', { bubbles: true }));
      apiKeyInput!.dispatchEvent(new Event('change', { bubbles: true }));
    });

    expect(setApiKey).not.toHaveBeenCalled();
    // The active provider api key is written through onUpdate with the full thirdPartyApi object.
    const thirdPartyUpdate = onUpdate.mock.calls.find(([key]) => key === 'thirdPartyApi');
    expect(thirdPartyUpdate).toBeDefined();
    const updatedSettings = thirdPartyUpdate![1] as AppSettings['thirdPartyApi'];
    expect(updatedSettings.connections.find((connection) => connection.id === 'openai')?.apiKey).toBe('sk-openai');
  });

  it('shows active provider model management inside the third-party API settings panel', async () => {
    await renderApiConfigSection({
      settings: {
        ...settingsFixture,
        ...withOpenaiProvider({
          modelId: 'gpt-5.6-sol',
          models: [
            { id: 'gpt-5.6-sol', name: 'GPT-5.6 Sol', isPinned: true },
            { id: 'gpt-4.1', name: 'GPT-4.1' },
          ],
        }),
      },
    });

    expandConnection();

    expect(renderer.container.querySelector('#connection-openai-base-url-input')).not.toBeNull();
    // Per-provider collapsible UI (no separate <select>): the active provider
    // (openai) is expanded by default and its model list editor is rendered.
    expect(renderer.container.querySelector('[aria-label="Model Name 1"]')).not.toBeNull();
  });

  it('explains that Live uses the browser API key directly without token endpoint settings', async () => {
    await renderApiConfigSection({
      apiKey: 'browser-key',
    });

    expect(renderer.container.textContent).toContain('Live connects from this browser');
    expect(renderer.container.textContent).toContain('uses your browser API key directly');
    expect(renderer.container.textContent).not.toContain('/api/live-token');
    expect(renderer.container.textContent).not.toContain('Advanced Live Settings');
    expect(renderer.container.querySelector('#live-token-endpoint-input')).toBeNull();
  });
});
