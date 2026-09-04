import type { McpServerAuthType, McpServerConfig, McpServerTransport } from '../../shared/mcpServerConfig';
import {
  APP_LANGUAGE_IDS as REGISTRY_APP_LANGUAGE_IDS,
  type AppLanguage as RegistryAppLanguage,
} from '@/i18n/languageRegistry';

export interface ModelOption {
  id: string;
  name: string;
  isPinned?: boolean;
  apiMode?: ApiMode;
  /** Session routing id: Gemini native or a third-party connection id. */
  providerId?: ChatProviderId;
  /** Template used to render the connection logo; independent of connection id. */
  templateId?: ThirdPartyTemplateId;
  /** User-visible connection name for picker grouping. */
  connectionName?: string;
  /** True when this entry is the current session's model on a missing/disabled connection. */
  unavailable?: boolean;
  /** True when the connection is enabled but has no API key yet. */
  missingApiKey?: boolean;
}

export enum HarmCategory {
  HARM_CATEGORY_HARASSMENT = 'HARM_CATEGORY_HARASSMENT',
  HARM_CATEGORY_HATE_SPEECH = 'HARM_CATEGORY_HATE_SPEECH',
  HARM_CATEGORY_SEXUALLY_EXPLICIT = 'HARM_CATEGORY_SEXUALLY_EXPLICIT',
  HARM_CATEGORY_DANGEROUS_CONTENT = 'HARM_CATEGORY_DANGEROUS_CONTENT',
}

export enum HarmBlockThreshold {
  OFF = 'OFF',
  BLOCK_NONE = 'BLOCK_NONE',
  BLOCK_ONLY_HIGH = 'BLOCK_ONLY_HIGH',
  BLOCK_MEDIUM_AND_ABOVE = 'BLOCK_MEDIUM_AND_ABOVE',
  BLOCK_LOW_AND_ABOVE = 'BLOCK_LOW_AND_ABOVE',
}

export enum MediaResolution {
  MEDIA_RESOLUTION_UNSPECIFIED = 'MEDIA_RESOLUTION_UNSPECIFIED',
  MEDIA_RESOLUTION_LOW = 'MEDIA_RESOLUTION_LOW',
  MEDIA_RESOLUTION_MEDIUM = 'MEDIA_RESOLUTION_MEDIUM',
  MEDIA_RESOLUTION_HIGH = 'MEDIA_RESOLUTION_HIGH',
  MEDIA_RESOLUTION_ULTRA_HIGH = 'MEDIA_RESOLUTION_ULTRA_HIGH',
}

export type ImageOutputMode = 'IMAGE_TEXT' | 'IMAGE_ONLY';
/** All valid API modes — used for both type checking and runtime validation. */
export const API_MODES = ['gemini-native', 'third-party'] as const;
export type ApiMode = (typeof API_MODES)[number];

/** The built-in Gemini provider id used in session routing. */
export const GEMINI_PROVIDER_ID = 'gemini-native';

/**
 * Normalize the apiMode tag on a persisted ModelOption (the "provider family"
 * label set by the model list editor). The legacy 'openai-compatible' tag is
 * folded into 'third-party' so old custom third-party models keep grouping
 * under the Third-Party section instead of disappearing or dropping to the
 * OpenAI Compatible segment.
 */
export const normalizeModelApiModeTag = (value: unknown): ApiMode | undefined => {
  if (value === 'gemini-native' || value === 'third-party') {
    return value;
  }
  if (value === 'openai-compatible') {
    return 'third-party';
  }
  return undefined;
};
export type { McpServerAuthType, McpServerConfig, McpServerTransport };

/** Wire protocol supported by a third-party API provider. */
export type ThirdPartyApiProtocol = 'openai-compatible' | 'anthropic';

/** Legacy persisted provider map keys (pre-connection-list settings). */
export const LEGACY_THIRD_PARTY_PROVIDER_IDS = [
  'openai',
  'deepseek',
  'anthropic',
  'openrouter',
  'qwen',
  'kimi',
  'glm',
  'custom',
] as const;
export type LegacyThirdPartyProviderId = (typeof LEGACY_THIRD_PARTY_PROVIDER_IDS)[number];
/** @deprecated Use ThirdPartyTemplateId or a connection id. Kept for logos and migration. */
export type ThirdPartyProviderId = LegacyThirdPartyProviderId;

/** Create-connection templates. `custom` is not a template; it migrates to custom-openai. */
export const THIRD_PARTY_TEMPLATE_IDS = [
  'openai',
  'deepseek',
  'anthropic',
  'openrouter',
  'qwen',
  'kimi',
  'glm',
  'nvidia',
  'minimax',
  'grok',
  'atlascloud',
  'custom-openai',
  'custom-anthropic',
] as const;
export type ThirdPartyTemplateId = (typeof THIRD_PARTY_TEMPLATE_IDS)[number];

/** Session routing id: Gemini native, a migrated legacy provider id, or a UUID. */
export type ChatProviderId = string;

/** Connection + model configuration for a single third-party endpoint. */
export interface ThirdPartyConnection {
  id: string;
  name: string;
  templateId: ThirdPartyTemplateId;
  protocol: ThirdPartyApiProtocol;
  apiKey: string | null;
  baseUrl: string | null;
  extraHeaders: Record<string, string>;
  modelId: string;
  models: ModelOption[];
  enabled: boolean;
}

/** Third-party connections. Sessions route by stored (providerId, modelId). */
export interface ThirdPartyApiSettings {
  connections: ThirdPartyConnection[];
}

/** All valid thinking levels — used for both type checking and runtime validation. */
export const THINKING_LEVELS = ['MINIMAL', 'LOW', 'MEDIUM', 'HIGH'] as const;
export type ThinkingLevel = (typeof THINKING_LEVELS)[number];
/** All valid live artifacts prompt modes — used for both type checking and runtime validation. */
export const LIVE_ARTIFACTS_PROMPT_MODES = ['inline'] as const;
export type LiveArtifactsPromptMode = (typeof LIVE_ARTIFACTS_PROMPT_MODES)[number];
export type LiveArtifactsSystemPrompts = Record<LiveArtifactsPromptMode, string>;
/** All valid translation target languages — used for both type checking and runtime validation. */
export const TRANSLATION_TARGET_LANGUAGES = [
  'English',
  'Simplified Chinese',
  'Traditional Chinese',
  'Japanese',
  'Korean',
  'Spanish',
  'French',
  'German',
] as const;
export type TranslationTargetLanguage = (typeof TRANSLATION_TARGET_LANGUAGES)[number];

/** All valid app language identifiers — used for both type checking and runtime validation. */
export const APP_LANGUAGE_IDS = REGISTRY_APP_LANGUAGE_IDS;
export type AppLanguage = RegistryAppLanguage;

export interface SafetySetting {
  category: HarmCategory;
  threshold: HarmBlockThreshold;
}

export interface FilesApiConfig {
  images: boolean;
  pdfs: boolean;
  audio: boolean;
  video: boolean;
  text: boolean;
}

export interface ChatSettings {
  modelId: string;
  /** Which provider this session's modelId belongs to. Absent = gemini-native. */
  providerId?: ChatProviderId;
  temperature: number;
  topP: number;
  topK: number;
  showThoughts: boolean;
  systemInstruction: string;
  ttsVoice: string;
  thinkingBudget: number;
  thinkingLevel?: ThinkingLevel;
  lockedApiKey?: string | null;
  isGoogleSearchEnabled?: boolean;
  isGoogleMapsEnabled?: boolean;
  isCodeExecutionEnabled?: boolean;
  isLocalPythonEnabled?: boolean;
  isUrlContextEnabled?: boolean;
  isDeepSearchEnabled?: boolean;
  /** PDF navigation preset (AI page-locate + side viewer). */
  isPdfNavEnabled?: boolean;
  /** Video navigation preset (AI timestamp-locate + side player). */
  isVideoNavEnabled?: boolean;
  /** Audio navigation preset (AI timestamp-locate + side player). */
  isAudioNavEnabled?: boolean;
  /** Unified media navigation preset (PDF + Video). */
  isMediaNavEnabled?: boolean;
  /** Maximum output tokens to generate (optional; unset = model default). */
  maxOutputTokens?: number;
  /** Stop sequences to halt generation (optional). */
  stopSequences?: string[];
  /** Presence penalty (-2.0 to 2.0) to encourage new topics (optional). */
  presencePenalty?: number;
  /** Frequency penalty (-2.0 to 2.0) to discourage repetition (optional). */
  frequencyPenalty?: number;
  /** Seed for deterministic sampling on supported models (optional). */
  seed?: number;
  isRawModeEnabled?: boolean;
  hideThinkingInContext?: boolean;
  alwaysKeepThinkingInContext?: boolean;
  safetySettings?: SafetySetting[];
  mediaResolution?: MediaResolution;
  transcriptionLanguage?: string;
  transcriptionWordTimestamps?: boolean;
  transcriptionSpeakerLabels?: boolean;
  transcriptionSmartMode?: boolean;
  transcriptionCustomVocabulary?: string;
  /** Instruction used only for transcription turns; kept separate from the chat `systemInstruction`. */
  transcriptionSystemInstruction?: string;
}

export type ChatSettingsUpdater = (updater: (prevSettings: ChatSettings) => ChatSettings) => void;

const DROPPED_LEGACY_PROVIDER_IDS = new Set(['openai-compatible']);

/**
 * Normalize a persisted session providerId. Any non-empty connection id survives
 * (including UUIDs). Legacy `openai-compatible` is dropped so routing falls back
 * to Gemini / modelId inference.
 */
export const normalizeProviderId = (value: unknown): ChatProviderId | undefined => {
  if (typeof value !== 'string') {
    return undefined;
  }

  const trimmed = value.trim();
  if (!trimmed || DROPPED_LEGACY_PROVIDER_IDS.has(trimmed)) {
    return undefined;
  }

  return trimmed;
};

export interface AppSettings extends ChatSettings {
  themeId: 'system' | 'onyx' | 'graphite' | 'pearl';
  baseFontSize: number;
  useCustomApiConfig: boolean;
  serverManagedApi?: boolean;
  apiKey: string | null;
  apiProxyUrl: string | null;
  useApiProxy?: boolean;
  language: AppLanguage;
  translationTargetLanguage: TranslationTargetLanguage;
  inputTranslationModelId?: string;
  thoughtTranslationTargetLanguage?: TranslationTargetLanguage;
  thoughtTranslationModelId?: string;
  showInputTranslationButton?: boolean;
  isStreamingEnabled: boolean;
  transcriptionModelId: string;
  filesApiConfig: FilesApiConfig;
  expandCodeBlocksByDefault: boolean;
  isAutoTitleEnabled: boolean;
  isMermaidRenderingEnabled: boolean;
  isGraphvizRenderingEnabled?: boolean;
  isCompletionNotificationEnabled: boolean;
  isCompletionSoundEnabled?: boolean;
  isCompletionSoundBackgroundOnly?: boolean;
  isLoggingEnabled?: boolean;
  isSuggestionsEnabled: boolean;
  isAutoScrollOnSendEnabled?: boolean;
  isAutoSendOnSuggestionClick?: boolean;
  generateQuadImages?: boolean;
  autoOpenHtmlPreview?: boolean;
  /** 将语言误标为 css/text/txt/markdown/md、内容却像完整 HTML 文档或含 LA
   *  标记的代码块自动解包为实时预览。关闭后此类代码块一律按源码显示。 */
  unwrapMislabeledHtmlBlocks?: boolean;
  showWelcomeSuggestions?: boolean;
  isAudioCompressionEnabled: boolean;
  liveArtifactsPromptMode?: LiveArtifactsPromptMode;
  liveArtifactsSystemPrompt?: string;
  liveArtifactsSystemPrompts?: LiveArtifactsSystemPrompts;
  liveArtifactsCustomFontSize?: number;
  isPasteRichTextAsMarkdownEnabled?: boolean;
  isPasteAsTextFileEnabled?: boolean;
  showInputPasteButton?: boolean;
  showInputClearButton?: boolean;
  showVoiceInputButton?: boolean;
  isCopySelectionFormattingEnabled?: boolean;
  isSystemAudioRecordingEnabled?: boolean;
  mcpServers: McpServerConfig[];
  customShortcuts: Record<string, string>; // ID -> Key Combination String
  tabModelCycleIds?: string[];
  liveTranslateTargetLanguageCode: string; // 目标语言 BCP-47 代码（源语言由模型自动检测）
  liveTranslateEchoTargetLanguage: boolean; // 输入已是目标语言时是否回放原声
  selectionAskModelId?: string;
  selectionAskProviderId?: ChatProviderId;
  tokenCalculatorApiKey?: string | null;
  liveApiKey?: string | null;
  thirdPartyApi: ThirdPartyApiSettings;
}
