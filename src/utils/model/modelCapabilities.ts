import { REQUIRED_THINKING_MODEL_IDS, MODELS_SUPPORTING_RAW_MODE } from '@/constants/modelConfiguration';
import type { ThinkingLevel } from '@/types';
import { normalizeModelId } from './modelId';

export const isGemini3Model = (modelId: string): boolean => {
  if (!modelId) return false;
  const lowerId = modelId.toLowerCase();
  if (lowerId.includes('transcribe')) return false;
  return (
    REQUIRED_THINKING_MODEL_IDS.some((model) => lowerId.includes(model)) ||
    lowerId.includes('gemini-3-pro') ||
    lowerId.includes('gemini-3.1-flash')
  );
};

export const isGemmaModel = (modelId: string): boolean => !!modelId && modelId.toLowerCase().includes('gemma');

export const isGeminiRoboticsModel = (modelId: string): boolean =>
  !!modelId && modelId.toLowerCase().includes('gemini-robotics-er');

/**
 * gemini-3.7-flash and gemini-3.8-flash have thinking levels low/medium/high
 * — minimal is not supported and returns an error per their model cards.
 * 3.5/3.6 Flash and 3.5 Flash-Lite do accept MINIMAL.
 */
const isGemini37Or38FlashModel = (modelId: string): boolean => {
  if (!modelId) return false;
  const lowerId = modelId.toLowerCase();
  return lowerId.includes('gemini-3.7-flash') || lowerId.includes('gemini-3.8-flash');
};

export const isLiveTranslateModel = (modelId: string): boolean =>
  !!modelId && modelId.toLowerCase().includes('live-translate');

export const isLiveTranscribeModel = (modelId: string): boolean =>
  !!modelId && modelId.toLowerCase().includes('transcribe-live');

export const isTranscribeModel = (modelId: string): boolean =>
  !!modelId && modelId.toLowerCase().includes('transcribe') && !modelId.toLowerCase().includes('transcribe-live');

const isNativeAudioModel = (modelId: string): boolean => {
  const lowerId = modelId.toLowerCase();
  return (
    lowerId.includes('native-audio') ||
    lowerId.includes('-live-') ||
    lowerId.includes('live-translate') ||
    lowerId.includes('transcribe-live')
  );
};

export const isGemini31FlashLiveModel = (modelId: string): boolean =>
  modelId.toLowerCase().includes('gemini-3.1-flash-live');

const isGemini31FlashImageModel = (modelId: string): boolean => {
  const lowerId = modelId.toLowerCase();
  // Includes both gemini-3.1-flash-image-preview and gemini-3.1-flash-lite-image.
  return lowerId.includes('gemini-3.1-flash-image') || lowerId.includes('gemini-3.1-flash-lite-image');
};

const isGemini31FlashLiteImageModel = (modelId: string): boolean =>
  modelId.toLowerCase().includes('gemini-3.1-flash-lite-image');

const isTtsModel = (modelId: string): boolean => modelId.toLowerCase().includes('tts');

export const isOpenAIGpt5FamilyModel = (modelId: string): boolean => {
  const lowerId = modelId.toLowerCase();
  return lowerId.startsWith('gpt-5') || lowerId.includes('/gpt-5');
};

export const isKimiK3Model = (modelId: string): boolean => {
  const lowerId = modelId.toLowerCase();
  return lowerId === 'kimi-k3' || lowerId.startsWith('kimi-k3-') || lowerId.includes('kimi-k3');
};

/**
 * Models that use adaptive thinking + output_config.effort.
 * Manual extended thinking (`thinking: { type: "enabled", budget_tokens }`) is rejected
 * on Claude Sonnet 5 / Opus 5 / Opus 4.8 / Fable 5 — use effort instead.
 */
export const isAnthropicEffortModel = (modelId: string): boolean => {
  const id = modelId.toLowerCase();
  if (/fable|mythos/.test(id)) {
    return true;
  }
  return (
    /claude-opus-5|claude-sonnet-5|claude-opus-4-[678]|claude-sonnet-4-6/.test(id) ||
    /opus-5|sonnet-5|opus-4\.[678]|sonnet-4\.6/.test(id)
  );
};

/** GLM-5 series models use the OpenAI-compatible thinking parameter. */
export const isGlmModel = (modelId: string): boolean => modelId.toLowerCase().startsWith('glm-');

const supportsThinkingLevel = (modelId: string): boolean => {
  // GLM-5 series supports thinking via the OpenAI-compatible thinking parameter.
  if (isGlmModel(modelId)) {
    return true;
  }
  // Third-party reasoning controls mapped in openaiCompatibleMessages / anthropicMessages.
  if (isOpenAIGpt5FamilyModel(modelId) || isKimiK3Model(modelId) || isAnthropicEffortModel(modelId)) {
    return true;
  }
  if (isGemini31FlashImageModel(modelId)) {
    return true;
  }
  return (
    !isTtsModel(modelId) &&
    !isTranscribeModel(modelId) &&
    !isImageGenerationModel(modelId) &&
    (isGemini3Model(modelId) || isGeminiRoboticsModel(modelId))
  );
};

const isGemini3ImageModel = (modelId: string): boolean =>
  normalizeModelId(modelId) === 'gemini-3-pro-image-preview' ||
  normalizeModelId(modelId) === 'gemini-3.1-flash-image-preview';

export const isImageGenerationModel = (modelId: string): boolean => modelId.toLowerCase().includes('image');

export interface ModelInteractionPermissions {
  canAcceptAttachments: boolean;
  canUseTools: boolean;
  canUseGoogleSearch: boolean;
  canUseGoogleMaps: boolean;
  canUseDeepSearch: boolean;
  canUseCodeExecution: boolean;
  canUseLocalPython: boolean;
  canUseUrlContext: boolean;
  canUseTokenCount: boolean;
  canUseYouTubeUrl: boolean;
  canGenerateSuggestions: boolean;
  canUseVoiceInput: boolean;
  canUseLiveControls: boolean;
  requiresTextPrompt: boolean;
}

export interface ModelCapabilities {
  isGemini3: boolean;
  supportsRawReasoningPrefill: boolean;
  supportsThinkingLevel: boolean;
  isGemmaModel: boolean;
  isGemini3FlashModel: boolean;
  isGemini31FlashLiveModel: boolean;
  isGemini31FlashImageModel: boolean;
  isGeminiRoboticsModel: boolean;
  supportsMinimalThinkingLevel: boolean;
  isGemini3ImageModel: boolean;
  isImageGenerationModel: boolean;
  isTtsModel: boolean;
  isTranscribeModel: boolean;
  isNativeAudioModel: boolean;
  isLiveTranslate: boolean;
  isLiveTranscribe: boolean;
  supportsBuiltInCustomToolCombination: boolean;
  permissions: ModelInteractionPermissions;
  supportedAspectRatios?: string[];
  supportedImageSizes?: string[];
}

export const getModelCapabilities = (modelId: string): ModelCapabilities => {
  const lowerId = modelId.toLowerCase();
  const isGemini3 = isGemini3Model(modelId);
  const supportsThinkingLevelSelection = supportsThinkingLevel(modelId);
  const gemini3ImageModel = isGemini3ImageModel(modelId);
  const ttsModel = isTtsModel(modelId);
  const transcribeModel = isTranscribeModel(modelId);
  const nativeAudioModel = isNativeAudioModel(modelId);
  const flashModel = lowerId.includes('flash');
  const gemini3FlashModel = isGemini3 && flashModel;
  const gemini31FlashLiveModel = isGemini31FlashLiveModel(modelId);
  const roboticsModel = isGeminiRoboticsModel(modelId);
  const imageGenerationModel = isImageGenerationModel(modelId);
  const canUseTextChatTools = !nativeAudioModel && !imageGenerationModel && !ttsModel && !transcribeModel;
  const gemmaModel = isGemmaModel(modelId);
  // Gemma models on the Gemini API support no tools at all (no grounding, no
  // code execution) — tool toggles for them would only produce API 400s.
  const canUseSearchFamily =
    (canUseTextChatTools ||
      (nativeAudioModel && !isLiveTranslateModel(modelId) && !isLiveTranscribeModel(modelId)) ||
      gemini3ImageModel) &&
    !gemmaModel;
  const permissions: ModelInteractionPermissions = {
    canAcceptAttachments: !ttsModel && !nativeAudioModel,
    canUseTools: canUseTextChatTools || nativeAudioModel || gemini3ImageModel || imageGenerationModel,
    canUseGoogleSearch: canUseSearchFamily,
    // Maps grounding is documented for text Gemini 2.5/3 models only — not for
    // image-generation models, and the Live API never sends it.
    canUseGoogleMaps: canUseTextChatTools && !gemmaModel,
    canUseDeepSearch: canUseTextChatTools && !gemmaModel,
    canUseCodeExecution: canUseTextChatTools && !gemmaModel,
    // Local Python drives a function-declaration round-trip, so it needs the
    // same API function-calling support Gemma lacks. Live (native audio)
    // supports function calling, except for Live Translate and Transcribe Live.
    canUseLocalPython:
      (canUseTextChatTools && !gemmaModel) ||
      (nativeAudioModel && !isLiveTranslateModel(modelId) && !isLiveTranscribeModel(modelId)),
    canUseUrlContext: canUseTextChatTools && !gemmaModel,
    canUseTokenCount: !nativeAudioModel,
    canUseYouTubeUrl: canUseTextChatTools,
    canGenerateSuggestions: canUseTextChatTools,
    canUseVoiceInput: !nativeAudioModel && !imageGenerationModel && !ttsModel,
    canUseLiveControls: nativeAudioModel,
    requiresTextPrompt: ttsModel || imageGenerationModel,
  };

  let supportedAspectRatios: string[] | undefined;
  if (isGemini31FlashImageModel(modelId)) {
    if (isGemini31FlashLiteImageModel(modelId)) {
      // gemini-3.1-flash-lite-image: only 1K resolution, 10 aspect ratios (no Auto, no 1:4/1:8/4:1/8:1)
      supportedAspectRatios = ['1:1', '3:2', '2:3', '3:4', '4:3', '4:5', '5:4', '9:16', '16:9', '21:9'];
    } else {
      // gemini-3.1-flash-image-preview: 14 aspect ratios including 1:4, 1:8, 4:1, 8:1
      supportedAspectRatios = [
        'Auto',
        '1:1',
        '1:4',
        '1:8',
        '16:9',
        '9:16',
        '4:1',
        '4:3',
        '3:4',
        '3:2',
        '2:3',
        '4:5',
        '5:4',
        '8:1',
        '21:9',
      ];
    }
  } else if (gemini3ImageModel) {
    supportedAspectRatios = ['Auto', '1:1', '16:9', '9:16', '4:3', '3:4', '3:2', '2:3', '4:5', '5:4', '21:9'];
  }

  let supportedImageSizes: string[] | undefined;
  if (isGemini31FlashLiteImageModel(modelId)) {
    // gemini-3.1-flash-lite-image: only 1K resolution
    supportedImageSizes = ['1K'];
  } else if (isGemini31FlashImageModel(modelId)) {
    supportedImageSizes = ['512', '1K', '2K', '4K'];
  } else if (gemini3ImageModel) {
    supportedImageSizes = ['1K', '2K', '4K'];
  }

  return {
    isGemini3,
    supportsRawReasoningPrefill: MODELS_SUPPORTING_RAW_MODE.some((model) => modelId.includes(model)),
    supportsThinkingLevel: supportsThinkingLevelSelection,
    isGemmaModel: isGemmaModel(modelId),
    isGemini3FlashModel: gemini3FlashModel,
    isGemini31FlashLiveModel: gemini31FlashLiveModel,
    isGemini31FlashImageModel: isGemini31FlashImageModel(modelId),
    isGeminiRoboticsModel: roboticsModel,
    supportsMinimalThinkingLevel: !isGemini3ProTextModel(modelId) && !isGemini37Or38FlashModel(modelId),
    isGemini3ImageModel: gemini3ImageModel,
    isImageGenerationModel: imageGenerationModel,
    isTtsModel: ttsModel,
    isTranscribeModel: transcribeModel,
    isNativeAudioModel: nativeAudioModel,
    isLiveTranslate: isLiveTranslateModel(modelId),
    isLiveTranscribe: isLiveTranscribeModel(modelId),
    supportsBuiltInCustomToolCombination: isGemini3,
    permissions,
    supportedAspectRatios,
    supportedImageSizes,
  };
};

export const normalizeAspectRatioForModel = (modelId: string, aspectRatio?: string): string | undefined => {
  const supportedAspectRatios = getModelCapabilities(modelId).supportedAspectRatios;

  if (!supportedAspectRatios || supportedAspectRatios.length === 0) {
    return aspectRatio;
  }

  if (aspectRatio && supportedAspectRatios.includes(aspectRatio)) {
    return aspectRatio;
  }

  return supportedAspectRatios[0];
};

export const normalizeImageSizeForModel = (modelId: string, imageSize?: string): string | undefined => {
  const supportedImageSizes = getModelCapabilities(modelId).supportedImageSizes;

  if (!supportedImageSizes || supportedImageSizes.length === 0) {
    return undefined;
  }

  if (imageSize && supportedImageSizes.includes(imageSize)) {
    return imageSize;
  }

  return supportedImageSizes[0];
};

export const getDefaultThinkingLevelForModel = (modelId: string, fallback: ThinkingLevel = 'HIGH'): ThinkingLevel => {
  if (isGemini31FlashLiveModel(modelId) || isGemini31FlashImageModel(modelId)) {
    return 'MINIMAL';
  }

  return fallback;
};

const isGemini3ProTextModel = (modelId: string): boolean => {
  const lowerId = modelId.toLowerCase();
  return lowerId.includes('gemini-3.1-pro') || (lowerId.includes('gemini-3-pro') && !lowerId.includes('image'));
};

export const normalizeThinkingLevelForModel = (
  modelId: string,
  thinkingLevel: ThinkingLevel | undefined,
  fallback: ThinkingLevel = 'HIGH',
): ThinkingLevel => {
  const resolvedLevel = thinkingLevel ?? fallback;

  // Both families reject MINIMAL with an API error per their model cards.
  if (resolvedLevel === 'MINIMAL' && (isGemini3ProTextModel(modelId) || isGemini37Or38FlashModel(modelId))) {
    return 'LOW';
  }

  return resolvedLevel;
};

export const shouldStripThinkingFromContext = (
  modelId: string,
  hideThinkingInContext?: boolean,
  alwaysKeepThinkingInContext?: boolean,
): boolean => {
  // "Always keep" wins outright — it must override both the hide toggle and the
  // Gemma default so the full thinking text can be injected back into context.
  if (alwaysKeepThinkingInContext) {
    return false;
  }

  if (hideThinkingInContext) {
    return true;
  }

  return isGemmaModel(modelId);
};
