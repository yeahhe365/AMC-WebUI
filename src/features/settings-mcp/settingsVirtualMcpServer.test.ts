import { describe, expect, it, beforeEach } from 'vitest';
import {
  createSettingsVirtualMcpServer,
  initSettingsVirtualMcpServer,
  sanitizeSettingsForExposure,
  SETTINGS_VIRTUAL_MCP_ID,
} from './settingsVirtualMcpServer';
import { useSettingsStore } from '@/stores/settingsStore';
import { useChatStore } from '@/stores/chatStore';
import { resetAllStoreState, setupStoreStateReset } from '@/test/stores/reset';
import { getVirtualMcpServers } from '@/features/mcp/virtualMcpRegistry';
import { DEFAULT_APP_SETTINGS } from '@/constants/settingsDefaults';
import type { SavedChatSession } from '@/types';

describe('settingsVirtualMcpServer', () => {
  setupStoreStateReset();

  beforeEach(() => {
    resetAllStoreState();
  });

  const callTool = async (
    server: ReturnType<typeof createSettingsVirtualMcpServer>,
    toolName: string,
    args: Record<string, unknown>,
  ) => {
    return (await server.callTool(toolName, args)) as {
      content: Array<{ type: string; text: string }>;
      structuredContent: Record<string, any>;
    };
  };

  describe('sanitizeSettingsForExposure', () => {
    it('strips all sensitive keys like API keys, tokens, secrets, proxy and thirdPartyApi', () => {
      const sensitiveInput = {
        themeId: 'onyx',
        apiKey: 'secret-gemini-key',
        custom_api_key: 'custom-key',
        bearerToken: 'my-token',
        clientSecret: 'secret-123',
        accountPassword: 'password-abc',
        customHeaders: { Authorization: 'Bearer xxx' },
        thirdPartyApi: { enabled: true, connections: [] },
        apiProxyUrl: 'https://proxy.example.com',
        useApiProxy: true,
        temperature: 0.7,
      };

      const sanitized = sanitizeSettingsForExposure(sensitiveInput);

      expect(sanitized).toEqual({
        themeId: 'onyx',
        temperature: 0.7,
      });
      expect(sanitized.apiKey).toBeUndefined();
      expect(sanitized.custom_api_key).toBeUndefined();
      expect(sanitized.bearerToken).toBeUndefined();
      expect(sanitized.clientSecret).toBeUndefined();
      expect(sanitized.accountPassword).toBeUndefined();
      expect(sanitized.customHeaders).toBeUndefined();
      expect(sanitized.thirdPartyApi).toBeUndefined();
      expect(sanitized.apiProxyUrl).toBeUndefined();
      expect(sanitized.useApiProxy).toBeUndefined();
    });
  });

  describe('server definition & tools declaration', () => {
    it('defines the correct id, name, and disabledAutoApproveTools', async () => {
      const server = createSettingsVirtualMcpServer();
      expect(server.id).toBe(SETTINGS_VIRTUAL_MCP_ID);
      expect(server.name).toBe('AMC Settings Manager');
      expect(server.disabledAutoApproveTools).toContain('reset_settings');
      expect(server.disabledAutoApproveTools).toContain('delete_mcp_server');

      const tools = await server.listTools();
      const toolNames = tools.map((t) => t.name);

      expect(toolNames).toEqual([
        'get_settings',
        'list_options',
        'update_appearance_settings',
        'update_generation_settings',
        'update_language_voice_settings',
        'list_mcp_servers',
        'add_mcp_server',
        'update_mcp_server',
        'delete_mcp_server',
        'toggle_mcp_server',
        'import_mcp_config',
        'test_mcp_server',
        'reset_settings',
      ]);
    });
  });

  describe('tool: get_settings', () => {
    it('returns sanitized global and session settings when scope is both', async () => {
      useSettingsStore.setState({
        appSettings: {
          ...DEFAULT_APP_SETTINGS,
          apiKey: 'confidential-gemini-key',
          themeId: 'onyx',
          temperature: 0.85,
        },
      });

      const activeSession: SavedChatSession = {
        id: 'session-test-1',
        title: 'Test Session',
        timestamp: 1000,
        messages: [],
        settings: {
          ...DEFAULT_APP_SETTINGS,
          temperature: 0.2,
          lockedApiKey: 'confidential-session-key',
        },
      };

      useChatStore.setState({
        activeSessionId: activeSession.id,
        savedSessions: [activeSession],
      });

      const server = createSettingsVirtualMcpServer();
      const response = await callTool(server, 'get_settings', { scope: 'both', domain: 'all' });
      const structured = response.structuredContent;

      expect(structured.global).toBeDefined();
      expect(structured.global.themeId).toBe('onyx');
      expect(structured.global.temperature).toBe(0.85);
      expect(structured.global.apiKey).toBeUndefined();

      expect(structured.session).toBeDefined();
      expect(structured.session.activeSessionId).toBe('session-test-1');
      expect(structured.session.settings.temperature).toBe(0.2);
      expect(structured.session.settings.lockedApiKey).toBeUndefined();
    });

    it('filters settings by domain', async () => {
      useSettingsStore.setState({
        appSettings: {
          ...DEFAULT_APP_SETTINGS,
          themeId: 'pearl',
          baseFontSize: 18,
          temperature: 0.9,
          language: 'ja',
        },
      });

      const server = createSettingsVirtualMcpServer();

      // Appearance domain
      const appearanceRes = await callTool(server, 'get_settings', { scope: 'global', domain: 'appearance' });
      const appearanceData = appearanceRes.structuredContent.global;
      expect(appearanceData.themeId).toBe('pearl');
      expect(appearanceData.baseFontSize).toBe(18);
      expect(appearanceData.temperature).toBeUndefined();
      expect(appearanceData.language).toBeUndefined();

      // Generation domain
      const genRes = await callTool(server, 'get_settings', { scope: 'global', domain: 'generation' });
      const genData = genRes.structuredContent.global;
      expect(genData.temperature).toBe(0.9);
      expect(genData.themeId).toBeUndefined();

      // Language & voice domain
      const langRes = await callTool(server, 'get_settings', { scope: 'global', domain: 'language_voice' });
      const langData = langRes.structuredContent.global;
      expect(langData.language).toBe('ja');
      expect(langData.themeId).toBeUndefined();
    });
  });

  describe('tool: list_options', () => {
    it('lists available themes', async () => {
      const server = createSettingsVirtualMcpServer();
      const res = await callTool(server, 'list_options', { category: 'themes' });
      const content = res.structuredContent;

      expect(content.allThemeIds).toContain('onyx');
      expect(content.allThemeIds).toContain('system');
      expect(content.availableThemes.some((t: { id: string }) => t.id === 'onyx')).toBe(true);
    });

    it('lists supported languages', async () => {
      const server = createSettingsVirtualMcpServer();
      const res = await callTool(server, 'list_options', { category: 'languages' });
      const content = res.structuredContent;

      expect(content.supportedLanguages.some((l: { id: string }) => l.id === 'zh')).toBe(true);
      expect(content.supportedLanguages.some((l: { id: string }) => l.id === 'en')).toBe(true);
    });

    it('lists tts voices, thinking levels, media resolutions, and translation languages', async () => {
      const server = createSettingsVirtualMcpServer();

      const voicesRes = await callTool(server, 'list_options', { category: 'tts_voices' });
      expect(voicesRes.structuredContent.availableVoices.some((v: { id: string }) => v.id === 'Puck')).toBe(true);

      const thinkingRes = await callTool(server, 'list_options', { category: 'thinking_levels' });
      expect(thinkingRes.structuredContent.availableThinkingLevels).toContain('HIGH');

      const mediaRes = await callTool(server, 'list_options', { category: 'media_resolutions' });
      expect(mediaRes.structuredContent.availableMediaResolutions.length).toBeGreaterThan(0);

      const transRes = await callTool(server, 'list_options', { category: 'translation_languages' });
      expect(transRes.structuredContent.availableTranslationLanguages).toContain('French');
    });

    it('throws on unknown category', async () => {
      const server = createSettingsVirtualMcpServer();
      await expect(callTool(server, 'list_options', { category: 'invalid_cat' })).rejects.toThrow(
        'Unknown option category: invalid_cat',
      );
    });
  });

  describe('tool: update_appearance_settings', () => {
    it('updates themeId and clamps baseFontSize', async () => {
      const server = createSettingsVirtualMcpServer();

      const res = await callTool(server, 'update_appearance_settings', {
        themeId: 'graphite',
        baseFontSize: 30, // Should clamp to 20
        expandCodeBlocksByDefault: true,
      });

      const structured = res.structuredContent;
      expect(structured.status).toBe('updated');
      expect(structured.updated.themeId).toBe('graphite');
      expect(structured.updated.baseFontSize).toBe(20);
      expect(structured.updated.expandCodeBlocksByDefault).toBe(true);

      const current = useSettingsStore.getState().appSettings;
      expect(current.themeId).toBe('graphite');
      expect(current.baseFontSize).toBe(20);
      expect(current.expandCodeBlocksByDefault).toBe(true);
    });

    it('throws on invalid themeId', async () => {
      const server = createSettingsVirtualMcpServer();
      await expect(
        callTool(server, 'update_appearance_settings', {
          themeId: 'neon-glow-invalid',
        }),
      ).rejects.toThrow('Invalid themeId');
    });

    it('returns no-op when no relevant arguments provided', async () => {
      const server = createSettingsVirtualMcpServer();
      const res = await callTool(server, 'update_appearance_settings', {});
      expect(res.structuredContent.status).toBe('no-op');
    });
  });

  describe('tool: update_generation_settings', () => {
    it('updates global generation settings when scope is global', async () => {
      const server = createSettingsVirtualMcpServer();

      const res = await callTool(server, 'update_generation_settings', {
        scope: 'global',
        modelId: 'gemini-2.5-flash',
        temperature: 1.5,
        topP: 0.9,
        topK: 40,
        showThoughts: true,
        thinkingBudget: 2048,
        thinkingLevel: 'medium', // will normalize to MEDIUM
        isGoogleSearchEnabled: true,
        isStreamingEnabled: false,
      });

      const structured = res.structuredContent;
      expect(structured.status).toBe('updated');
      expect(structured.scope).toBe('global');

      const current = useSettingsStore.getState().appSettings;
      expect(current.modelId).toBe('gemini-2.5-flash');
      expect(current.temperature).toBe(1.5);
      expect(current.topP).toBe(0.9);
      expect(current.topK).toBe(40);
      expect(current.showThoughts).toBe(true);
      expect(current.thinkingBudget).toBe(2048);
      expect(current.thinkingLevel).toBe('MEDIUM');
      expect(current.isGoogleSearchEnabled).toBe(true);
      expect(current.isStreamingEnabled).toBe(false);
    });

    it('updates session generation settings when scope is session', async () => {
      const session: SavedChatSession = {
        id: 'session-abc',
        title: 'Active Session',
        timestamp: 1000,
        messages: [],
        settings: {
          ...DEFAULT_APP_SETTINGS,
          temperature: 0.5,
        },
      };

      useChatStore.setState({
        activeSessionId: session.id,
        savedSessions: [session],
      });

      const server = createSettingsVirtualMcpServer();

      const res = await callTool(server, 'update_generation_settings', {
        scope: 'session',
        temperature: 0.1,
        systemInstruction: 'You are an expert pair programmer.',
      });

      const structured = res.structuredContent;
      expect(structured.status).toBe('updated');
      expect(structured.scope).toBe('session');
      expect(structured.activeSessionId).toBe('session-abc');

      const activeSessionUpdated = useChatStore.getState().savedSessions.find((s) => s.id === 'session-abc');
      expect(activeSessionUpdated?.settings?.temperature).toBe(0.1);
      expect(activeSessionUpdated?.settings?.systemInstruction).toBe('You are an expert pair programmer.');
    });

    it('returns no-op when no relevant arguments provided', async () => {
      const server = createSettingsVirtualMcpServer();
      const res = await callTool(server, 'update_generation_settings', { scope: 'global' });
      expect(res.structuredContent.status).toBe('no-op');
    });
  });

  describe('tool: update_language_voice_settings', () => {
    it('updates language, ttsVoice, and translationTargetLanguage', async () => {
      const server = createSettingsVirtualMcpServer();

      const res = await callTool(server, 'update_language_voice_settings', {
        language: 'zh',
        ttsVoice: 'zephyr', // should match case-insensitively to Zephyr
        translationTargetLanguage: 'French',
        isAudioCompressionEnabled: false,
      });

      const structured = res.structuredContent;
      expect(structured.status).toBe('updated');
      expect(structured.updated.language).toBe('zh');
      expect(structured.updated.ttsVoice).toBe('Zephyr');
      expect(structured.updated.translationTargetLanguage).toBe('French');
      expect(structured.updated.isAudioCompressionEnabled).toBe(false);

      const current = useSettingsStore.getState().appSettings;
      expect(current.language).toBe('zh');
      expect(current.ttsVoice).toBe('Zephyr');
      expect(current.translationTargetLanguage).toBe('French');
      expect(current.isAudioCompressionEnabled).toBe(false);
    });

    it('throws on invalid language', async () => {
      const server = createSettingsVirtualMcpServer();
      await expect(
        callTool(server, 'update_language_voice_settings', {
          language: 'non-existent-lang',
        }),
      ).rejects.toThrow('Invalid language: non-existent-lang');
    });

    it('throws on invalid ttsVoice', async () => {
      const server = createSettingsVirtualMcpServer();
      await expect(
        callTool(server, 'update_language_voice_settings', {
          ttsVoice: 'invalid-robot-voice',
        }),
      ).rejects.toThrow('Invalid ttsVoice: invalid-robot-voice');
    });

    it('throws on invalid translationTargetLanguage', async () => {
      const server = createSettingsVirtualMcpServer();
      await expect(
        callTool(server, 'update_language_voice_settings', {
          translationTargetLanguage: 'Klingon',
        }),
      ).rejects.toThrow('Invalid translationTargetLanguage: Klingon');
    });
  });

  describe('tool: reset_settings', () => {
    it('resets appearance settings to default values', async () => {
      useSettingsStore.setState({
        appSettings: {
          ...DEFAULT_APP_SETTINGS,
          themeId: 'onyx',
          baseFontSize: 19,
          temperature: 1.8, // should remain untouched
        },
      });

      const server = createSettingsVirtualMcpServer();
      const res = await callTool(server, 'reset_settings', { domain: 'appearance' });

      const structured = res.structuredContent;
      expect(structured.status).toBe('reset');
      expect(structured.domain).toBe('appearance');

      const current = useSettingsStore.getState().appSettings;
      expect(current.themeId).toBe(DEFAULT_APP_SETTINGS.themeId);
      expect(current.baseFontSize).toBe(DEFAULT_APP_SETTINGS.baseFontSize);
      expect(current.temperature).toBe(1.8);
    });

    it('resets generation settings to default values', async () => {
      useSettingsStore.setState({
        appSettings: {
          ...DEFAULT_APP_SETTINGS,
          themeId: 'pearl', // should remain untouched
          temperature: 1.9,
          topP: 0.2,
        },
      });

      const server = createSettingsVirtualMcpServer();
      const res = await callTool(server, 'reset_settings', { domain: 'generation' });

      const structured = res.structuredContent;
      expect(structured.status).toBe('reset');
      expect(structured.domain).toBe('generation');

      const current = useSettingsStore.getState().appSettings;
      expect(current.themeId).toBe('pearl');
      expect(current.temperature).toBe(DEFAULT_APP_SETTINGS.temperature);
      expect(current.topP).toBe(DEFAULT_APP_SETTINGS.topP);
    });
  });

  describe('MCP management tools', () => {
    it('returns sanitized MCP server information via get_settings with domain: mcp', async () => {
      useSettingsStore.setState({
        appSettings: {
          ...DEFAULT_APP_SETTINGS,
          mcpServers: [
            {
              id: 'srv-1',
              name: 'Remote MCP',
              transport: 'http',
              url: 'https://mcp.test.com',
              enabled: true,
              auth: { type: 'bearer', token: 'secret-token-12345' },
              headers: { Authorization: 'Bearer xxx' },
            },
          ],
        },
      });

      const server = createSettingsVirtualMcpServer();
      const res = await callTool(server, 'get_settings', { domain: 'mcp', scope: 'global' });
      const mcpData = res.structuredContent.global;

      expect(mcpData.externalServers).toHaveLength(1);
      expect(mcpData.externalServers[0].name).toBe('Remote MCP');
      expect(mcpData.externalServers[0].hasAuth).toBe(true);
      expect(mcpData.externalServers[0].maskedToken).toBe('sec****345');
      expect(mcpData.externalServers[0].headerNames).toEqual(['Authorization']);
      expect(mcpData.virtualServers.length).toBeGreaterThanOrEqual(0);
    });

    it('lists mcp_transports via list_options', async () => {
      const server = createSettingsVirtualMcpServer();
      const res = await callTool(server, 'list_options', { category: 'mcp_transports' });
      expect(res.structuredContent.availableTransports).toEqual(['http', 'sse', 'stdio']);
    });

    it('lists external and virtual MCP servers with list_mcp_servers', async () => {
      useSettingsStore.setState({
        appSettings: {
          ...DEFAULT_APP_SETTINGS,
          mcpServers: [
            { id: 'ext-1', name: 'External 1', transport: 'http', url: 'https://ext.com', enabled: true },
            { id: 'ext-2', name: 'External 2', transport: 'stdio', command: 'node', enabled: false },
          ],
        },
      });

      const server = createSettingsVirtualMcpServer();
      const res = await callTool(server, 'list_mcp_servers', { filter: 'enabled' });
      const structured = res.structuredContent;

      expect(structured.totalExternalCount).toBe(2);
      expect(structured.externalServers).toHaveLength(1);
      expect(structured.externalServers[0].id).toBe('ext-1');
    });

    it('adds a new external MCP server with add_mcp_server', async () => {
      const server = createSettingsVirtualMcpServer();
      const res = await callTool(server, 'add_mcp_server', {
        name: 'GitHub Tools',
        transport: 'http',
        url: 'https://github-mcp.test.com/api',
        bearerToken: 'ghp_secretTokenHere123',
        timeout: 45,
      });

      expect(res.structuredContent.status).toBe('created');
      expect(res.structuredContent.server.name).toBe('GitHub Tools');
      expect(res.structuredContent.server.hasAuth).toBe(true);
      expect(res.structuredContent.server.maskedToken).toBe('ghp****123');

      const saved = useSettingsStore.getState().appSettings.mcpServers;
      expect(saved.some((s) => s.name === 'GitHub Tools')).toBe(true);
    });

    it('updates an existing MCP server with update_mcp_server', async () => {
      useSettingsStore.setState({
        appSettings: {
          ...DEFAULT_APP_SETTINGS,
          mcpServers: [{ id: 'srv-up', name: 'Old Name', transport: 'http', url: 'https://old.com', enabled: true }],
        },
      });

      const server = createSettingsVirtualMcpServer();
      const res = await callTool(server, 'update_mcp_server', {
        id: 'srv-up',
        name: 'New Updated Name',
        url: 'https://new.com',
        enabled: false,
      });

      expect(res.structuredContent.status).toBe('updated');
      expect(res.structuredContent.server.name).toBe('New Updated Name');
      expect(res.structuredContent.server.enabled).toBe(false);

      const saved = useSettingsStore.getState().appSettings.mcpServers;
      const target = saved.find((s) => s.id === 'srv-up');
      expect(target?.name).toBe('New Updated Name');
      expect(target?.url).toBe('https://new.com');
      expect(target?.enabled).toBe(false);
    });

    it('deletes an external MCP server with delete_mcp_server', async () => {
      useSettingsStore.setState({
        appSettings: {
          ...DEFAULT_APP_SETTINGS,
          mcpServers: [{ id: 'srv-del', name: 'Delete Me', transport: 'stdio', command: 'echo', enabled: true }],
        },
      });

      const server = createSettingsVirtualMcpServer();
      const res = await callTool(server, 'delete_mcp_server', { id: 'srv-del' });

      expect(res.structuredContent.status).toBe('deleted');
      expect(res.structuredContent.id).toBe('srv-del');

      const saved = useSettingsStore.getState().appSettings.mcpServers;
      expect(saved.some((s) => s.id === 'srv-del')).toBe(false);
    });

    it('toggles an external or virtual MCP server with toggle_mcp_server', async () => {
      useSettingsStore.setState({
        appSettings: {
          ...DEFAULT_APP_SETTINGS,
          mcpServers: [
            { id: 'srv-toggle', name: 'Toggle Target', transport: 'http', url: 'https://tog.com', enabled: true },
          ],
        },
      });

      const server = createSettingsVirtualMcpServer();
      const res1 = await callTool(server, 'toggle_mcp_server', { id: 'srv-toggle' });
      expect(res1.structuredContent.enabled).toBe(false);

      const res2 = await callTool(server, 'toggle_mcp_server', { id: 'srv-toggle', enabled: true });
      expect(res2.structuredContent.enabled).toBe(true);
    });

    it('imports MCP servers from JSON with import_mcp_config', async () => {
      const server = createSettingsVirtualMcpServer();
      const sampleJson = JSON.stringify({
        mcpServers: {
          braveSearch: {
            command: 'npx',
            args: ['-y', '@modelcontextprotocol/server-brave-search'],
            env: { BRAVE_API_KEY: 'test-key' },
          },
        },
      });

      const res = await callTool(server, 'import_mcp_config', { jsonContent: sampleJson });
      expect(res.structuredContent.status).toBe('imported');
      expect(res.structuredContent.importedCount).toBe(1);

      const saved = useSettingsStore.getState().appSettings.mcpServers;
      expect(saved.some((s) => s.name === 'braveSearch')).toBe(true);
    });

    it('tests virtual MCP server connectivity with test_mcp_server', async () => {
      const server = createSettingsVirtualMcpServer();
      const res = await callTool(server, 'test_mcp_server', { id: SETTINGS_VIRTUAL_MCP_ID });

      expect(res.structuredContent.status).toBe('connected');
      expect(res.structuredContent.isVirtual).toBe(true);
      expect(res.structuredContent.toolsCount).toBeGreaterThan(0);
    });
  });

  describe('initSettingsVirtualMcpServer', () => {
    it('registers server into virtualMcpRegistry and allows unregistering', () => {
      const unregister = initSettingsVirtualMcpServer();
      const servers = getVirtualMcpServers();
      const registered = servers.find((s) => s.id === SETTINGS_VIRTUAL_MCP_ID);

      expect(registered).toBeDefined();
      expect(registered?.name).toBe('AMC Settings Manager');

      unregister();
      const serversAfter = getVirtualMcpServers();
      expect(serversAfter.some((s) => s.id === SETTINGS_VIRTUAL_MCP_ID)).toBe(false);
    });
  });
});
