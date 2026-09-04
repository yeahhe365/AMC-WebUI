// Inline reasoning-tag parser for third-party providers (DeepSeek-R1 style
// <thinking>/<think> blocks streamed inside the text part). The stream sender
// hands each text delta to pushInlineThinkingChunk, which splits it into a
// visible-content increment and a thought increment before the reducer sees it.
//
// Open/close tags may be split across chunk boundaries, so any non-empty prefix
// of a tag is held back in the buffer until the next chunk either completes it
// or disambiguates it into plain text. One chunk can open, close, and reopen
// several blocks; the while loop drains the buffer until no tag boundary
// remains. A tag that never completes simply stays in the buffer — an unclosed
// thinking block already had its inner text emitted as thought as it streamed,
// and a dangling opener prefix is dropped rather than surfaced as content.

interface InlineThinkingParserState {
  mode: 'content' | 'thinking';
  buffer: string;
}

const OPEN_TAG_VARIANTS = ['<thinking>', '<think>'];
const CLOSE_TAG_VARIANTS = ['</thinking>', '</think>'];

export const createInlineThinkingParserState: () => InlineThinkingParserState = () => ({
  mode: 'content',
  buffer: '',
});

const findEarliestTag = (buffer: string, tags: readonly string[]): { index: number; length: number } | undefined => {
  const lower = buffer.toLowerCase();
  let earliest: { index: number; length: number } | undefined;

  for (const tag of tags) {
    const index = lower.indexOf(tag);
    if (index !== -1 && (earliest === undefined || index < earliest.index)) {
      earliest = { index, length: tag.length };
    }
  }

  return earliest;
};

// Longest non-empty proper prefix of any tag that the buffer currently ends
// with. Only proper prefixes qualify — a complete tag is handled by
// findEarliestTag and consumed outright.
const heldBackPrefix = (buffer: string, tags: readonly string[]): string => {
  let longest = '';

  for (const tag of tags) {
    for (let prefixLength = 1; prefixLength < tag.length; prefixLength += 1) {
      const prefix = tag.slice(0, prefixLength);
      if (prefix.length > longest.length && buffer.endsWith(prefix)) {
        longest = prefix;
      }
    }
  }

  return longest;
};

export const pushInlineThinkingChunk = (
  state: InlineThinkingParserState,
  chunk: string,
): { content: string; thought: string } => {
  if (!chunk) {
    return { content: '', thought: '' };
  }

  state.buffer += chunk;
  let content = '';
  let thought = '';

  while (state.buffer.length > 0) {
    if (state.mode === 'content') {
      const openTag = findEarliestTag(state.buffer, OPEN_TAG_VARIANTS);
      if (openTag) {
        content += state.buffer.slice(0, openTag.index);
        state.mode = 'thinking';
        state.buffer = state.buffer.slice(openTag.index + openTag.length);
        continue;
      }

      const held = heldBackPrefix(state.buffer, OPEN_TAG_VARIANTS);
      if (held) {
        content += state.buffer.slice(0, state.buffer.length - held.length);
        state.buffer = held;
      } else {
        content += state.buffer;
        state.buffer = '';
      }
      break;
    }

    const closeTag = findEarliestTag(state.buffer, CLOSE_TAG_VARIANTS);
    if (closeTag) {
      thought += state.buffer.slice(0, closeTag.index);
      state.mode = 'content';
      state.buffer = state.buffer.slice(closeTag.index + closeTag.length);
      continue;
    }

    const held = heldBackPrefix(state.buffer, CLOSE_TAG_VARIANTS);
    if (held) {
      thought += state.buffer.slice(0, state.buffer.length - held.length);
      state.buffer = held;
    } else {
      thought += state.buffer;
      state.buffer = '';
    }
    break;
  }

  return { content, thought };
};
