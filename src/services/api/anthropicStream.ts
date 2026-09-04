import type { AnthropicStreamEvent } from './anthropicTypes';
import { readSseStream } from './sseReader';

export const parseAnthropicSseEvents = (buffer: string): { events: AnthropicStreamEvent[]; rest: string } => {
  const events: AnthropicStreamEvent[] = [];
  let searchStart = 0;
  let boundaryIndex = buffer.indexOf('\n\n', searchStart);

  while (boundaryIndex !== -1) {
    const rawEvent = buffer.slice(searchStart, boundaryIndex);
    const dataLines = rawEvent
      .split('\n')
      .map((line) => line.trimEnd())
      .filter((line) => line.startsWith('data:'))
      .map((line) => line.slice(5).trimStart())
      .join('\n');

    if (dataLines && dataLines !== '[DONE]') {
      try {
        events.push(JSON.parse(dataLines) as AnthropicStreamEvent);
      } catch {
        // skip malformed
      }
    }

    searchStart = boundaryIndex + 2;
    boundaryIndex = buffer.indexOf('\n\n', searchStart);
  }

  return { events, rest: buffer.slice(searchStart) };
};

export const readAnthropicStreamEvents = (
  response: Response,
  abortSignal: AbortSignal,
  onEvent: (event: AnthropicStreamEvent) => void,
): Promise<void> =>
  readSseStream(response, abortSignal, parseAnthropicSseEvents, onEvent, (event) => event.type === 'message_stop');
