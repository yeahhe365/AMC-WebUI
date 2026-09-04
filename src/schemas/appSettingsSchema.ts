import { z } from 'zod';
import { DEFAULT_APP_SETTINGS } from '@/constants/settingsDefaults';
import {
  type AppSettings,
  type FilesApiConfig,
  type LiveArtifactsSystemPrompts,
  type McpServerConfig,
  type SafetySetting,
  APP_LANGUAGE_IDS,
  HarmBlockThreshold,
  HarmCategory,
  LIVE_ARTIFACTS_PROMPT_MODES,
  MediaResolution,
  THINKING_LEVELS,
  TRANSLATION_TARGET_LANGUAGES,
} from '@/types';
import { createEmptyLiveArtifactsSystemPrompts } from '@/utils/live-artifacts/liveArtifactsPromptSettings';
import { sanitizeThirdPartyApiSettings } from '@/utils/thirdPartyApiProviders';
import {
  sanitizeMcpAuth,
  sanitizeMcpTimeout,
  sanitizeStringArray,
  sanitizeStringRecord,
} from '../../shared/mcpServerConfig';
import { isRecord } from '../../shared/predicates';
import { THEME_IDS } from '@/utils/themeMode';

const parseUnknownWithDefault = <Output>(schema: z.ZodType<Output>, fallback: Output): z.ZodType<Output> =>
  z
    .unknown()
    .optional()
    .transform((value) => {
      if (value === undefined) {
        return fallback;
      }

      const parsed = schema.safeParse(value);
      return parsed.success ? parsed.data : fallback;
    });

const withDefault = <Output>(schema: z.ZodType<Output>, fallback: Output): z.ZodType<Output> =>
  parseUnknownWithDefault(schema, fallback);

const optionalWithDefault = <Output>(
  schema: z.ZodType<Output>,
  fallback: Output | undefined,
): z.ZodType<Output | undefined> => parseUnknownWithDefault(schema, fallback);

const nullableStringWithDefault = (fallback: string | null | undefined) => {
  const normalizedFallback = fallback ?? null;
  return z.string().nullable().default(normalizedFallback).catch(normalizedFallback);
};

const booleanWithDefault = (fallback: boolean) => withDefault(z.boolean(), fallback);
const optionalBooleanWithDefault = (fallback: boolean | undefined) => optionalWithDefault(z.boolean(), fallback);
const numberWithDefault = (fallback: number) => withDefault(z.number().finite(), fallback);
const stringWithDefault = (fallback: string) => withDefault(z.string(), fallback);
const optionalStringWithDefault = (fallback: string | undefined) => optionalWithDefault(z.string(), fallback);

const filesApiConfigSchema: z.ZodType<FilesApiConfig> = z
  .object({
    images: booleanWithDefault(DEFAULT_APP_SETTINGS.filesApiConfig.images),
    pdfs: booleanWithDefault(DEFAULT_APP_SETTINGS.filesApiConfig.pdfs),
    audio: booleanWithDefault(DEFAULT_APP_SETTINGS.filesApiConfig.audio),
    video: booleanWithDefault(DEFAULT_APP_SETTINGS.filesApiConfig.video),
    text: booleanWithDefault(DEFAULT_APP_SETTINGS.filesApiConfig.text),
  })
  .default(DEFAULT_APP_SETTINGS.filesApiConfig)
  .catch(DEFAULT_APP_SETTINGS.filesApiConfig);

const thirdPartyApiSchema: z.ZodType<AppSettings['thirdPartyApi']> = parseUnknownWithDefault(
  z
    .unknown()
    .transform((value) => sanitizeThirdPartyApiSettings(value as Partial<AppSettings['thirdPartyApi']> | undefined)),
  DEFAULT_APP_SETTINGS.thirdPartyApi,
);

const safetySettingSchema = z.object({
  category: z.nativeEnum(HarmCategory),
  threshold: z.nativeEnum(HarmBlockThreshold),
});

const liveArtifactsSystemPromptsSchema: z.ZodType<LiveArtifactsSystemPrompts> = z
  .object({
    inline: z.string().optional().default(''),
  })
  .default(createEmptyLiveArtifactsSystemPrompts())
  .catch(createEmptyLiveArtifactsSystemPrompts());

const sanitizeSafetySettings = (value: unknown, fallback: SafetySetting[] | undefined): SafetySetting[] | undefined => {
  if (!Array.isArray(value)) {
    return fallback;
  }

  const settings = value.flatMap((item) => {
    const parsed = safetySettingSchema.safeParse(item);
    return parsed.success ? [parsed.data as SafetySetting] : [];
  });

  return settings.length > 0 ? settings : fallback;
};

const sanitizeCustomShortcuts = (value: unknown, fallback: Record<string, string>): Record<string, string> => {
  if (!isRecord(value)) {
    return fallback;
  }

  const shortcuts = Object.fromEntries(
    Object.entries(value).filter((entry): entry is [string, string] => typeof entry[1] === 'string'),
  );

  return shortcuts;
};

const sanitizeTabModelCycleIds = (value: unknown, fallback: string[] | undefined): string[] | undefined => {
  if (!Array.isArray(value)) {
    return fallback;
  }

  const seenIds = new Set<string>();
  const ids = value.reduce<string[]>((nextIds, item) => {
    if (typeof item !== 'string') {
      return nextIds;
    }

    const normalizedId = item.trim();
    if (!normalizedId || seenIds.has(normalizedId)) {
      return nextIds;
    }

    seenIds.add(normalizedId);
    nextIds.push(normalizedId);
    return nextIds;
  }, []);

  return ids.length > 0 ? ids : fallback;
};

const sanitizeMcpServers = (value: unknown, fallback: McpServerConfig[]): McpServerConfig[] => {
  if (!Array.isArray(value)) {
    return fallback;
  }

  const servers = value.flatMap((item): McpServerConfig[] => {
    if (!isRecord(item)) {
      return [];
    }

    const id = typeof item.id === 'string' ? item.id.trim() : '';
    const name = typeof item.name === 'string' ? item.name.trim() : '';
    const transport = item.transport;
    if (!id || !name || (transport !== 'stdio' && transport !== 'http' && transport !== 'sse')) {
      return [];
    }

    const server: McpServerConfig = {
      id,
      name,
      enabled: item.enabled === true,
      transport,
    };

    if (transport === 'stdio') {
      // An empty command stays as an in-progress card: dropping the entry on
      // every keystroke would destroy the server the user is still editing.
      // The API server reports the missing command when the server is used.
      const command = typeof item.command === 'string' ? item.command.trim() : '';
      server.command = command;
      const args = sanitizeStringArray(item.args);
      const env = sanitizeStringRecord(item.env);
      if (args) server.args = args;
      if (env) server.env = env;
    }

    if (transport === 'http' || transport === 'sse') {
      // Keep any typed URL for the same in-progress reason; validity is
      // enforced when the server is actually contacted.
      server.url = typeof item.url === 'string' ? item.url.trim() : '';
      const headers = sanitizeStringRecord(item.headers);
      const auth = sanitizeMcpAuth(item.auth);
      if (headers) server.headers = headers;
      if (auth) server.auth = auth;
    }

    const disabledTools = sanitizeStringArray((item as Record<string, unknown>).disabledTools);
    if (disabledTools) server.disabledTools = disabledTools;

    const disabledAutoApproveTools = sanitizeStringArray((item as Record<string, unknown>).disabledAutoApproveTools);
    if (disabledAutoApproveTools) server.disabledAutoApproveTools = disabledAutoApproveTools;
    if (typeof (item as Record<string, unknown>).isTrusted === 'boolean')
      server.isTrusted = (item as Record<string, unknown>).isTrusted as boolean;

    const timeout = sanitizeMcpTimeout((item as Record<string, unknown>).timeout);
    if (timeout !== undefined) server.timeout = timeout;
    const longRunning = (item as Record<string, unknown>).longRunning;
    if (typeof longRunning === 'boolean') server.longRunning = longRunning;

    return [server];
  });

  return servers;
};

/**
 * Fold legacy top-level `openaiCompatible*` fields (pre-thirdPartyApi layout)
 * into `thirdPartyApi.providers.openai`. Runs on the raw input before parsing
 * so sanitizeThirdPartyApiSettings can migrate that map into `connections`.
 */
export const migrateLegacyOpenAICompatibleInput = (value: unknown): Partial<AppSettings> => {
  if (!isRecord(value)) {
    return {};
  }

  const settings: Record<string, unknown> = { ...value };
  const hasLegacyOpenAIFields =
    'openaiCompatibleApiKey' in settings ||
    'openaiCompatibleBaseUrl' in settings ||
    'openaiCompatibleModelId' in settings ||
    'openaiCompatibleModels' in settings;

  if (!hasLegacyOpenAIFields) {
    return settings as Partial<AppSettings>;
  }

  const thirdPartyApi = isRecord(settings.thirdPartyApi) ? { ...settings.thirdPartyApi } : {};
  const providers = isRecord(thirdPartyApi.providers) ? { ...thirdPartyApi.providers } : {};
  const openaiProvider = isRecord(providers.openai) ? { ...providers.openai } : {};

  providers.openai = {
    ...openaiProvider,
    apiKey: settings.openaiCompatibleApiKey ?? openaiProvider.apiKey,
    baseUrl: settings.openaiCompatibleBaseUrl ?? openaiProvider.baseUrl,
    modelId: settings.openaiCompatibleModelId ?? openaiProvider.modelId,
    models: settings.openaiCompatibleModels ?? openaiProvider.models,
  };

  thirdPartyApi.providers = providers;
  settings.thirdPartyApi = thirdPartyApi;
  return settings as Partial<AppSettings>;
};

/**
 * Rename the legacy stored key `autoFullscreenHtml` to `autoOpenHtmlPreview`.
 * The setting auto-opens the HTML preview modal; it never forces fullscreen,
 * so the old name misdescribed the behavior.
 */
export const migrateLegacyAutoOpenHtmlPreview = (value: unknown): Partial<AppSettings> => {
  if (!isRecord(value) || !('autoFullscreenHtml' in value)) {
    return value as Partial<AppSettings>;
  }

  const settings: Record<string, unknown> = { ...value };
  const legacyValue = settings.autoFullscreenHtml;
  delete settings.autoFullscreenHtml;
  if (settings.autoOpenHtmlPreview === undefined && legacyValue !== undefined) {
    settings.autoOpenHtmlPreview = legacyValue;
  }
  return settings as Partial<AppSettings>;
};

const appSettingsSchema: z.ZodType<AppSettings> = z.object({
  modelId: stringWithDefault(DEFAULT_APP_SETTINGS.modelId),
  providerId: optionalWithDefault(z.string().min(1), DEFAULT_APP_SETTINGS.providerId),
  temperature: numberWithDefault(DEFAULT_APP_SETTINGS.temperature),
  topP: numberWithDefault(DEFAULT_APP_SETTINGS.topP),
  topK: numberWithDefault(DEFAULT_APP_SETTINGS.topK),
  showThoughts: booleanWithDefault(DEFAULT_APP_SETTINGS.showThoughts),
  systemInstruction: stringWithDefault(DEFAULT_APP_SETTINGS.systemInstruction),
  ttsVoice: stringWithDefault(DEFAULT_APP_SETTINGS.ttsVoice),
  thinkingBudget: numberWithDefault(DEFAULT_APP_SETTINGS.thinkingBudget),
  thinkingLevel: optionalWithDefault(z.enum(THINKING_LEVELS), DEFAULT_APP_SETTINGS.thinkingLevel),
  lockedApiKey: nullableStringWithDefault(DEFAULT_APP_SETTINGS.lockedApiKey ?? null),
  isGoogleSearchEnabled: optionalBooleanWithDefault(DEFAULT_APP_SETTINGS.isGoogleSearchEnabled),
  isGoogleMapsEnabled: optionalBooleanWithDefault(DEFAULT_APP_SETTINGS.isGoogleMapsEnabled),
  isCodeExecutionEnabled: optionalBooleanWithDefault(DEFAULT_APP_SETTINGS.isCodeExecutionEnabled),
  isLocalPythonEnabled: optionalBooleanWithDefault(DEFAULT_APP_SETTINGS.isLocalPythonEnabled),
  isUrlContextEnabled: optionalBooleanWithDefault(DEFAULT_APP_SETTINGS.isUrlContextEnabled),
  isDeepSearchEnabled: optionalBooleanWithDefault(DEFAULT_APP_SETTINGS.isDeepSearchEnabled),
  maxOutputTokens: optionalWithDefault(z.number().finite().positive(), DEFAULT_APP_SETTINGS.maxOutputTokens),
  stopSequences: z
    .unknown()
    .optional()
    .transform((value) => sanitizeStringArray(value)),
  presencePenalty: optionalWithDefault(z.number().finite().min(-2).max(2), DEFAULT_APP_SETTINGS.presencePenalty),
  frequencyPenalty: optionalWithDefault(z.number().finite().min(-2).max(2), DEFAULT_APP_SETTINGS.frequencyPenalty),
  seed: optionalWithDefault(z.number().finite().int(), DEFAULT_APP_SETTINGS.seed),
  isRawModeEnabled: optionalBooleanWithDefault(DEFAULT_APP_SETTINGS.isRawModeEnabled),
  hideThinkingInContext: optionalBooleanWithDefault(DEFAULT_APP_SETTINGS.hideThinkingInContext),
  alwaysKeepThinkingInContext: optionalBooleanWithDefault(DEFAULT_APP_SETTINGS.alwaysKeepThinkingInContext),
  safetySettings: z
    .unknown()
    .optional()
    .transform((value) => sanitizeSafetySettings(value, DEFAULT_APP_SETTINGS.safetySettings)),
  mediaResolution: optionalWithDefault(z.nativeEnum(MediaResolution), DEFAULT_APP_SETTINGS.mediaResolution),
  themeId: withDefault(z.enum(THEME_IDS), DEFAULT_APP_SETTINGS.themeId),
  baseFontSize: numberWithDefault(DEFAULT_APP_SETTINGS.baseFontSize),
  useCustomApiConfig: booleanWithDefault(DEFAULT_APP_SETTINGS.useCustomApiConfig),
  serverManagedApi: optionalBooleanWithDefault(DEFAULT_APP_SETTINGS.serverManagedApi),
  apiKey: nullableStringWithDefault(DEFAULT_APP_SETTINGS.apiKey),
  apiProxyUrl: nullableStringWithDefault(DEFAULT_APP_SETTINGS.apiProxyUrl),
  useApiProxy: optionalBooleanWithDefault(DEFAULT_APP_SETTINGS.useApiProxy),
  language: withDefault(z.enum(APP_LANGUAGE_IDS), DEFAULT_APP_SETTINGS.language),
  translationTargetLanguage: withDefault(
    z.enum(TRANSLATION_TARGET_LANGUAGES),
    DEFAULT_APP_SETTINGS.translationTargetLanguage,
  ),
  inputTranslationModelId: optionalStringWithDefault(DEFAULT_APP_SETTINGS.inputTranslationModelId),
  thoughtTranslationTargetLanguage: optionalWithDefault(
    z.enum(TRANSLATION_TARGET_LANGUAGES),
    DEFAULT_APP_SETTINGS.thoughtTranslationTargetLanguage,
  ),
  thoughtTranslationModelId: optionalStringWithDefault(DEFAULT_APP_SETTINGS.thoughtTranslationModelId),
  showInputTranslationButton: optionalBooleanWithDefault(DEFAULT_APP_SETTINGS.showInputTranslationButton),
  isStreamingEnabled: booleanWithDefault(DEFAULT_APP_SETTINGS.isStreamingEnabled),
  transcriptionModelId: stringWithDefault(DEFAULT_APP_SETTINGS.transcriptionModelId),
  filesApiConfig: filesApiConfigSchema,
  expandCodeBlocksByDefault: booleanWithDefault(DEFAULT_APP_SETTINGS.expandCodeBlocksByDefault),
  isAutoTitleEnabled: booleanWithDefault(DEFAULT_APP_SETTINGS.isAutoTitleEnabled),
  isMermaidRenderingEnabled: booleanWithDefault(DEFAULT_APP_SETTINGS.isMermaidRenderingEnabled),
  isGraphvizRenderingEnabled: optionalBooleanWithDefault(DEFAULT_APP_SETTINGS.isGraphvizRenderingEnabled),
  isCompletionNotificationEnabled: booleanWithDefault(DEFAULT_APP_SETTINGS.isCompletionNotificationEnabled),
  isCompletionSoundEnabled: optionalBooleanWithDefault(DEFAULT_APP_SETTINGS.isCompletionSoundEnabled),
  isCompletionSoundBackgroundOnly: optionalBooleanWithDefault(DEFAULT_APP_SETTINGS.isCompletionSoundBackgroundOnly),
  isLoggingEnabled: optionalBooleanWithDefault(DEFAULT_APP_SETTINGS.isLoggingEnabled),
  isSuggestionsEnabled: booleanWithDefault(DEFAULT_APP_SETTINGS.isSuggestionsEnabled),
  isAutoScrollOnSendEnabled: optionalBooleanWithDefault(DEFAULT_APP_SETTINGS.isAutoScrollOnSendEnabled),
  isAutoSendOnSuggestionClick: optionalBooleanWithDefault(DEFAULT_APP_SETTINGS.isAutoSendOnSuggestionClick),
  generateQuadImages: optionalBooleanWithDefault(DEFAULT_APP_SETTINGS.generateQuadImages),
  autoOpenHtmlPreview: optionalBooleanWithDefault(DEFAULT_APP_SETTINGS.autoOpenHtmlPreview),
  unwrapMislabeledHtmlBlocks: optionalBooleanWithDefault(DEFAULT_APP_SETTINGS.unwrapMislabeledHtmlBlocks),
  showWelcomeSuggestions: optionalBooleanWithDefault(DEFAULT_APP_SETTINGS.showWelcomeSuggestions),
  isAudioCompressionEnabled: booleanWithDefault(DEFAULT_APP_SETTINGS.isAudioCompressionEnabled),
  liveArtifactsPromptMode: optionalWithDefault(
    z.enum(LIVE_ARTIFACTS_PROMPT_MODES),
    DEFAULT_APP_SETTINGS.liveArtifactsPromptMode,
  ),
  liveArtifactsSystemPrompt: optionalStringWithDefault(DEFAULT_APP_SETTINGS.liveArtifactsSystemPrompt),
  liveArtifactsSystemPrompts: liveArtifactsSystemPromptsSchema,
  liveArtifactsCustomFontSize: optionalWithDefault(
    z.number().finite().min(10).max(32),
    DEFAULT_APP_SETTINGS.liveArtifactsCustomFontSize,
  ),
  isPasteRichTextAsMarkdownEnabled: optionalBooleanWithDefault(DEFAULT_APP_SETTINGS.isPasteRichTextAsMarkdownEnabled),
  isPasteAsTextFileEnabled: optionalBooleanWithDefault(DEFAULT_APP_SETTINGS.isPasteAsTextFileEnabled),
  showInputPasteButton: optionalBooleanWithDefault(DEFAULT_APP_SETTINGS.showInputPasteButton),
  showInputClearButton: optionalBooleanWithDefault(DEFAULT_APP_SETTINGS.showInputClearButton),
  isCopySelectionFormattingEnabled: optionalBooleanWithDefault(DEFAULT_APP_SETTINGS.isCopySelectionFormattingEnabled),
  isSystemAudioRecordingEnabled: optionalBooleanWithDefault(DEFAULT_APP_SETTINGS.isSystemAudioRecordingEnabled),
  mcpServers: z
    .unknown()
    .optional()
    .transform((value) => sanitizeMcpServers(value, DEFAULT_APP_SETTINGS.mcpServers))
    .default(DEFAULT_APP_SETTINGS.mcpServers),
  customShortcuts: z
    .unknown()
    .optional()
    .transform((value) => sanitizeCustomShortcuts(value, DEFAULT_APP_SETTINGS.customShortcuts))
    .default(DEFAULT_APP_SETTINGS.customShortcuts),
  tabModelCycleIds: z
    .unknown()
    .optional()
    .transform((value) => sanitizeTabModelCycleIds(value, DEFAULT_APP_SETTINGS.tabModelCycleIds)),
  liveTranslateTargetLanguageCode: stringWithDefault(DEFAULT_APP_SETTINGS.liveTranslateTargetLanguageCode),
  liveTranslateEchoTargetLanguage: z.boolean().optional().default(DEFAULT_APP_SETTINGS.liveTranslateEchoTargetLanguage),
  selectionAskModelId: optionalStringWithDefault(DEFAULT_APP_SETTINGS.selectionAskModelId),
  selectionAskProviderId: optionalWithDefault(z.string(), DEFAULT_APP_SETTINGS.selectionAskProviderId),
  tokenCalculatorApiKey: nullableStringWithDefault(DEFAULT_APP_SETTINGS.tokenCalculatorApiKey),
  liveApiKey: nullableStringWithDefault(DEFAULT_APP_SETTINGS.liveApiKey),
  thirdPartyApi: thirdPartyApiSchema,
});

export const sanitizeImportedAppSettings = (value: unknown): AppSettings =>
  appSettingsSchema.parse(migrateLegacyOpenAICompatibleInput(migrateLegacyAutoOpenHtmlPreview(value)));
