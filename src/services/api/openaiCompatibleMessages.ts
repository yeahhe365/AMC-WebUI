import type { Part } from '@google/genai';
import type { ChatHistoryItem, ThinkingLevel } from '@/types';
import { isAudioMimeType, isImageMimeType } from '@/utils/file/fileTypeClassification';
import { getInlineAudioFormat } from '@/features/audio/audioProcessing';
import {
  isGlmModel,
  isKimiK3Model,
  isOpenAIGpt5FamilyModel,
  isOpenAIReasoningModel,
} from '@/utils/model/modelCapabilities';
import {
  isDashScopeOfficialEndpoint,
  isDeepSeekOfficialEndpoint,
  isLocalEngineEndpoint,
} from '@/utils/thirdPartyApiProviders';
import type { OpenAICompatibleChatConfig, OpenAIMessage, OpenAIMessageContent } from './openaiCompatibleTypes';
import { collapseOnlyTextContent, hasNonEmptyMessageContent } from './chatMessageContent';
import { appendSamplingParameters } from './requestFactory';

const OPENAI_COMPATIBLE_FILE_DATA_ERROR = 'OpenAI-compatible mode cannot send Gemini Files API file references.';

const mapThinkingLevelToOpenAIReasoningEffort = (level: ThinkingLevel | undefined): string => {
  switch (level) {
    case 'NONE':
      return 'none';
    case 'MINIMAL':
      return 'minimal';
    case 'LOW':
      return 'low';
    case 'MEDIUM':
      return 'medium';
    case 'HIGH':
      return 'high';
    case 'XHIGH':
      return 'xhigh';
    case 'MAX':
      return 'max';
    default:
      return 'high';
  }
};

const mapThinkingLevelToKimiReasoningEffort = (level: ThinkingLevel | undefined): 'low' | 'high' | 'max' => {
  switch (level) {
    case 'NONE':
    case 'MINIMAL':
    case 'LOW':
      return 'low';
    case 'MEDIUM':
      return 'high';
    case 'HIGH':
    case 'XHIGH':
    case 'MAX':
    default:
      return 'max';
  }
};

const partToOpenAIContentItems = (part: Part): Exclude<OpenAIMessageContent, string> => {
  const partWithMedia = part as Part & {
    inlineData?: {
      mimeType?: string;
      data?: string;
    };
    fileData?: {
      mimeType?: string;
      fileUri?: string;
    };
  };

  if (typeof part.text === 'string') {
    return part.text ? [{ type: 'text', text: part.text }] : [];
  }

  if (partWithMedia.fileData) {
    throw new Error(OPENAI_COMPATIBLE_FILE_DATA_ERROR);
  }

  const inlineData = partWithMedia.inlineData;
  const mimeType = inlineData?.mimeType;
  if (inlineData?.data && mimeType && isImageMimeType(mimeType)) {
    return [
      {
        type: 'image_url',
        image_url: {
          url: `data:${mimeType};base64,${inlineData.data}`,
        },
      },
    ];
  }

  if (inlineData?.data && mimeType && isAudioMimeType(mimeType)) {
    return [
      {
        type: 'input_audio',
        input_audio: {
          data: inlineData.data,
          format: getInlineAudioFormat(mimeType),
        },
      },
    ];
  }

  if (inlineData?.data) {
    throw new Error(`OpenAI-compatible mode cannot send inline ${mimeType || 'media'} attachments.`);
  }

  return [];
};

const partsToOpenAIContent = (parts: Part[]): OpenAIMessageContent =>
  collapseOnlyTextContent(parts.flatMap(partToOpenAIContentItems), (item) =>
    item.type === 'text' ? item.text : null,
  ) as OpenAIMessageContent;

const buildOpenAICompatibleMessages = (
  history: ChatHistoryItem[],
  parts: Part[],
  role: 'user' | 'model',
  config: OpenAICompatibleChatConfig,
): OpenAIMessage[] => {
  const messages: OpenAIMessage[] = [];
  const systemInstruction = config.systemInstruction?.trim();

  if (systemInstruction) {
    messages.push({ role: 'system', content: systemInstruction });
  }

  for (const item of history) {
    const content = partsToOpenAIContent(item.parts);
    if (!hasNonEmptyMessageContent(content)) {
      continue;
    }

    messages.push({
      role: item.role === 'model' ? 'assistant' : 'user',
      content,
    });
  }

  const currentContent = partsToOpenAIContent(parts);
  if (hasNonEmptyMessageContent(currentContent)) {
    messages.push({
      role: role === 'model' ? 'assistant' : 'user',
      content: currentContent,
    });
  }

  return messages;
};

export const buildOpenAICompatibleRequestBody = (
  modelId: string,
  history: ChatHistoryItem[],
  parts: Part[],
  config: OpenAICompatibleChatConfig,
  role: 'user' | 'model',
  stream: boolean,
): Record<string, unknown> => {
  const body: Record<string, unknown> = {
    model: modelId,
    messages: buildOpenAICompatibleMessages(history, parts, role, config),
    stream,
  };

  appendSamplingParameters(body, config);

  if (typeof config.maxOutputTokens === 'number' && config.maxOutputTokens > 0) {
    body.max_tokens = config.maxOutputTokens;
  }
  if (Array.isArray(config.stopSequences) && config.stopSequences.length > 0) {
    const validStops = config.stopSequences.map((s) => s.trim()).filter(Boolean);
    if (validStops.length > 0) {
      body.stop = validStops.length === 1 ? validStops[0] : validStops;
    }
  }
  if (typeof config.presencePenalty === 'number') {
    body.presence_penalty = config.presencePenalty;
  }
  if (typeof config.frequencyPenalty === 'number') {
    body.frequency_penalty = config.frequencyPenalty;
  }
  if (typeof config.seed === 'number') {
    body.seed = config.seed;
  }

  const isDeepSeekOfficial = isDeepSeekOfficialEndpoint(config.templateId, config.baseUrl);
  const isDashScopeOfficial = isDashScopeOfficialEndpoint(config.templateId, config.baseUrl);
  const isLocalEngine = isLocalEngineEndpoint(config.templateId, config.baseUrl);

  // 1. GLM series models: use thinking parameter { type: "enabled" | "disabled" }
  if (isGlmModel(modelId)) {
    const thinkingEnabled =
      config.thinkingLevel === 'HIGH' ||
      config.thinkingLevel === 'MEDIUM' ||
      config.thinkingLevel === 'XHIGH' ||
      config.thinkingLevel === 'MAX';
    body.thinking = { type: thinkingEnabled ? 'enabled' : 'disabled' };
  }
  // 2. DeepSeek official endpoint:
  // - deepseek-reasoner / deepseek-chat handle reasoning server-side; NEVER send reasoning_effort (causes HTTP 400).
  // - DeepSeek V4 models accept { thinking: { type: "enabled" | "disabled" } }.
  else if (isDeepSeekOfficial) {
    if (modelId.toLowerCase().includes('v4')) {
      const thinkingEnabled = config.thinkingLevel !== 'NONE' && config.thinkingLevel !== 'MINIMAL';
      body.thinking = { type: thinkingEnabled ? 'enabled' : 'disabled' };
    }
    // Deliberately omit reasoning_effort to prevent DeepSeek official 400 Bad Request.
  }
  // 3. DashScope (Qwen official):
  // - Chat completions uses enable_thinking: boolean (and optional thinking_budget).
  // - NEVER send reasoning_effort on DashScope chat completions.
  else if (isDashScopeOfficial) {
    if (config.thinkingLevel !== undefined) {
      const thinkingEnabled = config.thinkingLevel !== 'NONE' && config.thinkingLevel !== 'MINIMAL';
      body.enable_thinking = thinkingEnabled;
      if (typeof config.thinkingBudget === 'number' && config.thinkingBudget > 0 && thinkingEnabled) {
        body.thinking_budget = config.thinkingBudget;
      }
    }
  }
  // 4. Local engines (Ollama / LM Studio):
  // - Local models output reasoning natively (<think> tags); do NOT attach reasoning_effort.
  else if (isLocalEngine) {
    // Deliberately omit reasoning_effort for local engines.
  }
  // 5. Kimi K3: always-on reasoning; top-level reasoning_effort is low/high/max (default max).
  else if (isKimiK3Model(modelId)) {
    body.reasoning_effort = mapThinkingLevelToKimiReasoningEffort(config.thinkingLevel);
  }
  // 6. OpenAI reasoning models (o4, gpt-5, etc.) and third-party reasoning proxies (OpenRouter, SiliconFlow, Together, etc.):
  else if (isOpenAIReasoningModel(modelId) || isOpenAIGpt5FamilyModel(modelId)) {
    body.reasoning_effort = mapThinkingLevelToOpenAIReasoningEffort(config.thinkingLevel);
  }

  if (stream) {
    body.stream_options = { include_usage: true };
  }

  return body;
};
