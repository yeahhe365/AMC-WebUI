import type {
  ThinkingLevel as GenAIThinkingLevel,
  CountTokensConfig,
  FunctionDeclaration,
  GenerateContentConfig,
  Tool,
} from '@google/genai';
import { loadDeepSearchSystemPrompt, loadLocalPythonSystemPrompt } from '@/features/prompts/promptRegistry';
import {
  MediaResolution,
  type ChatSettings,
  type GeoLocationCoordinates,
  type ImageOutputMode,
  type SafetySetting,
  type ThinkingLevel,
} from '@/types';
import { logService } from '@/services/logService';
import { toApiSafetySettings } from '@/constants/safetySettings';
import {
  isGemini3Model,
  isGemini4Model,
  getDefaultThinkingLevelForModel,
  isGemini3ImageModel,
  isGeminiRoboticsModel,
  isGemmaModel,
  isTranscribeModel,
  normalizeThinkingLevelForModel,
  normalizeAspectRatioForModel,
  normalizeImageSizeForModel,
} from '@/utils/model/modelCapabilities';
import { normalizeModelId } from '@/utils/model/modelId';
import { isServerCodeExecutionMode } from '@/utils/code/codeExecution';

// Docs examples always list TEXT before IMAGE; the set order is what the API
// expects on the wire.
const IMAGE_TEXT_MODALITIES = ['TEXT', 'IMAGE'];
const IMAGE_ONLY_MODALITIES = ['IMAGE'];
const THINKING_LEVEL_FOR_SDK = {
  NONE: 'MINIMAL' as GenAIThinkingLevel,
  MINIMAL: 'MINIMAL' as GenAIThinkingLevel,
  LOW: 'LOW' as GenAIThinkingLevel,
  MEDIUM: 'MEDIUM' as GenAIThinkingLevel,
  HIGH: 'HIGH' as GenAIThinkingLevel,
  // The API supports XHIGH for Hydrogen; the installed SDK enum has not caught up.
  XHIGH: 'XHIGH' as GenAIThinkingLevel,
  MAX: 'HIGH' as GenAIThinkingLevel,
} as const;

type GenerationConfig = Omit<GenerateContentConfig, 'mediaResolution' | 'safetySettings'> & {
  safetySettings?: SafetySetting[];
  mediaResolution?: MediaResolution;
};

type BuildGenerationConfigInput = Pick<
  GenerationConfig,
  | 'temperature'
  | 'topP'
  | 'topK'
  | 'maxOutputTokens'
  | 'stopSequences'
  | 'presencePenalty'
  | 'frequencyPenalty'
  | 'seed'
  | 'responseMimeType'
  | 'responseSchema'
>;

type GenerationConfigSettings = Pick<
  ChatSettings,
  | 'modelId'
  | 'systemInstruction'
  | 'temperature'
  | 'topP'
  | 'topK'
  | 'maxOutputTokens'
  | 'stopSequences'
  | 'presencePenalty'
  | 'frequencyPenalty'
  | 'seed'
  | 'showThoughts'
  | 'thinkingBudget'
  | 'isGoogleSearchEnabled'
  | 'isCodeExecutionEnabled'
  | 'isUrlContextEnabled'
  | 'thinkingLevel'
  | 'isDeepSearchEnabled'
  | 'isGoogleMapsEnabled'
  | 'googleMapsLocation'
  | 'safetySettings'
  | 'mediaResolution'
  | 'isLocalPythonEnabled'
>;

interface BuildGenerationConfigOptions {
  settings: GenerationConfigSettings;
  modelId?: string;
  systemInstruction?: string;
  config?: Partial<BuildGenerationConfigInput>;
  aspectRatio?: string;
  imageSize?: string;
  isLocalPythonEnabled?: boolean;
  imageOutputMode?: ImageOutputMode;
  googleMapsLocation?: GeoLocationCoordinates;
}

type InternalBuildGenerationConfigOptions = {
  modelId: string;
  systemInstruction: string;
  config: BuildGenerationConfigInput;
  showThoughts: boolean;
  thinkingBudget: number;
  isGoogleSearchEnabled?: boolean;
  isGoogleMapsEnabled?: boolean;
  googleMapsLocation?: GeoLocationCoordinates;
  isCodeExecutionEnabled?: boolean;
  isUrlContextEnabled?: boolean;
  thinkingLevel?: ThinkingLevel;
  aspectRatio?: string;
  isDeepSearchEnabled?: boolean;
  imageSize?: string;
  safetySettings?: SafetySetting[];
  mediaResolution?: MediaResolution;
  isLocalPythonEnabled?: boolean;
  imageOutputMode?: ImageOutputMode;
};

const buildGoogleSearchToolForModel = (modelId: string): Tool => {
  const norm = normalizeModelId(modelId);
  // Image-generation models that also ground on image search advertise both
  // search types; Nano Banana 2.1 grounds with Google Web and Image Search.
  return norm === 'gemini-3.1-flash-image' || norm.startsWith('gemini-nano-banana')
    ? {
        googleSearch: {
          searchTypes: {
            webSearch: {},
            imageSearch: {},
          },
        },
      }
    : { googleSearch: {} };
};

const buildGoogleMapsTool = (): Tool => ({ googleMaps: {} });

const toSdkThinkingLevel = (
  thinkingLevel: InternalBuildGenerationConfigOptions['thinkingLevel'],
  fallback: keyof typeof THINKING_LEVEL_FOR_SDK,
) => THINKING_LEVEL_FOR_SDK[thinkingLevel ?? fallback];

const toInternalBuildGenerationConfigOptions = (
  options: BuildGenerationConfigOptions,
): InternalBuildGenerationConfigOptions => {
  const { settings } = options;

  return {
    modelId: options.modelId ?? settings.modelId,
    systemInstruction: options.systemInstruction ?? settings.systemInstruction,
    config: {
      temperature: settings.temperature,
      topP: settings.topP,
      topK: settings.topK,
      maxOutputTokens: settings.maxOutputTokens,
      stopSequences: settings.stopSequences,
      presencePenalty: settings.presencePenalty,
      frequencyPenalty: settings.frequencyPenalty,
      seed: settings.seed,
      ...options.config,
    },
    showThoughts: settings.showThoughts,
    thinkingBudget: settings.thinkingBudget,
    isGoogleSearchEnabled: settings.isGoogleSearchEnabled,
    isGoogleMapsEnabled: settings.isGoogleMapsEnabled,
    googleMapsLocation: options.googleMapsLocation ?? settings.googleMapsLocation,
    isCodeExecutionEnabled: settings.isCodeExecutionEnabled,
    isUrlContextEnabled: settings.isUrlContextEnabled,
    thinkingLevel: settings.thinkingLevel,
    aspectRatio: options.aspectRatio,
    isDeepSearchEnabled: settings.isDeepSearchEnabled,
    imageSize: options.imageSize,
    safetySettings: settings.safetySettings,
    mediaResolution: settings.mediaResolution,
    isLocalPythonEnabled: options.isLocalPythonEnabled ?? settings.isLocalPythonEnabled,
    imageOutputMode: options.imageOutputMode,
  };
};

async function buildGenerationConfigFromOptions({
  modelId,
  systemInstruction,
  config,
  showThoughts,
  thinkingBudget,
  isGoogleSearchEnabled,
  isGoogleMapsEnabled,
  googleMapsLocation,
  isCodeExecutionEnabled,
  isUrlContextEnabled,
  thinkingLevel,
  aspectRatio,
  isDeepSearchEnabled,
  imageSize,
  safetySettings,
  mediaResolution,
  isLocalPythonEnabled,
  imageOutputMode = 'IMAGE_TEXT',
}: InternalBuildGenerationConfigOptions): Promise<GenerationConfig> {
  const normalizedAspectRatio = normalizeAspectRatioForModel(modelId, aspectRatio);
  const normalizedImageSize = normalizeImageSizeForModel(modelId, imageSize);
  const googleSearchTool = buildGoogleSearchToolForModel(modelId);

  if (isGemini3ImageModel(modelId)) {
    const normalizedModelId = normalizeModelId(modelId);
    const imageConfig: NonNullable<GenerationConfig['imageConfig']> = {
      imageSize: normalizedImageSize || '1K',
    };
    if (normalizedAspectRatio && normalizedAspectRatio !== 'Auto') {
      imageConfig.aspectRatio = normalizedAspectRatio;
    }

    const generationConfig: GenerationConfig = {
      responseModalities: imageOutputMode === 'IMAGE_ONLY' ? IMAGE_ONLY_MODALITIES : IMAGE_TEXT_MODALITIES,
      imageConfig,
    };

    if (normalizedModelId === 'gemini-3.1-flash-image' || normalizedModelId === 'gemini-3.1-flash-lite-image') {
      generationConfig.thinkingConfig = {
        includeThoughts: true,
        // Gemini 3.1 Flash Image / Lite expose only minimal/high thinking levels.
        thinkingLevel: toSdkThinkingLevel(thinkingLevel === 'HIGH' ? 'HIGH' : 'MINIMAL', 'MINIMAL'),
      };
    }

    if (normalizedModelId.startsWith('gemini-nano-banana')) {
      // Nano Banana 2.1 exposes minimal / medium (default) / high, so unlike the
      // 3.1 image models it is not clamped to the two-level MINIMAL/HIGH pair.
      generationConfig.thinkingConfig = {
        includeThoughts: true,
        thinkingLevel: toSdkThinkingLevel(
          thinkingLevel === 'MINIMAL' || thinkingLevel === 'LOW'
            ? 'MINIMAL'
            : thinkingLevel === 'HIGH' || thinkingLevel === 'XHIGH' || thinkingLevel === 'MAX'
              ? 'HIGH'
              : 'MEDIUM',
          'MEDIUM',
        ),
      };
    }

    const tools: NonNullable<GenerationConfig['tools']> = [];
    // gemini-3.1-flash-lite-image does not support Google Search or Maps grounding;
    // Maps grounding is not documented for any image-generation model.
    if (normalizedModelId !== 'gemini-3.1-flash-lite-image') {
      if (isGoogleSearchEnabled) tools.push(googleSearchTool);
    }
    if (tools.length > 0) generationConfig.tools = tools;

    if (systemInstruction) generationConfig.systemInstruction = systemInstruction;

    return generationConfig;
  }

  const isGemma = isGemmaModel(modelId);

  let finalSystemInstruction = systemInstruction;
  // Deep Search = googleSearch tool + search-directive prompt; Gemma supports
  // neither the tool (unsupported by the API) nor the round-trip, so skip both.
  if (isDeepSearchEnabled && !isGemma) {
    const deepSearchPrompt = await loadDeepSearchSystemPrompt();
    if (!finalSystemInstruction?.includes(deepSearchPrompt.trim())) {
      finalSystemInstruction = finalSystemInstruction
        ? `${finalSystemInstruction}\n\n${deepSearchPrompt}`
        : deepSearchPrompt;
    }
  }

  if (isLocalPythonEnabled) {
    const localPythonPrompt = await loadLocalPythonSystemPrompt();
    if (!finalSystemInstruction?.includes(localPythonPrompt.trim())) {
      finalSystemInstruction = finalSystemInstruction
        ? `${finalSystemInstruction}\n\n${localPythonPrompt}`
        : localPythonPrompt;
    }
  }

  const gemmaThinkingLevel = isGemma
    ? thinkingLevel === 'HIGH' || thinkingLevel === 'MINIMAL'
      ? thinkingLevel
      : showThoughts
        ? 'HIGH'
        : 'MINIMAL'
    : undefined;

  const generationConfig: GenerationConfig = {
    ...config,
    systemInstruction: finalSystemInstruction || undefined,
    safetySettings: toApiSafetySettings(safetySettings),
  };

  if (isGemini4Model(modelId)) {
    // Gemini 4 Argon ignores sampling controls. Do not expose ineffective
    // settings as if they changed model behavior.
    delete generationConfig.temperature;
    delete generationConfig.topP;
    delete generationConfig.topK;
  }

  const isGemini3 = isGemini3Model(modelId);
  const isTranscribe = isTranscribeModel(modelId);
  const normalizedMediaResolution =
    !isGemini3 && !isTranscribe && mediaResolution === MediaResolution.MEDIA_RESOLUTION_ULTRA_HIGH
      ? MediaResolution.MEDIA_RESOLUTION_HIGH
      : mediaResolution;
  if (!isGemini3 && !isTranscribe && normalizedMediaResolution) {
    generationConfig.mediaResolution = normalizedMediaResolution;
  }

  if (!generationConfig.systemInstruction) {
    delete generationConfig.systemInstruction;
  }
  if (typeof generationConfig.maxOutputTokens !== 'number' || generationConfig.maxOutputTokens <= 0) {
    delete generationConfig.maxOutputTokens;
  }
  if (!Array.isArray(generationConfig.stopSequences) || generationConfig.stopSequences.length === 0) {
    delete generationConfig.stopSequences;
  }
  if (typeof generationConfig.presencePenalty !== 'number') {
    delete generationConfig.presencePenalty;
  }
  if (typeof generationConfig.frequencyPenalty !== 'number') {
    delete generationConfig.frequencyPenalty;
  }
  if (typeof generationConfig.seed !== 'number') {
    delete generationConfig.seed;
  }

  const supportsThinkingLevel = isGemini3 || isGeminiRoboticsModel(modelId);

  if (supportsThinkingLevel) {
    // Gemini 3 and 4 models use the official thinkingLevel + includeThoughts API.
    // Do not send thinkingBudget alone — it is a 2.5-era parameter and can omit thought summaries on 3.x.
    // includeThoughts stays true so summaries are available; UI visibility is gated by showThoughts.
    generationConfig.thinkingConfig = {
      includeThoughts: true,
      thinkingLevel: toSdkThinkingLevel(
        normalizeThinkingLevelForModel(
          modelId,
          thinkingLevel,
          isGemini4Model(modelId) ? getDefaultThinkingLevelForModel(modelId) : 'HIGH',
        ),
        isGemini4Model(modelId) ? getDefaultThinkingLevelForModel(modelId) : 'HIGH',
      ),
    };

    // Robotics still accepts budget for backwards-compatible token control when set.
    if (!isGemini3 && thinkingBudget > 0) {
      delete generationConfig.thinkingConfig.thinkingLevel;
      generationConfig.thinkingConfig.thinkingBudget = thinkingBudget;
    }
  } else if (isGemma) {
    generationConfig.thinkingConfig = {
      includeThoughts: true,
      thinkingLevel: gemmaThinkingLevel ? toSdkThinkingLevel(gemmaThinkingLevel, 'MINIMAL') : undefined,
    };
  }

  const tools: NonNullable<GenerationConfig['tools']> = [];
  const hasSearch = !isTranscribe && !isGemma && (isGoogleSearchEnabled || isDeepSearchEnabled);
  const hasMaps = !isTranscribe && !isGemma && isGoogleMapsEnabled;
  const canCombineSearchMaps = isGemini3 || isGeminiRoboticsModel(modelId);

  if (hasSearch) {
    tools.push(googleSearchTool);
  }
  if (hasMaps) {
    if (!hasSearch || canCombineSearchMaps) {
      tools.push(buildGoogleMapsTool());
      if (
        googleMapsLocation &&
        typeof googleMapsLocation.latitude === 'number' &&
        typeof googleMapsLocation.longitude === 'number' &&
        Number.isFinite(googleMapsLocation.latitude) &&
        Number.isFinite(googleMapsLocation.longitude) &&
        googleMapsLocation.latitude >= -90 &&
        googleMapsLocation.latitude <= 90 &&
        googleMapsLocation.longitude >= -180 &&
        googleMapsLocation.longitude <= 180
      ) {
        generationConfig.toolConfig = {
          ...(generationConfig.toolConfig ?? {}),
          retrievalConfig: {
            ...(generationConfig.toolConfig?.retrievalConfig ?? {}),
            latLng: {
              latitude: googleMapsLocation.latitude,
              longitude: googleMapsLocation.longitude,
            },
          },
        };
      }
    } else {
      logService.warn(
        'Skipping Google Maps tool because combining search grounding with maps grounding is only supported for Gemini 3.5+ models.',
        { modelId },
      );
    }
  }
  if (!isTranscribe && !isGemma && isServerCodeExecutionMode({ isCodeExecutionEnabled, isLocalPythonEnabled })) {
    tools.push({ codeExecution: {} });
  }
  if (!isTranscribe && !isGemma && isUrlContextEnabled) {
    tools.push({ urlContext: {} });
  }

  if (tools.length > 0) {
    generationConfig.tools = tools;
  }

  return generationConfig;
}

export const buildGenerationConfig = (options: BuildGenerationConfigOptions): Promise<GenerationConfig> =>
  buildGenerationConfigFromOptions(toInternalBuildGenerationConfigOptions(options));

const hasBuiltInTools = (tools: GenerationConfig['tools'] | undefined): boolean =>
  !!tools?.some(
    (tool) => 'googleSearch' in tool || 'googleMaps' in tool || 'codeExecution' in tool || 'urlContext' in tool,
  );

export const appendFunctionDeclarationsToTools = (
  modelId: string,
  generationConfig: GenerationConfig,
  functionDeclarations: FunctionDeclaration[],
): GenerationConfig => {
  const supportsBuiltInCustomToolCombination = isGemini3Model(modelId) || isGeminiRoboticsModel(modelId);
  const hasBuiltIns = hasBuiltInTools(generationConfig.tools);
  const shouldIncludeServerSideToolInvocations = hasBuiltIns && supportsBuiltInCustomToolCombination;

  if (functionDeclarations.length === 0) {
    return shouldIncludeServerSideToolInvocations
      ? {
          ...generationConfig,
          toolConfig: {
            ...(generationConfig.toolConfig ?? {}),
            includeServerSideToolInvocations: true,
          },
        }
      : generationConfig;
  }

  if (hasBuiltInTools(generationConfig.tools) && !supportsBuiltInCustomToolCombination) {
    logService.warn(
      'Skipping custom function declarations because built-in/custom tool combinations are only supported for Gemini 3 models.',
      {
        modelId,
        functionDeclarationCount: functionDeclarations.length,
      },
    );
    return generationConfig;
  }

  return {
    ...generationConfig,
    tools: [...(generationConfig.tools ?? []), { functionDeclarations }],
    toolConfig: shouldIncludeServerSideToolInvocations
      ? {
          ...(generationConfig.toolConfig ?? {}),
          includeServerSideToolInvocations: true,
        }
      : generationConfig.toolConfig,
  };
};

export const toCountTokensConfig = (generationConfig?: GenerationConfig): CountTokensConfig | undefined => {
  if (!generationConfig) {
    return undefined;
  }

  const { systemInstruction, tools } = generationConfig;
  const countTokensConfig: CountTokensConfig = {};

  if (systemInstruction) {
    countTokensConfig.systemInstruction = systemInstruction;
  }

  if (tools && tools.length > 0) {
    countTokensConfig.tools = tools as CountTokensConfig['tools'];
  }

  return Object.keys(countTokensConfig).length > 0 ? countTokensConfig : undefined;
};
