import type { Part } from '@google/genai';
import type { ChatHistoryItem, ThinkingLevel } from '@/types';
import { isAudioMimeType, isImageMimeType } from '@/utils/file/fileTypeClassification';
import { isGlmModel, isKimiK3Model, isOpenAIGpt5FamilyModel } from '@/utils/model/modelCapabilities';
import type { OpenAICompatibleChatConfig, OpenAIMessage, OpenAIMessageContent } from './openaiCompatibleTypes';
import { appendSamplingParameters } from './requestFactory';

const OPENAI_COMPATIBLE_FILE_DATA_ERROR = 'OpenAI-compatible mode cannot send Gemini Files API file references.';

const mapThinkingLevelToOpenAIReasoningEffort = (level: ThinkingLevel | undefined): string => {
  switch (level) {
    case 'MINIMAL':
      return 'none';
    case 'LOW':
      return 'low';
    case 'MEDIUM':
      return 'medium';
    case 'HIGH':
    default:
      return 'high';
  }
};

const mapThinkingLevelToKimiReasoningEffort = (level: ThinkingLevel | undefined): 'low' | 'high' | 'max' => {
  switch (level) {
    case 'MINIMAL':
    case 'LOW':
      return 'low';
    case 'MEDIUM':
      return 'high';
    case 'HIGH':
    default:
      return 'max';
  }
};

const getInlineAudioFormat = (mimeType: string): string => {
  const subtype = mimeType.split('/')[1]?.split(';')[0]?.trim();
  return subtype || 'wav';
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

const partsToOpenAIContent = (parts: Part[]): OpenAIMessageContent => {
  const contentItems = parts.flatMap(partToOpenAIContentItems);
  const hasOnlyText = contentItems.every((item) => item.type === 'text');

  if (hasOnlyText) {
    return contentItems
      .map((item) => (item.type === 'text' ? item.text : ''))
      .filter(Boolean)
      .join('\n');
  }

  return contentItems;
};

const hasOpenAIContent = (content: OpenAIMessageContent) =>
  typeof content === 'string' ? content.trim().length > 0 : content.length > 0;

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
    if (!hasOpenAIContent(content)) {
      continue;
    }

    messages.push({
      role: item.role === 'model' ? 'assistant' : 'user',
      content,
    });
  }

  const currentContent = partsToOpenAIContent(parts);
  if (hasOpenAIContent(currentContent)) {
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

  // GLM-5 series supports a thinking parameter for chain-of-thought reasoning.
  // Map HIGH/MEDIUM to enabled, LOW/MINIMAL to disabled (controlled via ThinkingSpeedControl slider).
  if (isGlmModel(modelId)) {
    const thinkingEnabled = config.thinkingLevel === 'HIGH' || config.thinkingLevel === 'MEDIUM';
    body.thinking = { type: thinkingEnabled ? 'enabled' : 'disabled' };
  }

  // OpenAI GPT-5.x: map UI thinkingLevel → reasoning_effort (none/low/medium/high).
  if (isOpenAIGpt5FamilyModel(modelId)) {
    body.reasoning_effort = mapThinkingLevelToOpenAIReasoningEffort(config.thinkingLevel);
  }

  // Kimi K3: always-on reasoning; top-level reasoning_effort is low/high/max (default max).
  if (isKimiK3Model(modelId)) {
    body.reasoning_effort = mapThinkingLevelToKimiReasoningEffort(config.thinkingLevel);
  }

  if (stream) {
    body.stream_options = { include_usage: true };
  }

  return body;
};
