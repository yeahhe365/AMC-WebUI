import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { ModelOption, ThirdPartyProviderId } from '@/types';
import { getModelIcon, THIRD_PARTY_PROVIDER_LOGO } from './ModelIcon';

const renderIconHtml = (model: ModelOption): string => renderToStaticMarkup(getModelIcon(model));

describe('getModelIcon', () => {
  it('renders the provider brand logo <img> for third-party models instead of the colored box', () => {
    const html = renderIconHtml({
      id: 'claude-fable-5',
      name: 'Claude Fable 5',
      isPinned: true,
      apiMode: 'third-party',
      providerId: 'anthropic',
    });

    expect(html).toContain('data-model-provider-logo="anthropic"');
    // Real <img> with the logo src, not the colored Box fallback.
    expect(html).toContain('<img');
    expect(html).not.toContain('text-orange');
  });

  it('keeps pinned non-provider models on the sparkle icon', () => {
    const html = renderIconHtml({
      id: 'some-pinned-model',
      name: 'Some Pinned Model',
      isPinned: true,
    });

    expect(html).toContain('text-sky');
    expect(html).not.toContain('data-model-provider-logo');
  });

  it.each(['openai', 'anthropic', 'qwen', 'deepseek', 'kimi', 'glm', 'openrouter', 'custom'] as const)(
    'renders the brand logo <img> for provider %s',
    (providerId: ThirdPartyProviderId) => {
      const html = renderIconHtml({
        id: `${providerId}-model`,
        name: `${providerId} model`,
        isPinned: true,
        apiMode: 'third-party',
        providerId,
        templateId: providerId === 'custom' ? 'custom-openai' : providerId,
      });

      expect(html).toContain(`data-model-provider-logo="${providerId}"`);
      expect(html).toContain('<img');
      // Every built-in provider has a logo asset wired up.
      expect(THIRD_PARTY_PROVIDER_LOGO[providerId]).toBeTruthy();
    },
  );
});
