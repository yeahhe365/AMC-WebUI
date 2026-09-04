import { getRuntimeConfigAppSettingsOverrides } from '@/runtime/runtimeConfig';
import {
  MediaResolution,
  type AppSettings,
  type ChatSettings,
  type FilesApiConfig,
  type ThinkingLevel,
  GEMINI_PROVIDER_ID,
} from '@/types';
import { createEmptyLiveArtifactsSystemPrompts } from '@/utils/live-artifacts/liveArtifactsPromptSettings';
import { DEFAULT_THEME_ID } from './themeRegistry';
import {
  DEFAULT_MODEL_ID,
  DEFAULT_SHOW_THOUGHTS,
  DEFAULT_TEMPERATURE,
  DEFAULT_THINKING_BUDGET,
  DEFAULT_THINKING_LEVEL,
  DEFAULT_THOUGHT_TRANSLATION_MODEL_ID,
  DEFAULT_TOP_K,
  DEFAULT_TOP_P,
  DEFAULT_TRANSCRIPTION_MODEL_ID,
  DEFAULT_TTS_VOICE,
} from './modelConfiguration';
import { DEFAULT_SAFETY_SETTINGS } from './safetySettings';
import { DEFAULT_THOUGHT_TRANSLATION_TARGET_LANGUAGE, DEFAULT_TRANSLATION_TARGET_LANGUAGE } from './translationOptions';
import { createDefaultThirdPartyApiSettings } from '@/utils/thirdPartyApiProviders';

export const DEFAULT_SYSTEM_INSTRUCTION = '';

const DEFAULT_IS_STREAMING_ENABLED = true;
const DEFAULT_BASE_FONT_SIZE = 16;
const DEFAULT_LIVE_ARTIFACTS_CUSTOM_FONT_SIZE = 16;
const DEFAULT_IS_AUDIO_COMPRESSION_ENABLED = true;
const DEFAULT_MEDIA_RESOLUTION = MediaResolution.MEDIA_RESOLUTION_UNSPECIFIED;

export const DEFAULT_FILES_API_CONFIG: FilesApiConfig = {
  images: false,
  pdfs: true,
  audio: true,
  video: true,
  text: false,
};

export const DEFAULT_CHAT_SETTINGS: Omit<ChatSettings, 'lockedApiKey'> & { lockedApiKey: null } = {
  modelId: DEFAULT_MODEL_ID,
  providerId: GEMINI_PROVIDER_ID,
  temperature: DEFAULT_TEMPERATURE,
  topP: DEFAULT_TOP_P,
  topK: DEFAULT_TOP_K,
  showThoughts: DEFAULT_SHOW_THOUGHTS,
  systemInstruction: DEFAULT_SYSTEM_INSTRUCTION,
  ttsVoice: DEFAULT_TTS_VOICE,
  thinkingBudget: DEFAULT_THINKING_BUDGET,
  thinkingLevel: DEFAULT_THINKING_LEVEL as ThinkingLevel,
  lockedApiKey: null,
  isGoogleSearchEnabled: false,
  isGoogleMapsEnabled: false,
  isCodeExecutionEnabled: false,
  isUrlContextEnabled: false,
  isDeepSearchEnabled: false,
  isPdfNavEnabled: false,
  isVideoNavEnabled: false,
  isAudioNavEnabled: false,
  maxOutputTokens: undefined,
  stopSequences: undefined,
  presencePenalty: undefined,
  frequencyPenalty: undefined,
  seed: undefined,
  isRawModeEnabled: false,
  hideThinkingInContext: false,
  alwaysKeepThinkingInContext: false,
  safetySettings: DEFAULT_SAFETY_SETTINGS,
  mediaResolution: DEFAULT_MEDIA_RESOLUTION,
  transcriptionLanguage: '',
  transcriptionWordTimestamps: false,
  transcriptionSpeakerLabels: false,
  transcriptionSmartMode: false,
  transcriptionCustomVocabulary: '',
};

const BASE_DEFAULT_APP_SETTINGS: Omit<AppSettings, 'thirdPartyApi'> = {
  ...DEFAULT_CHAT_SETTINGS,
  themeId: DEFAULT_THEME_ID,
  baseFontSize: DEFAULT_BASE_FONT_SIZE,
  useCustomApiConfig: false,
  serverManagedApi: false,
  apiKey: null,
  apiProxyUrl: 'https://api-proxy.de/gemini',
  useApiProxy: false,
  language: 'system',
  translationTargetLanguage: DEFAULT_TRANSLATION_TARGET_LANGUAGE,
  inputTranslationModelId: DEFAULT_THOUGHT_TRANSLATION_MODEL_ID,
  thoughtTranslationTargetLanguage: DEFAULT_THOUGHT_TRANSLATION_TARGET_LANGUAGE,
  thoughtTranslationModelId: DEFAULT_THOUGHT_TRANSLATION_MODEL_ID,
  showInputTranslationButton: false,
  isStreamingEnabled: DEFAULT_IS_STREAMING_ENABLED,
  transcriptionModelId: DEFAULT_TRANSCRIPTION_MODEL_ID,
  filesApiConfig: DEFAULT_FILES_API_CONFIG,
  expandCodeBlocksByDefault: false,
  isAutoTitleEnabled: true,
  isMermaidRenderingEnabled: true,
  isGraphvizRenderingEnabled: true,
  isCompletionNotificationEnabled: false,
  isCompletionSoundEnabled: false,
  isCompletionSoundBackgroundOnly: false,
  isLoggingEnabled: false,
  isSuggestionsEnabled: true,
  isAutoScrollOnSendEnabled: true,
  isAutoSendOnSuggestionClick: true,
  generateQuadImages: false,
  autoOpenHtmlPreview: false,
  unwrapMislabeledHtmlBlocks: true,
  showWelcomeSuggestions: true,
  isAudioCompressionEnabled: DEFAULT_IS_AUDIO_COMPRESSION_ENABLED,
  liveArtifactsPromptMode: 'inline',
  liveArtifactsSystemPrompt: '',
  liveArtifactsSystemPrompts: createEmptyLiveArtifactsSystemPrompts(),
  liveArtifactsCustomFontSize: DEFAULT_LIVE_ARTIFACTS_CUSTOM_FONT_SIZE,
  isPasteRichTextAsMarkdownEnabled: true,
  isPasteAsTextFileEnabled: true,
  showInputPasteButton: true,
  showInputClearButton: true,
  showVoiceInputButton: false,
  isCopySelectionFormattingEnabled: true,
  isSystemAudioRecordingEnabled: false,
  mcpServers: [],
  customShortcuts: {},
  tabModelCycleIds: undefined,
  liveTranslateTargetLanguageCode: 'en',
  liveTranslateEchoTargetLanguage: false,
  selectionAskModelId: DEFAULT_MODEL_ID,
  selectionAskProviderId: undefined,
  tokenCalculatorApiKey: null,
  liveApiKey: null,
};

export function getDefaultAppSettings(): AppSettings {
  return {
    ...BASE_DEFAULT_APP_SETTINGS,
    ...getRuntimeConfigAppSettingsOverrides(),
    // Fresh clone per call: a shared module-level thirdPartyApi object would
    // leak mutations from one consumer into every other default. The provider
    // configs (incl. the models array) must be copied, not shared by reference.
    thirdPartyApi: createDefaultThirdPartyApiSettings(),
  };
}

export const DEFAULT_APP_SETTINGS: AppSettings = getDefaultAppSettings();
