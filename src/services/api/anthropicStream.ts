import type { AnthropicStreamEvent } from './anthropicTypes';
import { parseSseJsonEvents, readSseStream } from './sseReader';

export const parseAnthropicSseEvents = (buffer: string): { events: AnthropicStreamEvent[]; rest: string } =>
  parseSseJsonEvents<AnthropicStreamEvent>(buffer);

export const readAnthropicStreamEvents = (
  response: Response,
  abortSignal: AbortSignal,
  onEvent: (event: AnthropicStreamEvent) => void,
): Promise<void> =>
  readSseStream(response, abortSignal, parseAnthropicSseEvents, onEvent, (event) => event.type === 'message_stop');
