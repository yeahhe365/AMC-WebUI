import type { OpenAIResponsePayload } from './openaiCompatibleTypes';

// The OpenAI spec writes finish_reason in snake_case, but some compatible
// providers camelCase it; read both.
export const extractOpenAICompatibleFinishReason = (payload: OpenAIResponsePayload): string | undefined => {
  const choice = payload.choices?.[0];
  return choice?.finish_reason ?? choice?.finishReason;
};

export const extractOpenAICompatibleMessageText = (payload: OpenAIResponsePayload): string => {
  const content = payload.choices?.[0]?.message?.content;

  if (typeof content === 'string') {
    return content;
  }

  if (Array.isArray(content)) {
    return content
      .map((item) => item.text)
      .filter((text): text is string => typeof text === 'string')
      .join('');
  }

  return '';
};

type ReasoningPayloadContainer = {
  reasoning?: unknown;
  reasoning_content?: unknown;
  reasoning_details?: unknown;
};

// OpenRouter and friends use `reasoning` (sometimes `reasoning_details`, a list
// of {text} segments) instead of DeepSeek's `reasoning_content`. Read the
// first non-empty of the three, in the same order the providers document them.
const extractReasoningFromContainer = (container?: ReasoningPayloadContainer | null): string | undefined => {
  if (!container) {
    return undefined;
  }

  if (typeof container.reasoning === 'string' && container.reasoning) {
    return container.reasoning;
  }

  if (typeof container.reasoning_content === 'string' && container.reasoning_content) {
    return container.reasoning_content;
  }

  if (Array.isArray(container.reasoning_details)) {
    const joined = container.reasoning_details
      .map((item) => (item as { text?: unknown })?.text)
      .filter((text): text is string => typeof text === 'string' && text.length > 0)
      .join('');
    if (joined) {
      return joined;
    }
  }

  return undefined;
};

export const extractOpenAICompatibleReasoningText = (payload: OpenAIResponsePayload): string | undefined =>
  extractReasoningFromContainer(payload.choices?.[0]?.message);

// Delta-level variant used by the stream reader: a chunk can carry reasoning in
// any of the three shapes (OpenRouter streams `reasoning` text directly).
export const extractOpenAICompatibleReasoningDelta = (payload: OpenAIResponsePayload): string | undefined =>
  extractReasoningFromContainer(payload.choices?.[0]?.delta);
