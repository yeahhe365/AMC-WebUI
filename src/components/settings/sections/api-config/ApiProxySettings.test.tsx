import { act } from 'react';
import { setupProviderTestRenderer as setupTestRenderer } from '@/test/render/providerRenderer';
import { describe, expect, it, vi } from 'vitest';
import { ApiProxySettings } from './ApiProxySettings';

describe('ApiProxySettings', () => {
  const renderer = setupTestRenderer();

  it('renders the SDK request preview for a custom proxy URL', () => {
    act(() => {
      renderer.root.render(
        <ApiProxySettings
          useApiProxy
          setUseApiProxy={vi.fn()}
          apiProxyUrl="https://proxy.example.com/gemini/v1beta"
          setApiProxyUrl={vi.fn()}
        />,
      );
    });

    expect(document.body).toHaveTextContent(
      'https://proxy.example.com/gemini/v1beta/models/gemini-4-hydrogen:generateContent',
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

  it('does not render built-in proxy badge or hint when proxy is empty, and hides reset button', () => {
    act(() => {
      renderer.root.render(
        <ApiProxySettings useApiProxy setUseApiProxy={vi.fn()} apiProxyUrl={null} setApiProxyUrl={vi.fn()} />,
      );
    });

    const input = renderer.container.querySelector('#api-proxy-url-input') as HTMLInputElement;
    expect(input).not.toBeNull();
    expect(input.placeholder).toBe('e.g., https://proxy.example.com');
    expect(document.body).not.toHaveTextContent('Built-in Proxy');
    expect(document.body).not.toHaveTextContent('系统内置代理');
    expect(document.body).not.toHaveTextContent('Reset');
  });

  it('shows reset button when custom proxy is entered, and clicking it resets to null', () => {
    const setApiProxyUrl = vi.fn();
    act(() => {
      renderer.root.render(
        <ApiProxySettings
          useApiProxy
          setUseApiProxy={vi.fn()}
          apiProxyUrl="https://custom.proxy.com"
          setApiProxyUrl={setApiProxyUrl}
        />,
      );
    });

    const resetButton = renderer.container.querySelector('button[title="Reset"], button[title="重置"]');
    expect(resetButton).not.toBeNull();
    act(() => {
      resetButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(setApiProxyUrl).toHaveBeenCalledWith(null);
  });
});
