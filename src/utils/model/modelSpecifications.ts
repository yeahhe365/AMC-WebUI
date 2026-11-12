import type { ModelOption, ThinkingLevel } from '@/types';
import {
  isGemini3Model,
  isGemmaModel,
  isReasoningModel,
  isGrokReasoningModel,
  getModelCapabilities,
} from './modelCapabilities';
import { THINKING_BUDGET_RANGES } from '@/constants/modelConfiguration';
import { KNOWN_MODELS_CATALOG, formatContextWindow } from './knownModelsCatalog';

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
  const catalogEntry =
    KNOWN_MODELS_CATALOG[modelId] ||
    KNOWN_MODELS_CATALOG[modelId.replace(/^(models\/|openai\/|anthropic\/|xai\/)/i, '')];
  if (catalogEntry?.capabilities?.vision !== undefined) {
    return catalogEntry.capabilities.vision;
  }
  if (lower.includes('tts') || lower.includes('transcribe') || lower.includes('live-translate')) return false;
  if (lower.includes('gemini') || lower.includes('gemma')) return true;
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
  if (lower.includes('grok-4') || lower.includes('grok-build') || lower.includes('grok-2-vision')) {
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
    lower.includes('pro-image') ||
    lower.includes('nano-banana')
  ) {
    return false;
  }
  if (
    lower.includes('gemini-1.5') ||
    lower.includes('gemini-2') ||
    lower.includes('gemini-3') ||
    lower.includes('gemini-4')
  ) {
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
  // Gemini 3 Pro Image takes only image and text; the 3.1 image models and
  // Nano Banana 2.1 all document video input.
  if (lower.includes('pro-image')) {
    return false;
  }
  if (lower.includes('flash-image') || lower.includes('flash-lite-image') || lower.includes('nano-banana')) {
    return true;
  }
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
  // Gemini 3 Pro Image takes only image and text; the 3.1 image models and
  // Nano Banana 2.1 all document PDF input.
  if (lower.includes('pro-image')) {
    return false;
  }
  if (lower.includes('flash-image') || lower.includes('flash-lite-image') || lower.includes('nano-banana')) {
    return true;
  }
  if (lower.includes('tts')) {
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
  if (
    id.includes('gpt-') ||
    id.startsWith('o4') ||
    id.startsWith('o3') ||
    id.startsWith('o1') ||
    id.includes('/o4') ||
    id.includes('/o3') ||
    id.includes('/o1')
  ) {
    return 'OpenAI';
  }
  if (id.includes('claude')) return 'Anthropic';
  if (id.includes('deepseek')) return 'DeepSeek';
  if (id.includes('grok')) return 'xAI Grok';
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
  if (lower.includes('nano-banana')) {
    // gemini-nano-banana-2.1: 131,072 in / 32,768 out at 1K, 2K and 4K.
    return { contextWindow: '131,072 (128K)', maxOutput: '32,768 (32K)' };
  }
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

  // Claude family — 5.x is 1M / 128K, the retired 3.x and 4.x lines were 200K
  if (
    lower.includes('claude-3') ||
    lower.includes('claude-4') ||
    lower.includes('claude-sonnet') ||
    lower.includes('claude-opus') ||
    lower.includes('claude-haiku') ||
    lower.includes('claude-fable')
  ) {
    const isCurrentGeneration = /claude-(fable-5|opus-5|sonnet-5|haiku-5)/.test(lower);
    if (isCurrentGeneration) {
      return { contextWindow: '1,000,000 (1M)', maxOutput: '131,072 (128K)' };
    }
    if (lower.includes('3-7') || lower.includes('claude-4')) {
      return { contextWindow: '200,000 (200K)', maxOutput: '64,000 (64K)' };
    }
    return { contextWindow: '200,000 (200K)', maxOutput: '8,192 (8K)' };
  }

  // Grok family — xAI documents a context window only, never an output cap
  if (lower.includes('grok-4.7') || lower.includes('grok-4.6') || lower.includes('grok-4.5')) {
    return { contextWindow: '500,000 (500K)' };
  }
  if (lower.includes('grok-build-0.1')) {
    return { contextWindow: '256,000 (256K)' };
  }
  if (lower.includes('grok-4')) {
    return { contextWindow: '1,000,000 (1M)' };
  }
  if (lower.includes('grok-3') || lower.includes('grok-2')) {
    return { contextWindow: '131,072 (128K)' };
  }

  // OpenAI family
  if (lower.includes('gpt-6') || lower.includes('gpt6')) {
    return { contextWindow: '1,050,000 (1.1M)', maxOutput: '128,000 (128K)' };
  }
  if (
    lower.includes('gpt-5') ||
    lower.startsWith('o4') ||
    lower.includes('/o4') ||
    lower.startsWith('o3') ||
    lower.includes('/o3') ||
    lower.startsWith('o1') ||
    lower.includes('/o1')
  ) {
    return { contextWindow: '200,000 (200K)', maxOutput: '100,000 (100K)' };
  }
  if (lower.includes('gpt-4o') || lower.includes('gpt-4-turbo')) {
    return { contextWindow: '128,000 (128K)', maxOutput: '16,384 (16K)' };
  }

  // DeepSeek family — V4.x only: 1M context, 384K output
  if (lower.includes('deepseek')) {
    return { contextWindow: '1,000,000 (1M)', maxOutput: '393,216 (384K)' };
  }

  // Llama family — 4.x is 10M (Scout) / 1M (Maverick) at 8K output, 3.x is 128K at 4K
  if (lower.includes('llama-4')) {
    if (lower.includes('maverick')) {
      return { contextWindow: '1,048,576 (1M)', maxOutput: '8,192 (8K)' };
    }
    return { contextWindow: '10,485,760 (10M)', maxOutput: '8,192 (8K)' };
  }
  if (lower.includes('llama-3')) {
    return { contextWindow: '128,000 (128K)', maxOutput: '4,096 (4K)' };
  }

  // Mistral family
  if (lower.includes('codestral')) {
    return { contextWindow: '131,072 (128K)' };
  }
  if (lower.includes('mistral') || lower.includes('pixtral')) {
    return { contextWindow: '1,000,000 (1M)' };
  }

  // Qwen family
  if (lower.includes('qwen-max')) {
    return { contextWindow: '32,768 (32K)', maxOutput: '8,192 (8K)' };
  }
  if (lower.includes('qwen') || lower.includes('qwq')) {
    return { contextWindow: '1,000,000 (1M)', maxOutput: '131,072 (128K)' };
  }

  // Kimi / GLM
  if (lower.includes('kimi-k3')) {
    return { contextWindow: '1,048,576 (1M)' };
  }
  if (lower.includes('kimi')) {
    return { contextWindow: '262,144 (256K)' };
  }
  if (lower.includes('glm-5')) {
    return { contextWindow: '1,000,000 (1M)', maxOutput: '131,072 (128K)' };
  }
  if (lower.includes('glm')) {
    return { contextWindow: '131,072 (128K)', maxOutput: '32,768 (32K)' };
  }

  const catalogEntry =
    KNOWN_MODELS_CATALOG[modelId] ||
    KNOWN_MODELS_CATALOG[modelId.replace(/^(models\/|openai\/|anthropic\/|xai\/)/i, '')];
  if (catalogEntry) {
    const formattedCtx = `${catalogEntry.contextWindow.toLocaleString()} (${formatContextWindow(catalogEntry.contextWindow)})`;
    const formattedMax = catalogEntry.maxOutputTokens
      ? `${catalogEntry.maxOutputTokens.toLocaleString()} (${formatContextWindow(catalogEntry.maxOutputTokens)})`
      : undefined;
    return { contextWindow: formattedCtx, maxOutput: formattedMax };
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
  if (lower.includes('nano-banana')) {
    // gemini-nano-banana-2.1: minimal / medium (default) / high.
    return { type: 'range', min: 'MINIMAL', max: 'HIGH', defaultLevel: 'MEDIUM' };
  }
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

  // Gemini 4 Argon defaults to MEDIUM; Gemini 3.1 Pro defaults to HIGH.
  if (lower.includes('gemini-4')) {
    return { type: 'range', min: 'LOW', max: 'HIGH', defaultLevel: 'MEDIUM' };
  }
  if (lower.includes('gemini-3.1-pro')) {
    return { type: 'range', min: 'LOW', max: 'HIGH', defaultLevel: 'HIGH' };
  }

  // Gemini Robotics ER 2
  if (lower.includes('gemini-robotics-er')) {
    return { type: 'range', min: 'LOW', max: 'HIGH', defaultLevel: 'MEDIUM', isRecommended: true };
  }

  // Gemini 3.8 Live Extended Thinking (minimal not supported)
  if (lower.includes('live-extended-thinking')) {
    return { type: 'range', min: 'LOW', max: 'HIGH', defaultLevel: 'LOW' };
  }

  // Deprecated Gemini 3.1 Flash Live (legacy fallback)
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

  // Grok reasoning models
  if (isGrokReasoningModel(modelId)) {
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

  const formatLevelLabel = (level?: ThinkingLevel) => {
    if (!level) return '';
    const key = levelKeyMap[level];
    const translated = key ? t(key) : undefined;
    return translated && translated !== key ? translated : level;
  };
  const defaultPrefix = spec.isRecommended
    ? t('modelCardThinkingRecommended') || '推荐'
    : t('thinkingDefault') || '默认';

  if (spec.type === 'discrete' && spec.levels) {
    const names = spec.levels.map((level) => formatLevelLabel(level)).join(' / ');
    return spec.defaultLevel ? `${names} (${defaultPrefix} ${formatLevelLabel(spec.defaultLevel)})` : names;
  }
  if (spec.type === 'range' && spec.min && spec.max) {
    const rangeText = `${formatLevelLabel(spec.min)} ~ ${formatLevelLabel(spec.max)}`;
    return spec.defaultLevel ? `${rangeText} (${defaultPrefix} ${formatLevelLabel(spec.defaultLevel)})` : rangeText;
  }
  return undefined;
};

const resolveThinkingLevelRange = (modelId: string): string | undefined => {
  const spec = resolveThinkingLevelSpec(modelId);
  if (!spec) return undefined;
  if (spec.type === 'fixed') return '内置思考（不可调节）';
  const defaultSuffix = spec.defaultLevel
    ? ` (${spec.isRecommended ? '推荐' : '默认'} ${spec.defaultLevel === 'MINIMAL' ? 'Minimal' : spec.defaultLevel === 'LOW' ? 'Low' : spec.defaultLevel === 'MEDIUM' ? 'Medium' : spec.defaultLevel === 'HIGH' ? 'High' : spec.defaultLevel})`
    : '';
  if (spec.type === 'discrete' && spec.levels) {
    return `${spec.levels.map((level) => (level === 'MINIMAL' ? 'Minimal' : level === 'LOW' ? 'Low' : level === 'HIGH' ? 'High' : level)).join(' / ')}${defaultSuffix}`;
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

  // Gemini 3.x and Gemini Robotics ER 2 use the thinking_level enum instead of
  // a token budget; the Gemini 2.5 series still takes one.
  if (isGemini3Model(modelId) || lower.includes('gemini-robotics-er-2')) {
    return undefined;
  }

  const range = THINKING_BUDGET_RANGES[modelId] || THINKING_BUDGET_RANGES[modelId.replace(/^models\//, '')];
  if (range) {
    return `${range.min.toLocaleString()} ~ ${range.max.toLocaleString()}`;
  }

  return undefined;
};

const resolveModelDescriptionKey = (modelId: string): string | undefined => {
  const lower = modelId.toLowerCase();
  if (lower.includes('gemini-4-carbon')) return 'modelDescGemini4Carbon';
  if (lower.includes('gemini-4')) return 'modelDescGemini4Argon';
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
  if (lower.includes('live-extended-thinking')) return 'modelDescGeminiLiveExtendedThinking';
  if (lower.includes('flash-live') || lower.includes('-live')) return 'modelDescGeminiLive';
  if (lower.includes('tts')) return 'modelDescGeminiTts';
  if (lower.includes('image')) return 'modelDescGeminiImage';
  if (lower.includes('deepseek-r1') || lower.includes('deepseek-reasoner')) return 'modelDescDeepSeekR1';
  if (lower.includes('deepseek')) return 'modelDescDeepSeekGeneral';
  if (lower.includes('claude')) return 'modelDescClaude';
  if (lower.includes('llama')) return 'modelDescLlama';
  if (lower.includes('grok')) return 'modelDescGrok';
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
  if (lower.includes('gemini-4-carbon')) {
    return "Google's most capable reasoning model, built for complex software engineering, deep mathematical and scientific problem solving, high factual accuracy, and autonomous multi-step agents.";
  }
  if (lower.includes('gemini-4')) {
    return 'Google frontier reasoning model built for complex software engineering, deep mathematical and scientific problem solving, and long-decode workflows.';
  }
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
  if (lower.includes('grok')) {
    return 'xAI frontier model with high-speed reasoning, real-time search knowledge, and deep conversational nuance.';
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
