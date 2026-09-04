import type { Content, Part, UsageMetadata, FunctionDeclaration } from '@google/genai';
import type { ImageOutputMode, SafetySetting, ThinkingLevel } from './settings';
import type { UploadedFile } from './chat';

export type ChatHistoryItem = Content & {
  parts: Part[];
  role: 'user' | 'model';
};

export type StreamMessageCompleteHandler = (
  usageMetadata?: UsageMetadata,
  groundingMetadata?: unknown,
  urlContextMetadata?: unknown,
) => void;

export type NonStreamMessageCompleteHandler = (
  parts: Part[],
  thoughtsText?: string,
  usageMetadata?: UsageMetadata,
  groundingMetadata?: unknown,
  urlContextMetadata?: unknown,
) => void;

export type LiveTranscriptHandler = (
  text: string,
  role: 'user' | 'model',
  isFinal: boolean,
  type?: 'content' | 'thought',
  audioUrl?: string | null,
  generatedFiles?: UploadedFile[],
  apiPart?: Part,
) => void;

export type StreamMessageSender = (
  apiKey: string,
  modelId: string,
  history: ChatHistoryItem[],
  parts: Part[],
  config: unknown,
  abortSignal: AbortSignal,
  onPart: (part: Part) => void,
  onThoughtChunk: (chunk: string) => void,
  onError: (error: Error) => void,
  onComplete: StreamMessageCompleteHandler,
  role?: 'user' | 'model',
  providerId?: string | null,
  // Optional stream-journal resume context. When provided, the sender stamps
  // x-amc-job-id / x-amc-last-seq (plus x-amc-job-secret for secret-bound jobs)
  // headers so the api container can resume a buffered upstream instead of
  // restarting it (see server/src/streamJobs.ts).
  streamResume?: { jobId: string; jobSecret?: string; lastSeq: number; onSeq?: (seq: number) => void },
) => Promise<void>;

export type NonStreamMessageSender = (
  apiKey: string,
  modelId: string,
  history: ChatHistoryItem[],
  parts: Part[],
  config: unknown,
  abortSignal: AbortSignal,
  onError: (error: Error) => void,
  onComplete: NonStreamMessageCompleteHandler,
  role?: 'user' | 'model',
  providerId?: string | null,
) => Promise<void>;

export interface LiveClientFunction {
  declaration: FunctionDeclaration;
  handler: (args: unknown, options?: { abortSignal?: AbortSignal }) => Promise<LiveClientFunctionExecutionResult>;
}

export type LiveClientFunctions = Record<string, LiveClientFunction>;

export interface LiveClientFunctionExecutionResult {
  response: unknown;
  generatedFiles?: UploadedFile[];
}

export interface StandardClientFunctionExecutionResult {
  response: unknown;
  generatedFiles?: UploadedFile[];
}

export interface StandardClientFunction {
  declaration: FunctionDeclaration;
  handler: (args: unknown, options?: { abortSignal?: AbortSignal }) => Promise<StandardClientFunctionExecutionResult>;
}

export type StandardClientFunctions = Record<string, StandardClientFunction>;

export interface EditImageRequestConfig {
  systemInstruction?: string;
  showThoughts?: boolean;
  thinkingBudget?: number;
  thinkingLevel?: ThinkingLevel;
  isGoogleSearchEnabled?: boolean;
  isDeepSearchEnabled?: boolean;
  safetySettings?: SafetySetting[];
  imageOutputMode?: ImageOutputMode;
}

export interface ThoughtSupportingPart extends Part {
  thought?: boolean;
}
