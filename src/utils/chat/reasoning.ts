import { splitMarkdownSegments, transformMarkdownTextSegments } from '@/utils/markdownSegments';
import { escapeHtml } from '@/utils/escapeHtml';

const GEMMA_THOUGHT_CHANNEL_REGEX = /<\|channel(?:\|thought>|>thought\s*)([\s\S]*?)\s*<channel\|>/gi;
const GEMMA_THOUGHT_CHANNEL_PRESENCE_REGEX = /<\|channel(?:\|thought>|>thought\s*)([\s\S]*?)\s*<channel\|>/i;
// Both <thinking> (DeepSeek) and <think> (OpenAI-compatible reasoning tags)
// spell the same block; the streaming parser in inlineThinkingParser matches
// the same variants so extraction and streaming never disagree. RAW_* requires
// the full closer (</thinking>) or the short one (</think>) to treat a block as
// closed; the loose THINKING_BLOCK closer also absorbs malformed closers.
const THINKING_BLOCK_REGEX = /<think(?:ing)?>([\s\S]*?)<\/[^>]+>/gi;
const THINKING_BLOCK_PRESENCE_REGEX = /<think(?:ing)?>([\s\S]*?)<\/[^>]+>/i;
const RAW_THINKING_BLOCK_REGEX = /<think(?:ing)?>([\s\S]*?)<\/think(?:ing)?>/gi;
const RAW_OPEN_THINKING_BLOCK_REGEX = /<think(?:ing)?>([\s\S]*)$/i;
const INCOMPLETE_THINKING_BLOCK_REGEX = /<think(?:ing)?>([\s\S]*?)$/i;

const normalizeReasoningWhitespace = (text: string): string =>
  text
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();

export const extractGemmaThoughtChannel = (text: string): { content: string; thoughts?: string } => {
  if (!text) {
    return { content: '' };
  }

  if (!GEMMA_THOUGHT_CHANNEL_PRESENCE_REGEX.test(text)) {
    return { content: text };
  }

  const thoughts: string[] = [];
  const content = text.replace(GEMMA_THOUGHT_CHANNEL_REGEX, (_match, innerContent: string) => {
    const normalizedThought = normalizeReasoningWhitespace(innerContent);
    if (normalizedThought) {
      thoughts.push(normalizedThought);
    }
    return ' ';
  });

  const extractedContent = normalizeReasoningWhitespace(content);
  if (thoughts.length === 0) {
    return { content: extractedContent };
  }

  return {
    content: extractedContent,
    thoughts: thoughts.join('\n\n'),
  };
};

export const extractRawThinkingBlocks = (
  text: string,
): { content: string; thoughts?: string; hasOpenThinkingBlock: boolean } => {
  if (!text) {
    return { content: '', hasOpenThinkingBlock: false };
  }

  const thoughts: string[] = [];
  let hasOpenThinkingBlock = false;
  let foundThinkingMarkup = false;

  const content = splitMarkdownSegments(text)
    .map((segment) => {
      if (segment.type === 'literal') {
        return segment.value;
      }

      let segmentContent = segment.value.replace(RAW_THINKING_BLOCK_REGEX, (_match, innerContent: string) => {
        foundThinkingMarkup = true;
        const normalizedThought = normalizeReasoningWhitespace(innerContent);
        if (normalizedThought) {
          thoughts.push(normalizedThought);
        }
        return ' ';
      });

      const openMatch = RAW_OPEN_THINKING_BLOCK_REGEX.exec(segmentContent);
      if (openMatch) {
        foundThinkingMarkup = true;
        hasOpenThinkingBlock = true;
        const normalizedThought = normalizeReasoningWhitespace(openMatch[1]);
        if (normalizedThought) {
          thoughts.push(normalizedThought);
        }
        segmentContent = segmentContent.slice(0, openMatch.index);
      }

      return segmentContent;
    })
    .join('');

  if (!foundThinkingMarkup) {
    return { content: text, hasOpenThinkingBlock: false };
  }

  return {
    content: normalizeReasoningWhitespace(content),
    thoughts: thoughts.length > 0 ? thoughts.join('\n\n') : undefined,
    hasOpenThinkingBlock,
  };
};

export const stripReasoningMarkup = (text: string): string => {
  if (!text) {
    return '';
  }

  const rawExtraction = extractRawThinkingBlocks(text);
  const hadThinkingBlock = THINKING_BLOCK_PRESENCE_REGEX.test(text) || rawExtraction.hasOpenThinkingBlock;
  const withoutThinkingBlocks = rawExtraction.content.replace(THINKING_BLOCK_REGEX, ' ');
  const { content } = extractGemmaThoughtChannel(withoutThinkingBlocks);

  if (!hadThinkingBlock) {
    return content;
  }

  return normalizeReasoningWhitespace(content);
};

const createThinkingBlockMarkup = (innerContent: string, isLoading: boolean, summaryLabel: string): string => {
  const escapedContent = escapeHtml(innerContent.trim());
  const escapedSummaryLabel = escapeHtml(summaryLabel);
  const openAttribute = isLoading ? ' open' : '';

  return `<details${openAttribute}><summary>${escapedSummaryLabel}</summary><div>${escapedContent}</div></details>`;
};

export const wrapReasoningMarkup = (value: string, isLoading: boolean, summaryLabel: string): string =>
  transformMarkdownTextSegments(value, (segment) => {
    let nextValue = segment.replace(THINKING_BLOCK_REGEX, (_match, innerContent: string) =>
      createThinkingBlockMarkup(innerContent, isLoading, summaryLabel),
    );

    if (isLoading) {
      nextValue = nextValue.replace(INCOMPLETE_THINKING_BLOCK_REGEX, (_match, innerContent: string) =>
        createThinkingBlockMarkup(innerContent, true, summaryLabel),
      );
    }

    nextValue = nextValue.replace(GEMMA_THOUGHT_CHANNEL_REGEX, (_match, innerContent: string) =>
      createThinkingBlockMarkup(innerContent, isLoading, summaryLabel),
    );

    return nextValue;
  });

export const stripGemmaThoughtMarkup = (value: string): string =>
  transformMarkdownTextSegments(value, (segment) => segment.replace(GEMMA_THOUGHT_CHANNEL_REGEX, ' '));
