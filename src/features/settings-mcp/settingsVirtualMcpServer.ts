import {
  findVirtualMcpServer,
  getVirtualMcpServers,
  registerVirtualMcpServer,
  type VirtualMcpServer,
} from '@/features/mcp/virtualMcpRegistry';
import { dedupeServersById, parseImportJson } from '@/features/mcp/importMcpServers';
import { fetchMcpServerCapabilities, type McpToolDefinition } from '@/services/api/mcpApi';
import { useSettingsStore } from '@/stores/settingsStore';
import { useChatStore } from '@/stores/chatStore';
import { useVirtualMcpStore } from '@/stores/virtualMcpStore';
import { DEFAULT_APP_SETTINGS } from '@/constants/settingsDefaults';
import { THEME_IDS, isKnownThemeId } from '@/utils/themeMode';
import { AVAILABLE_THEMES } from '@/constants/themeRegistry';
import { AVAILABLE_TTS_VOICES } from '@/constants/voiceOptions';
import { APP_LANGUAGE_IDS, LANGUAGE_META, type AppLanguage } from '@/i18n/languageRegistry';
import { getErrorMessage } from '@/utils/errorMessage';
import {
  MediaResolution,
  THINKING_LEVELS,
  TRANSLATION_TARGET_LANGUAGES,
  type AppSettings,
  type ChatSettings,
  type ThinkingLevel,
} from '@/types';
import { isRecord } from '../../../shared/predicates';
import { toMcpServerSummary, toVirtualMcpServerSummary } from './mcpRedaction';
import { applyMcpServerUpdate, validateAndBuildNewServer } from './mcpPatch';

export const SETTINGS_VIRTUAL_MCP_ID = 'amc_settings_manager';

const SENSITIVE_KEY_PATTERNS = [
  /api[_-]?key/i,
  /token/i,
  /secret/i,
  /password/i,
  /headers/i,
  /thirdPartyApi/i,
  /proxy/i,
  /^mcpServers$/i,
];

function isSensitiveKey(key: string): boolean {
  return SENSITIVE_KEY_PATTERNS.some((pattern) => pattern.test(key));
}

export function sanitizeSettingsForExposure(record: object): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(record)) {
    if (isSensitiveKey(key)) continue;
    result[key] = val;
  }
  return result;
}

const SETTINGS_TOOLS: McpToolDefinition[] = [
  {
    name: 'get_settings',
    description:
      'Read current application settings and/or active session settings. Sensitive credentials (API keys, auth headers, raw tokens) are always omitted.',
    inputSchema: {
      type: 'object',
      properties: {
        scope: {
          type: 'string',
          enum: ['global', 'session', 'both'],
          description:
            "Whether to read global app defaults ('global'), active chat session settings ('session'), or both ('both'). Defaults to 'both'.",
        },
        domain: {
          type: 'string',
          enum: ['all', 'appearance', 'generation', 'language_voice', 'mcp'],
          description: "Category of settings to return. Defaults to 'all'.",
        },
      },
    },
  },
  {
    name: 'list_options',
    description:
      'List available, valid values for system configuration options (themes, languages, TTS voices, thinking levels, media resolutions, mcp transports).',
    inputSchema: {
      type: 'object',
      properties: {
        category: {
          type: 'string',
          enum: [
            'themes',
            'languages',
            'tts_voices',
            'thinking_levels',
            'media_resolutions',
            'translation_languages',
            'mcp_transports',
          ],
          description: 'Category of options to query.',
        },
      },
      required: ['category'],
    },
  },
  {
    name: 'update_appearance_settings',
    description:
      'Update UI appearance and interaction preferences (theme, font size, code block expansion, toggle buttons) in global settings.',
    inputSchema: {
      type: 'object',
      properties: {
        themeId: {
          type: 'string',
          description: "Theme ID ('system', 'onyx', 'graphite', 'pearl', 'sepia')",
        },
        baseFontSize: {
          type: 'integer',
          minimum: 12,
          maximum: 20,
          description: 'Base font size in pixels (integer between 12 and 20)',
        },
        expandCodeBlocksByDefault: {
          type: 'boolean',
          description: 'Whether code blocks in chat messages are automatically expanded',
        },
        showWelcomeSuggestions: {
          type: 'boolean',
          description: 'Whether to show prompt suggestions when starting a new chat',
        },
        showInputPasteButton: {
          type: 'boolean',
          description: 'Show paste button in input toolbar',
        },
        showInputClearButton: {
          type: 'boolean',
          description: 'Show clear button in input toolbar',
        },
        showVoiceInputButton: {
          type: 'boolean',
          description: 'Show voice recording button in input toolbar',
        },
        isPasteRichTextAsMarkdownEnabled: {
          type: 'boolean',
          description: 'Automatically convert rich text to markdown when pasting',
        },
      },
    },
  },
  {
    name: 'update_generation_settings',
    description:
      'Update model generation preferences like temperature, system instruction, thinking budget, and tools. Supports updating either global defaults or the currently active chat session.',
    inputSchema: {
      type: 'object',
      properties: {
        scope: {
          type: 'string',
          enum: ['global', 'session'],
          description:
            "Target scope: 'global' applies to app default settings; 'session' applies only to the currently active chat session. Defaults to 'global'.",
        },
        modelId: {
          type: 'string',
          description: 'Model ID to use for chat (e.g. gemini-3.8-flash, gemini-2.5-pro)',
        },
        temperature: {
          type: 'number',
          minimum: 0,
          maximum: 2,
          description: 'Sampling temperature between 0.0 and 2.0',
        },
        topP: {
          type: 'number',
          minimum: 0,
          maximum: 1,
          description: 'Top-P nucleus sampling between 0.0 and 1.0',
        },
        topK: {
          type: 'integer',
          minimum: 1,
          maximum: 100,
          description: 'Top-K sampling between 1 and 100',
        },
        showThoughts: {
          type: 'boolean',
          description: 'Whether to show reasoning / thought traces',
        },
        thinkingBudget: {
          type: 'integer',
          description: 'Thinking budget tokens (-1 for auto/unlimited, 0 for off, or budget count)',
        },
        thinkingLevel: {
          type: 'string',
          enum: [...THINKING_LEVELS],
          description: `Thinking level for supported models: ${THINKING_LEVELS.join(', ')}`,
        },
        systemInstruction: {
          type: 'string',
          description: 'System instruction / persona prompt',
        },
        isStreamingEnabled: {
          type: 'boolean',
          description: 'Whether typewriter streaming responses are enabled (global scope only)',
        },
        isGoogleSearchEnabled: {
          type: 'boolean',
          description: 'Whether Google Search grounding is enabled',
        },
        isCodeExecutionEnabled: {
          type: 'boolean',
          description: 'Whether code execution sandbox is enabled',
        },
        isUrlContextEnabled: {
          type: 'boolean',
          description: 'Whether URL context fetching is enabled',
        },
        isDeepSearchEnabled: {
          type: 'boolean',
          description: 'Whether Deep Search agentic reasoning is enabled',
        },
        isRawModeEnabled: {
          type: 'boolean',
          description: 'Whether raw reasoning mode is enabled',
        },
      },
    },
  },
  {
    name: 'update_language_voice_settings',
    description: 'Update interface language, TTS voice, and translation target language.',
    inputSchema: {
      type: 'object',
      properties: {
        language: {
          type: 'string',
          enum: ['system', 'en', 'zh', 'ja', 'ko', 'es', 'fr', 'de'],
          description: 'App interface language code',
        },
        ttsVoice: {
          type: 'string',
          description: 'TTS voice name (e.g. Zephyr, Puck, Charon, Kore, Fenrir, Aoede)',
        },
        translationTargetLanguage: {
          type: 'string',
          enum: [...TRANSLATION_TARGET_LANGUAGES],
          description: `Target language for quick translations: ${TRANSLATION_TARGET_LANGUAGES.join(', ')}`,
        },
        isAudioCompressionEnabled: {
          type: 'boolean',
          description: 'Whether to compress microphone audio before uploading',
        },
      },
    },
  },
  {
    name: 'list_mcp_servers',
    description:
      'List all configured external MCP servers and in-process virtual MCP servers. Returns IDs, names, transports, enabled states, and capability summaries. Sensitive credentials (tokens, header values) are automatically masked.',
    inputSchema: {
      type: 'object',
      properties: {
        filter: {
          type: 'string',
          enum: ['all', 'enabled', 'disabled', 'http', 'sse', 'stdio'],
          description: "Optional filter by status or transport. Defaults to 'all'.",
        },
        includeVirtual: {
          type: 'boolean',
          description: 'Whether to include in-process virtual MCP servers. Defaults to true.',
        },
      },
    },
  },
  {
    name: 'add_mcp_server',
    description:
      'Add a new external MCP server (HTTP, SSE, or local Stdio). Requires name and transport. Returns sanitized server summary.',
    inputSchema: {
      type: 'object',
      properties: {
        id: {
          type: 'string',
          description: 'Optional custom unique server ID. Auto-generated if omitted.',
        },
        name: {
          type: 'string',
          description: 'Display name for the MCP server.',
        },
        transport: {
          type: 'string',
          enum: ['http', 'sse', 'stdio'],
          description: "Transport protocol: 'http', 'sse', or 'stdio'.",
        },
        url: {
          type: 'string',
          description: 'Endpoint URL (required for http and sse transports).',
        },
        command: {
          type: 'string',
          description: 'Command executable (required for stdio transport, e.g. "npx", "python3").',
        },
        args: {
          type: 'array',
          items: { type: 'string' },
          description: 'Arguments array for stdio transport command.',
        },
        env: {
          type: 'object',
          description: 'Environment variables map for stdio transport.',
        },
        headers: {
          type: 'object',
          description: 'Custom HTTP headers map for http/sse transports.',
        },
        bearerToken: {
          type: 'string',
          description: 'Bearer token for authorization (http/sse transports).',
        },
        timeout: {
          type: 'integer',
          minimum: 1,
          maximum: 3600,
          description: 'Tool execution timeout in seconds (1 to 3600).',
        },
        longRunning: {
          type: 'boolean',
          description: 'Whether the server supports long-running tools with progress heartbeat.',
        },
        enabled: {
          type: 'boolean',
          description: 'Whether the server is enabled immediately. Defaults to true.',
        },
        isTrusted: {
          type: 'boolean',
          description: 'Whether this server is trusted to run tools.',
        },
      },
      required: ['name', 'transport'],
    },
  },
  {
    name: 'update_mcp_server',
    description: 'Update an existing external MCP server configuration by ID.',
    inputSchema: {
      type: 'object',
      properties: {
        id: {
          type: 'string',
          description: 'ID of the MCP server to update.',
        },
        name: {
          type: 'string',
          description: 'New display name.',
        },
        url: {
          type: 'string',
          description: 'New endpoint URL (for http/sse transports).',
        },
        command: {
          type: 'string',
          description: 'New command executable (for stdio transport).',
        },
        args: {
          type: 'array',
          items: { type: 'string' },
          description: 'New arguments array for stdio transport.',
        },
        env: {
          type: 'object',
          description: 'New environment variables map for stdio transport.',
        },
        headers: {
          type: 'object',
          description: 'New custom HTTP headers map.',
        },
        bearerToken: {
          type: 'string',
          description: 'New bearer token.',
        },
        timeout: {
          type: 'integer',
          minimum: 1,
          maximum: 3600,
          description: 'Tool execution timeout in seconds.',
        },
        longRunning: {
          type: 'boolean',
          description: 'Whether long-running progress heartbeat is enabled.',
        },
        enabled: {
          type: 'boolean',
          description: 'Enable or disable the server.',
        },
        isTrusted: {
          type: 'boolean',
          description: 'Trust or untrust this server.',
        },
      },
      required: ['id'],
    },
  },
  {
    name: 'delete_mcp_server',
    description: 'Delete an external MCP server by ID. Requires user confirmation.',
    inputSchema: {
      type: 'object',
      properties: {
        id: {
          type: 'string',
          description: 'ID of the external MCP server to delete.',
        },
      },
      required: ['id'],
    },
  },
  {
    name: 'toggle_mcp_server',
    description:
      'Enable or disable an MCP server. Supports both external servers and in-process virtual servers (like amc_local_python).',
    inputSchema: {
      type: 'object',
      properties: {
        id: {
          type: 'string',
          description: 'ID of the server to toggle.',
        },
        enabled: {
          type: 'boolean',
          description: 'Explicit enabled state. If omitted, flips the current state.',
        },
      },
      required: ['id'],
    },
  },
  {
    name: 'import_mcp_config',
    description:
      'Import MCP servers from a Claude Desktop or Cherry Studio formatted JSON configuration string ({ "mcpServers": { ... } }).',
    inputSchema: {
      type: 'object',
      properties: {
        jsonContent: {
          type: 'string',
          description: 'Raw JSON string containing MCP server definitions.',
        },
      },
      required: ['jsonContent'],
    },
  },
  {
    name: 'test_mcp_server',
    description: 'Test connectivity and fetch capabilities/tools of an MCP server (external or virtual) by ID.',
    inputSchema: {
      type: 'object',
      properties: {
        id: {
          type: 'string',
          description: 'ID of the MCP server to test.',
        },
      },
      required: ['id'],
    },
  },
  {
    name: 'reset_settings',
    description: 'Reset specific settings domains back to factory default values. Requires user confirmation.',
    inputSchema: {
      type: 'object',
      properties: {
        domain: {
          type: 'string',
          enum: ['appearance', 'generation', 'all'],
          description:
            "Domain to reset: 'appearance' resets theme & UI flags; 'generation' resets model parameters; 'all' resets both.",
        },
      },
      required: ['domain'],
    },
  },
];

const toMcpResponse = (data: unknown) => ({
  content: [{ type: 'text', text: typeof data === 'string' ? data : JSON.stringify(data, null, 2) }],
  structuredContent: data,
});

export const createSettingsVirtualMcpServer = (): VirtualMcpServer => {
  const selfServer: VirtualMcpServer = {
    id: SETTINGS_VIRTUAL_MCP_ID,
    name: 'AMC Settings Manager',
    description: 'Manage AMC WebUI global application settings, MCP servers, and active chat session parameters.',
    disabledAutoApproveTools: ['reset_settings', 'delete_mcp_server'],

    listTools: async () => SETTINGS_TOOLS,

    callTool: async (toolName: string, rawArgs: Record<string, unknown>) => {
      const args = isRecord(rawArgs) ? rawArgs : {};

      switch (toolName) {
        case 'get_settings': {
          const scope = (args.scope as string) || 'both';
          const domain = (args.domain as string) || 'all';

          const appSettings = useSettingsStore.getState().appSettings;
          const { activeSessionId, savedSessions, pendingChatSettings } = useChatStore.getState();
          const activeSession = savedSessions.find((s) => s.id === activeSessionId);
          const currentSessionSettings = (activeSession?.settings ?? pendingChatSettings ?? {}) as ChatSettings;

          const filterDomain = (settings: object) => {
            const sanitized = sanitizeSettingsForExposure(settings);
            if (domain === 'mcp') {
              const virtualServers = getVirtualMcpServers().map((vs) =>
                toVirtualMcpServerSummary(vs, useVirtualMcpStore.getState().isServerEnabled(vs.id)),
              );
              return {
                externalServers: (appSettings.mcpServers ?? []).map(toMcpServerSummary),
                virtualServers,
              };
            }
            if (domain === 'appearance') {
              return {
                themeId: sanitized.themeId,
                baseFontSize: sanitized.baseFontSize,
                expandCodeBlocksByDefault: sanitized.expandCodeBlocksByDefault,
                showWelcomeSuggestions: sanitized.showWelcomeSuggestions,
                showInputPasteButton: sanitized.showInputPasteButton,
                showInputClearButton: sanitized.showInputClearButton,
                showVoiceInputButton: sanitized.showVoiceInputButton,
                isPasteRichTextAsMarkdownEnabled: sanitized.isPasteRichTextAsMarkdownEnabled,
                isCopySelectionFormattingEnabled: sanitized.isCopySelectionFormattingEnabled,
              };
            }
            if (domain === 'generation') {
              return {
                modelId: sanitized.modelId,
                temperature: sanitized.temperature,
                topP: sanitized.topP,
                topK: sanitized.topK,
                showThoughts: sanitized.showThoughts,
                thinkingBudget: sanitized.thinkingBudget,
                thinkingLevel: sanitized.thinkingLevel,
                systemInstruction: sanitized.systemInstruction,
                isStreamingEnabled: sanitized.isStreamingEnabled,
                isGoogleSearchEnabled: sanitized.isGoogleSearchEnabled,
                isCodeExecutionEnabled: sanitized.isCodeExecutionEnabled,
                isUrlContextEnabled: sanitized.isUrlContextEnabled,
                isDeepSearchEnabled: sanitized.isDeepSearchEnabled,
                isRawModeEnabled: sanitized.isRawModeEnabled,
                mediaResolution: sanitized.mediaResolution,
              };
            }
            if (domain === 'language_voice') {
              return {
                language: sanitized.language,
                ttsVoice: sanitized.ttsVoice,
                translationTargetLanguage: sanitized.translationTargetLanguage,
                isAudioCompressionEnabled: sanitized.isAudioCompressionEnabled,
                liveTranslateTargetLanguageCode: sanitized.liveTranslateTargetLanguageCode,
              };
            }
            // domain === 'all'
            const virtualServers = getVirtualMcpServers();
            return {
              ...sanitized,
              mcpSummary: {
                externalCount: (appSettings.mcpServers ?? []).length,
                virtualCount: virtualServers.length,
                enabledExternalCount: (appSettings.mcpServers ?? []).filter((s) => s.enabled).length,
              },
            };
          };

          const result: Record<string, unknown> = {};
          if (scope === 'global' || scope === 'both') {
            result.global = filterDomain(appSettings);
          }
          if (scope === 'session' || scope === 'both') {
            result.session = {
              activeSessionId: activeSessionId ?? null,
              settings: filterDomain(currentSessionSettings),
            };
          }
          return toMcpResponse(result);
        }

        case 'list_options': {
          const category = args.category as string;
          switch (category) {
            case 'themes':
              return toMcpResponse({
                availableThemes: AVAILABLE_THEMES.map((t) => ({ id: t.id, name: t.name, isDark: t.isDark })),
                allThemeIds: THEME_IDS,
              });
            case 'languages':
              return toMcpResponse({
                supportedLanguages: APP_LANGUAGE_IDS.map((id) => ({
                  id,
                  label:
                    id === 'system' ? 'Follow System' : (LANGUAGE_META[id as keyof typeof LANGUAGE_META]?.label ?? id),
                })),
              });
            case 'tts_voices':
              return toMcpResponse({
                availableVoices: AVAILABLE_TTS_VOICES.map((v) => ({ id: v.id, name: v.name })),
              });
            case 'thinking_levels':
              return toMcpResponse({
                availableThinkingLevels: THINKING_LEVELS,
              });
            case 'media_resolutions':
              return toMcpResponse({
                availableMediaResolutions: Object.values(MediaResolution),
              });
            case 'translation_languages':
              return toMcpResponse({
                availableTranslationLanguages: TRANSLATION_TARGET_LANGUAGES,
              });
            case 'mcp_transports':
              return toMcpResponse({
                availableTransports: ['http', 'sse', 'stdio'],
              });
            default:
              throw new Error(`Unknown option category: ${category}`);
          }
        }

        case 'list_mcp_servers': {
          const filter = (typeof args.filter === 'string' ? args.filter : 'all').toLowerCase();
          const includeVirtual = args.includeVirtual !== false;

          const appSettings = useSettingsStore.getState().appSettings;
          const externalServers = appSettings.mcpServers ?? [];

          const filteredExternal = externalServers.filter((server) => {
            if (filter === 'enabled') return server.enabled;
            if (filter === 'disabled') return !server.enabled;
            if (filter === 'http') return server.transport === 'http';
            if (filter === 'sse') return server.transport === 'sse';
            if (filter === 'stdio') return server.transport === 'stdio';
            return true;
          });

          const virtualState = useVirtualMcpStore.getState();
          const virtualServers = includeVirtual
            ? getVirtualMcpServers()
                .filter((vServer) => {
                  const enabled = virtualState.isServerEnabled(vServer.id);
                  if (filter === 'enabled') return enabled;
                  if (filter === 'disabled') return !enabled;
                  return true;
                })
                .map((vServer) => toVirtualMcpServerSummary(vServer, virtualState.isServerEnabled(vServer.id)))
            : [];

          return toMcpResponse({
            totalExternalCount: externalServers.length,
            externalServers: filteredExternal.map(toMcpServerSummary),
            virtualServers,
          });
        }

        case 'add_mcp_server': {
          const currentSettings = useSettingsStore.getState().appSettings;
          const existingServers = currentSettings.mcpServers ?? [];

          const { server, error } = validateAndBuildNewServer(args, existingServers);
          if (error || !server) {
            throw new Error(`Failed to add MCP server: ${error}`);
          }

          const nextServers = [...existingServers, server];
          useSettingsStore.getState().setAppSettings((prev) => ({
            ...prev,
            mcpServers: nextServers,
          }));

          return toMcpResponse({
            status: 'created',
            server: toMcpServerSummary(server),
          });
        }

        case 'update_mcp_server': {
          const id = typeof args.id === 'string' ? args.id.trim() : '';
          if (!id) {
            throw new Error('Server ID is required.');
          }

          const currentSettings = useSettingsStore.getState().appSettings;
          const existingServers = currentSettings.mcpServers ?? [];
          const index = existingServers.findIndex((s) => s.id === id);
          if (index === -1) {
            throw new Error(`MCP server with id "${id}" not found.`);
          }

          const target = existingServers[index];
          const { updatedServer, error } = applyMcpServerUpdate(target, args);
          if (error || !updatedServer) {
            throw new Error(`Failed to update MCP server: ${error}`);
          }

          const nextServers = [...existingServers];
          nextServers[index] = updatedServer;
          useSettingsStore.getState().setAppSettings((prev) => ({
            ...prev,
            mcpServers: nextServers,
          }));

          return toMcpResponse({
            status: 'updated',
            server: toMcpServerSummary(updatedServer),
          });
        }

        case 'delete_mcp_server': {
          const id = typeof args.id === 'string' ? args.id.trim() : '';
          if (!id) {
            throw new Error('Server ID is required.');
          }

          const currentSettings = useSettingsStore.getState().appSettings;
          const existingServers = currentSettings.mcpServers ?? [];
          const target = existingServers.find((s) => s.id === id);
          if (!target) {
            throw new Error(`MCP server with id "${id}" not found.`);
          }

          const nextServers = existingServers.filter((s) => s.id !== id);
          useSettingsStore.getState().setAppSettings((prev) => ({
            ...prev,
            mcpServers: nextServers,
          }));

          return toMcpResponse({
            status: 'deleted',
            id: target.id,
            name: target.name,
          });
        }

        case 'toggle_mcp_server': {
          const id = typeof args.id === 'string' ? args.id.trim() : '';
          if (!id) {
            throw new Error('Server ID is required.');
          }

          const vServer = findVirtualMcpServer(id) ?? (id === SETTINGS_VIRTUAL_MCP_ID ? selfServer : undefined);
          if (vServer) {
            const virtualState = useVirtualMcpStore.getState();
            const currentEnabled = virtualState.isServerEnabled(id);
            const nextEnabled = typeof args.enabled === 'boolean' ? args.enabled : !currentEnabled;
            virtualState.setServerEnabled(id, nextEnabled);
            return toMcpResponse({
              status: 'toggled',
              id,
              name: vServer.name,
              enabled: nextEnabled,
              isVirtual: true,
            });
          }

          const currentSettings = useSettingsStore.getState().appSettings;
          const existingServers = currentSettings.mcpServers ?? [];
          const index = existingServers.findIndex((s) => s.id === id);
          if (index === -1) {
            throw new Error(`MCP server with id "${id}" not found (neither external nor virtual).`);
          }

          const target = existingServers[index];
          const nextEnabled = typeof args.enabled === 'boolean' ? args.enabled : !target.enabled;
          const nextServers = [...existingServers];
          nextServers[index] = { ...target, enabled: nextEnabled };
          useSettingsStore.getState().setAppSettings((prev) => ({
            ...prev,
            mcpServers: nextServers,
          }));

          return toMcpResponse({
            status: 'toggled',
            id,
            name: target.name,
            enabled: nextEnabled,
            isVirtual: false,
          });
        }

        case 'import_mcp_config': {
          const jsonContent = typeof args.jsonContent === 'string' ? args.jsonContent.trim() : '';
          if (!jsonContent) {
            throw new Error('jsonContent is required and cannot be empty.');
          }

          const parsed = parseImportJson(jsonContent);
          if (parsed.length === 0) {
            throw new Error('No valid MCP servers found in provided JSON.');
          }

          const currentSettings = useSettingsStore.getState().appSettings;
          const existingServers = currentSettings.mcpServers ?? [];
          const deduped = dedupeServersById(
            parsed,
            existingServers.map((s) => s.id),
          );
          const nextServers = [...existingServers, ...deduped];

          useSettingsStore.getState().setAppSettings((prev) => ({
            ...prev,
            mcpServers: nextServers,
          }));

          return toMcpResponse({
            status: 'imported',
            importedCount: deduped.length,
            importedServers: deduped.map(toMcpServerSummary),
          });
        }

        case 'test_mcp_server': {
          const id = typeof args.id === 'string' ? args.id.trim() : '';
          if (!id) {
            throw new Error('Server ID is required.');
          }

          const vServer = findVirtualMcpServer(id) ?? (id === SETTINGS_VIRTUAL_MCP_ID ? selfServer : undefined);
          if (vServer) {
            try {
              const tools = await vServer.listTools();
              return toMcpResponse({
                status: 'connected',
                id,
                name: vServer.name,
                isVirtual: true,
                toolsCount: tools.length,
                tools: tools.map((t) => ({ name: t.name, description: t.description })),
              });
            } catch (toolListError) {
              return toMcpResponse({
                status: 'error',
                id,
                name: vServer.name,
                isVirtual: true,
                error: getErrorMessage(toolListError),
              });
            }
          }

          const currentSettings = useSettingsStore.getState().appSettings;
          const server = (currentSettings.mcpServers ?? []).find((s) => s.id === id);
          if (!server) {
            throw new Error(`MCP server with id "${id}" not found.`);
          }

          try {
            const caps = await fetchMcpServerCapabilities(server);
            if (caps.errors && caps.errors.length > 0) {
              const errorMsg = caps.errors.map((e) => e.error).join('; ');
              return toMcpResponse({
                status: 'error',
                id,
                name: server.name,
                isVirtual: false,
                error: errorMsg,
              });
            }
            return toMcpResponse({
              status: 'connected',
              id,
              name: server.name,
              isVirtual: false,
              toolsCount: caps.tools?.length ?? 0,
              tools: (caps.tools ?? []).map((t) => ({ name: t.name, description: t.description })),
              promptsCount: caps.prompts?.length ?? 0,
              resourcesCount: caps.resources?.length ?? 0,
            });
          } catch (capabilityError) {
            return toMcpResponse({
              status: 'error',
              id,
              name: server.name,
              isVirtual: false,
              error: getErrorMessage(capabilityError),
            });
          }
        }

        case 'update_appearance_settings': {
          const patch: Partial<AppSettings> = {};

          if (typeof args.themeId === 'string') {
            if (!isKnownThemeId(args.themeId)) {
              throw new Error(`Invalid themeId: ${args.themeId}`);
            }
            patch.themeId = args.themeId;
          }
          if (typeof args.baseFontSize === 'number') {
            patch.baseFontSize = Math.min(20, Math.max(12, Math.round(args.baseFontSize)));
          }

          const booleanKeys: Array<keyof AppSettings> = [
            'expandCodeBlocksByDefault',
            'showWelcomeSuggestions',
            'showInputPasteButton',
            'showInputClearButton',
            'showVoiceInputButton',
            'isPasteRichTextAsMarkdownEnabled',
          ];
          for (const key of booleanKeys) {
            if (typeof args[key] === 'boolean') {
              (patch as Record<string, unknown>)[key] = args[key];
            }
          }

          if (Object.keys(patch).length === 0) {
            return toMcpResponse({ status: 'no-op', message: 'No valid appearance settings provided in arguments.' });
          }

          useSettingsStore.getState().setAppSettings((prev) => ({ ...prev, ...patch }));
          return toMcpResponse({ status: 'updated', scope: 'global', updated: patch });
        }

        case 'update_generation_settings': {
          const scope = (args.scope as string) || 'global';
          const patch: Partial<ChatSettings & { isStreamingEnabled?: boolean }> = {};

          if (typeof args.modelId === 'string' && args.modelId.trim()) {
            patch.modelId = args.modelId.trim();
          }
          if (typeof args.temperature === 'number') {
            patch.temperature = Math.min(2.0, Math.max(0.0, args.temperature));
          }
          if (typeof args.topP === 'number') {
            patch.topP = Math.min(1.0, Math.max(0.0, args.topP));
          }
          if (typeof args.topK === 'number') {
            patch.topK = Math.min(100, Math.max(1, Math.round(args.topK)));
          }
          if (typeof args.thinkingBudget === 'number') {
            patch.thinkingBudget = Math.round(args.thinkingBudget);
          }
          if (typeof args.thinkingLevel === 'string') {
            const upper = args.thinkingLevel.toUpperCase();
            if ((THINKING_LEVELS as readonly string[]).includes(upper)) {
              patch.thinkingLevel = upper as ThinkingLevel;
            }
          }
          if (typeof args.systemInstruction === 'string') {
            patch.systemInstruction = args.systemInstruction;
          }

          const booleanKeys: Array<keyof ChatSettings> = [
            'showThoughts',
            'isGoogleSearchEnabled',
            'isCodeExecutionEnabled',
            'isUrlContextEnabled',
            'isDeepSearchEnabled',
            'isRawModeEnabled',
          ];
          for (const key of booleanKeys) {
            if (typeof args[key] === 'boolean') {
              (patch as Record<string, unknown>)[key] = args[key];
            }
          }

          if (scope === 'global' && typeof args.isStreamingEnabled === 'boolean') {
            patch.isStreamingEnabled = args.isStreamingEnabled;
          }

          if (Object.keys(patch).length === 0) {
            return toMcpResponse({ status: 'no-op', message: 'No valid generation settings provided in arguments.' });
          }

          if (scope === 'session') {
            useChatStore.getState().setCurrentChatSettings((prev) => ({
              ...prev,
              ...(patch as Partial<ChatSettings>),
            }));
            return toMcpResponse({
              status: 'updated',
              scope: 'session',
              activeSessionId: useChatStore.getState().activeSessionId ?? null,
              updated: patch,
            });
          }

          useSettingsStore.getState().setAppSettings((prev) => ({ ...prev, ...(patch as Partial<AppSettings>) }));
          return toMcpResponse({ status: 'updated', scope: 'global', updated: patch });
        }

        case 'update_language_voice_settings': {
          const patch: Partial<AppSettings> = {};

          if (typeof args.language === 'string') {
            if (!(APP_LANGUAGE_IDS as readonly string[]).includes(args.language)) {
              throw new Error(`Invalid language: ${args.language}. Must be one of: ${APP_LANGUAGE_IDS.join(', ')}`);
            }
            patch.language = args.language as AppLanguage;
          }

          if (typeof args.ttsVoice === 'string') {
            const voiceExists = AVAILABLE_TTS_VOICES.some(
              (v) => v.id.toLowerCase() === (args.ttsVoice as string).toLowerCase(),
            );
            if (!voiceExists) {
              throw new Error(
                `Invalid ttsVoice: ${args.ttsVoice}. Must be one of: ${AVAILABLE_TTS_VOICES.map((v) => v.id).join(', ')}`,
              );
            }
            const matched = AVAILABLE_TTS_VOICES.find(
              (v) => v.id.toLowerCase() === (args.ttsVoice as string).toLowerCase(),
            );
            patch.ttsVoice = matched?.id ?? (args.ttsVoice as string);
          }

          if (typeof args.translationTargetLanguage === 'string' && args.translationTargetLanguage.trim()) {
            const raw = args.translationTargetLanguage.trim().toLowerCase();
            const matched = TRANSLATION_TARGET_LANGUAGES.find((l) => l.toLowerCase() === raw);
            if (!matched) {
              throw new Error(
                `Invalid translationTargetLanguage: ${args.translationTargetLanguage}. Must be one of: ${TRANSLATION_TARGET_LANGUAGES.join(', ')}`,
              );
            }
            patch.translationTargetLanguage = matched;
          }

          if (typeof args.isAudioCompressionEnabled === 'boolean') {
            patch.isAudioCompressionEnabled = args.isAudioCompressionEnabled;
          }

          if (Object.keys(patch).length === 0) {
            return toMcpResponse({
              status: 'no-op',
              message: 'No valid language/voice settings provided in arguments.',
            });
          }

          useSettingsStore.getState().setAppSettings((prev) => ({ ...prev, ...patch }));
          return toMcpResponse({ status: 'updated', scope: 'global', updated: patch });
        }

        case 'reset_settings': {
          const domain = args.domain as string;
          const patch: Partial<AppSettings> = {};

          if (domain === 'appearance' || domain === 'all') {
            patch.themeId = DEFAULT_APP_SETTINGS.themeId;
            patch.baseFontSize = DEFAULT_APP_SETTINGS.baseFontSize;
            patch.expandCodeBlocksByDefault = DEFAULT_APP_SETTINGS.expandCodeBlocksByDefault;
            patch.showWelcomeSuggestions = DEFAULT_APP_SETTINGS.showWelcomeSuggestions;
            patch.showInputPasteButton = DEFAULT_APP_SETTINGS.showInputPasteButton;
            patch.showInputClearButton = DEFAULT_APP_SETTINGS.showInputClearButton;
            patch.showVoiceInputButton = DEFAULT_APP_SETTINGS.showVoiceInputButton;
            patch.isPasteRichTextAsMarkdownEnabled = DEFAULT_APP_SETTINGS.isPasteRichTextAsMarkdownEnabled;
          }

          if (domain === 'generation' || domain === 'all') {
            patch.modelId = DEFAULT_APP_SETTINGS.modelId;
            patch.temperature = DEFAULT_APP_SETTINGS.temperature;
            patch.topP = DEFAULT_APP_SETTINGS.topP;
            patch.topK = DEFAULT_APP_SETTINGS.topK;
            patch.showThoughts = DEFAULT_APP_SETTINGS.showThoughts;
            patch.thinkingBudget = DEFAULT_APP_SETTINGS.thinkingBudget;
            patch.thinkingLevel = DEFAULT_APP_SETTINGS.thinkingLevel;
            patch.systemInstruction = DEFAULT_APP_SETTINGS.systemInstruction;
            patch.isStreamingEnabled = DEFAULT_APP_SETTINGS.isStreamingEnabled;
            patch.isGoogleSearchEnabled = DEFAULT_APP_SETTINGS.isGoogleSearchEnabled;
            patch.isCodeExecutionEnabled = DEFAULT_APP_SETTINGS.isCodeExecutionEnabled;
            patch.isUrlContextEnabled = DEFAULT_APP_SETTINGS.isUrlContextEnabled;
            patch.isDeepSearchEnabled = DEFAULT_APP_SETTINGS.isDeepSearchEnabled;
            patch.isRawModeEnabled = DEFAULT_APP_SETTINGS.isRawModeEnabled;
          }

          useSettingsStore.getState().setAppSettings((prev) => ({ ...prev, ...patch }));
          return toMcpResponse({ status: 'reset', domain, updatedKeys: Object.keys(patch) });
        }

        default:
          throw new Error(`Unknown tool: ${toolName}`);
      }
    },
  };
  return selfServer;
};

export const initSettingsVirtualMcpServer = (): (() => void) => {
  const server = createSettingsVirtualMcpServer();
  return registerVirtualMcpServer(server);
};
