// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { loadConfig } from './config';

describe('loadConfig', () => {
  it('keeps MCP stdio and private HTTP disabled unless explicitly enabled', () => {
    const config = loadConfig({});

    expect(config.enableMcpStdio).toBe(false);
    expect(config.enableMcpPrivateHttp).toBe(false);
  });

  it('parses MCP transport enablement flags from the environment', () => {
    const config = loadConfig({
      ENABLE_MCP_STDIO: 'true',
      ENABLE_MCP_PRIVATE_HTTP: 'yes',
    });

    expect(config.enableMcpStdio).toBe(true);
    expect(config.enableMcpPrivateHttp).toBe(true);
  });

  it('leaves the Live WS proxy disabled by default', () => {
    const config = loadConfig({});

    expect(config.enableLiveWsProxy).toBe(false);
    expect(config.liveWsIdleTimeoutMs).toBe(300_000);
    expect(config.serverKeyPriority).toBe(false);
    expect(config.thirdPartyRoutes).toEqual({});
  });

  it('enables the Live WS proxy and parses the idle timeout', () => {
    const config = loadConfig({
      ENABLE_LIVE_WS_PROXY: 'on',
      LIVE_WS_IDLE_TIMEOUT_MS: '120000',
    });

    expect(config.enableLiveWsProxy).toBe(true);
    expect(config.liveWsIdleTimeoutMs).toBe(120_000);
  });

  it('falls back to the default idle timeout for invalid values', () => {
    expect(loadConfig({ LIVE_WS_IDLE_TIMEOUT_MS: 'abc' }).liveWsIdleTimeoutMs).toBe(300_000);
    expect(loadConfig({ LIVE_WS_IDLE_TIMEOUT_MS: '-5' }).liveWsIdleTimeoutMs).toBe(300_000);
  });

  it('defaults SERVER_KEY_PRIORITY to false (BYOK 兜底) and parses explicit flags', () => {
    expect(loadConfig({}).serverKeyPriority).toBe(false);
    expect(loadConfig({ SERVER_KEY_PRIORITY: 'true' }).serverKeyPriority).toBe(true);
    expect(loadConfig({ SERVER_KEY_PRIORITY: '0' }).serverKeyPriority).toBe(false);
  });

  it('parses THIRD_PARTY_ROUTES as a provider → { baseUrl, apiKey } map', () => {
    const config = loadConfig({
      THIRD_PARTY_ROUTES: JSON.stringify({
        openai: { baseUrl: 'https://api.openai.com/v1', apiKey: 'sk-abc' },
        deepseek: { baseUrl: 'https://api.deepseek.com/' },
      }),
    });

    expect(config.thirdPartyRoutes).toEqual({
      openai: { baseUrl: 'https://api.openai.com/v1', apiKey: 'sk-abc' },
      deepseek: { baseUrl: 'https://api.deepseek.com/', apiKey: undefined },
    });
  });

  it('ignores malformed THIRD_PARTY_ROUTES JSON', () => {
    const config = loadConfig({ THIRD_PARTY_ROUTES: '{not json' });
    expect(config.thirdPartyRoutes).toEqual({});
  });

  it('ignores non-object THIRD_PARTY_ROUTES payloads', () => {
    expect(loadConfig({ THIRD_PARTY_ROUTES: '["a","b"]' }).thirdPartyRoutes).toEqual({});
    expect(loadConfig({ THIRD_PARTY_ROUTES: '"x"' }).thirdPartyRoutes).toEqual({});
    expect(loadConfig({ THIRD_PARTY_ROUTES: 'null' }).thirdPartyRoutes).toEqual({});
  });

  it('drops route entries that have no baseUrl', () => {
    const config = loadConfig({
      THIRD_PARTY_ROUTES: JSON.stringify({
        good: { baseUrl: 'https://api.example.com', apiKey: 'k' },
        bad: { apiKey: 'k' },
      }),
    });

    expect(config.thirdPartyRoutes).toEqual({
      good: { baseUrl: 'https://api.example.com', apiKey: 'k' },
    });
  });

  it('parses GEMINI_API_KEY and LIVE_GEMINI_API_KEY from environment', () => {
    const config = loadConfig({
      GEMINI_API_KEY: '  general-key  ',
      LIVE_GEMINI_API_KEY: '  live-key  ',
    });

    expect(config.geminiApiKey).toBe('general-key');
    expect(config.liveGeminiApiKey).toBe('live-key');
  });
});
