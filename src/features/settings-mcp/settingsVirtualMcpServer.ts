import { registerVirtualMcpServer, type VirtualMcpServer } from '@/features/mcp/virtualMcpRegistry';
import type { McpToolDefinition } from '@/services/api/mcpApi';
import { useSettingsStore } from '@/stores/settingsStore';
import { useChatStore } from '@/stores/chatStore';
import { DEFAULT_APP_SETTINGS } from '@/constants/settingsDefaults';
import { THEME_IDS, isKnownThemeId } from '@/utils/themeMode';
import { AVAILABLE_THEMES } from '@/constants/themeRegistry';
import { AVAILABLE_TTS_VOICES } from '@/constants/voiceOptions';
import { APP_LANGUAGE_IDS, LANGUAGE_META, type AppLanguage } from '@/i18n/languageRegistry';
import {
  MediaResolution,
  THINKING_LEVELS,
  TRANSLATION_TARGET_LANGUAGES,
  type AppSettings,
  type ChatSettings,
  type ThinkingLevel,
} from '@/types';
import { isRecord } from '../../../shared/predicates';

export const SETTINGS_VIRTUAL_MCP_ID = 'amc_settings_manager';

const SENSITIVE_KEY_PATTERNS = [
  /api[_-]?key/i,
  /token/i,
  /secret/i,
  /password/i,
  /headers/i,
  /thirdPartyApi/i,
  /proxy/i,
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
      'Read current application settings and/or active session settings. Sensitive credentials (API keys, auth headers) are always omitted.',
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
          enum: ['all', 'appearance', 'generation', 'language_voice'],
          description: "Category of settings to return. Defaults to 'all'.",
        },
      },
    },
  },
  {
    name: 'list_options',
    description:
      'List available, valid values for system configuration options (themes, languages, TTS voices, thinking levels, media resolutions).',
    inputSchema: {
      type: 'object',
      properties: {
        category: {
          type: 'string',
          enum: ['themes', 'languages', 'tts_voices', 'thinking_levels', 'media_resolutions', 'translation_languages'],
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

export const createSettingsVirtualMcpServer = (): VirtualMcpServer => ({
  id: SETTINGS_VIRTUAL_MCP_ID,
  name: 'AMC Settings Manager',
  description: 'Manage AMC WebUI global application settings and active chat session parameters.',
  disabledAutoApproveTools: ['reset_settings'],

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
          if (domain === 'all') return sanitized;
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
          return sanitized;
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
                nativeLabel:
                  id === 'system' ? '跟随系统' : (LANGUAGE_META[id as keyof typeof LANGUAGE_META]?.nativeLabel ?? id),
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
          default:
            throw new Error(`Unknown option category: ${category}`);
        }
      }

      case 'update_appearance_settings': {
        const patch: Partial<AppSettings> = {};

        if (typeof args.themeId === 'string') {
          if (!isKnownThemeId(args.themeId)) {
            throw new Error(`Invalid themeId: ${args.themeId}. Must be one of: ${THEME_IDS.join(', ')}`);
          }
          patch.themeId = args.themeId;
        }

        if (typeof args.baseFontSize === 'number') {
          const clamped = Math.min(20, Math.max(12, Math.round(args.baseFontSize)));
          patch.baseFontSize = clamped;
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
          return toMcpResponse({ status: 'no-op', message: 'No valid language/voice settings provided in arguments.' });
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
});

export const initSettingsVirtualMcpServer = (): (() => void) => {
  const server = createSettingsVirtualMcpServer();
  return registerVirtualMcpServer(server);
};
