import { SHORTCUT_REGISTRY } from './shortcuts';
import type { SettingsTab } from '@/stores/settingsUiStore';

export interface SettingsSearchEntry {
  /** Stable id used for scroll targeting via `data-settings-item`. */
  id: string;
  tab: SettingsTab;
  /** Primary label translation key. */
  labelKey: string;
  /** Optional secondary text (tooltip / description). */
  descriptionKey?: string;
  /** Optional group / section heading key shown as a breadcrumb. */
  groupKey?: string;
}

const interfaceEntries: SettingsSearchEntry[] = [
  { id: 'interface-theme', tab: 'interface', labelKey: 'settingsTheme', groupKey: 'settingsTabInterface' },
  { id: 'interface-language', tab: 'interface', labelKey: 'settingsLanguage', groupKey: 'settingsTabInterface' },
  { id: 'interface-font-size', tab: 'interface', labelKey: 'settingsFontSize', groupKey: 'settingsTabInterface' },
  {
    id: 'interface-live-artifacts-font',
    tab: 'interface',
    labelKey: 'settingsLiveArtifactsFontSize',
    descriptionKey: 'settingsLiveArtifactsFontSizeTooltip',
    groupKey: 'settingsTabInterface',
  },
  {
    id: 'interface-input-toolbar',
    tab: 'interface',
    labelKey: 'settingsInputToolbar',
    groupKey: 'settingsTabInterface',
  },
  {
    id: 'interface-show-translate',
    tab: 'interface',
    labelKey: 'settingsShowInputTranslationButtonLabel',
    descriptionKey: 'settingsShowInputTranslationButtonTooltip',
    groupKey: 'settingsInputToolbar',
  },
  {
    id: 'interface-show-paste',
    tab: 'interface',
    labelKey: 'settingsShowInputPasteButtonLabel',
    descriptionKey: 'settingsShowInputPasteButtonTooltip',
    groupKey: 'settingsInputToolbar',
  },
  {
    id: 'interface-show-clear',
    tab: 'interface',
    labelKey: 'settingsShowInputClearButtonLabel',
    descriptionKey: 'settingsShowInputClearButtonTooltip',
    groupKey: 'settingsInputToolbar',
  },
  {
    id: 'interface-show-voice',
    tab: 'interface',
    labelKey: 'settingsShowVoiceInputButtonLabel',
    descriptionKey: 'settingsShowVoiceInputButtonTooltip',
    groupKey: 'settingsInputToolbar',
  },
  {
    id: 'interface-chat-behavior',
    tab: 'interface',
    labelKey: 'settingsChatBehavior',
    groupKey: 'settingsTabInterface',
  },
  {
    id: 'interface-streaming',
    tab: 'interface',
    labelKey: 'headerStream',
    groupKey: 'settingsChatBehavior',
  },
  {
    id: 'interface-auto-title',
    tab: 'interface',
    labelKey: 'isAutoTitleEnabled',
    descriptionKey: 'isAutoTitleEnabledTooltip',
    groupKey: 'settingsChatBehavior',
  },
  {
    id: 'interface-suggestions',
    tab: 'interface',
    labelKey: 'settingsEnableSuggestionsLabel',
    descriptionKey: 'settingsEnableSuggestionsTooltip',
    groupKey: 'settingsChatBehavior',
  },
  {
    id: 'interface-auto-scroll',
    tab: 'interface',
    labelKey: 'settingsAutoScrollOnSendLabel',
    groupKey: 'settingsChatBehavior',
  },
  {
    id: 'interface-clipboard',
    tab: 'interface',
    labelKey: 'settingsClipboardInput',
    groupKey: 'settingsTabInterface',
  },
  {
    id: 'interface-paste-markdown',
    tab: 'interface',
    labelKey: 'settingsPasteRichTextAsMarkdownLabel',
    descriptionKey: 'settingsPasteRichTextAsMarkdownTooltip',
    groupKey: 'settingsClipboardInput',
  },
  {
    id: 'interface-paste-file',
    tab: 'interface',
    labelKey: 'settingsPasteAsTextFileLabel',
    descriptionKey: 'settingsPasteAsTextFileTooltip',
    groupKey: 'settingsClipboardInput',
  },
  {
    id: 'interface-copy-format',
    tab: 'interface',
    labelKey: 'settingsCopySelectionFormattingLabel',
    descriptionKey: 'settingsCopySelectionFormattingTooltip',
    groupKey: 'settingsClipboardInput',
  },
  {
    id: 'interface-rendering',
    tab: 'interface',
    labelKey: 'settingsRenderingPreview',
    groupKey: 'settingsTabInterface',
  },
  {
    id: 'interface-expand-code',
    tab: 'interface',
    labelKey: 'settingsExpandCodeBlocksByDefaultLabel',
    groupKey: 'settingsRenderingPreview',
  },
  {
    id: 'interface-auto-preview',
    tab: 'interface',
    labelKey: 'settingsAutoFullscreenHtmlLabel',
    descriptionKey: 'settingsAutoFullscreenHtmlTooltip',
    groupKey: 'settingsRenderingPreview',
  },
  {
    id: 'interface-mermaid',
    tab: 'interface',
    labelKey: 'settingsEnableMermaidRenderingLabel',
    descriptionKey: 'settingsEnableMermaidRenderingTooltip',
    groupKey: 'settingsRenderingPreview',
  },
  {
    id: 'interface-graphviz',
    tab: 'interface',
    labelKey: 'settingsEnableGraphvizRenderingLabel',
    descriptionKey: 'settingsEnableGraphvizRenderingTooltip',
    groupKey: 'settingsRenderingPreview',
  },
  {
    id: 'interface-unwrap-html',
    tab: 'interface',
    labelKey: 'settingsUnwrapMislabeledHtmlLabel',
    descriptionKey: 'settingsUnwrapMislabeledHtmlTooltip',
    groupKey: 'settingsRenderingPreview',
  },
  {
    id: 'interface-notifications',
    tab: 'interface',
    labelKey: 'settingsNotificationsFeedback',
    groupKey: 'settingsTabInterface',
  },
  {
    id: 'interface-completion-notification',
    tab: 'interface',
    labelKey: 'settingsEnableCompletionNotificationLabel',
    descriptionKey: 'settingsEnableCompletionNotificationTooltip',
    groupKey: 'settingsNotificationsFeedback',
  },
  {
    id: 'interface-completion-sound',
    tab: 'interface',
    labelKey: 'settingsEnableCompletionSoundLabel',
    descriptionKey: 'settingsEnableCompletionSoundTooltip',
    groupKey: 'settingsNotificationsFeedback',
  },
  {
    id: 'interface-completion-sound-background-only',
    tab: 'interface',
    labelKey: 'settingsCompletionSoundBackgroundOnlyLabel',
    descriptionKey: 'settingsCompletionSoundBackgroundOnlyTooltip',
    groupKey: 'settingsNotificationsFeedback',
  },
  {
    id: 'interface-audio-compression',
    tab: 'interface',
    labelKey: 'settingsAudioCompressionLabel',
    descriptionKey: 'settingsAudioCompressionTooltip',
    groupKey: 'settingsNotificationsFeedback',
  },
];

const modelsEntries: SettingsSearchEntry[] = [
  {
    id: 'models-primary',
    tab: 'models',
    labelKey: 'settingsDefaultModel',
    groupKey: 'settingsTabModels',
  },
  {
    id: 'models-system-prompt',
    tab: 'models',
    labelKey: 'settingsSystemPrompt',
    groupKey: 'settingsTabModels',
  },
  {
    id: 'models-temperature',
    tab: 'models',
    labelKey: 'settingsTemperature',
    groupKey: 'settingsTabModels',
  },
  {
    id: 'models-top-p',
    tab: 'models',
    labelKey: 'settingsTopP',
    descriptionKey: 'chatBehaviorTopPTooltip',
    groupKey: 'settingsTabModels',
  },
  {
    id: 'models-top-k',
    tab: 'models',
    labelKey: 'settingsTopK',
    descriptionKey: 'settingsTopKTooltip',
    groupKey: 'settingsTabModels',
  },
  {
    id: 'models-max-output-tokens',
    tab: 'models',
    labelKey: 'settingsMaxOutputTokens',
    descriptionKey: 'settingsMaxOutputTokensTooltip',
    groupKey: 'settingsTabModels',
  },
  {
    id: 'models-stop-sequences',
    tab: 'models',
    labelKey: 'settingsStopSequences',
    descriptionKey: 'settingsStopSequencesTooltip',
    groupKey: 'settingsTabModels',
  },
  {
    id: 'models-presence-penalty',
    tab: 'models',
    labelKey: 'settingsPresencePenalty',
    descriptionKey: 'settingsPresencePenaltyTooltip',
    groupKey: 'settingsTabModels',
  },
  {
    id: 'models-frequency-penalty',
    tab: 'models',
    labelKey: 'settingsFrequencyPenalty',
    descriptionKey: 'settingsFrequencyPenaltyTooltip',
    groupKey: 'settingsTabModels',
  },
  {
    id: 'models-seed',
    tab: 'models',
    labelKey: 'settingsSeed',
    descriptionKey: 'settingsSeedTooltip',
    groupKey: 'settingsTabModels',
  },
  {
    id: 'models-media-resolution',
    tab: 'models',
    labelKey: 'settingsMediaResolution',
    descriptionKey: 'settingsMediaResolutionTooltip',
    groupKey: 'settingsTabModels',
  },
  {
    id: 'models-raw-mode',
    tab: 'models',
    labelKey: 'settingsRawModeLabel',
    descriptionKey: 'settingsRawModeTooltip',
    groupKey: 'settingsTabModels',
  },
  {
    id: 'models-hide-thinking',
    tab: 'models',
    labelKey: 'settingsHideThinkingInContextLabel',
    descriptionKey: 'settingsHideThinkingInContextTooltip',
    groupKey: 'settingsTabModels',
  },
  {
    id: 'models-always-keep-thinking',
    tab: 'models',
    labelKey: 'settingsAlwaysKeepThinkingInContextLabel',
    descriptionKey: 'settingsAlwaysKeepThinkingInContextTooltip',
    groupKey: 'settingsTabModels',
  },
  {
    id: 'models-tts-voice',
    tab: 'models',
    labelKey: 'settingsTtsVoice',
    groupKey: 'settingsTabLanguageVoice',
  },
  {
    id: 'models-safety',
    tab: 'models',
    labelKey: 'safetyTitle',
    descriptionKey: 'safetyDescription',
    groupKey: 'settingsTabModels',
  },
  {
    id: 'models-live-artifacts',
    tab: 'models',
    labelKey: 'settingsTabLiveArtifacts',
    groupKey: 'settingsTabModels',
  },
  {
    id: 'selectionAskModel',
    tab: 'models',
    labelKey: 'selectionAskModel',
    descriptionKey: 'selectionAskModelDesc',
    groupKey: 'settingsTabModels',
  },
];

const apiEntries: SettingsSearchEntry[] = [
  {
    id: 'api-config',
    tab: 'api',
    labelKey: 'settingsApiConfig',
    groupKey: 'settingsTabApi',
  },
  {
    id: 'api-provider',
    tab: 'api',
    labelKey: 'settingsApiModeLabel',
    groupKey: 'settingsTabApi',
  },
  {
    id: 'api-third-party',
    tab: 'api',
    labelKey: 'settingsApiModeThirdParty',
    descriptionKey: 'settingsOpenAICompatibleToggleHelp',
    groupKey: 'settingsTabApi',
  },
  {
    id: 'api-files-strategy',
    tab: 'api',
    labelKey: 'settingsFilesApiTitle',
    descriptionKey: 'settingsFilesApiDesc',
    groupKey: 'settingsTabApi',
  },
  {
    id: 'api-proxy',
    tab: 'api',
    labelKey: 'settingsApiProxyLabel',
    groupKey: 'settingsTabApi',
  },
];

const mcpEntries: SettingsSearchEntry[] = [
  {
    id: 'mcp-root',
    tab: 'mcp',
    labelKey: 'settingsMcpTitle',
    descriptionKey: 'settingsMcpDescription',
    groupKey: 'settingsTabMcp',
  },
  {
    id: 'mcp-transport',
    tab: 'mcp',
    labelKey: 'settingsMcpTransport',
    groupKey: 'settingsMcpTitle',
  },
];

const dataEntries: SettingsSearchEntry[] = [
  {
    id: 'data-import-export',
    tab: 'data',
    labelKey: 'settingsDataImportsExports',
    groupKey: 'settingsTabData',
  },
  {
    id: 'data-settings',
    tab: 'data',
    labelKey: 'settingsDataSettings',
    groupKey: 'settingsDataImportsExports',
  },
  {
    id: 'data-history',
    tab: 'data',
    labelKey: 'settingsDataHistory',
    groupKey: 'settingsDataImportsExports',
  },
  {
    id: 'data-scenarios',
    tab: 'data',
    labelKey: 'settingsDataScenarios',
    groupKey: 'settingsDataImportsExports',
  },
  {
    id: 'data-system-tools',
    tab: 'data',
    labelKey: 'settingsSystemTools',
    groupKey: 'settingsTabData',
  },
  {
    id: 'data-logs',
    tab: 'data',
    labelKey: 'settingsViewLogsAndUsage',
    groupKey: 'settingsSystemTools',
  },
  {
    id: 'data-enable-logging',
    tab: 'data',
    labelKey: 'settingsEnableLogging',
    descriptionKey: 'settingsEnableLoggingDescription',
    groupKey: 'settingsSystemTools',
  },
  {
    id: 'data-install-app',
    tab: 'data',
    labelKey: 'settingsInstallApp',
    groupKey: 'settingsSystemTools',
  },
  {
    id: 'data-danger',
    tab: 'data',
    labelKey: 'settingsDangerZone',
    groupKey: 'settingsTabData',
  },
  {
    id: 'data-reset',
    tab: 'data',
    labelKey: 'settingsReset',
    descriptionKey: 'settingsResetConfirm',
    groupKey: 'settingsDangerZone',
  },
  {
    id: 'data-clear-history',
    tab: 'data',
    labelKey: 'settingsClearHistory',
    descriptionKey: 'settingsClearHistoryConfirm',
    groupKey: 'settingsDangerZone',
  },
  {
    id: 'data-clear-cache',
    tab: 'data',
    labelKey: 'settingsClearCache',
    descriptionKey: 'settingsClearCacheConfirm',
    groupKey: 'settingsDangerZone',
  },
];

const shortcutCategoryKeys: Record<string, string> = {
  general: 'shortcutsGeneralTitle',
  input: 'shortcutsChatInputTitle',
  global: 'shortcutsGlobalTitle',
};

const shortcutsEntries: SettingsSearchEntry[] = [
  ...SHORTCUT_REGISTRY.map((item) => ({
    id: `shortcut-${item.id}`,
    tab: 'shortcuts' as const,
    labelKey: String(item.labelKey),
    groupKey: shortcutCategoryKeys[item.category] ?? 'settingsTabShortcuts',
  })),
  {
    id: 'shortcuts-cycle-models',
    tab: 'shortcuts',
    labelKey: 'shortcutsCycleModelsScopeTitle',
    groupKey: 'shortcutsChatInputTitle',
  },
];

const aboutEntries: SettingsSearchEntry[] = [
  {
    id: 'about-root',
    tab: 'about',
    labelKey: 'aboutTitle',
    descriptionKey: 'aboutDescription',
    groupKey: 'settingsTabAbout',
  },
  {
    id: 'about-github',
    tab: 'about',
    labelKey: 'aboutViewOnGithub',
    groupKey: 'settingsTabAbout',
  },
];

/** Flat catalog of settings destinations for in-modal search. */
export const SETTINGS_SEARCH_CATALOG: SettingsSearchEntry[] = [
  ...modelsEntries,
  ...apiEntries,
  ...mcpEntries,
  ...interfaceEntries,
  ...dataEntries,
  ...shortcutsEntries,
  ...aboutEntries,
];

/** DOM id of the container holding the rendered search results. */
export const SETTINGS_SEARCH_RESULTS_ID = 'settings-search-results';

/** DOM id of the flat-index result option, referenced by aria-activedescendant. */
export const settingsSearchOptionId = (index: number): string => `settings-search-option-${index}`;
