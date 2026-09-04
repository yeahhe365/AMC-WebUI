import type { Part } from '@google/genai';
import type { ChatHistoryItem, ThinkingLevel } from '@/types';
import { isImageMimeType } from '@/utils/file/fileTypeClassification';
import { isAnthropicEffortModel } from '@/utils/model/modelCapabilities';
import type { AnthropicChatConfig, AnthropicContentBlock, AnthropicMessage } from './anthropicTypes';
import { appendSamplingParameters } from './requestFactory';

const ANTHROPIC_FILE_DATA_ERROR = 'Anthropic mode cannot send Gemini Files API file references.';

const partToAnthropicContentItems = (part: Part): AnthropicContentBlock[] => {
  const partWithMedia = part as Part & {
    inlineData?: { mimeType?: string; data?: string };
    fileData?: { mimeType?: string; fileUri?: string };
  };

  if (typeof part.text === 'string') {
    return part.text ? [{ type: 'text', text: part.text }] : [];
  }

  if (partWithMedia.fileData) {
    throw new Error(ANTHROPIC_FILE_DATA_ERROR);
  }

  const inlineData = partWithMedia.inlineData;
  const mimeType = inlineData?.mimeType;
  if (inlineData?.data && mimeType && isImageMimeType(mimeType)) {
    return [
      {
        type: 'image',
        source: { type: 'base64', media_type: mimeType, data: inlineData.data },
      },
    ];
  }

  if (inlineData?.data) {
    throw new Error(`Anthropic mode cannot send inline ${mimeType || 'media'} attachments.`);
  }

  return [];
};

const partsToAnthropicContent = (parts: Part[]): string | AnthropicContentBlock[] => {
  const items = parts.flatMap(partToAnthropicContentItems);
  const hasOnlyText = items.every((item) => item.type === 'text');
  if (hasOnlyText) {
    return items
      .map((item) => (item.type === 'text' ? item.text : ''))
      .filter(Boolean)
      .join('\n');
  }
  return items;
};

const hasAnthropicContent = (content: string | AnthropicContentBlock[]) =>
  typeof content === 'string' ? content.trim().length > 0 : content.length > 0;

const buildAnthropicMessages = (
  history: ChatHistoryItem[],
  parts: Part[],
  role: 'user' | 'model',
): AnthropicMessage[] => {
  const messages: AnthropicMessage[] = [];
  for (const item of history) {
    const content = partsToAnthropicContent(item.parts);
    if (!hasAnthropicContent(content)) continue;
    messages.push({ role: item.role === 'model' ? 'assistant' : 'user', content });
  }
  const currentContent = partsToAnthropicContent(parts);
  if (hasAnthropicContent(currentContent)) {
    messages.push({ role: role === 'model' ? 'assistant' : 'user', content: currentContent });
  }
  return messages;
};

const ANTHROPIC_OUTPUT_TOKENS = 8192;
const ANTHROPIC_MIN_THINKING_BUDGET = 1024;

const mapThinkingLevelToAnthropicEffort = (level: ThinkingLevel | undefined): 'low' | 'medium' | 'high' => {
  switch (level) {
    case 'MINIMAL':
    case 'LOW':
      return 'low';
    case 'MEDIUM':
      return 'medium';
    case 'HIGH':
    default:
      return 'high';
  }
};

export const buildAnthropicRequestBody = (
  modelId: string,
  history: ChatHistoryItem[],
  parts: Part[],
  config: AnthropicChatConfig,
  role: 'user' | 'model',
  stream: boolean,
): Record<string, unknown> => {
  const customMaxTokens =
    typeof config.maxOutputTokens === 'number' && config.maxOutputTokens > 0
      ? config.maxOutputTokens
      : ANTHROPIC_OUTPUT_TOKENS;

  const body: Record<string, unknown> = {
    model: modelId,
    messages: buildAnthropicMessages(history, parts, role),
    stream,
    max_tokens: customMaxTokens,
  };

  const systemInstruction = config.systemInstruction?.trim();
  if (systemInstruction) {
    body.system = systemInstruction;
  }
  appendSamplingParameters(body, config);

  if (Array.isArray(config.stopSequences) && config.stopSequences.length > 0) {
    const validStops = config.stopSequences.map((s) => s.trim()).filter(Boolean);
    if (validStops.length > 0) {
      body.stop_sequences = validStops;
    }
  }

  if (isAnthropicEffortModel(modelId)) {
    // Adaptive models: control thoroughness via output_config.effort; never send budget_tokens.
    body.output_config = { effort: mapThinkingLevelToAnthropicEffort(config.thinkingLevel) };
  } else if (typeof config.thinkingBudget === 'number' && config.thinkingBudget > 0) {
    // Legacy extended thinking for models that still accept budget_tokens (e.g. Haiku).
    const budgetTokens = Math.max(ANTHROPIC_MIN_THINKING_BUDGET, config.thinkingBudget);
    body.thinking = { type: 'enabled', budget_tokens: budgetTokens };
    body.max_tokens = budgetTokens + ANTHROPIC_OUTPUT_TOKENS;
    // Anthropic rejects modified sampling while thinking is enabled (temperature
    // must stay 1, top_p must be omitted) — drop both instead of failing the request.
    delete body.temperature;
    delete body.top_p;
  }

  return body;
};
