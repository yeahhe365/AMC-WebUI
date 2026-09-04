import type { UsageMetadata } from '@google/genai';
import type { ThinkingLevel } from '@/types';

export interface OpenAICompatibleChatConfig {
  baseUrl?: string | null;
  systemInstruction?: string;
  temperature?: number;
  topP?: number;
  topK?: number;
  maxOutputTokens?: number;
  stopSequences?: string[];
  presencePenalty?: number;
  frequencyPenalty?: number;
  seed?: number;
  thinkingLevel?: ThinkingLevel;
  extraHeaders?: Record<string, string> | null;
}

export type OpenAIMessageContent =
  | string
  | Array<
      | { type: 'text'; text: string }
      | { type: 'image_url'; image_url: { url: string } }
      | { type: 'input_audio'; input_audio: { data: string; format: string } }
    >;

export type OpenAIMessage = {
  role: 'system' | 'user' | 'assistant';
  content: OpenAIMessageContent;
};

export type OpenAIUsage = {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
};

export type OpenAIChoice = {
  finish_reason?: string;
  finishReason?: string;
  message?: {
    content?: string | Array<{ text?: string }>;
    reasoning_content?: string;
    reasoning?: string;
    reasoning_details?: Array<{ text?: string }>;
  };
  delta?: {
    content?: string;
    reasoning_content?: string;
    reasoning?: string;
    reasoning_details?: Array<{ text?: string }>;
  };
};

export type OpenAIResponsePayload = {
  choices?: OpenAIChoice[];
  usage?: OpenAIUsage;
  error?: {
    message?: string;
  };
};

export const asOpenAICompatibleConfig = (config: unknown): OpenAICompatibleChatConfig =>
  typeof config === 'object' && config !== null ? (config as OpenAICompatibleChatConfig) : {};

export const mapOpenAICompatibleUsage = (usage?: OpenAIUsage): UsageMetadata | undefined => {
  if (!usage) {
    return undefined;
  }

  return {
    promptTokenCount: usage.prompt_tokens,
    candidatesTokenCount: usage.completion_tokens,
    totalTokenCount: usage.total_tokens,
  } as UsageMetadata;
};
