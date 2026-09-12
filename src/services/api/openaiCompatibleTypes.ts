import type { UsageMetadata } from '@google/genai';
import type { ThinkingLevel } from '@/types';

import type { OpenAIToolDefinition } from '@/features/chat-tools/toolSchemaAdapters';

export interface OpenAIToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

export interface OpenAICompatibleChatConfig {
  baseUrl?: string | null;
  templateId?: string | null;
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
  thinkingBudget?: number;
  extraHeaders?: Record<string, string> | null;
  tools?: OpenAIToolDefinition[];
}

export type OpenAIMessageContent =
  | string
  | Array<
      | { type: 'text'; text: string }
      | { type: 'image_url'; image_url: { url: string } }
      | { type: 'input_audio'; input_audio: { data: string; format: string } }
    >;

export type OpenAIMessage =
  | {
      role: 'system' | 'user';
      content: OpenAIMessageContent;
    }
  | {
      role: 'assistant';
      content: OpenAIMessageContent | null;
      tool_calls?: OpenAIToolCall[];
    }
  | {
      role: 'tool';
      tool_call_id: string;
      content: string;
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
    tool_calls?: OpenAIToolCall[];
  };
  delta?: {
    content?: string;
    reasoning_content?: string;
    reasoning?: string;
    reasoning_details?: Array<{ text?: string }>;
    tool_calls?: Array<{
      index?: number;
      id?: string;
      type?: 'function';
      function?: {
        name?: string;
        arguments?: string;
      };
    }>;
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
