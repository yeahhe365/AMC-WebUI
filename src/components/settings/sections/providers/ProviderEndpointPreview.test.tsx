import { act } from 'react';
import { setupProviderTestRenderer as setupTestRenderer } from '@/test/render/providerRenderer';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { setupStoreStateReset } from '@/test/stores/reset';
import { ProviderEndpointPreview } from './ProviderEndpointPreview';

describe('ProviderEndpointPreview', () => {
  const renderer = setupTestRenderer({ providers: { language: 'zh' } });
  setupStoreStateReset();

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const render = (protocol: 'openai-compatible' | 'anthropic' | 'openai-responses', baseUrl: string | null) => {
    act(() => {
      renderer.root.render(<ProviderEndpointPreview protocol={protocol} baseUrl={baseUrl} />);
    });
    return renderer.container.textContent ?? '';
  };

  it('shows the resolved chat/completions URL for an openai-compatible base URL', () => {
    const text = render('openai-compatible', 'https://api.openai.com/v1');
    expect(text).toContain('https://api.openai.com/v1/chat/completions');
  });

  it('shows the /v1/models URL shape for anthropic connections', () => {
    const text = render('anthropic', 'https://api.anthropic.com');
    expect(text).toContain('https://api.anthropic.com/v1/messages');
  });

  it('shows the /responses URL for openai-responses connections', () => {
    const text = render('openai-responses', 'https://api.openai.com/v1');
    expect(text).toContain('https://api.openai.com/v1/responses');
  });

  it('warns when the base URL already contains the appended endpoint', () => {
    const text = render('openai-compatible', 'https://api.openai.com/v1/chat/completions');
    expect(text).toContain('/chat/completions');
    expect(text).toContain('自动拼接');
  });

  it('does not warn for a plain base URL', () => {
    const text = render('openai-compatible', 'https://api.deepseek.com');
    expect(text).not.toContain('自动拼接');
  });
});
