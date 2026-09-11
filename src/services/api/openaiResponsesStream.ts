import type { OpenAIResponsesStreamEvent } from './openaiResponsesTypes';
import { parseSseJsonEvents, readSseStream } from './sseReader';

const parseOpenAIResponsesSseEvents = (buffer: string): { events: OpenAIResponsesStreamEvent[]; rest: string } =>
  parseSseJsonEvents<OpenAIResponsesStreamEvent>(buffer);

const isOpenAIResponsesTerminalEvent = (event: OpenAIResponsesStreamEvent): boolean =>
  event.type === 'response.completed' || event.type === 'response.failed' || event.type === 'error';

export const readOpenAIResponsesStreamEvents = (
  response: Response,
  abortSignal: AbortSignal,
  onEvent: (event: OpenAIResponsesStreamEvent) => void,
): Promise<void> =>
  readSseStream(response, abortSignal, parseOpenAIResponsesSseEvents, onEvent, isOpenAIResponsesTerminalEvent);
