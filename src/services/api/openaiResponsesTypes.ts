import type { UsageMetadata } from '@google/genai';
import type { ThinkingLevel } from '@/types';

export interface OpenAIResponsesChatConfig {
  baseUrl?: string | null;
  systemInstruction?: string;
  temperature?: number;
  topP?: number;
  maxOutputTokens?: number;
  thinkingLevel?: ThinkingLevel;
  extraHeaders?: Record<string, string> | null;
  tools?: Array<Record<string, unknown>>;
  previousResponseId?: string;
}

export type OpenAIResponsesInputTextPart = {
  type: 'input_text';
  text: string;
};

export type OpenAIResponsesInputImagePart = {
  type: 'input_image';
  image_url: string;
};

export type OpenAIResponsesInputAudioPart = {
  type: 'input_audio';
  input_audio: {
    data: string;
    format: string;
  };
};

export type OpenAIResponsesContentPart =
  OpenAIResponsesInputTextPart | OpenAIResponsesInputImagePart | OpenAIResponsesInputAudioPart;

export interface OpenAIResponsesInputMessage {
  role: 'user' | 'assistant' | 'system' | 'developer';
  content: string | OpenAIResponsesContentPart[];
}

export type OpenAIResponsesInputItem = OpenAIResponsesInputMessage;

export interface OpenAIResponsesRequestBody {
  [key: string]: unknown;
  model: string;
  input: OpenAIResponsesInputItem[];
  instructions?: string;
  stream?: boolean;
  temperature?: number;
  top_p?: number;
  max_output_tokens?: number;
  reasoning_effort?: string;
  reasoning?: {
    effort?: string;
  };
  tools?: Array<Record<string, unknown>>;
  previous_response_id?: string;
}

export type OpenAIResponsesUsage = {
  input_tokens?: number;
  output_tokens?: number;
  total_tokens?: number;
};

export type OpenAIResponsesOutputContentBlock = {
  type?: string;
  text?: string;
  thinking?: string;
  reasoning?: string;
};

export type OpenAIResponsesOutputItem = {
  id?: string;
  type?: 'message' | 'reasoning' | 'function_call' | string;
  role?: string;
  content?: OpenAIResponsesOutputContentBlock[] | string;
  summary?: string[];
};

export type OpenAIResponsesResponsePayload = {
  id?: string;
  object?: string;
  status?: string;
  model?: string;
  output?: OpenAIResponsesOutputItem[];
  usage?: OpenAIResponsesUsage;
  incomplete_details?: {
    reason?: string;
  };
  error?: {
    message?: string;
    type?: string;
    code?: string;
  };
};

export type OpenAIResponsesStreamEvent = {
  type: string;
  delta?: string;
  item_id?: string;
  output_index?: number;
  content_index?: number;
  response?: OpenAIResponsesResponsePayload;
  item?: OpenAIResponsesOutputItem;
  part?: OpenAIResponsesOutputContentBlock;
  error?: {
    message?: string;
  };
};

export const asOpenAIResponsesConfig = (config: unknown): OpenAIResponsesChatConfig =>
  typeof config === 'object' && config !== null ? (config as OpenAIResponsesChatConfig) : {};

export const mapOpenAIResponsesUsage = (usage?: OpenAIResponsesUsage): UsageMetadata | undefined => {
  if (!usage) {
    return undefined;
  }
  const prompt = usage.input_tokens ?? 0;
  const completion = usage.output_tokens ?? 0;
  return {
    promptTokenCount: prompt,
    candidatesTokenCount: completion,
    totalTokenCount: usage.total_tokens ?? prompt + completion,
  } as UsageMetadata;
};
