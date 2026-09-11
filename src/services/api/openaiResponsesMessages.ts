import type { Part } from '@google/genai';
import type { ChatHistoryItem, ThinkingLevel } from '@/types';
import { isAudioMimeType, isImageMimeType } from '@/utils/file/fileTypeClassification';
import { getInlineAudioFormat } from '@/features/audio/audioProcessing';
import type {
  OpenAIResponsesChatConfig,
  OpenAIResponsesContentPart,
  OpenAIResponsesInputItem,
  OpenAIResponsesRequestBody,
} from './openaiResponsesTypes';
import { collapseOnlyTextContent, hasNonEmptyMessageContent } from './chatMessageContent';
import { isOpenAIGpt5FamilyModel, isOpenAIReasoningModel } from '@/utils/model/modelCapabilities';

const OPENAI_RESPONSES_FILE_DATA_ERROR = 'OpenAI Responses mode cannot send Gemini Files API file references.';

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
    case 'MAX':
      return 'xhigh';
    default:
      return 'medium';
  }
};

const partToOpenAIResponsesContentItems = (part: Part): OpenAIResponsesContentPart[] => {
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
    return part.text ? [{ type: 'input_text', text: part.text }] : [];
  }

  if (partWithMedia.fileData) {
    throw new Error(OPENAI_RESPONSES_FILE_DATA_ERROR);
  }

  const inlineData = partWithMedia.inlineData;
  const mimeType = inlineData?.mimeType;
  if (inlineData?.data && mimeType && isImageMimeType(mimeType)) {
    return [
      {
        type: 'input_image',
        image_url: `data:${mimeType};base64,${inlineData.data}`,
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
    throw new Error(`OpenAI Responses mode cannot send inline ${mimeType || 'media'} attachments.`);
  }

  return [];
};

const partsToOpenAIResponsesContent = (parts: Part[]): string | OpenAIResponsesContentPart[] =>
  collapseOnlyTextContent(parts.flatMap(partToOpenAIResponsesContentItems), (item) =>
    item.type === 'input_text' ? item.text : null,
  );

const buildOpenAIResponsesInput = (
  history: ChatHistoryItem[],
  parts: Part[],
  role: 'user' | 'model',
): OpenAIResponsesInputItem[] => {
  const input: OpenAIResponsesInputItem[] = [];

  for (const item of history) {
    const content = partsToOpenAIResponsesContent(item.parts);
    if (!hasNonEmptyMessageContent(content)) {
      continue;
    }

    input.push({
      role: item.role === 'model' ? 'assistant' : 'user',
      content,
    });
  }

  const currentContent = partsToOpenAIResponsesContent(parts);
  if (hasNonEmptyMessageContent(currentContent)) {
    input.push({
      role: role === 'model' ? 'assistant' : 'user',
      content: currentContent,
    });
  }

  return input;
};

export const buildOpenAIResponsesRequestBody = (
  modelId: string,
  history: ChatHistoryItem[],
  parts: Part[],
  config: OpenAIResponsesChatConfig,
  role: 'user' | 'model',
  stream: boolean,
): OpenAIResponsesRequestBody => {
  const body: OpenAIResponsesRequestBody = {
    model: modelId,
    input: buildOpenAIResponsesInput(history, parts, role),
    stream,
  };

  const systemInstruction = config.systemInstruction?.trim();
  if (systemInstruction) {
    body.instructions = systemInstruction;
  }

  if (typeof config.temperature === 'number') {
    body.temperature = config.temperature;
  }
  if (typeof config.topP === 'number') {
    body.top_p = config.topP;
  }
  if (typeof config.maxOutputTokens === 'number' && config.maxOutputTokens > 0) {
    body.max_output_tokens = config.maxOutputTokens;
  }

  if (config.thinkingLevel && (isOpenAIReasoningModel(modelId) || isOpenAIGpt5FamilyModel(modelId))) {
    body.reasoning = {
      effort: mapThinkingLevelToOpenAIReasoningEffort(config.thinkingLevel),
    };
  }

  if (Array.isArray(config.tools) && config.tools.length > 0) {
    body.tools = config.tools;
  }

  if (config.previousResponseId) {
    body.previous_response_id = config.previousResponseId;
  }

  return body;
};
