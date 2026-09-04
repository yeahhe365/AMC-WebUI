import { act, type ComponentProps } from 'react';
import { setupProviderTestRenderer as setupTestRenderer } from '@/test/render/providerRenderer';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { setupStoreStateReset } from '@/test/stores/reset';
import { createThirdPartyConnection } from '@/test/data/factories';
import { ThirdPartyConnectionEditor } from './ThirdPartyConnectionEditor';

describe('ThirdPartyConnectionEditor', () => {
  const renderer = setupTestRenderer({ providers: { language: 'en' } });
  setupStoreStateReset();

  afterEach(() => {
    vi.clearAllMocks();
    delete (window as unknown as { __AMC_RUNTIME_CONFIG__?: unknown }).__AMC_RUNTIME_CONFIG__;
  });

  const renderEditor = (overrides: Partial<ComponentProps<typeof ThirdPartyConnectionEditor>> = {}) => {
    const props: ComponentProps<typeof ThirdPartyConnectionEditor> = {
      connection: createThirdPartyConnection({
        id: 'openai',
        apiKey: 'sk',
        baseUrl: 'https://api.openai.com/v1',
        extraHeaders: { 'X-Title': 'AMC' },
      }),
      onChange: vi.fn(),
      onRemove: vi.fn(),
      ...overrides,
    };

    act(() => {
      renderer.root.render(<ThirdPartyConnectionEditor {...props} />);
    });
  };

  it('previews both the browser request path and the upstream URL when a proxy is injected', () => {
    (window as unknown as { __AMC_RUNTIME_CONFIG__?: unknown }).__AMC_RUNTIME_CONFIG__ = {
      thirdPartyProxyUrl: '/api/openai',
    };

    renderEditor();

    expect(renderer.container.textContent).toContain('This browser');
    expect(renderer.container.textContent).toContain('/api/openai/chat/completions');
    expect(renderer.container.textContent).toContain('Upstream');
    expect(renderer.container.textContent).toContain('https://api.openai.com/v1/chat/completions');
  });

  it('shows extra-header count and a test-model dropdown', () => {
    renderEditor();

    expect(renderer.container.textContent).toContain('Advanced: extra headers (1)');
    expect(renderer.container.querySelector('#connection-openai-api-test-model')).not.toBeNull();
  });

  it('renders official documentation and API key links for known provider templates', () => {
    renderEditor();

    expect(renderer.container.textContent).toContain('Get API Key');
    expect(renderer.container.textContent).toContain('Documentation');
  });

  it('renders preset header chips in the advanced headers section', () => {
    renderEditor();

    expect(renderer.container.textContent).toContain('Presets:');
    expect(renderer.container.textContent).toContain('+ HTTP-Referer');
    expect(renderer.container.textContent).toContain('+ User-Agent');
  });
});
