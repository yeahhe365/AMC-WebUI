import type { OpenAIResponsesResponsePayload } from './openaiResponsesTypes';

export const extractOpenAIResponsesFinishReason = (payload: OpenAIResponsesResponsePayload): string | undefined => {
  const incompleteReason = payload.incomplete_details?.reason;
  if (incompleteReason === 'max_output_tokens') {
    return 'length';
  }
  if (incompleteReason === 'content_filter') {
    return 'content_filter';
  }
  if (incompleteReason) {
    return incompleteReason;
  }
  if (payload.status === 'completed') {
    return 'stop';
  }
  return payload.status;
};

export const extractOpenAIResponsesMessageText = (payload: OpenAIResponsesResponsePayload): string => {
  if (!Array.isArray(payload.output)) {
    return '';
  }

  const texts: string[] = [];

  for (const item of payload.output) {
    if (item.type === 'message') {
      if (typeof item.content === 'string') {
        texts.push(item.content);
      } else if (Array.isArray(item.content)) {
        for (const block of item.content) {
          if (block.type !== 'thinking' && block.type !== 'reasoning' && typeof block.text === 'string') {
            texts.push(block.text);
          }
        }
      }
    }
  }

  return texts.join('');
};

export const extractOpenAIResponsesMessageThoughts = (payload: OpenAIResponsesResponsePayload): string | undefined => {
  if (!Array.isArray(payload.output)) {
    return undefined;
  }

  const thoughts: string[] = [];

  for (const item of payload.output) {
    if (item.type === 'reasoning') {
      if (Array.isArray(item.content)) {
        for (const block of item.content) {
          if (typeof block.text === 'string' && block.text.trim().length > 0) {
            thoughts.push(block.text);
          }
        }
      } else if (typeof item.content === 'string' && item.content.trim().length > 0) {
        thoughts.push(item.content);
      }
      if (Array.isArray(item.summary)) {
        for (const s of item.summary) {
          if (typeof s === 'string' && s.trim().length > 0) {
            thoughts.push(s);
          }
        }
      }
    } else if (item.type === 'message' && Array.isArray(item.content)) {
      for (const block of item.content) {
        if (
          (block.type === 'thinking' || block.type === 'reasoning') &&
          typeof block.text === 'string' &&
          block.text.trim().length > 0
        ) {
          thoughts.push(block.text);
        }
        if (typeof block.thinking === 'string' && block.thinking.trim().length > 0) {
          thoughts.push(block.thinking);
        }
        if (typeof block.reasoning === 'string' && block.reasoning.trim().length > 0) {
          thoughts.push(block.reasoning);
        }
      }
    }
  }

  return thoughts.length > 0 ? thoughts.join('\n\n') : undefined;
};
