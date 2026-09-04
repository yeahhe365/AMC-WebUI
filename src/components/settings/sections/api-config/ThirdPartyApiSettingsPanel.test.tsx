import { act, type ComponentProps, useState } from 'react';
import { waitFor } from '@testing-library/react';
import { setupProviderTestRenderer as setupTestRenderer } from '@/test/render/providerRenderer';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { setupStoreStateReset } from '@/test/stores/reset';
import { useChatStore } from '@/stores/chatStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { createChatSettings, createSavedChatSession, createThirdPartyConnection } from '@/test/data/factories';
import type { AppSettings } from '@/types';
import { ThirdPartyApiSettingsPanel } from './ThirdPartyApiSettingsPanel';

describe('ThirdPartyApiSettingsPanel', () => {
  const renderer = setupTestRenderer();
  setupStoreStateReset();

  afterEach(() => {
    vi.clearAllMocks();
  });

  const queryDoc = (selector: string) => renderer.container.ownerDocument.querySelector(selector);

  const findButton = (label: string) =>
    Array.from(renderer.container.querySelectorAll('button')).find((button) => button.textContent?.includes(label));

  const createPanelProps = (
    overrides: Partial<ComponentProps<typeof ThirdPartyApiSettingsPanel>> = {},
  ): ComponentProps<typeof ThirdPartyApiSettingsPanel> => {
    const base: AppSettings = useSettingsStore.getState().appSettings;
    return {
      settings: base,
      onUpdateSettings: vi.fn(),
      ...overrides,
    };
  };

  const StatefulPanel = ({ initial }: { initial: AppSettings }) => {
    const [settings, setSettings] = useState(initial);
    return (
      <ThirdPartyApiSettingsPanel
        settings={settings}
        onUpdateSettings={(partial) => setSettings((previous) => ({ ...previous, ...partial }))}
      />
    );
  };

  it('shows an empty-state add button only, and opens an inline template picker', async () => {
    const onUpdateSettings = vi.fn();

    act(() => {
      renderer.root.render(<ThirdPartyApiSettingsPanel {...createPanelProps({ onUpdateSettings })} />);
    });

    expect(renderer.container.textContent).toContain('No third-party connections yet');
    expect(findButton('Add connection')).toBeDefined();
    expect(renderer.container.querySelectorAll('button').length).toBe(
      Array.from(renderer.container.querySelectorAll('button')).filter((button) =>
        button.textContent?.includes('Add connection'),
      ).length,
    );

    act(() => {
      findButton('Add connection')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(onUpdateSettings).not.toHaveBeenCalled();
    await waitFor(() => {
      expect(queryDoc('[data-testid="third-party-template-openai"]')).not.toBeNull();
    });
    expect(queryDoc('[data-modal-backdrop]')).toBeNull();
    expect(queryDoc('[data-testid="third-party-template-openai"]')?.textContent).toContain('https://api.openai.com/v1');
  });

  it('adds a connection from a template and expands only that new card', async () => {
    act(() => {
      renderer.root.render(<StatefulPanel initial={useSettingsStore.getState().appSettings} />);
    });

    act(() => {
      queryDoc('[data-testid="third-party-add-connection"]')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await waitFor(() => {
      expect(queryDoc('[data-testid="third-party-template-openai"]')).not.toBeNull();
    });
    act(() => {
      queryDoc('[data-testid="third-party-template-openai"]')?.dispatchEvent(
        new MouseEvent('click', { bubbles: true }),
      );
    });

    await waitFor(() => {
      expect(queryDoc('[id^="connection-"][id$="-api-key-input"]')).not.toBeNull();
    });
  });

  it('keeps existing connections collapsed until the row is opened', () => {
    const onUpdateSettings = vi.fn();
    const connection = createThirdPartyConnection({
      id: 'openai',
      enabled: true,
      apiKey: 'sk',
      baseUrl: 'https://api.openai.com/v1',
    });
    const settings: AppSettings = {
      ...useSettingsStore.getState().appSettings,
      thirdPartyApi: { connections: [connection] },
    };

    act(() => {
      renderer.root.render(<ThirdPartyApiSettingsPanel {...createPanelProps({ settings, onUpdateSettings })} />);
    });

    expect(queryDoc('#connection-openai-api-key-input')).toBeNull();
    expect(renderer.container.textContent).toContain('Ready');
    expect(findButton('Add connection')).toBeDefined();

    const cardButton = findButton('OpenAI');
    expect(cardButton).toBeDefined();

    act(() => {
      cardButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(onUpdateSettings).not.toHaveBeenCalled();
    expect(queryDoc('#connection-openai-api-key-input')).not.toBeNull();
  });

  it('shows No URL when the connection has a key but no base URL', () => {
    const settings: AppSettings = {
      ...useSettingsStore.getState().appSettings,
      thirdPartyApi: {
        connections: [
          createThirdPartyConnection({
            id: 'custom',
            templateId: 'custom-openai',
            enabled: true,
            apiKey: 'sk',
            baseUrl: null,
          }),
        ],
      },
    };

    act(() => {
      renderer.root.render(<ThirdPartyApiSettingsPanel {...createPanelProps({ settings })} />);
    });

    expect(renderer.container.textContent).toContain('No URL');
    expect(renderer.container.textContent).not.toContain('Ready');
  });

  it('asks for confirmation before removing a connection that chats still use', () => {
    const onUpdateSettings = vi.fn();
    const settings: AppSettings = {
      ...useSettingsStore.getState().appSettings,
      thirdPartyApi: {
        connections: [createThirdPartyConnection({ id: 'openai', enabled: true })],
      },
    };

    act(() => {
      useChatStore.setState({
        savedSessions: [createSavedChatSession({ settings: createChatSettings({ providerId: 'openai' }) })],
      });
      renderer.root.render(<ThirdPartyApiSettingsPanel {...createPanelProps({ settings, onUpdateSettings })} />);
    });

    act(() => {
      findButton('OpenAI')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    act(() => {
      findButton('Remove connection')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(onUpdateSettings).not.toHaveBeenCalled();
    expect(renderer.container.textContent).toContain('Remove this connection?');
    expect(renderer.container.textContent).toContain('will be blocked');

    act(() => {
      findButton('Delete')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(onUpdateSettings).toHaveBeenCalledTimes(1);
  });
});
