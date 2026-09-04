import React from 'react';

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const getTerms = (query: string): string[] =>
  Array.from(new Set(query.trim().split(/\s+/).filter(Boolean))).sort((a, b) => b.length - a.length);

interface HighlightedTextProps {
  text: string;
  query: string;
}

/**
 * Renders `text` with every query term wrapped in a `<mark>`. Multi-word
 * queries split on whitespace; terms are matched longest-first so a short term
 * like `font` never swallows the longer `font size`. Query metacharacters are
 * escaped, and the split/`test` pairing avoids the global-regex `lastIndex`
 * trap (see `exactRegex`). Unknown/no terms render the plain text.
 */
export const HighlightedText: React.FC<HighlightedTextProps> = ({ text, query }) => {
  const terms = getTerms(query);

  if (!text || terms.length === 0) {
    return <>{text}</>;
  }

  const pattern = terms.map(escapeRegExp).join('|');
  const splitRegex = new RegExp(`(${pattern})`, 'gi');
  const exactRegex = new RegExp(`^(?:${pattern})$`, 'i');
  const parts = text.split(splitRegex);

  return (
    <>
      {parts.map((part, index) =>
        exactRegex.test(part) ? (
          <mark
            key={index}
            className="rounded-[0.25rem] bg-[var(--theme-bg-accent)]/20 px-[0.15rem] text-[var(--theme-text-primary)]"
          >
            {part}
          </mark>
        ) : (
          <React.Fragment key={index}>{part}</React.Fragment>
        ),
      )}
    </>
  );
};
