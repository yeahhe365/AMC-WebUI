import { useState, useEffect, useRef, useMemo } from 'react';
import {
  isLikelyStreamingHtmlArtifact,
  isLikelyStreamingLiveArtifactInteractionJson,
} from '@/utils/previewableMarkdown';

const FENCED_CODE_BLOCK_REGEX = /(```[\s\S]*?```|```[\s\S]*$)/g;
const GFM_TABLE_REGEX = /(?:^|\n)\|[^\n]*\|\s*\n\|(?:\s*:?-{3,}:?\s*\|)+/;
const RENDER_THROTTLE_MS = 60;
const DEFAULT_CHARS_PER_FRAME = 1;
const CATCH_UP_SPEEDS = [
  { lagThreshold: 200, charsPerFrame: 15 },
  { lagThreshold: 100, charsPerFrame: 8 },
  { lagThreshold: 50, charsPerFrame: 5 },
  { lagThreshold: 20, charsPerFrame: 3 },
  { lagThreshold: 5, charsPerFrame: 2 },
] as const;

const hasStreamingSensitiveMarkdownTable = (text: string) => {
  return text.split(FENCED_CODE_BLOCK_REGEX).some((segment, index) => index % 2 === 0 && GFM_TABLE_REGEX.test(segment));
};

// When the bypass is active (streaming a table / artifact), grow the displayed
// text to the next whole line instead of the whole received text at once. A
// whole-text swap turns plain-text table lines into a rendered <table> in a
// single frame — an abrupt height jump that makes Virtuoso reposition the
// viewport. Line-by-line growth keeps the message height smooth while the
// table streams in.
const getBypassNextText = (current: string, target: string): string => {
  if (current.length >= target.length) return target;
  const nextNewline = target.indexOf('\n', current.length);
  if (nextNewline === -1) return target;
  return target.slice(0, nextNewline + 1);
};

const getCharsToAdd = (lag: number): number =>
  CATCH_UP_SPEEDS.find(({ lagThreshold }) => lag > lagThreshold)?.charsPerFrame ?? DEFAULT_CHARS_PER_FRAME;

/**
 * A hook that provides a "typing effect" for streaming text.
 * It catches up to the target text smoothly instead of jumping in large chunks.
 */
export const useSmoothStreaming = (text: string | undefined | null, isStreaming: boolean) => {
  const safeText = text || '';
  const isDocumentHidden = typeof document !== 'undefined' && document.hidden;
  // Classify the content once per text value. The table check in particular
  // splits the whole string (array allocation); memoizing keeps that off the
  // hot path and avoids running it twice per render (bypass + line-by-line).
  const textClassification = useMemo(
    () => ({
      hasSensitiveTable: hasStreamingSensitiveMarkdownTable(safeText),
      isHtmlArtifact: isLikelyStreamingHtmlArtifact(safeText),
      isLiveArtifactJson: isLikelyStreamingLiveArtifactInteractionJson(safeText),
    }),
    [safeText],
  );
  const shouldBypassAnimation =
    isStreaming &&
    (textClassification.hasSensitiveTable ||
      textClassification.isHtmlArtifact ||
      textClassification.isLiveArtifactJson);
  // Tables grow line-by-line (smooth height) even in bypass mode, because an
  // artifact must appear atomically (a partial JSON/HTML cannot render) while a
  // table only needs its rows to keep arriving. Artifact candidates and a
  // hidden document must still swap to the full text at once.
  const shouldGrowLineByLine = isStreaming && textClassification.hasSensitiveTable;
  const [displayedText, setDisplayedText] = useState(isStreaming ? '' : safeText);

  const displayedTextRef = useRef(isStreaming ? '' : safeText);
  const targetTextRef = useRef(safeText);
  const animationFrameRef = useRef<number | null>(null);
  const lastRenderTimeRef = useRef<number>(0);

  useEffect(() => {
    targetTextRef.current = safeText;

    // Skip character-by-character animation when the content contains markdown
    // tables or artifact candidates, because repeatedly reparsing partial
    // table/artifact states creates visible structural jank in the chat bubble.
    // Markdown tables still grow displayedText line-by-line (see the animate
    // loop below) instead of swapping the whole received text at once, so a
    // mid-stream table never changes the message height abruptly. Artifact
    // candidates need the full text at once (a partial JSON/HTML cannot render
    // meaningfully), so they swap immediately.
    if (shouldBypassAnimation && !shouldGrowLineByLine) {
      displayedTextRef.current = safeText;
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
      return;
    }

    if (!isStreaming) {
      if (displayedTextRef.current !== safeText) {
        displayedTextRef.current = safeText;
      }
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
    }
  }, [safeText, isStreaming, shouldBypassAnimation, shouldGrowLineByLine]);

  useEffect(() => {
    if (!isStreaming) return;

    const animate = (time: DOMHighResTimeStamp) => {
      if (typeof document !== 'undefined' && document.hidden) {
        animationFrameRef.current = null;
        return;
      }

      const currentLen = displayedTextRef.current.length;
      const targetLen = targetTextRef.current.length;

      if (currentLen < targetLen) {
        const lag = targetLen - currentLen;

        // Bypass mode for tables advances to the next whole line so the message
        // height grows smoothly instead of jumping to the full text.
        const nextText = shouldGrowLineByLine
          ? getBypassNextText(displayedTextRef.current, targetTextRef.current)
          : targetTextRef.current.slice(0, currentLen + getCharsToAdd(lag));
        displayedTextRef.current = nextText;

        const isFinishedCatchingUp = nextText.length >= targetLen;

        if (isFinishedCatchingUp || time - lastRenderTimeRef.current > RENDER_THROTTLE_MS) {
          setDisplayedText(nextText);
          lastRenderTimeRef.current = time;
        }

        if (isFinishedCatchingUp) {
          animationFrameRef.current = null;
        } else {
          animationFrameRef.current = requestAnimationFrame(animate);
        }
      } else if (currentLen > targetLen) {
        displayedTextRef.current = targetTextRef.current;
        setDisplayedText(targetTextRef.current);
        lastRenderTimeRef.current = time;
        animationFrameRef.current = null;
      } else {
        animationFrameRef.current = null;
      }
    };

    if (!animationFrameRef.current && displayedTextRef.current !== targetTextRef.current) {
      animationFrameRef.current = requestAnimationFrame(animate);
    }

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
    };
  }, [isStreaming, safeText, shouldGrowLineByLine]);

  // While the tab is hidden there are no animation frames to drive the typing
  // effect, so surface the full text immediately. Non-table bypass modes
  // (artifact candidates) also swap to the full text at once because a partial
  // JSON/HTML cannot render meaningfully. Markdown tables return the
  // incrementally-grown displayedText so the height changes smoothly instead of
  // jumping.
  if (isDocumentHidden && isStreaming) {
    return safeText;
  }

  if (shouldBypassAnimation && !shouldGrowLineByLine) {
    return safeText;
  }

  return isStreaming ? displayedText : safeText;
};
