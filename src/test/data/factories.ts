import {
  MediaResolution,
  type AppSettings,
  type ChatMessage,
  type ChatSettings,
  type SavedChatSession,
  type Theme,
  type ThirdPartyConnection,
  type ThirdPartyTemplateId,
  type UploadedFile,
  GEMINI_PROVIDER_ID,
  THIRD_PARTY_TEMPLATE_IDS,
} from '@/types';
import { AVAILABLE_THEMES } from '@/constants/themeRegistry';
import { DEFAULT_TRANSCRIPTION_MODEL_ID } from '@/constants/modelConfiguration';
import { createDefaultThirdPartyApiSettings, getThirdPartyTemplateDefaults } from '@/utils/thirdPartyApiProviders';

export const createChatSettings = (overrides: Partial<ChatSettings> = {}): ChatSettings => ({
  modelId: 'gemini-3.1-pro-preview',
  providerId: GEMINI_PROVIDER_ID,
  temperature: 1,
  topP: 1,
  topK: 1,
  showThoughts: false,
  systemInstruction: '',
  ttsVoice: 'Aoede',
  thinkingBudget: 0,
  thinkingLevel: 'MEDIUM',
  lockedApiKey: null,
  isGoogleSearchEnabled: false,
  isCodeExecutionEnabled: false,
  isLocalPythonEnabled: false,
  isUrlContextEnabled: false,
  isDeepSearchEnabled: false,
  isRawModeEnabled: false,
  hideThinkingInContext: false,
  safetySettings: [],
  mediaResolution: MediaResolution.MEDIA_RESOLUTION_MEDIUM,
  ...overrides,
});

export const createAppSettings = (overrides: Partial<AppSettings> = {}): AppSettings => ({
  ...createChatSettings(),
  themeId: 'pearl',
  baseFontSize: 14,
  useCustomApiConfig: false,
  apiKey: 'api-key',
  apiProxyUrl: null,
  language: 'en',
  translationTargetLanguage: 'English',
  isStreamingEnabled: true,
  transcriptionModelId: DEFAULT_TRANSCRIPTION_MODEL_ID,
  filesApiConfig: {
    images: true,
    pdfs: true,
    audio: true,
    video: true,
    text: true,
  },
  expandCodeBlocksByDefault: false,
  isAutoTitleEnabled: true,
  isMermaidRenderingEnabled: true,
  isGraphvizRenderingEnabled: true,
  isCompletionNotificationEnabled: false,
  isCompletionSoundEnabled: false,
  isSuggestionsEnabled: true,
  isAutoScrollOnSendEnabled: true,
  generateQuadImages: false,
  isAudioCompressionEnabled: false,
  liveArtifactsPromptMode: 'inline',
  liveArtifactsSystemPrompt: '',
  liveArtifactsSystemPrompts: {
    inline: '',
  },
  isPasteRichTextAsMarkdownEnabled: true,
  isSystemAudioRecordingEnabled: false,
  mcpServers: [],
  customShortcuts: {},
  liveTranslateTargetLanguageCode: 'en',
  liveTranslateEchoTargetLanguage: false,
  thirdPartyApi: createDefaultThirdPartyApiSettings(),
  ...overrides,
});

export const createUploadedFile = (overrides: Partial<UploadedFile> = {}): UploadedFile => ({
  id: 'file-1',
  name: 'attachment.png',
  type: 'image/png',
  size: 123,
  uploadState: 'active',
  ...overrides,
});

export const createChatMessage = (overrides: Partial<ChatMessage> = {}): ChatMessage => ({
  id: 'message-1',
  role: 'user',
  content: 'hello',
  timestamp: new Date('2026-04-12T00:00:00.000Z'),
  ...overrides,
});

export const createSavedChatSession = (overrides: Partial<SavedChatSession> = {}): SavedChatSession => ({
  id: 'session-1',
  title: 'Session',
  timestamp: new Date('2026-04-12T00:00:00.000Z').getTime(),
  messages: [createChatMessage()],
  settings: createChatSettings(),
  ...overrides,
});

export const createSavedChatSessionMetadata = (overrides: Partial<SavedChatSession> = {}): SavedChatSession => ({
  id: 'session',
  title: 'Session',
  timestamp: 0,
  messages: [],
  settings: createChatSettings(),
  ...overrides,
});

export const createTheme = (overrides: Partial<Theme> = {}): Theme => ({
  ...AVAILABLE_THEMES.find((theme) => theme.id === 'pearl')!,
  ...overrides,
});

const resolveFactoryTemplateId = (overrides: Partial<ThirdPartyConnection>): ThirdPartyTemplateId => {
  if (overrides.templateId) {
    return overrides.templateId;
  }
  if (overrides.id === 'custom') {
    return 'custom-openai';
  }
  if (overrides.id && (THIRD_PARTY_TEMPLATE_IDS as readonly string[]).includes(overrides.id)) {
    return overrides.id as ThirdPartyTemplateId;
  }
  return 'openai';
};

export const createThirdPartyConnection = (overrides: Partial<ThirdPartyConnection> = {}): ThirdPartyConnection => {
  const templateId = resolveFactoryTemplateId(overrides);
  const defaults = getThirdPartyTemplateDefaults(templateId);
  const id =
    overrides.id ?? (templateId === 'custom-openai' || templateId === 'custom-anthropic' ? 'custom' : templateId);

  const { extraHeaders, models, modelId, ...rest } = overrides;

  return {
    id,
    name: defaults.name,
    templateId,
    protocol: defaults.protocol,
    apiKey: null,
    baseUrl: defaults.baseUrl,
    enabled: true,
    ...rest,
    extraHeaders: { ...(extraHeaders ?? {}) },
    models: models ?? defaults.models,
    modelId: modelId ?? defaults.modelId,
  };
};
