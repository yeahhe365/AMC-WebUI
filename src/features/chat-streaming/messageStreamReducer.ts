import type { Part, UsageMetadata } from '@google/genai';
import type { UploadedFile } from '@/types';
import { mergeGroundingMetadata, type MetadataWithCitations } from '@/utils/groundingMetadata';
import {
  appendApiPart,
  getContentDeltaFromPart,
  getGeneratedFileFromPart,
  mergeUniqueFiles,
} from './messageStreamParts';
import { mergeUsageMetadata, mergeUrlContextMetadata } from './messageStreamMetadata';

type MessageStreamEvent =
  | {
      type: 'part';
      part: Part;
      /** Split deltas for inline-reasoning streams (third-party providers). When
       *  absent, contentDelta falls back to getContentDeltaFromPart so Live API
       *  and other callers that pass raw parts behave exactly as before. */
      contentDelta?: string;
      thoughtDelta?: string;
      receivedAt?: Date;
      recordFirstToken?: boolean;
    }
  | { type: 'thought'; text: string; receivedAt?: Date; recordFirstToken?: boolean }
  | { type: 'files'; files: UploadedFile[]; receivedAt?: Date }
  | {
      type: 'complete';
      usage?: UsageMetadata;
      grounding?: unknown;
      urlContext?: unknown;
      generatedFiles?: UploadedFile[];
      aborted?: boolean;
      receivedAt?: Date;
    };

export interface MessageStreamState {
  generationId: string;
  generationStartTime: Date;
  content: string;
  thoughts: string;
  apiParts: Part[];
  files: UploadedFile[];
  firstTokenTimeMs?: number;
  firstContentPartTime: Date | null;
  lastThoughtChunkTimeMs?: number;
  lastContentPartTime?: Date;
  thinkingActive: boolean;
  usage?: UsageMetadata;
  grounding?: MetadataWithCitations;
  urlContext?: unknown;
  aborted: boolean;
}

export const createMessageStreamState = ({
  generationId,
  generationStartTime,
}: {
  generationId: string;
  generationStartTime: Date;
}): MessageStreamState => ({
  generationId,
  generationStartTime,
  content: '',
  thoughts: '',
  apiParts: [],
  files: [],
  firstContentPartTime: null,
  thinkingActive: false,
  aborted: false,
});

// A part counts as "thinking has ended" only when it visibly switches the
// turn to answering. Visible content (the split contentDelta or generated
// media) ends thinking; interleaved code execution is a tooling round-trip, so
// it keeps the thinking state alive so the thinking strip survives the
// round-trip and resumes if the model thinks again afterwards.
const hasInlineData = (part: Part): boolean => Boolean((part as Part & { inlineData?: unknown }).inlineData);

// Any part that can carry model output is a "token", but it must not end the
// thinking state (see hasContentEnd below).
const isTokenPart = (part: Part) => {
  const anyPart = part as Part & {
    text?: string;
    executableCode?: unknown;
    codeExecutionResult?: unknown;
    inlineData?: unknown;
  };

  return Boolean(
    (anyPart.text && anyPart.text.trim().length > 0) ||
    anyPart.executableCode ||
    anyPart.codeExecutionResult ||
    anyPart.inlineData,
  );
};

const recordFirstToken = (state: MessageStreamState, receivedAt?: Date): MessageStreamState => {
  if (state.firstTokenTimeMs !== undefined) {
    return state;
  }

  const now = receivedAt ?? new Date();
  return {
    ...state,
    firstTokenTimeMs: now.getTime() - state.generationStartTime.getTime(),
  };
};

const recordFirstContentPart = (state: MessageStreamState, receivedAt?: Date): MessageStreamState => {
  if (state.firstContentPartTime) {
    return state;
  }

  return {
    ...state,
    firstContentPartTime: receivedAt ?? new Date(),
  };
};

export const reduceMessageStreamEvent = (state: MessageStreamState, event: MessageStreamEvent): MessageStreamState => {
  // recordFirstToken:false marks a replay (non-streaming reply, tool-loop final
  // turn) whose parts all arrive at completion time. Such replays must not
  // advance the first-token timestamp or per-chunk thinking timings — those
  // would be stamped "now" and zero out the thinking-time display. They still
  // record the first content part so finalizeMessages can measure the total
  // run as the thinking duration.
  const isReplay = 'recordFirstToken' in event && event.recordFirstToken === false;

  switch (event.type) {
    case 'thought': {
      const receivedAt = event.receivedAt ?? new Date();
      if (isReplay) {
        return {
          ...state,
          thoughts: state.thoughts + event.text,
        };
      }

      return {
        ...recordFirstToken(state, receivedAt),
        thoughts: state.thoughts + event.text,
        lastThoughtChunkTimeMs: receivedAt.getTime() - state.generationStartTime.getTime(),
        thinkingActive: true,
      };
    }
    case 'part': {
      const receivedAt = event.receivedAt ?? new Date();
      const contentDelta = event.contentDelta ?? getContentDeltaFromPart(event.part);
      const thoughtDelta = event.thoughtDelta ?? '';
      let nextState = state;
      if (!isReplay && isTokenPart(event.part)) {
        nextState = recordFirstToken(state, receivedAt);
      }

      // Content-end is decided on visible *text* content. When split deltas are
      // supplied (inline-reasoning streams) contentDelta is authoritative; a
      // part whose raw text is entirely inline reasoning yields an empty delta
      // and must not end thinking. Without deltas, fall back to the raw part
      // text — executableCode/codeExecutionResult derive markdown from
      // getContentDeltaFromPart but are tooling round-trips, not the model
      // switching to answering. inlineData (images) still ends thinking.
      const hasVisibleText =
        event.contentDelta !== undefined
          ? contentDelta.trim().length > 0
          : Boolean((event.part as Part & { text?: string }).text?.trim());
      const hasContentEnd = hasVisibleText || hasInlineData(event.part);

      if (hasContentEnd) {
        nextState = recordFirstContentPart(nextState, receivedAt);
      }

      const generatedFile = getGeneratedFileFromPart(event.part);

      // Split thought deltas append to thoughts and, outside replay, keep the
      // thinking state alive and stamp the chunk time. Replays still get the
      // thought text (non-streaming third-party replies must render it) but
      // must not advance the live timing state machine.
      const thoughts = thoughtDelta ? nextState.thoughts + thoughtDelta : nextState.thoughts;
      const lastThoughtChunkTimeMs =
        !isReplay && thoughtDelta
          ? receivedAt.getTime() - state.generationStartTime.getTime()
          : nextState.lastThoughtChunkTimeMs;
      const thinkingActive =
        !isReplay && hasContentEnd ? false : !isReplay && thoughtDelta ? true : nextState.thinkingActive;

      return {
        ...nextState,
        content: nextState.content + contentDelta,
        thoughts,
        apiParts: appendApiPart(nextState.apiParts, event.part),
        files: generatedFile ? mergeUniqueFiles(nextState.files, [generatedFile]) : nextState.files,
        // lastContentPartTime drives the mid-stream "thinking ended" commit; a
        // replay measures the whole run once at finalize instead.
        lastContentPartTime: !isReplay && hasContentEnd ? receivedAt : nextState.lastContentPartTime,
        thinkingActive,
        lastThoughtChunkTimeMs,
      };
    }
    case 'files':
      return {
        ...state,
        files: mergeUniqueFiles(state.files, event.files),
      };
    case 'complete':
      return {
        ...state,
        usage: mergeUsageMetadata(state.usage, event.usage),
        grounding: mergeGroundingMetadata(state.grounding, event.grounding),
        urlContext: mergeUrlContextMetadata(state.urlContext, event.urlContext),
        files: event.generatedFiles ? mergeUniqueFiles(state.files, event.generatedFiles) : state.files,
        aborted: state.aborted || !!event.aborted,
      };
  }
};
