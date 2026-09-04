import type { MutableRefObject } from 'react';
import type { SupportedLanguage } from '@/i18n/languageRegistry';
import {
  type AppSettings,
  type ChatMessage,
  type ChatSettings as IndividualChatSettings,
  type SavedChatSession,
  type UploadedFile,
  type ImageOutputMode,
} from '@/types';
import type { Part, UsageMetadata } from '@google/genai';
import type { getTranslator } from '@/i18n/translations';

export type SessionsUpdater = (
  updater: (prev: SavedChatSession[]) => SavedChatSession[],
  options?: { persist?: boolean },
) => void;

export type MessageSenderTranslator = ReturnType<typeof getTranslator>;

export interface StreamHandlerOptions {
  /** When false, replayed parts (non-streaming replies, tool-loop final turn) do
   *  not advance the first-token timestamp, which would otherwise be stamped at
   *  completion time and zero out the "thinking took" display. */
  recordFirstToken?: boolean;
  /** Provenance of the thought text, stamped on the message the first time a
   *  thought arrives. `'third-party'` forces the flat strip (no sectioned
   *  rendering); `'gemini'` (or undefined) allows Gemini-style sections. */
  source?: 'gemini' | 'third-party';
}

export interface StreamHandlerFunctions {
  streamOnError: (error: Error) => void;
  streamOnComplete: (
    usageMetadata?: UsageMetadata,
    groundingMetadata?: unknown,
    urlContextMetadata?: unknown,
    generatedFiles?: UploadedFile[],
  ) => void;
  streamOnPart: (part: Part, options?: StreamHandlerOptions) => void;
  onThoughtChunk: (thoughtChunk: string, options?: StreamHandlerOptions) => void;
}

export type GetStreamHandlers = (
  currentSessionId: string,
  generationId: string,
  abortController: AbortController,
  generationStartTime: Date,
  currentChatSettings: IndividualChatSettings,
  requestParts?: Part[],
  onSuccess?: (generationId: string, finalContent: string) => void,
  transformFinalContent?: (finalContent: string) => string,
) => StreamHandlerFunctions;

export interface BaseSenderProps {
  appSettings: AppSettings;
  currentChatSettings: IndividualChatSettings;
  updateAndPersistSessions: SessionsUpdater;
  setSessionLoading: (sessionId: string, isLoading: boolean) => void;
  activeJobs: MutableRefObject<Map<string, AbortController>>;
  setAppFileError: (error: string | null) => void;
  language: SupportedLanguage;
}

export interface StandardChatProps extends BaseSenderProps {
  messages: ChatMessage[];
  setEditingMessageId: (id: string | null) => void;
  aspectRatio: string;
  imageSize?: string;
  imageOutputMode: ImageOutputMode;
  userScrolledUpRef: MutableRefObject<boolean>;
  activeSessionId: string | null;
  setActiveSessionId: (id: string | null) => void;
  getStreamHandlers: GetStreamHandlers;
  sessionKeyMapRef: MutableRefObject<Map<string, string>>;
}
