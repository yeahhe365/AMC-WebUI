import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  buildOpenAIResponsesModelsUrl,
  buildOpenAIResponsesUpstreamUrl,
  buildOpenAIResponsesUrl,
  getOpenAIResponsesBaseUrlWarning,
} from './openaiResponsesUrls';

describe('openaiResponsesUrls', () => {
  beforeEach(() => {
    delete (window as unknown as { __AMC_RUNTIME_CONFIG__?: unknown }).__AMC_RUNTIME_CONFIG__;
  });
  afterEach(() => {
    delete (window as unknown as { __AMC_RUNTIME_CONFIG__?: unknown }).__AMC_RUNTIME_CONFIG__;
  });

  it('appends responses and models paths to the configured API root', () => {
    expect(buildOpenAIResponsesUrl('https://api.openai.com/v1/')).toBe('https://api.openai.com/v1/responses');
    expect(buildOpenAIResponsesModelsUrl('https://api.openai.com/v1/')).toBe('https://api.openai.com/v1/models');
  });

  it('uses default OpenAI root when configured root is blank', () => {
    expect(buildOpenAIResponsesUrl('  ')).toBe('https://api.openai.com/v1/responses');
    expect(buildOpenAIResponsesModelsUrl(null)).toBe('https://api.openai.com/v1/models');
  });

  it('warns when the configured root already includes an endpoint path', () => {
    expect(getOpenAIResponsesBaseUrlWarning('https://api.example.com/v1/responses')).toBe('responses-endpoint');
    expect(getOpenAIResponsesBaseUrlWarning('https://api.example.com/v1/chat/completions')).toBe(
      'chat-completions-endpoint',
    );
    expect(getOpenAIResponsesBaseUrlWarning('https://api.example.com/v1/models/')).toBe('models-endpoint');
    expect(getOpenAIResponsesBaseUrlWarning('https://api.example.com/v1')).toBeNull();
  });

  it('routes through the runtime-injected relative proxy when present (Docker)', () => {
    (window as unknown as { __AMC_RUNTIME_CONFIG__?: unknown }).__AMC_RUNTIME_CONFIG__ = {
      thirdPartyProxyUrl: '/api/openai',
    };

    expect(buildOpenAIResponsesUrl('https://api.openai.com/v1')).toBe('/api/openai/responses');
    expect(buildOpenAIResponsesModelsUrl('https://api.openai.com/v1')).toBe('/api/openai/models');
    expect(buildOpenAIResponsesUpstreamUrl('https://api.openai.com/v1')).toBe('https://api.openai.com/v1/responses');
  });
});
