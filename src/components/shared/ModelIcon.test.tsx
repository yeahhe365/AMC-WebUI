import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { ModelOption, ThirdPartyProviderId, ThirdPartyTemplateId } from '@/types';
import { getModelIcon, THIRD_PARTY_PROVIDER_LOGO } from './ModelIcon';

const renderIconHtml = (model: ModelOption): string => renderToStaticMarkup(getModelIcon(model));

describe('getModelIcon', () => {
  it('renders dedicated model logo <img> for models with specialized marks', () => {
    const claudeHtml = renderIconHtml({
      id: 'claude-fable-5',
      name: 'Claude Fable 5',
      isPinned: true,
      apiMode: 'third-party',
      providerId: 'anthropic',
    });
    expect(claudeHtml).toContain('data-model-provider-logo="claude"');
    expect(claudeHtml).toContain('<img');
    expect(claudeHtml).not.toContain('text-orange');

    const gpt4oHtml = renderIconHtml({
      id: 'gpt-4o',
      name: 'GPT-4o',
      isPinned: true,
      apiMode: 'third-party',
      providerId: 'openai',
    });
    expect(gpt4oHtml).toContain('data-model-provider-logo="gpt-4o"');
    expect(gpt4oHtml).toContain('<img');

    const dalleHtml = renderIconHtml({
      id: 'dall-e-3',
      name: 'DALL-E 3',
      isPinned: true,
      apiMode: 'third-party',
      providerId: 'openai',
    });
    expect(dalleHtml).toContain('data-model-provider-logo="dalle"');

    const fluxHtml = renderIconHtml({
      id: 'black-forest-labs/flux-1-schnell',
      name: 'Flux 1 Schnell',
      isPinned: true,
      apiMode: 'third-party',
      providerId: 'openrouter',
    });
    expect(fluxHtml).toContain('data-model-provider-logo="flux"');

    const kimiHtml = renderIconHtml({
      id: 'kimi-k3',
      name: 'Kimi K3',
      isPinned: true,
      apiMode: 'third-party',
      providerId: 'kimi',
    });
    expect(kimiHtml).toContain('data-model-provider-logo="kimi"');

    const glmHtml = renderIconHtml({
      id: 'glm-5.2',
      name: 'GLM 5.2',
      isPinned: true,
      apiMode: 'third-party',
      providerId: 'glm',
    });
    expect(glmHtml).toContain('data-model-provider-logo="glm"');
  });

  it('infers vendor logo for models without dedicated mark', () => {
    const llamaHtml = renderIconHtml({
      id: 'meta-llama/llama-3.3-70b-instruct',
      name: 'Llama 3.3 70B',
      isPinned: true,
      apiMode: 'third-party',
      providerId: 'openrouter',
    });
    expect(llamaHtml).toContain('data-model-provider-logo="meta"');

    const deepseekHtml = renderIconHtml({
      id: 'deepseek-ai/deepseek-v3',
      name: 'DeepSeek V3',
      isPinned: true,
      apiMode: 'third-party',
      providerId: 'siliconflow',
    });
    expect(deepseekHtml).toContain('data-model-provider-logo="deepseek"');
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

  it.each([
    { providerId: 'openai', expectedKey: 'openai' },
    { providerId: 'anthropic', expectedKey: 'anthropic' },
    { providerId: 'qwen', expectedKey: 'qwen' },
    { providerId: 'deepseek', expectedKey: 'deepseek' },
    { providerId: 'kimi', expectedKey: 'moonshot' },
    { providerId: 'glm', expectedKey: 'zhipu' },
    { providerId: 'openrouter', expectedKey: 'openrouter' },
    { providerId: 'custom', expectedKey: 'custom' },
  ] as const)('renders the brand logo <img> for provider fallback $providerId', ({ providerId, expectedKey }) => {
    const html = renderIconHtml({
      id: `custom-endpoint-model-sku-42`,
      name: `Custom model on ${providerId}`,
      isPinned: true,
      apiMode: 'third-party',
      providerId: providerId as ThirdPartyProviderId,
      templateId: providerId === 'custom' ? 'custom-openai' : (providerId as unknown as ThirdPartyTemplateId),
    });

    expect(html).toContain(`data-model-provider-logo="${expectedKey}"`);
    expect(html).toContain('<img');
    expect(THIRD_PARTY_PROVIDER_LOGO[providerId]).toBeTruthy();
  });
});
