import type { OpenAIResponsePayload } from './openaiCompatibleTypes';
import { readSseStream } from './sseReader';

const parseSseDataLines = (buffer: string): { events: string[]; rest: string } => {
  const events: string[] = [];
  let searchStart = 0;
  let boundaryIndex = buffer.indexOf('\n\n', searchStart);

  while (boundaryIndex !== -1) {
    const rawEvent = buffer.slice(searchStart, boundaryIndex);
    const eventData = rawEvent
      .split('\n')
      .map((line) => line.trimEnd())
      .filter((line) => line.startsWith('data:'))
      .map((line) => line.slice(5).trimStart())
      .join('\n');

    if (eventData) {
      events.push(eventData);
    }

    searchStart = boundaryIndex + 2;
    boundaryIndex = buffer.indexOf('\n\n', searchStart);
  }

  return { events, rest: buffer.slice(searchStart) };
};

export const readOpenAICompatibleStreamEvents = (
  response: Response,
  abortSignal: AbortSignal,
  onEvent: (payload: OpenAIResponsePayload) => void,
): Promise<void> =>
  readSseStream(
    response,
    abortSignal,
    parseSseDataLines,
    (event) => {
      // Skip malformed SSE lines instead of aborting the whole stream.
      try {
        onEvent(JSON.parse(event) as OpenAIResponsePayload);
      } catch {
        // Ignore unparseable event and continue.
      }
    },
    (event) => event === '[DONE]',
  );
