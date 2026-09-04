import { GEMINI_PROVIDER_ID, type ChatToolId, type ChatToolSettingKey } from '@/types';
import type { ModelCapabilities } from '@/utils/model/modelCapabilities';

type ChatToolSurface = 'tools-menu' | 'slash-command';

export type ChatToolIconKey = 'telescope' | 'globe' | 'map' | 'terminal' | 'python' | 'link' | 'calculator' | 'brain';

export interface ChatToolDefinition {
  id: ChatToolId;
  labelKey: string;
  shortLabelKey?: string;
  icon: ChatToolIconKey;
  settingKey?: ChatToolSettingKey;
  slashCommand?: {
    name: string;
    descriptionKey: string;
    icon: string;
  };
  isAvailable: (context: ChatToolAvailabilityContext) => boolean;
}

export interface ChatToolAvailabilityContext {
  surface: ChatToolSurface;
  capabilities: ModelCapabilities;
  hasLocalPythonHandler?: boolean;
  /**
   * Active session routing. The Gemini built-in tools below only exist on the
   * Gemini-native API — third-party providers never read these settings — so
   * the menu/slash surfaces must not offer them when the session routes
   * elsewhere. Undefined means the Gemini-native route.
   */
  providerId?: string;
}

const isToolsMenu = (context: ChatToolAvailabilityContext) => context.surface === 'tools-menu';

const isGeminiNativeRoute = (context: ChatToolAvailabilityContext): boolean =>
  context.providerId === undefined || context.providerId === GEMINI_PROVIDER_ID;

const CHAT_TOOL_REGISTRY: ChatToolDefinition[] = [
  {
    id: 'deepSearch',
    labelKey: 'deepSearchLabel',
    shortLabelKey: 'deepSearchShort',
    icon: 'telescope',
    settingKey: 'isDeepSearchEnabled',
    slashCommand: { name: 'deep', descriptionKey: 'helpCmdDeep', icon: 'deep' },
    isAvailable: (context) => isGeminiNativeRoute(context) && context.capabilities.permissions.canUseDeepSearch,
  },
  {
    id: 'googleSearch',
    labelKey: 'webSearchLabel',
    shortLabelKey: 'webSearchShort',
    icon: 'globe',
    settingKey: 'isGoogleSearchEnabled',
    slashCommand: { name: 'online', descriptionKey: 'helpCmdSearch', icon: 'search' },
    isAvailable: (context) =>
      isGeminiNativeRoute(context) &&
      context.capabilities.permissions.canUseGoogleSearch &&
      // Live models get the dedicated WebSearchToggle button instead.
      (!isToolsMenu(context) || !context.capabilities.permissions.canUseLiveControls),
  },
  {
    id: 'googleMaps',
    labelKey: 'mapsGroundingLabel',
    shortLabelKey: 'mapsGroundingShort',
    icon: 'map',
    settingKey: 'isGoogleMapsEnabled',
    slashCommand: { name: 'maps', descriptionKey: 'helpCmdMaps', icon: 'maps' },
    isAvailable: (context) =>
      isGeminiNativeRoute(context) &&
      context.capabilities.permissions.canUseGoogleMaps &&
      // The Live API never sends the Maps tool, so the toggle would be dead there.
      !context.capabilities.permissions.canUseLiveControls,
  },
  {
    id: 'codeExecution',
    labelKey: 'codeExecutionLabel',
    shortLabelKey: 'codeExecutionShort',
    icon: 'terminal',
    settingKey: 'isCodeExecutionEnabled',
    slashCommand: { name: 'code', descriptionKey: 'helpCmdCode', icon: 'code' },
    isAvailable: (context) => isGeminiNativeRoute(context) && context.capabilities.permissions.canUseCodeExecution,
  },
  {
    id: 'localPython',
    labelKey: 'localPythonLabel',
    shortLabelKey: 'localPythonShort',
    icon: 'python',
    settingKey: 'isLocalPythonEnabled',
    isAvailable: (context) =>
      isGeminiNativeRoute(context) &&
      context.capabilities.permissions.canUseLocalPython &&
      !!context.hasLocalPythonHandler,
  },
  {
    id: 'urlContext',
    labelKey: 'urlContextLabel',
    shortLabelKey: 'urlContextShort',
    icon: 'link',
    settingKey: 'isUrlContextEnabled',
    slashCommand: { name: 'url', descriptionKey: 'helpCmdUrl', icon: 'url' },
    isAvailable: (context) => isGeminiNativeRoute(context) && context.capabilities.permissions.canUseUrlContext,
  },
  {
    id: 'alwaysKeepThinking',
    labelKey: 'alwaysKeepThinkingLabel',
    shortLabelKey: 'alwaysKeepThinkingShort',
    icon: 'brain',
    settingKey: 'alwaysKeepThinkingInContext',
    isAvailable: ({ capabilities }) =>
      !capabilities.isNativeAudioModel &&
      !capabilities.isTtsModel &&
      !capabilities.isImageGenerationModel &&
      !capabilities.isTranscribeModel,
  },
  {
    id: 'tokenCount',
    labelKey: 'toolsTokenCountLabel',
    icon: 'calculator',
    // The token-count modal always targets the Gemini countTokens endpoint and
    // the Gemini model list, so it would mislead on third-party sessions.
    isAvailable: (context) => isGeminiNativeRoute(context) && context.capabilities.permissions.canUseTokenCount,
  },
];

export const getChatToolsForSurface = (context: ChatToolAvailabilityContext): ChatToolDefinition[] =>
  CHAT_TOOL_REGISTRY.filter((tool) => {
    if (context.surface === 'slash-command' && !tool.slashCommand) {
      return false;
    }

    return tool.isAvailable(context);
  });

export const getSlashCommandToolDefinitions = (): ChatToolDefinition[] =>
  CHAT_TOOL_REGISTRY.filter((tool) => !!tool.slashCommand);
