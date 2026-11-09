import { describe, expect, it } from 'vitest';
import { sanitizeImportedAppSettings } from './appSettingsSchema';
import { createAppSettings } from '@/test/data/factories';
import { redactExportedAppSettings, restoreRedactedSecrets } from '@/utils/secretRedaction';

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

  it('preserves an explicit showVoiceInputButton from imported settings', () => {
    const settings = sanitizeImportedAppSettings({ showVoiceInputButton: true });

    expect(settings.showVoiceInputButton).toBe(true);
  });

  it('defaults a missing showVoiceInputButton to false', () => {
    const settings = sanitizeImportedAppSettings({});

    expect(settings.showVoiceInputButton).toBe(false);
  });

  it('preserves an explicit readingFontFamily from imported settings', () => {
    const settings = sanitizeImportedAppSettings({ readingFontFamily: 'serif' });

    expect(settings.readingFontFamily).toBe('serif');
  });

  it('defaults a missing or invalid readingFontFamily to sans', () => {
    const defaultSettings = sanitizeImportedAppSettings({});
    const invalidSettings = sanitizeImportedAppSettings({ readingFontFamily: 'unknown-font' });

    expect(defaultSettings.readingFontFamily).toBe('sans');
    expect(invalidSettings.readingFontFamily).toBe('sans');
  });
  // P0-6:这 15 个字段此前不在 schema 里，zod 会把它们当未知键剥掉，
  // 而导入后是整体替换 settings —— 用户导出再导入，功能就被静默重置了。
  describe('MCP approval fields', () => {
    const serveWith = (extra: Record<string, unknown>) =>
      sanitizeImportedAppSettings({
        mcpServers: [
          { id: 's1', name: 'S1', enabled: true, transport: 'http', url: 'https://x.example.com', ...extra },
        ],
      }).mcpServers[0];

    it('keeps an allowlist on import', () => {
      // Approval is the default now, so losing this field on import would
      // silently re-gate every tool the user had explicitly allowed.
      expect(serveWith({ autoApproveTools: ['safe_tool'] }).autoApproveTools).toEqual(['safe_tool']);
    });

    it('keeps the legacy deny-list alongside it', () => {
      const server = serveWith({
        autoApproveTools: ['safe_tool'],
        disabledAutoApproveTools: ['dangerous_tool'],
      });
      expect(server.autoApproveTools).toEqual(['safe_tool']);
      expect(server.disabledAutoApproveTools).toEqual(['dangerous_tool']);
    });

    it('drops non-string entries instead of trusting them', () => {
      expect(serveWith({ autoApproveTools: ['safe_tool', 42] }).autoApproveTools).toEqual(['safe_tool']);
    });
  });

  describe('fields that export→import used to drop (P0-6)', () => {
    const preserved = {
      isPdfNavEnabled: true,
      isVideoNavEnabled: true,
      isAudioNavEnabled: true,
      isImageNavEnabled: true,
      isLiveArtifactsEnabled: true,
      isVisualFormattingActive: true,
      visionPromptMode: 'hdGuide' as const,
      taskSuggestionMode: 'ocr' as const,
      transcriptionLanguage: 'ja',
      transcriptionWordTimestamps: true,
      transcriptionSmartMode: true,
      transcriptionOutputSubtitles: true,
      transcriptionSpeakerLabels: true,
      transcriptionCustomVocabulary: 'AMC, WebUI',
      transcriptionSystemInstruction: 'Keep speaker labels in Japanese.',
    };

    it('keeps every one of them on import', () => {
      const settings = sanitizeImportedAppSettings({ ...preserved });

      expect(settings).toMatchObject(preserved);
    });

    it('survives a full export → import round trip together with redacted credentials', () => {
      const exported = redactExportedAppSettings(createAppSettings({ ...preserved, apiKey: 'gemini-key' }));
      const imported = sanitizeImportedAppSettings(JSON.parse(JSON.stringify(exported)));
      const restored = restoreRedactedSecrets(imported, createAppSettings({ apiKey: 'local-key' }));

      expect(restored).toMatchObject(preserved);
      expect(restored.apiKey).toBe('local-key');
    });

    it('falls back to defaults when an older export does not carry them', () => {
      const settings = sanitizeImportedAppSettings({});

      // 有默认值的按默认值补齐（此前是 undefined，等价于"功能被关掉"）。
      expect(settings.isPdfNavEnabled).toBe(false);
      expect(settings.visionPromptMode).toBeNull();
      expect(settings.taskSuggestionMode).toBeNull();
      expect(settings.transcriptionLanguage).toBe('');
      // 唯一没有默认值的那个：保持 undefined，不要用空串盖掉用户已填的提示词。
      expect(settings.transcriptionSystemInstruction).toBeUndefined();
    });

    it('rejects an unknown task suggestion mode instead of importing it', () => {
      const settings = sanitizeImportedAppSettings({ taskSuggestionMode: 'not-a-mode' });

      expect(settings.taskSuggestionMode).toBeNull();
    });
  });
});
