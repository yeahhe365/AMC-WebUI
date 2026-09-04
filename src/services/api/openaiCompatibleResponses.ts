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

// OpenRouter and friends use `reasoning` (sometimes `reasoning_details`, a list
// of {text} segments) instead of DeepSeek's `reasoning_content`. Read the
// first non-empty of the three, in the same order the providers document them.
export const extractOpenAICompatibleReasoningText = (payload: OpenAIResponsePayload): string | undefined => {
  const message = payload.choices?.[0]?.message;
  if (!message) {
    return undefined;
  }

  if (typeof message.reasoning === 'string' && message.reasoning) {
    return message.reasoning;
  }

  if (typeof message.reasoning_content === 'string' && message.reasoning_content) {
    return message.reasoning_content;
  }

  if (Array.isArray(message.reasoning_details)) {
    const joined = message.reasoning_details
      .map((item) => item.text)
      .filter((text): text is string => typeof text === 'string' && text.length > 0)
      .join('');
    if (joined) {
      return joined;
    }
  }

  return undefined;
};

// Delta-level variant used by the stream reader: a chunk can carry reasoning in
// any of the three shapes (OpenRouter streams `reasoning` text directly).
export const extractOpenAICompatibleReasoningDelta = (payload: OpenAIResponsePayload): string | undefined => {
  const delta = payload.choices?.[0]?.delta;
  if (!delta) {
    return undefined;
  }

  if (typeof delta.reasoning === 'string' && delta.reasoning) {
    return delta.reasoning;
  }

  if (typeof delta.reasoning_content === 'string' && delta.reasoning_content) {
    return delta.reasoning_content;
  }

  if (Array.isArray(delta.reasoning_details)) {
    const joined = delta.reasoning_details
      .map((item) => item.text)
      .filter((text): text is string => typeof text === 'string' && text.length > 0)
      .join('');
    if (joined) {
      return joined;
    }
  }

  return undefined;
};
