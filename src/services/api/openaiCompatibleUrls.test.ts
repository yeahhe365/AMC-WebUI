import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  buildOpenAICompatibleChatCompletionsUrl,
  buildOpenAICompatibleModelsUrl,
  buildOpenAICompatibleUpstreamChatCompletionsUrl,
  getOpenAICompatibleBaseUrlWarning,
} from './openaiCompatibleUrls';

describe('openaiCompatibleUrls', () => {
  beforeEach(() => {
    delete (window as unknown as { __AMC_RUNTIME_CONFIG__?: unknown }).__AMC_RUNTIME_CONFIG__;
  });
  afterEach(() => {
    delete (window as unknown as { __AMC_RUNTIME_CONFIG__?: unknown }).__AMC_RUNTIME_CONFIG__;
  });

  it('appends chat completions and models paths to the configured API root', () => {
    expect(buildOpenAICompatibleChatCompletionsUrl('https://generativelanguage.googleapis.com/v1beta/openai/')).toBe(
      'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
    );
    expect(buildOpenAICompatibleModelsUrl('https://generativelanguage.googleapis.com/v1beta/openai/')).toBe(
      'https://generativelanguage.googleapis.com/v1beta/openai/models',
    );
  });

  it('uses the default OpenAI-compatible API root when the configured root is blank', () => {
    expect(buildOpenAICompatibleChatCompletionsUrl('  ')).toBe('https://api.openai.com/v1/chat/completions');
    expect(buildOpenAICompatibleModelsUrl(null)).toBe('https://api.openai.com/v1/models');
  });

  it('warns when the configured root already includes an endpoint path', () => {
    expect(getOpenAICompatibleBaseUrlWarning('https://api.example.com/v1/chat/completions')).toBe(
      'chat-completions-endpoint',
    );
    expect(getOpenAICompatibleBaseUrlWarning('https://api.example.com/v1/models/')).toBe('models-endpoint');
    expect(getOpenAICompatibleBaseUrlWarning('https://api.example.com/v1')).toBeNull();
  });

  it('routes through the runtime-injected relative proxy when present (Docker)', () => {
    (window as unknown as { __AMC_RUNTIME_CONFIG__?: unknown }).__AMC_RUNTIME_CONFIG__ = {
      thirdPartyProxyUrl: '/api/openai',
    };

    expect(buildOpenAICompatibleChatCompletionsUrl('https://api.openai.com/v1')).toBe('/api/openai/chat/completions');
    expect(buildOpenAICompatibleModelsUrl('https://api.openai.com/v1')).toBe('/api/openai/models');
    expect(buildOpenAICompatibleUpstreamChatCompletionsUrl('https://api.openai.com/v1')).toBe(
      'https://api.openai.com/v1/chat/completions',
    );
  });
});
