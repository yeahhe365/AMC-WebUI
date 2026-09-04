import { afterEach, describe, expect, it } from 'vitest';
import {
  getGeminiApiBaseUrlForSettings,
  getGeminiProxyBaseUrlForSettings,
  resolveConfiguredGeminiBaseUrl,
  resolveLiveClientBaseUrl,
} from './geminiApiBaseUrl';

const setRuntimeConfig = (config: Record<string, unknown> | undefined) => {
  (window as Window & { __AMC_RUNTIME_CONFIG__?: Record<string, unknown> }).__AMC_RUNTIME_CONFIG__ = config;
};

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

  it('resolves the Docker runtime relative proxy path into an absolute URL for the SDK', () => {
    setRuntimeConfig({
      serverManagedApi: true,
      useCustomApiConfig: true,
      useApiProxy: true,
      apiProxyUrl: '/api/gemini',
    });

    // A bare relative path would make the @google/genai SDK throw "Invalid URL"
    // inside new URL(baseUrl + path). It must be resolved against the origin.
    expect(getGeminiApiBaseUrlForSettings()).toBe('http://localhost/api/gemini');
  });

  afterEach(() => {
    setRuntimeConfig(undefined);
  });
});
