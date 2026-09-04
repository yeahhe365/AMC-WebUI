import { describe, expect, it } from 'vitest';
import {
  buildAnthropicMessagesUrl,
  buildAnthropicModelsUrl,
  buildAnthropicUpstreamMessagesUrl,
  normalizeAnthropicBaseUrl,
} from './anthropicUrls';

describe('anthropicUrls', () => {
  it('normalizes by trimming trailing slashes', () => {
    expect(normalizeAnthropicBaseUrl('https://api.anthropic.com/')).toBe('https://api.anthropic.com');
  });

  it('falls back to default base url when empty', () => {
    expect(normalizeAnthropicBaseUrl(null)).toBe('https://api.anthropic.com');
    expect(normalizeAnthropicBaseUrl('  ')).toBe('https://api.anthropic.com');
  });

  it('builds messages url with /v1/messages', () => {
    expect(buildAnthropicMessagesUrl('https://api.anthropic.com')).toBe('https://api.anthropic.com/v1/messages');
  });

  it('builds models url with /v1/models', () => {
    expect(buildAnthropicModelsUrl('https://api.anthropic.com')).toBe('https://api.anthropic.com/v1/models');
  });

  it('keeps the upstream messages URL on the user base even when the Docker proxy is injected', () => {
    (window as unknown as { __AMC_RUNTIME_CONFIG__?: unknown }).__AMC_RUNTIME_CONFIG__ = {
      thirdPartyProxyUrl: '/api/openai',
    };

    expect(buildAnthropicMessagesUrl('https://api.anthropic.com')).toBe('/api/openai/v1/messages');
    expect(buildAnthropicUpstreamMessagesUrl('https://api.anthropic.com')).toBe(
      'https://api.anthropic.com/v1/messages',
    );

    delete (window as unknown as { __AMC_RUNTIME_CONFIG__?: unknown }).__AMC_RUNTIME_CONFIG__;
  });
});
