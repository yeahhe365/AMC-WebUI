import type { ModelOption, ThinkingLevel } from '@/types';
import { isGemini3Model, isGemmaModel, isReasoningModel, getModelCapabilities } from './modelCapabilities';
import { THINKING_BUDGET_RANGES } from '@/constants/modelConfiguration';

export type ModelModalityId = 'vision' | 'audio' | 'video';

export interface ModelModalityTag {
  id: ModelModalityId;
  labelKey: string;
  defaultLabel: string;
}

export interface ModelCapabilityTag {
  id: string;
  labelKey: string;
  defaultLabel: string;
  category: 'reasoning' | 'vision' | 'tools' | 'search' | 'code' | 'audio' | 'image' | 'pdf';
}

export interface ThinkingLevelSpec {
  type: 'range' | 'discrete' | 'fixed';
  min?: ThinkingLevel;
  max?: ThinkingLevel;
  levels?: ThinkingLevel[];
  defaultLevel?: ThinkingLevel;
  isRecommended?: boolean;
}

export interface ModelSpecification {
  modelId: string;
  modelName: string;
  providerDisplayName: string;
  contextWindow: string;
  maxOutput?: string;
  capabilities: ModelCapabilityTag[];
  modalities: ModelModalityTag[];
  thinkingLevelSpec?: ThinkingLevelSpec;
  thinkingLevelRange?: string;
  thinkingBudgetRange?: string;
  descriptionKey?: string;
  description?: string;
  isMultimodalVision: boolean;
  isReasoning: boolean;
  isToolSupported: boolean;
}

const isVisionSupportedModel = (modelId: string): boolean => {
  const lower = modelId.toLowerCase();
  if (lower.includes('tts') || lower.includes('transcribe')) return false;
  if (lower.includes('gemini')) return true;
  if (lower.includes('gpt-4o') || lower.includes('gpt-4-turbo') || lower.includes('gpt-5') || lower.includes('o4')) {
    return true;
  }
  if (
    lower.includes('claude-3') ||
    lower.includes('claude-sonnet') ||
    lower.includes('claude-opus') ||
    lower.includes('claude-fable')
  ) {
    return true;
  }
  if (lower.includes('vision') || lower.includes('-vl') || lower.includes('/vl')) {
    return true;
  }
  return false;
};

const isAudioSupportedModel = (modelId: string): boolean => {
  const lower = modelId.toLowerCase();
  if (
    lower.includes('tts') ||
    lower.includes('flash-lite-image') ||
    lower.includes('flash-image') ||
    lower.includes('pro-image')
  ) {
    return false;
  }
  if (lower.includes('gemini-1.5') || lower.includes('gemini-2') || lower.includes('gemini-3')) {
    return true;
  }
  if (lower.includes('native-audio') || lower.includes('live-translate') || lower.includes('transcribe-live')) {
    return true;
  }
  if (lower.includes('gpt-4o-audio') || lower.includes('gpt-4o-mini-audio')) {
    return true;
  }
  return false;
};

const isVideoSupportedModel = (modelId: string): boolean => {
  const lower = modelId.toLowerCase();
  if (
    lower.includes('tts') ||
    lower.includes('transcribe') ||
    lower.includes('live-translate') ||
    lower.includes('image')
  ) {
    return false;
  }
  if (lower.includes('gemini-1.5') || lower.includes('gemini-2') || lower.includes('gemini-3')) {
    return true;
  }
  if (lower.includes('qvq') || lower.includes('qwen-vl-max') || lower.includes('qwen2.5-vl')) {
    return true;
  }
  return false;
};

const isPdfSupportedModel = (modelId: string): boolean => {
  const lower = modelId.toLowerCase();
  if (
    lower.includes('tts') ||
    lower.includes('flash-lite-image') ||
    lower.includes('flash-image') ||
    lower.includes('pro-image')
  ) {
    return false;
  }
  if (lower.includes('gemini-1.5') || lower.includes('gemini-2') || lower.includes('gemini-3')) {
    return true;
  }
  if (
    lower.includes('claude-3-5') ||
    lower.includes('claude-3.5') ||
    lower.includes('claude-3-7') ||
    lower.includes('claude-3.7') ||
    lower.includes('claude-sonnet') ||
    lower.includes('claude-opus')
  ) {
    return true;
  }
  if (lower.includes('gpt-4o') || lower.includes('gpt-5') || lower.startsWith('o4') || lower.includes('/o4')) {
    return true;
  }
  return false;
};

const resolveProviderDisplayName = (model: ModelOption): string => {
  if (model.connectionName) return model.connectionName;
  if (model.templateId) {
    switch (model.templateId) {
      case 'openai':
        return 'OpenAI';
      case 'anthropic':
        return 'Anthropic';
      case 'deepseek':
        return 'DeepSeek';
      case 'openrouter':
        return 'OpenRouter';
      case 'qwen':
        return 'Qwen / DashScope';
      case 'kimi':
        return 'Moonshot Kimi';
      case 'glm':
        return 'Zhipu GLM';
      case 'siliconflow':
        return 'SiliconFlow';
      case 'groq':
        return 'Groq';
      case 'together':
        return 'Together AI';
      case 'nvidia':
        return 'NVIDIA NIM';
      case 'minimax':
        return 'MiniMax';
      case 'grok':
        return 'xAI Grok';
      case 'ollama':
        return 'Ollama';
      case 'lmstudio':
        return 'LM Studio';
      default:
        break;
    }
  }

  const id = model.id.toLowerCase();
  if (id.includes('gemini') || id.includes('gemma') || id.includes('robotics')) return 'Google Gemini';
  if (id.includes('gpt-') || id.startsWith('o4')) return 'OpenAI';
  if (id.includes('claude')) return 'Anthropic';
  if (id.includes('deepseek')) return 'DeepSeek';
  if (id.includes('qwen') || id.includes('qwq')) return 'Alibaba Qwen';
  if (id.includes('kimi')) return 'Moonshot Kimi';
  if (id.includes('glm')) return 'Zhipu AI';
  if (id.includes('llama')) return 'Meta Llama';
  if (id.includes('mistral') || id.includes('mixtral')) return 'Mistral AI';

  return 'AI Provider';
};

const resolveContextWindow = (modelId: string): { contextWindow: string; maxOutput?: string } => {
  const lower = modelId.toLowerCase();

  // Gemini audio & TTS specialized models
  if (lower.includes('tts')) {
    return { contextWindow: '8,192 (8K)', maxOutput: '16,384 (16K)' };
  }
  if (lower.includes('live-translate') || lower.includes('-live') || lower.includes('native-audio')) {
    return { contextWindow: '131,072 (128K)', maxOutput: '65,536 (64K)' };
  }

  // Gemini image generation models
  if (lower.includes('flash-lite-image')) {
    return { contextWindow: '65,536 (64K)', maxOutput: '4,096 (4K)' };
  }
  if (lower.includes('flash-image')) {
    return { contextWindow: '131,072 (128K)', maxOutput: '32,768 (32K)' };
  }
  if (lower.includes('pro-image')) {
    return { contextWindow: '65,536 (64K)', maxOutput: '32,768 (32K)' };
  }

  // Gemini Robotics models
  if (lower.includes('robotics')) {
    return { contextWindow: '131,072 (128K)', maxOutput: '65,536 (64K)' };
  }

  // Gemma family
  if (lower.includes('gemma')) {
    return { contextWindow: '256,000 (256K)', maxOutput: '8,192 (8K)' };
  }

  // Gemini 1.5 Pro has 2M context; Gemini 3.1 Pro has 1M context per official API doc
  if (lower.includes('gemini-1.5-pro')) {
    return { contextWindow: '2,000,000 (2M)', maxOutput: '65,536 (64K)' };
  }
  if (lower.includes('gemini-3') || lower.includes('gemini-2.5') || lower.includes('gemini-1.5-flash')) {
    return { contextWindow: '1,000,000 (1M)', maxOutput: '65,536 (64K)' };
  }

  // Claude family
  if (
    lower.includes('claude-3') ||
    lower.includes('claude-sonnet') ||
    lower.includes('claude-opus') ||
    lower.includes('claude-fable')
  ) {
    if (lower.includes('3-7') || lower.includes('sonnet-5') || lower.includes('fable-5')) {
      return { contextWindow: '200,000 (200K)', maxOutput: '64,000 (64K)' };
    }
    return { contextWindow: '200,000 (200K)', maxOutput: '8,192 (8K)' };
  }

  // OpenAI family
  if (lower.includes('gpt-5') || lower.includes('o4')) {
    return { contextWindow: '200,000 (200K)', maxOutput: '100,000 (100K)' };
  }
  if (lower.includes('gpt-4o') || lower.includes('gpt-4-turbo')) {
    return { contextWindow: '128,000 (128K)', maxOutput: '16,384 (16K)' };
  }

  // DeepSeek family
  if (lower.includes('deepseek')) {
    return { contextWindow: '64,000 ~ 128,000', maxOutput: '8,192 (8K)' };
  }

  // Llama family
  if (lower.includes('llama-3')) {
    return { contextWindow: '128,000 (128K)', maxOutput: '8,192 (8K)' };
  }

  // Qwen family
  if (lower.includes('qwen') || lower.includes('qwq')) {
    return { contextWindow: '32,000 ~ 128,000', maxOutput: '8,192 (8K)' };
  }

  // Kimi / GLM
  if (lower.includes('kimi')) {
    return { contextWindow: '128,000 ~ 200,000', maxOutput: '8,192 (8K)' };
  }
  if (lower.includes('glm')) {
    return { contextWindow: '128,000 (128K)', maxOutput: '4,096 (4K)' };
  }

  return { contextWindow: '32,000 ~ 128,000' };
};

const resolveThinkingLevelSpec = (modelId: string): ThinkingLevelSpec | undefined => {
  const lower = modelId.toLowerCase();

  // Models that do NOT support thinking
  if (lower.includes('tts') || lower.includes('transcribe') || lower.includes('live-translate')) {
    return undefined;
  }

  // Image models
  if (lower.includes('pro-image')) {
    return { type: 'fixed' };
  }
  if (lower.includes('flash-lite-image') || lower.includes('flash-image')) {
    return { type: 'discrete', levels: ['MINIMAL', 'HIGH'], defaultLevel: 'MINIMAL' };
  }

  // Gemini 3.7 Flash & 3.8 Flash (minimal not supported)
  if (lower.includes('gemini-3.7-flash') || lower.includes('gemini-3.8-flash')) {
    return { type: 'range', min: 'LOW', max: 'HIGH', defaultLevel: 'MEDIUM' };
  }

  // Gemini 3.5 Flash-Lite
  if (lower.includes('gemini-3.5-flash-lite')) {
    return { type: 'range', min: 'MINIMAL', max: 'HIGH', defaultLevel: 'MINIMAL' };
  }

  // Gemini 3.1 Pro (minimal not supported)
  if (lower.includes('gemini-3.1-pro')) {
    return { type: 'range', min: 'LOW', max: 'HIGH', defaultLevel: 'HIGH' };
  }

  // Gemini Robotics ER 2
  if (lower.includes('gemini-robotics-er')) {
    return { type: 'range', min: 'LOW', max: 'HIGH', defaultLevel: 'MEDIUM', isRecommended: true };
  }

  // Gemini 3.1 Flash Live
  if (lower.includes('flash-live')) {
    return { type: 'range', min: 'MINIMAL', max: 'HIGH', defaultLevel: 'MINIMAL' };
  }

  // Gemma 4 (API supports minimal and high)
  if (lower.includes('gemma')) {
    return { type: 'discrete', levels: ['MINIMAL', 'HIGH'], defaultLevel: 'MINIMAL' };
  }

  // Other Gemini 3 models
  if (lower.includes('gemini-3-flash-preview')) {
    return { type: 'range', min: 'MINIMAL', max: 'HIGH', defaultLevel: 'HIGH' };
  }
  if (lower.includes('gemini-3.6-flash') || lower.includes('gemini-3.5-flash')) {
    return { type: 'range', min: 'MINIMAL', max: 'HIGH', defaultLevel: 'MEDIUM' };
  }

  // OpenAI reasoning models (o1, o3, o4)
  if (lower.startsWith('o4') || lower.includes('/o4') || lower.startsWith('o3') || lower.startsWith('o1')) {
    return { type: 'range', min: 'LOW', max: 'HIGH' };
  }

  return undefined;
};

export const formatThinkingLevelSpec = (
  spec: ThinkingLevelSpec | undefined,
  t: (key: string) => string,
): string | undefined => {
  if (!spec) return undefined;
  if (spec.type === 'fixed') {
    return t('modelCardThinkingFixed') || '内置思考（不可调节）';
  }

  const levelKeyMap: Record<ThinkingLevel, string> = {
    NONE: 'thinkingLevelNone',
    MINIMAL: 'thinkingLevelMinimal',
    LOW: 'thinkingLevelLow',
    MEDIUM: 'thinkingLevelMedium',
    HIGH: 'thinkingLevelHigh',
    XHIGH: 'thinkingLevelXHigh',
    MAX: 'thinkingLevelMax',
  };

  const levelText = (l?: ThinkingLevel) => {
    if (!l) return '';
    const key = levelKeyMap[l];
    const translated = key ? t(key) : undefined;
    return translated && translated !== key ? translated : l;
  };
  const defaultPrefix = spec.isRecommended
    ? t('modelCardThinkingRecommended') || '推荐'
    : t('thinkingDefault') || '默认';

  if (spec.type === 'discrete' && spec.levels) {
    const names = spec.levels.map((l) => levelText(l)).join(' / ');
    return spec.defaultLevel ? `${names} (${defaultPrefix} ${levelText(spec.defaultLevel)})` : names;
  }
  if (spec.type === 'range' && spec.min && spec.max) {
    const rangeStr = `${levelText(spec.min)} ~ ${levelText(spec.max)}`;
    return spec.defaultLevel ? `${rangeStr} (${defaultPrefix} ${levelText(spec.defaultLevel)})` : rangeStr;
  }
  return undefined;
};

const resolveThinkingLevelRange = (modelId: string): string | undefined => {
  const spec = resolveThinkingLevelSpec(modelId);
  if (!spec) return undefined;
  if (spec.type === 'fixed') return '内置思考（不可调节）';
  const defaultSuffix = spec.defaultLevel
    ? ` (${spec.isRecommended ? '推荐' : '默认'} ${spec.defaultLevel === 'MINIMAL' ? 'Minimal' : spec.defaultLevel === 'MEDIUM' ? 'Medium' : spec.defaultLevel === 'HIGH' ? 'High' : spec.defaultLevel})`
    : '';
  if (spec.type === 'discrete' && spec.levels) {
    return `${spec.levels.map((l) => (l === 'MINIMAL' ? 'Minimal' : l === 'HIGH' ? 'High' : l)).join(' / ')}${defaultSuffix}`;
  }
  if (spec.type === 'range' && spec.min && spec.max) {
    const minStr = spec.min === 'MINIMAL' ? 'Minimal' : spec.min === 'LOW' ? 'Low' : spec.min;
    const maxStr = spec.max === 'HIGH' ? 'High' : spec.max;
    return `${minStr} ~ ${maxStr}${defaultSuffix}`;
  }
  return undefined;
};

const resolveThinkingBudget = (modelId: string): string | undefined => {
  const lower = modelId.toLowerCase();

  // Claude 3.7 with extended thinking token budget (1024 ~ 64000)
  if (lower.includes('claude-3-7') || lower.includes('claude-3.7')) {
    return '1,024 ~ 64,000';
  }

  // Gemini 3.x and Gemini Robotics ER 2 models use thinking_level enum instead of token budget
  if (isGemini3Model(modelId) || lower.includes('gemini-robotics-er-2')) {
    return undefined;
  }

  // Gemini 2.5 series legacy budget
  const range = THINKING_BUDGET_RANGES[modelId] || THINKING_BUDGET_RANGES[modelId.replace(/^models\//, '')];
  if (range) {
    return `${range.min.toLocaleString()} ~ ${range.max.toLocaleString()}`;
  }

  return undefined;
};

const resolveModelDescriptionKey = (modelId: string): string | undefined => {
  const lower = modelId.toLowerCase();
  if (lower.includes('gemini-3.1-pro')) return 'modelDescGemini31Pro';
  if (
    lower.includes('gemini-3.8-flash') ||
    lower.includes('gemini-3.7-flash') ||
    lower.includes('gemini-3.6-flash') ||
    lower.includes('gemini-3-flash')
  ) {
    return 'modelDescGemini3Flash';
  }
  if (lower.includes('gemini-3.5-flash-lite')) return 'modelDescGemini35FlashLite';
  if (lower.includes('gemini-robotics-er')) return 'modelDescGeminiRobotics';
  if (lower.includes('gemma')) return 'modelDescGemma4';
  if (lower.includes('live-translate')) return 'modelDescGeminiLiveTranslate';
  if (lower.includes('transcribe')) return 'modelDescGeminiTranscribe';
  if (lower.includes('flash-live')) return 'modelDescGeminiLive';
  if (lower.includes('tts')) return 'modelDescGeminiTts';
  if (lower.includes('image')) return 'modelDescGeminiImage';
  if (lower.includes('deepseek-r1') || lower.includes('deepseek-reasoner')) return 'modelDescDeepSeekR1';
  if (lower.includes('deepseek')) return 'modelDescDeepSeekGeneral';
  if (lower.includes('claude')) return 'modelDescClaude';
  if (lower.includes('llama')) return 'modelDescLlama';
  if (lower.startsWith('o4') || lower.includes('/o4') || lower.startsWith('o3') || lower.startsWith('o1')) {
    return 'modelDescOpenAIReasoning';
  }
  if (lower.includes('qwen') || lower.includes('qwq') || lower.includes('qvq')) return 'modelDescQwen';
  if (lower.includes('kimi')) return 'modelDescKimi';
  if (lower.includes('glm')) return 'modelDescGlm';
  return undefined;
};

const resolveModelDescription = (modelId: string): string | undefined => {
  const lower = modelId.toLowerCase();
  if (lower.includes('gemini-3.1-pro')) {
    return 'Google flagship frontier model designed for high-complexity reasoning, advanced code synthesis, and multimodal problem solving.';
  }
  if (lower.includes('gemini-3.8-flash') || lower.includes('gemini-3.7-flash')) {
    return 'Next-generation reasoning flash model balancing near-instant speed with high analytical precision.';
  }
  if (lower.includes('gemini-3.5-flash-lite')) {
    return 'Ultra-cost-efficient lightweight model with minimal latency for high-frequency interactive tasks.';
  }
  if (lower.includes('deepseek-r1')) {
    return 'Open-weight reasoning model excelling at mathematics, competitive programming, and multi-step logic.';
  }
  if (lower.includes('deepseek-v3') || lower.includes('deepseek-v4')) {
    return 'High-performance general chat and code model with state-of-the-art MoE architecture.';
  }
  if (lower.includes('claude-3-7') || lower.includes('claude-sonnet-5')) {
    return 'Hybrid reasoning model supporting instantaneous responses and extended thinking with exceptional coding acumen.';
  }
  if (lower.includes('llama-3.3-70b')) {
    return 'Flagship open architecture model delivering top-tier conversational depth and tool use.';
  }
  if (lower.includes('o4')) {
    return 'OpenAI next-generation reasoning model with deliberative chain-of-thought processing.';
  }
  return undefined;
};

export const getModelSpecification = (model: ModelOption): ModelSpecification => {
  const modelId = model.id;
  const lower = modelId.toLowerCase();
  const caps = getModelCapabilities(modelId);
  const isReasoning =
    !caps.isTtsModel &&
    !caps.isTranscribeModel &&
    !caps.isLiveTranslate &&
    (isReasoningModel(modelId) || isGemini3Model(modelId) || isGemmaModel(modelId));
  const isVision = isVisionSupportedModel(modelId);
  const isAudio = isAudioSupportedModel(modelId);
  const isVideo = isVideoSupportedModel(modelId);
  const isPdf = isPdfSupportedModel(modelId);
  const isAudioLive = caps.isNativeAudioModel || caps.isLiveTranscribe || caps.isLiveTranslate;
  const isImageGen = caps.isImageGenerationModel || lower.includes('dall-e') || lower.includes('flux');
  const isGemma = isGemmaModel(modelId);
  const isToolSupported = caps.permissions.canUseTools && !isGemma;

  const modalities: ModelModalityTag[] = [];

  if (isVision) {
    modalities.push({
      id: 'vision',
      labelKey: 'modelModalityVision',
      defaultLabel: 'Vision',
    });
  }

  if (isAudio) {
    modalities.push({
      id: 'audio',
      labelKey: 'modelModalityAudio',
      defaultLabel: 'Audio',
    });
  }

  if (isVideo) {
    modalities.push({
      id: 'video',
      labelKey: 'modelModalityVideo',
      defaultLabel: 'Video',
    });
  }

  const capabilities: ModelCapabilityTag[] = [];

  if (isReasoning) {
    capabilities.push({
      id: 'reasoning',
      labelKey: 'modelCapReasoning',
      defaultLabel: 'Thinking',
      category: 'reasoning',
    });
  }

  if (isVision) {
    capabilities.push({
      id: 'vision',
      labelKey: 'modelCapVision',
      defaultLabel: 'Vision',
      category: 'vision',
    });
  }

  if (isToolSupported) {
    capabilities.push({
      id: 'tools',
      labelKey: 'modelCapTools',
      defaultLabel: 'Function Calling',
      category: 'tools',
    });
  }

  if (caps.permissions.canUseGoogleSearch) {
    capabilities.push({
      id: 'search',
      labelKey: 'modelCapSearch',
      defaultLabel: 'Web Search',
      category: 'search',
    });
  }

  if (caps.permissions.canUseLocalPython) {
    capabilities.push({
      id: 'code',
      labelKey: 'modelCapCodeExecution',
      defaultLabel: 'Python Sandbox',
      category: 'code',
    });
  }

  if (isAudioLive) {
    capabilities.push({
      id: 'audio',
      labelKey: 'modelCapLiveAudio',
      defaultLabel: 'Live Audio',
      category: 'audio',
    });
  }

  if (isImageGen) {
    capabilities.push({
      id: 'image',
      labelKey: 'modelCapImageGen',
      defaultLabel: 'Image Gen',
      category: 'image',
    });
  }

  if (isPdf) {
    capabilities.push({
      id: 'pdf',
      labelKey: 'modelCapPdf',
      defaultLabel: 'PDF Support',
      category: 'pdf',
    });
  }

  const { contextWindow, maxOutput } = resolveContextWindow(modelId);
  const thinkingLevelSpec = resolveThinkingLevelSpec(modelId);
  const thinkingLevelRange = resolveThinkingLevelRange(modelId);
  const thinkingBudgetRange = resolveThinkingBudget(modelId);
  const descriptionKey = resolveModelDescriptionKey(modelId);
  const description = resolveModelDescription(modelId);

  return {
    modelId,
    modelName: model.name,
    providerDisplayName: resolveProviderDisplayName(model),
    contextWindow,
    maxOutput,
    capabilities,
    modalities,
    thinkingLevelSpec,
    thinkingLevelRange,
    thinkingBudgetRange,
    descriptionKey,
    description,
    isMultimodalVision: isVision,
    isReasoning,
    isToolSupported,
  };
};
