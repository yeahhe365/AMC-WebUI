import { describe, expect, it } from 'vitest';
import {
  getGeminiApiBaseUrlForSettings,
  getGeminiProxyBaseUrlForSettings,
  resolveConfiguredGeminiBaseUrl,
  resolveLiveClientBaseUrl,
} from './geminiApiBaseUrl';

const disabledProxySettings = {
  useCustomApiConfig: true,
  useApiProxy: false,
  apiProxyUrl: 'https://proxy.example.com/gemini/v1beta/',
};

describe('geminiApiBaseUrl', () => {
  it('resolves configured Gemini proxy URLs only when both custom config and proxy mode are enabled', () => {
    expect(
      resolveConfiguredGeminiBaseUrl({
        useCustomApiConfig: true,
        useApiProxy: true,
        apiProxyUrl: 'https://proxy.example.com/gemini/v1beta/',
      }),
    ).toBe('https://proxy.example.com/gemini/v1beta/');

    expect(resolveConfiguredGeminiBaseUrl(disabledProxySettings)).toBeNull();
  });

  it('normalizes configured Gemini base URLs before SDK use', () => {
    expect(getGeminiApiBaseUrlForSettings(disabledProxySettings)).toBe('https://generativelanguage.googleapis.com');
    expect(
      getGeminiApiBaseUrlForSettings({
        useCustomApiConfig: true,
        useApiProxy: true,
        apiProxyUrl: 'https://proxy.example.com/gemini/v1beta/',
      }),
    ).toBe('https://proxy.example.com/gemini');
  });

  it('resolves same-origin proxy paths to absolute URLs for SDK use', () => {
    expect(
      getGeminiApiBaseUrlForSettings({
        useCustomApiConfig: true,
        useApiProxy: true,
        apiProxyUrl: '/api/gemini/v1beta',
      }),
    ).toBe('http://localhost/api/gemini');
  });

  it('returns a normalized proxy base URL only when proxy mode is active', () => {
    expect(getGeminiProxyBaseUrlForSettings(disabledProxySettings)).toBeNull();
    expect(
      getGeminiProxyBaseUrlForSettings({
        useCustomApiConfig: true,
        useApiProxy: true,
        apiProxyUrl: '/api/gemini/v1beta',
      }),
    ).toBe('/api/gemini');
  });

  it('only forwards absolute HTTP URLs to the Live API client', () => {
    expect(
      resolveLiveClientBaseUrl({
        useCustomApiConfig: true,
        useApiProxy: true,
        apiProxyUrl: 'https://proxy.example.com/gemini/v1beta/',
      }),
    ).toBe('https://proxy.example.com/gemini');

    expect(
      resolveLiveClientBaseUrl({
        useCustomApiConfig: true,
        useApiProxy: true,
        apiProxyUrl: '/api/gemini/v1beta',
      }),
    ).toBeNull();
  });
});
