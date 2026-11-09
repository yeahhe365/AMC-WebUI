import {
  findVirtualMcpServer,
  getVirtualMcpServers,
  registerVirtualMcpServer,
  type VirtualMcpServer,
} from '@/features/mcp/virtualMcpRegistry';
import { dedupeServersById, parseImportJson } from '@/features/mcp/importMcpServers';
import { fetchMcpServerCapabilities } from '@/services/api/mcpApi';
import { SETTINGS_TOOLS } from './settingsVirtualMcpTools';
import { useSettingsStore } from '@/stores/settingsStore';
import { useChatStore } from '@/stores/chatStore';
import { useVirtualMcpStore } from '@/stores/mcp/virtualMcpStore';
import { DEFAULT_APP_SETTINGS } from '@/constants/settingsDefaults';
import { THEME_IDS, isKnownThemeId } from '@/utils/theme/themeMode';
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

const toMcpResponse = (data: unknown) => ({
  content: [{ type: 'text', text: typeof data === 'string' ? data : JSON.stringify(data, null, 2) }],
  structuredContent: data,
});

export const createSettingsVirtualMcpServer = (): VirtualMcpServer => {
  const selfServer: VirtualMcpServer = {
    id: SETTINGS_VIRTUAL_MCP_ID,
    name: 'AMC Settings Manager',
    description: 'Manage AMC WebUI global application settings, MCP servers, and active chat session parameters.',
    // 凡是"改了就会持久化一个能被下轮工具发现消费的外部端点/开关"的工具，都必须
    // 有人确认：新增/改 URL 会引入攻击者控制的工具清单（描述可注入），toggle 能把
    // 本地 Python 这类虚拟服务器打开，import 是一批新增，reset/delete 是不可逆删除。
    // 判据见 `src/features/mcp/toolApproval.ts`（默认要审批，`autoApproveTools` 才免审批，
    // 此数组里的工具即使被列进白名单也仍然要审批）。
    // Approval is the default (see toolApproval.ts), so the tools that may run
    // without asking have to be named. These only read state or adjust
    // reversible local preferences; anything that installs, edits, enables or
    // deletes an endpoint stays gated by the deny-list below.
    autoApproveTools: [
      'get_settings',
      'list_options',
      'list_mcp_servers',
      'test_mcp_server',
      'update_appearance_settings',
      'update_generation_settings',
      'update_language_voice_settings',
    ],
    disabledAutoApproveTools: [
      'reset_settings',
      'delete_mcp_server',
      'add_mcp_server',
      'update_mcp_server',
      'toggle_mcp_server',
      'import_mcp_config',
    ],

    listTools: async () => SETTINGS_TOOLS,

    callTool: async (toolName: string, rawArgs: Record<string, unknown>) => {
      const args = isRecord(rawArgs) ? rawArgs : {};

      switch (toolName) {
        case 'get_settings': {
          const scope = (args.scope as string) || 'both';
          const domain = (args.domain as string) || 'all';

          const appSettings = useSettingsStore.getState().appSettings;
          const { activeSessionId, savedSessions, pendingChatSettings } = useChatStore.getState();
          const activeSession = savedSessions.find((session) => session.id === activeSessionId);
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
                enabledExternalCount: (appSettings.mcpServers ?? []).filter((server) => server.enabled).length,
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
                availableThemes: AVAILABLE_THEMES.map((theme) => ({
                  id: theme.id,
                  name: theme.name,
                  isDark: theme.isDark,
                })),
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
                availableVoices: AVAILABLE_TTS_VOICES.map((voice) => ({ id: voice.id, name: voice.name })),
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
          const includeVirtual = args.includeVirtual ?? true;

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
          const index = existingServers.findIndex((server) => server.id === id);
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
          const target = existingServers.find((server) => server.id === id);
          if (!target) {
            throw new Error(`MCP server with id "${id}" not found.`);
          }

          const nextServers = existingServers.filter((server) => server.id !== id);
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
          const index = existingServers.findIndex((server) => server.id === id);
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
            existingServers.map((server) => server.id),
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
                tools: tools.map((tool) => ({ name: tool.name, description: tool.description })),
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
          const server = (currentSettings.mcpServers ?? []).find((server) => server.id === id);
          if (!server) {
            throw new Error(`MCP server with id "${id}" not found.`);
          }

          try {
            const caps = await fetchMcpServerCapabilities(server);
            if (caps.errors && caps.errors.length > 0) {
              const errorMsg = caps.errors.map((errorEntry) => errorEntry.error).join('; ');
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
              tools: (caps.tools ?? []).map((tool) => ({ name: tool.name, description: tool.description })),
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
              (voice) => voice.id.toLowerCase() === (args.ttsVoice as string).toLowerCase(),
            );
            if (!voiceExists) {
              throw new Error(
                `Invalid ttsVoice: ${args.ttsVoice}. Must be one of: ${AVAILABLE_TTS_VOICES.map((voice) => voice.id).join(', ')}`,
              );
            }
            const matched = AVAILABLE_TTS_VOICES.find(
              (voice) => voice.id.toLowerCase() === (args.ttsVoice as string).toLowerCase(),
            );
            patch.ttsVoice = matched?.id ?? (args.ttsVoice as string);
          }

          if (typeof args.translationTargetLanguage === 'string' && args.translationTargetLanguage.trim()) {
            const raw = args.translationTargetLanguage.trim().toLowerCase();
            const matched = TRANSLATION_TARGET_LANGUAGES.find((language) => language.toLowerCase() === raw);
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
