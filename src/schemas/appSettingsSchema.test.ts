import { describe, expect, it } from 'vitest';
import { sanitizeImportedAppSettings } from './appSettingsSchema';

describe('appSettingsSchema', () => {
  it('preserves custom Live Artifacts prompts from imported settings', () => {
    const settings = sanitizeImportedAppSettings({
      liveArtifactsSystemPrompt: 'Custom Live Artifacts prompt',
    });

    expect((settings as { liveArtifactsSystemPrompt?: string }).liveArtifactsSystemPrompt).toBe(
      'Custom Live Artifacts prompt',
    );
  });

  it('defaults missing custom Live Artifacts prompts to blank', () => {
    const settings = sanitizeImportedAppSettings({});

    expect((settings as { liveArtifactsSystemPrompt?: string }).liveArtifactsSystemPrompt).toBe('');
  });

  it('preserves only the inline custom Live Artifacts prompt from imported settings', () => {
    const settings = sanitizeImportedAppSettings({
      liveArtifactsSystemPrompts: {
        inline: 'Inline custom prompt',
        full: 'Full custom prompt',
        fullHtml: 'Complete HTML custom prompt',
        unsupported: 'Ignore me',
      },
    });

    expect(
      (
        settings as {
          liveArtifactsSystemPrompts?: Record<string, string>;
        }
      ).liveArtifactsSystemPrompts,
    ).toEqual({
      inline: 'Inline custom prompt',
    });
  });

  it('defaults Live Artifacts built-in prompt mode to inline', () => {
    const settings = sanitizeImportedAppSettings({});

    expect(settings.liveArtifactsPromptMode).toBe('inline');
  });

  it('preserves the graphite theme from imported settings', () => {
    const settings = sanitizeImportedAppSettings({
      themeId: 'graphite',
    });

    expect(settings.themeId).toBe('graphite');
  });

  it('falls back to inline when importing retired Live Artifacts prompt modes', () => {
    const fullSettings = sanitizeImportedAppSettings({
      liveArtifactsPromptMode: 'full',
    });
    const fullHtmlSettings = sanitizeImportedAppSettings({
      liveArtifactsPromptMode: 'fullHtml',
    });

    expect(fullSettings.liveArtifactsPromptMode).toBe('inline');
    expect(fullHtmlSettings.liveArtifactsPromptMode).toBe('inline');
  });

  it('preserves valid Live Artifacts custom font size settings from imported settings', () => {
    const settings = sanitizeImportedAppSettings({
      liveArtifactsCustomFontSize: 22,
    });

    expect(settings.liveArtifactsCustomFontSize).toBe(22);
  });

  it('falls back for invalid Live Artifacts custom font size settings', () => {
    const settings = sanitizeImportedAppSettings({
      liveArtifactsCustomFontSize: 99,
    });

    expect(settings.liveArtifactsCustomFontSize).toBe(16);
  });

  it('preserves valid MCP server settings from imported settings', () => {
    const settings = sanitizeImportedAppSettings({
      mcpServers: [
        {
          id: 'filesystem',
          name: 'Filesystem',
          enabled: true,
          transport: 'stdio',
          command: 'npx',
          args: ['-y', '@modelcontextprotocol/server-filesystem', '/tmp'],
          env: {
            DEBUG: 'mcp:*',
          },
        },
        {
          id: 'remote-search',
          name: 'Remote Search',
          enabled: false,
          transport: 'http',
          url: 'https://mcp.example.com/mcp',
          headers: {
            authorization: 'Bearer token',
          },
          auth: {
            type: 'bearer',
            token: 'remote-token',
          },
        },
        {
          id: 'legacy-sse',
          name: 'Legacy SSE',
          enabled: true,
          transport: 'sse',
          url: 'https://mcp.example.com/sse',
        },
      ],
    });

    expect(settings.mcpServers).toEqual([
      {
        id: 'filesystem',
        name: 'Filesystem',
        enabled: true,
        transport: 'stdio',
        command: 'npx',
        args: ['-y', '@modelcontextprotocol/server-filesystem', '/tmp'],
        env: {
          DEBUG: 'mcp:*',
        },
      },
      {
        id: 'remote-search',
        name: 'Remote Search',
        enabled: false,
        transport: 'http',
        url: 'https://mcp.example.com/mcp',
        headers: {
          authorization: 'Bearer token',
        },
        auth: {
          type: 'bearer',
          token: 'remote-token',
        },
      },
      {
        id: 'legacy-sse',
        name: 'Legacy SSE',
        enabled: true,
        transport: 'sse',
        url: 'https://mcp.example.com/sse',
      },
    ]);
  });

  it('preserves MCP timeout and longRunning fields', () => {
    const settings = sanitizeImportedAppSettings({
      mcpServers: [
        {
          id: 'long-task',
          name: 'Long Task',
          enabled: true,
          transport: 'http',
          url: 'https://mcp.example.com/mcp',
          timeout: 300,
          longRunning: true,
        },
        {
          id: 'bad-timeout',
          name: 'Bad Timeout',
          enabled: true,
          transport: 'http',
          url: 'https://mcp.example.com/mcp',
          timeout: '120',
          longRunning: 'yes',
        },
      ],
    });

    expect(settings.mcpServers[0].timeout).toBe(300);
    expect(settings.mcpServers[0].longRunning).toBe(true);
    expect(settings.mcpServers[1].timeout).toBeUndefined();
    expect(settings.mcpServers[1].longRunning).toBeUndefined();
  });

  it('drops identity-invalid MCP entries but keeps incomplete in-progress configs', () => {
    const settings = sanitizeImportedAppSettings({
      mcpServers: [
        {
          id: 'valid',
          name: 'Valid',
          enabled: true,
          transport: 'stdio',
          command: 'node',
          args: ['server.js', 42],
          env: {
            KEEP: 'yes',
            DROP: 1,
          },
        },
        {
          id: '',
          name: 'Missing ID',
          enabled: true,
          transport: 'stdio',
          command: 'node',
        },
        {
          id: 'unsupported',
          name: 'Unsupported',
          enabled: true,
          transport: 'websocket',
        },
        {
          id: 'file-url',
          name: 'File URL',
          enabled: true,
          transport: 'http',
          url: 'file:///tmp/mcp',
        },
        {
          id: 'no-command',
          name: 'No Command Yet',
          enabled: true,
          transport: 'stdio',
          command: '',
        },
      ],
    });

    expect(settings.mcpServers).toEqual([
      {
        id: 'valid',
        name: 'Valid',
        enabled: true,
        transport: 'stdio',
        command: 'node',
        args: ['server.js'],
        env: {
          KEEP: 'yes',
        },
      },
      {
        id: 'file-url',
        name: 'File URL',
        enabled: true,
        transport: 'http',
        url: 'file:///tmp/mcp',
      },
      {
        id: 'no-command',
        name: 'No Command Yet',
        enabled: true,
        transport: 'stdio',
        command: '',
      },
    ]);
  });

  it('defaults a missing isLoggingEnabled field to false', () => {
    const settings = sanitizeImportedAppSettings({});

    expect(settings.isLoggingEnabled).toBe(false);
  });

  it('preserves an explicit isLoggingEnabled true from imported settings', () => {
    const settings = sanitizeImportedAppSettings({ isLoggingEnabled: true });

    expect(settings.isLoggingEnabled).toBe(true);
  });

  it('migrates the legacy autoFullscreenHtml key to autoOpenHtmlPreview', () => {
    const settings = sanitizeImportedAppSettings({ autoFullscreenHtml: true });

    expect(settings.autoOpenHtmlPreview).toBe(true);
    expect((settings as { autoFullscreenHtml?: boolean }).autoFullscreenHtml).toBeUndefined();
  });

  it('defaults a migrated legacy autoFullscreenHtml false to false', () => {
    const settings = sanitizeImportedAppSettings({ autoFullscreenHtml: false });

    expect(settings.autoOpenHtmlPreview).toBe(false);
  });

  it('keeps an explicit autoOpenHtmlPreview when a legacy key is also present', () => {
    const settings = sanitizeImportedAppSettings({ autoFullscreenHtml: true, autoOpenHtmlPreview: false });

    expect(settings.autoOpenHtmlPreview).toBe(false);
  });
});
