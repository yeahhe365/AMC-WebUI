/**
 * Checks whether a message content (either a string or an array of content parts) is non-empty.
 */
export const hasNonEmptyMessageContent = (content: string | readonly unknown[]): boolean =>
  typeof content === 'string' ? content.trim().length > 0 : content.length > 0;

/**
 * If all content items are text blocks, joins their text by newlines.
 * If any non-text block is encountered, returns the original array of items untouched.
 */
export const collapseOnlyTextContent = <T>(
  items: T[],
  extractText: (item: T) => string | null | undefined,
): string | T[] => {
  const texts: string[] = [];
  for (const item of items) {
    const text = extractText(item);
    if (typeof text !== 'string') {
      return items;
    }
    if (text) {
      texts.push(text);
    }
  }
  return texts.join('\n');
};
