const BLOCK_TEX_MATH_PATTERN = /(^|[^\\])\$\$[\s\S]*?[^\\]\$\$/m;
const INLINE_TEX_MATH_PATTERN = /(^|[^\\])\$(?!\$)(?:\\.|[^\\$\n])+\$/m;

// Signals that strongly suggest TeX math rather than a currency amount or a
// stray dollar sign. Mirrors the preview-document heuristic so the chat path
// does not flip to the math renderer for ordinary "$5 and $10" text.
const TEX_MATH_SIGNAL_REGEX = /[\\^_{}=+\-*/<>|]|[A-Za-z]\d|\d[A-Za-z]|[Ͱ-Ͽ]/;
const ASYMPTOTIC_COMPLEXITY_REGEX = /^(?:O|Θ|Ω|Theta|Omega)\s*\([^)]*[A-Za-z0-9][^)]*\)$/;

const isLikelyTexMath = (value: string): boolean => {
  const normalizedValue = value.trim();

  if (!normalizedValue) {
    return false;
  }

  return TEX_MATH_SIGNAL_REGEX.test(normalizedValue) || ASYMPTOTIC_COMPLEXITY_REGEX.test(normalizedValue);
};

const stripEscapedDollarMarkers = (value: string): string => value.replace(/\\\$/g, '$');

export const containsTexMathMarkdown = (content: string): boolean =>
  BLOCK_TEX_MATH_PATTERN.test(content) || INLINE_TEX_MATH_PATTERN.test(content);

/**
 * True when the content contains a TeX delimiter whose payload looks like real
 * math. Unlike `containsTexMathMarkdown`, this validates each candidate so a
 * bare `$5 and $10` (currency) does not force the math renderer onto the
 * message. Used by LazyMarkdownRenderer to decide whether to load the math
 * chunk.
 */
export const hasLikelyTexMathMarkdown = (content: string): boolean => {
  const blockMatches = content.match(new RegExp(BLOCK_TEX_MATH_PATTERN.source, 'gm')) ?? [];
  if (blockMatches.some((match) => isLikelyTexMath(stripEscapedDollarMarkers(match)))) {
    return true;
  }

  const inlineMatches = content.match(new RegExp(INLINE_TEX_MATH_PATTERN.source, 'gm')) ?? [];
  return inlineMatches.some((match) => isLikelyTexMath(stripEscapedDollarMarkers(match)));
};
