import type { OpenAIResponsePayload } from './openaiCompatibleTypes';
import { parseSseRawDataChunks, readSseStream } from './sseReader';

export const readOpenAICompatibleStreamEvents = (
  response: Response,
  abortSignal: AbortSignal,
  onEvent: (payload: OpenAIResponsePayload) => void,
): Promise<void> =>
  readSseStream(
    response,
    abortSignal,
    parseSseRawDataChunks,
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
