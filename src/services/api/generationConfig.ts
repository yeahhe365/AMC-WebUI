import {
  ThinkingLevel as GenAIThinkingLevel,
  type CountTokensConfig,
  type FunctionDeclaration,
  type GenerateContentConfig,
  type Tool,
} from '@google/genai';
import { loadDeepSearchSystemPrompt, loadLocalPythonSystemPrompt } from '@/features/prompts/promptRegistry';
import {
  MediaResolution,
  type ChatSettings,
  type ImageOutputMode,
  type SafetySetting,
  type ThinkingLevel,
} from '@/types';
import { logService } from '@/services/logService';
import { toApiSafetySettings } from '@/constants/safetySettings';
import {
  isGemini3Model,
  isGeminiRoboticsModel,
  isGemmaModel,
  isTranscribeModel,
  normalizeThinkingLevelForModel,
  normalizeAspectRatioForModel,
  normalizeImageSizeForModel,
} from '@/utils/model/modelCapabilities';
import { normalizeModelId } from '@/utils/model/modelId';
import { isServerCodeExecutionMode } from '@/utils/codeExecution';

// Docs examples always list TEXT before IMAGE; the set order is what the API
// expects on the wire.
const IMAGE_TEXT_MODALITIES = ['TEXT', 'IMAGE'];
const IMAGE_ONLY_MODALITIES = ['IMAGE'];
const THINKING_LEVEL_FOR_SDK = {
  MINIMAL: GenAIThinkingLevel.MINIMAL,
  LOW: GenAIThinkingLevel.LOW,
  MEDIUM: GenAIThinkingLevel.MEDIUM,
  HIGH: GenAIThinkingLevel.HIGH,
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
}

type InternalBuildGenerationConfigOptions = {
  modelId: string;
  systemInstruction: string;
  config: BuildGenerationConfigInput;
  showThoughts: boolean;
  thinkingBudget: number;
  isGoogleSearchEnabled?: boolean;
  isGoogleMapsEnabled?: boolean;
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

const buildGoogleSearchToolForModel = (modelId: string): Tool =>
  normalizeModelId(modelId) === 'gemini-3.1-flash-image-preview'
    ? {
        googleSearch: {
          searchTypes: {
            webSearch: {},
            imageSearch: {},
          },
        },
      }
    : { googleSearch: {} };

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

  if (
    normalizeModelId(modelId) === 'gemini-3-pro-image-preview' ||
    normalizeModelId(modelId) === 'gemini-3.1-flash-image-preview' ||
    normalizeModelId(modelId) === 'gemini-3.1-flash-lite-image'
  ) {
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

    if (
      normalizeModelId(modelId) === 'gemini-3.1-flash-image-preview' ||
      normalizeModelId(modelId) === 'gemini-3.1-flash-lite-image'
    ) {
      generationConfig.thinkingConfig = {
        includeThoughts: true,
        // Gemini 3.1 Flash Image / Lite expose only minimal/high thinking levels.
        thinkingLevel: toSdkThinkingLevel(thinkingLevel === 'HIGH' ? 'HIGH' : 'MINIMAL', 'MINIMAL'),
      };
    }

    const tools: NonNullable<GenerationConfig['tools']> = [];
    // gemini-3.1-flash-lite-image does not support Google Search or Maps grounding;
    // Maps grounding is not documented for any image-generation model.
    if (normalizeModelId(modelId) !== 'gemini-3.1-flash-lite-image') {
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
    finalSystemInstruction = finalSystemInstruction
      ? `${finalSystemInstruction}\n\n${deepSearchPrompt}`
      : deepSearchPrompt;
  }

  if (isLocalPythonEnabled) {
    const localPythonPrompt = await loadLocalPythonSystemPrompt();
    finalSystemInstruction = finalSystemInstruction
      ? `${finalSystemInstruction}\n\n${localPythonPrompt}`
      : localPythonPrompt;
  }

  const gemmaThinkingLevel = isGemma ? (showThoughts ? 'HIGH' : 'MINIMAL') : undefined;

  const generationConfig: GenerationConfig = {
    ...config,
    systemInstruction: finalSystemInstruction || undefined,
    safetySettings: toApiSafetySettings(safetySettings),
  };

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
    // Gemini 3 series (incl. 3.8 Flash / 3.7 Flash / 3.6 Flash / 3.5 Flash-Lite): official API is thinkingLevel + includeThoughts.
    // Do not send thinkingBudget alone — it is a 2.5-era parameter and can omit thought summaries on 3.x.
    // includeThoughts stays true so summaries are available; UI visibility is gated by showThoughts.
    generationConfig.thinkingConfig = {
      includeThoughts: true,
      thinkingLevel: toSdkThinkingLevel(normalizeThinkingLevelForModel(modelId, thinkingLevel, 'HIGH'), 'HIGH'),
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
  if (!isTranscribe && !isGemma && (isGoogleSearchEnabled || isDeepSearchEnabled)) {
    tools.push(googleSearchTool);
  }
  if (!isTranscribe && !isGemma && isGoogleMapsEnabled) {
    tools.push(buildGoogleMapsTool());
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
