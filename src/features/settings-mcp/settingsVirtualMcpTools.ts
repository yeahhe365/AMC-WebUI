import type { McpToolDefinition } from '@/services/api/mcpApi';
import { THINKING_LEVELS, TRANSLATION_TARGET_LANGUAGES } from '@/types';

export const SETTINGS_TOOLS: McpToolDefinition[] = [
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
          description: 'Model ID to use for chat (e.g. gemini-3.8-flash, gemini-3.5-flash-lite)',
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
