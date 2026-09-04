import { act } from 'react';
import { setupProviderTestRenderer as setupTestRenderer } from '@/test/render/providerRenderer';
import { describe, expect, it, vi } from 'vitest';
import { ApiProxySettings } from './ApiProxySettings';

describe('ApiProxySettings', () => {
  const renderer = setupTestRenderer();

  it('renders the SDK request preview for a renderer.root proxy URL', () => {
    act(() => {
      renderer.root.render(
        <ApiProxySettings
          useApiProxy
          setUseApiProxy={vi.fn()}
          apiProxyUrl="https://api-proxy.de/gemini/v1beta"
          setApiProxyUrl={vi.fn()}
        />,
      );
    });

    expect(document.body).toHaveTextContent(
      'https://api-proxy.de/gemini/v1beta/models/gemini-3.8-flash:generateContent',
    );
  });

  it('collapses proxy URL details while proxy usage is off', () => {
    act(() => {
      renderer.root.render(
        <ApiProxySettings
          useApiProxy={false}
          setUseApiProxy={vi.fn()}
          apiProxyUrl="http://localhost:7860/v1beta"
          setApiProxyUrl={vi.fn()}
        />,
      );
    });

    expect(document.body).toHaveTextContent('Use Proxy Endpoint');
    expect(document.body).not.toHaveTextContent('Reset');
    expect(document.body).not.toHaveTextContent('Request URL Preview');
    expect(renderer.container.querySelector('#api-proxy-url-input')).toBeNull();
  });
});
