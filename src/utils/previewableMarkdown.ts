type PreviewMarkupType = 'html' | 'svg';
interface NormalizePreviewableMarkdownOptions {
  isStreaming?: boolean;
  /**
   * 是否把语言误标为 css/text/txt/markdown/md、内容却像完整 HTML 文档或含
   * Live Artifacts 协议标记的代码块解包为实时预览。默认 true(向后兼容);
   * 关闭后此类代码块一律按源码显示。
   */
  unwrapMislabeledHtmlBlocks?: boolean;
}

const LIVE_ARTIFACT_HTML_LANGUAGE = 'amc-live-artifact-html';
const LIVE_ARTIFACT_INTERACTION_LANGUAGE = 'amc-live-artifact-interaction';
const HTML_LANGUAGE_ALIASES = new Set(['html', 'htm']);
const SVG_LANGUAGE_ALIASES = new Set(['svg']);
// Trailing whitespace/comments after </html> are tolerated: models sometimes
// append a closing remark comment to a full document, and rejecting the whole
// document over it is why such replies fell back to colorless raw HTML. Trailing
// prose text is still rejected here (the segment extractor handles that case by
// splitting the artifact off from surrounding text instead).
const HTML_DOCUMENT_REGEX = /^(?:<!doctype\s+html\b[^>]*>\s*)?<html\b[\s\S]*<\/html>\s*(?:<!--[\s\S]*-->\s*)*$/i;
const HTML_DOCUMENT_START_REGEX = /^(?:<!doctype\s+html\b[^>]*>\s*)?(?:<html\b|<head\b|<body\b)/i;
const HTML_DOCTYPE_START_REGEX = /^<!doctype\s+html\b/i;
const HTML_FRAGMENT_TAG_NAMES = [
  'article',
  'aside',
  'blockquote',
  'button',
  'caption',
  'details',
  'div',
  'figure',
  'figcaption',
  'footer',
  'form',
  'h[1-6]',
  'header',
  'label',
  'li',
  'main',
  'meter',
  'nav',
  'ol',
  'p',
  'progress',
  'section',
  'select',
  'span',
  'summary',
  'table',
  'tbody',
  'td',
  'tfoot',
  'th',
  'thead',
  'tr',
  'ul',
].join('|');
const HTML_FRAGMENT_REGEX = new RegExp(`^<(${HTML_FRAGMENT_TAG_NAMES})(?:\\s[^>]*)?>[\\s\\S]*<\\/\\1>$`, 'i');
const HTML_FRAGMENT_CONTAINER_REGEX = new RegExp(
  `^<(?:${HTML_FRAGMENT_TAG_NAMES})(?:\\s[^>]*)?>[\\s\\S]*<\\/(?:${HTML_FRAGMENT_TAG_NAMES})>$`,
  'i',
);
const HTML_FRAGMENT_START_REGEX = new RegExp(
  `^(?:<!--[\\s\\S]*?-->\\s*)?<(?:${HTML_FRAGMENT_TAG_NAMES})(?:\\s[^>]*)?>`,
  'i',
);
const HTML_STRUCTURAL_BLANK_LINE_REGEX = new RegExp(
  `\\n[ \\t]*\\n(?=[ \\t]*(?:<!--|<\\/?(?:${HTML_FRAGMENT_TAG_NAMES})(?:\\s|>|/)))`,
  'gi',
);
const HTML_COMMENT_REGEX = /<!--[\s\S]*?-->/g;
// NOTE: Do not reject fragments that merely mention <script>/<iframe>/… in text.
// Models often document those tags inside Live Artifacts (e.g. "通过 <iframe> 嵌入"),
// and string-matching them used to drop the whole reply out of ArtifactFrame into a
// broken Markdown/HTML code-block view. Executable tags are still stripped by the
// preview sanitizer when the artifact actually renders.
const SVG_DOCUMENT_REGEX = /^<svg\b[\s\S]*<\/svg>$/i;
const FENCED_CODE_BLOCK_REGEX = /```([^\n`]*)\n?([\s\S]*?)```/g;
const OPEN_FENCED_CODE_BLOCK_AT_END_REGEX = /```([^\n`]*)\n?([\s\S]*)$/;
const MISLABELED_HTML_FRAGMENT_LANGUAGES = new Set(['css', 'text', 'txt', 'markdown', 'md']);
const TOOL_RESULT_FRAGMENT_REGEX = /^<div\b(?=[^>]*\bclass=["'][^"']*\btool-result\b)/i;
// Live Artifacts 协议特征:只会出现在模型按 LA 提示词产出的内容里,几乎不可
// 能出现在"展示源码"的教程文本中。CSS 变量(--amc-live-artifact-*)与声明式
// 交互属性(data-amc-*)都是 LA 专有,作为解包误标代码块的强信号。
const LIVE_ARTIFACT_MARKER_REGEX = /--amc-live-artifact-|data-amc-/i;

const normalizeLanguage = (language?: string): string => {
  if (!language) return '';
  return language.trim().split(/\s+/)[0].toLowerCase();
};

export const isLiveArtifactLanguage = (language?: string): boolean => {
  return normalizeLanguage(language) === LIVE_ARTIFACT_HTML_LANGUAGE;
};

export const isLiveArtifactInteractionLanguage = (language?: string): boolean => {
  return normalizeLanguage(language) === LIVE_ARTIFACT_INTERACTION_LANGUAGE;
};

const isLikelyLiveArtifactInteractionJson = (textContent: string): boolean => {
  // Lenient by design: CodeBlock renders the interaction form OR a diagnostic
  // card via diagnoseLiveArtifactInteraction, which can repair specs that a
  // strict parse would reject (e.g. a missing items.type). Wrapping on the
  // same shape gate CodeBlock uses keeps the two paths consistent — a
  // repairable spec gets a form/diagnostic, not a silent plain-text fallback.
  const normalizedContent = textContent.trim();
  return (
    !!normalizedContent &&
    normalizedContent.startsWith('{') &&
    normalizedContent.includes('"instruction"') &&
    normalizedContent.includes('"schema"')
  );
};

const getPreviewMarkupType = (textContent: string): PreviewMarkupType | null => {
  if (!textContent) return null;

  const normalizedContent = textContent.trim();
  if (!normalizedContent) return null;

  if (SVG_DOCUMENT_REGEX.test(normalizedContent)) {
    return 'svg';
  }

  if (HTML_DOCUMENT_REGEX.test(normalizedContent)) {
    return 'html';
  }

  if (isStandaloneHtmlFragment(normalizedContent)) {
    return 'html';
  }

  return null;
};

const isStandaloneHtmlFragment = (textContent: string): boolean => {
  if (!textContent) return false;

  const normalizedContent = textContent.trim();
  if (!normalizedContent) {
    return false;
  }

  const contentWithoutComments = normalizedContent.replace(HTML_COMMENT_REGEX, '').trim();

  return HTML_FRAGMENT_REGEX.test(contentWithoutComments) || HTML_FRAGMENT_CONTAINER_REGEX.test(contentWithoutComments);
};

const isLikelyStreamingStandaloneHtmlFragment = (textContent: string): boolean => {
  const normalizedContent = textContent.trim();

  if (!normalizedContent) {
    return false;
  }

  return HTML_FRAGMENT_START_REGEX.test(normalizedContent);
};

const isLikelyStreamingStandaloneHtmlDocument = (textContent: string): boolean => {
  const normalizedContent = textContent.trim();

  if (!normalizedContent) {
    return false;
  }

  return HTML_DOCUMENT_START_REGEX.test(normalizedContent) || HTML_DOCTYPE_START_REGEX.test(normalizedContent);
};

export const isLikelyStreamingHtmlArtifact = (textContent: string): boolean => {
  const normalizedContent = textContent.trim();

  if (!normalizedContent || TOOL_RESULT_FRAGMENT_REGEX.test(normalizedContent)) {
    return false;
  }

  return (
    isLikelyStreamingStandaloneHtmlDocument(normalizedContent) ||
    isLikelyStreamingStandaloneHtmlFragment(normalizedContent)
  );
};

export const isLikelyStreamingLiveArtifactInteractionJson = (textContent: string): boolean => {
  const normalizedContent = textContent.trim();
  const openFenceMatch = normalizedContent.match(OPEN_FENCED_CODE_BLOCK_AT_END_REGEX);
  const candidateContent =
    openFenceMatch && isLiveArtifactInteractionLanguage(openFenceMatch[1])
      ? (openFenceMatch[2] ?? '').trim()
      : normalizedContent;

  return (
    candidateContent.startsWith('{') &&
    candidateContent.includes('"instruction"') &&
    candidateContent.includes('"schema"')
  );
};

/**
 * 误标代码块是否应解包还原为实时预览。只有强信号才解包:
 * - 强信号 A:完整 HTML 文档(以 <!doctype html> 或 <html> 开头)——模型输出
 *   完整文档却误标成 text/css 时,几乎可以确定是 LA 产物。
 * - 强信号 B:内容含 Live Artifacts 协议标记(--amc-live-artifact-* CSS 变量
 *   或 data-amc-* 声明式交互属性)。
 * 刻意放弃"块级标签首尾匹配"的裸片段:这类内容无法区分"误标 LA"与"故意
 * 展示源码",一律按源码显示(即该特性引入前的行为)。
 */
const shouldUnwrapMislabeledHtmlFence = (content: string): boolean => {
  if (!content) return false;

  if (HTML_DOCTYPE_START_REGEX.test(content) || /^<html\b/i.test(content)) {
    return true;
  }

  return LIVE_ARTIFACT_MARKER_REGEX.test(content);
};

const getStandaloneDocumentPreviewType = (textContent: string): PreviewMarkupType | null => {
  if (!textContent) return null;

  const normalizedContent = textContent.trim();
  if (!normalizedContent) return null;

  if (SVG_DOCUMENT_REGEX.test(normalizedContent)) {
    return 'svg';
  }

  if (HTML_DOCUMENT_REGEX.test(normalizedContent)) {
    return 'html';
  }

  return null;
};

export const getCodeBlockPreviewType = (textContent: string, language?: string): PreviewMarkupType | null => {
  const normalizedLanguage = normalizeLanguage(language);

  if (isLiveArtifactLanguage(normalizedLanguage)) {
    return 'html';
  }

  if (HTML_LANGUAGE_ALIASES.has(normalizedLanguage)) {
    return 'html';
  }

  if (SVG_LANGUAGE_ALIASES.has(normalizedLanguage)) {
    return 'svg';
  }

  return getPreviewMarkupType(textContent);
};

// Strict classifier for the automatic preview-open path. Unlike
// getCodeBlockPreviewType, it never content-sniffs: an explicit non-HTML/SVG
// language (python, css, text, …) is treated as author intent and returns
// null even when the body happens to look like HTML. Only an explicit
// html/svg label, or an unlabeled full HTML/SVG document, counts as a
// preview target for auto-open.
export const getAutoPreviewType = (textContent: string, language?: string): PreviewMarkupType | null => {
  const normalizedLanguage = normalizeLanguage(language);

  // Live Artifacts (amc-live-artifact-html) render ONLY inline in the message
  // bubble via ArtifactFrame. They must never trigger the automatic fullscreen
  // preview modal, so this fence language is excluded from auto-open. Note:
  // bare HTML documents are wrapped into this fence by
  // normalizePreviewableMarkdownContent, so they are excluded here too —
  // they render inline as Live Artifacts instead of opening the preview modal.

  if (HTML_LANGUAGE_ALIASES.has(normalizedLanguage)) {
    return 'html';
  }

  if (SVG_LANGUAGE_ALIASES.has(normalizedLanguage)) {
    return 'svg';
  }

  if (normalizedLanguage) {
    return null;
  }

  return getStandaloneDocumentPreviewType(textContent);
};

// Strict variant of extractPreviewableCodeBlock for the automatic preview-open
// path: fenced blocks are classified with getAutoPreviewType (no sniffing of
// mislabeled languages), and a fallback to the whole document only fires for a
// complete unlabeled HTML/SVG document — never for a bare fragment.
export const extractAutoPreviewableBlock = (
  markdownContent: string,
): { content: string; markupType: PreviewMarkupType } | null => {
  if (!markdownContent) return null;

  for (const match of markdownContent.matchAll(FENCED_CODE_BLOCK_REGEX)) {
    const rawLanguage = match[1] ?? '';
    const rawContent = match[2] ?? '';
    const content = rawContent.trim();
    const markupType = getAutoPreviewType(content, rawLanguage);

    if (markupType) {
      return { content, markupType };
    }
  }

  const standaloneDocumentType = getStandaloneDocumentPreviewType(markdownContent);
  if (standaloneDocumentType) {
    return { content: markdownContent.trim(), markupType: standaloneDocumentType };
  }

  return null;
};

type ArtifactSegment = {
  html: string;
  markupType: PreviewMarkupType;
  suffix: string;
};

/**
 * Locates a self-contained HTML/SVG artifact in the content, tolerating optional
 * trailing prose after `</html>` (comments are also tolerated by the whole-content
 * path via HTML_DOCUMENT_REGEX). Leading prose + a bare fragment is intentionally
 * NOT treated as an artifact here: inline "prose + HTML" is rendered as rich
 * markdown in the message DOM (with theme tokens available via the main-page
 * --amc-live-artifact-* variables), not promoted into a Live Artifact frame.
 */
const extractArtifactSegment = (textContent: string, isStreaming: boolean): ArtifactSegment | null => {
  const trimmed = textContent.trim();
  if (!trimmed) {
    return null;
  }

  const wholeMarkupType =
    getPreviewMarkupType(trimmed) || (isStreaming && isLikelyStreamingHtmlArtifact(trimmed) ? 'html' : null);
  if (wholeMarkupType) {
    return { html: trimmed, markupType: wholeMarkupType, suffix: '' };
  }

  // A full document that only carries trailing prose after </html>: split the
  // artifact off so it still renders as a Live Artifact instead of degrading to
  // colorless raw HTML. The document regex already handles trailing comments.
  // The trimmed content starts with the document (there is no leading prose to
  // skip in this path), so the artifact is everything up to and including
  // `</html>`.
  if (!/^(\s*)(?:<!doctype\s+html\b[^>]*>\s*)?<html\b[^>]*>/i.test(trimmed)) {
    return null;
  }

  const htmlCloseIndex = trimmed.lastIndexOf('</html>');
  if (htmlCloseIndex === -1) {
    return null;
  }

  const doc = trimmed.slice(0, htmlCloseIndex + '</html>'.length);
  const docType = getPreviewMarkupType(doc);
  if (!docType) {
    return null;
  }

  const suffix = trimmed.slice(htmlCloseIndex + '</html>'.length).trim();
  return { html: doc, markupType: docType, suffix };
};

/**
 * A model reply is often prose PLUS a bare artifact (`引导语 + <div …>`), not a
 * single artifact. `extractArtifactSegment` only fires when the artifact is the
 * whole message (optionally with trailing prose after a full `</html>`), so a
 * fragment preceded by a sentence used to fall through to the Markdown
 * renderer and surface as escaped source text in the bubble.
 *
 * This finds the outermost bare artifact region anywhere in the reply so the
 * surrounding prose can be preserved verbatim. Three rules keep it safe:
 *
 * 1. Fenced regions are never considered. A fenced block is author intent —
 *    either a real artifact fence or a deliberate source example — and must
 *    not be re-wrapped or nested.
 * 2. Only strong LA signals qualify: a complete HTML document/SVG, or a
 *    `--amc-live-artifact-*` / `data-amc-*` marker. A marker-less bare fragment
 *    stays as-is to match `shouldUnwrapMislabeledHtmlFence`, which cannot
 *    distinguish "mislabeled LA" from "intentionally showing markup".
 * 3. The artifact must be separated from the prose by a blank line. Inline
 *    "prose + HTML" (`已为你生成：\n<section>…`) is deliberately rendered as
 *    rich markdown in the message flow, not promoted into an artifact frame.
 */
const BARE_ARTIFACT_OPENER_REGEX = new RegExp(
  `^(?:<!doctype\\s+html\\b[^>]*>|<html\\b|<(?:${HTML_FRAGMENT_TAG_NAMES})(?:\\s[^>]*)?>)`,
  'i',
);

/** A region is only a candidate when a blank line precedes it. */
const BLANK_LINE_BEFORE_REGEX = /\n[ \t]*\n[ \t]*$/;

/** Offsets of every fenced code region, so bare-artifact scanning can skip them. */
const getFencedRegionOffsets = (text: string): Array<{ start: number; end: number }> => {
  const regions: Array<{ start: number; end: number }> = [];
  const regex = new RegExp(FENCED_CODE_BLOCK_REGEX.source, 'g');
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    regions.push({ start: match.index, end: match.index + match[0].length });
    if (match[0].length === 0) {
      regex.lastIndex += 1;
    }
  }

  // An unclosed fence opened at the end swallows the rest of the reply.
  const openMatch = text.match(OPEN_FENCED_CODE_BLOCK_AT_END_REGEX);
  if (openMatch && openMatch.index !== undefined) {
    const alreadyCovered = regions.some(
      (region) => openMatch.index !== undefined && openMatch.index >= region.start && openMatch.index < region.end,
    );
    if (!alreadyCovered) {
      regions.push({ start: openMatch.index, end: text.length });
    }
  }

  return regions;
};

const isInsideFencedRegion = (offset: number, regions: Array<{ start: number; end: number }>): boolean =>
  regions.some((region) => offset >= region.start && offset < region.end);

/**
 * Does this bare region carry a strong enough signal to be promoted?
 *
 * A complete document/SVG is unambiguous. For fragments the bar is deliberately
 * higher than `getPreviewMarkupType`: a bare `<div>…</div>` is very often a
 * truncation boundary of a longer streaming fragment, or plain markup being
 * shown on purpose. Only a Live Artifacts marker (protocol CSS variable or
 * `data-amc-*`) proves the author meant an artifact — the same signal
 * `shouldUnwrapMislabeledHtmlFence` relies on.
 */
const isPromotableBareArtifact = (artifact: string): boolean => {
  const markupType = getPreviewMarkupType(artifact);
  if (markupType === 'svg') {
    return true;
  }

  if (markupType === 'html' && HTML_DOCUMENT_REGEX.test(artifact.trim())) {
    return true;
  }

  return LIVE_ARTIFACT_MARKER_REGEX.test(artifact) && isStandaloneHtmlFragment(artifact);
};

const findBareArtifactRegion = (text: string): { start: number; end: number } | null => {
  const lines = text.split('\n');
  const fencedRegions = getFencedRegionOffsets(text);
  // Absolute offset of each line so a matched region can be spliced back into
  // the original string without re-normalizing the prose around it.
  const lineOffsets: number[] = [];
  let offset = 0;
  for (const line of lines) {
    lineOffsets.push(offset);
    offset += line.length + 1;
  }

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const lineStart = lineOffsets[i];

    if (isInsideFencedRegion(lineStart, fencedRegions)) {
      continue;
    }

    if (!BARE_ARTIFACT_OPENER_REGEX.test(line.trimStart())) {
      continue;
    }

    const leadingWhitespace = line.length - line.trimStart().length;
    const candidateStart = lineStart + leadingWhitespace;

    // Rule 3: the artifact must be set off from preceding prose by a blank line
    // (or be the whole reply). Otherwise it is inline prose+HTML and stays as
    // rich markdown in the message flow.
    const precedingText = text.slice(0, candidateStart);
    if (precedingText.trim() !== '' && !BLANK_LINE_BEFORE_REGEX.test(precedingText)) {
      continue;
    }

    // Rule 1: a fence that opens after the candidate swallows everything that
    // follows it, so nothing at or past that fence can be part of the artifact.
    const followingFenceStart = fencedRegions
      .filter((region) => region.start > candidateStart)
      .reduce((min, region) => Math.min(min, region.start), Number.POSITIVE_INFINITY);

    // Longest suffix-delimited region first: prefer the most complete artifact
    // so a partially-closed fragment never wins over the full run of markup.
    for (let j = lines.length - 1; j >= i; j -= 1) {
      const end = j === lines.length - 1 ? text.length : lineOffsets[j + 1] - 1;
      if (end <= candidateStart) {
        continue;
      }
      if (Number.isFinite(followingFenceStart) && end > followingFenceStart) {
        continue;
      }

      const candidate = text.slice(candidateStart, end);
      if (isPromotableBareArtifact(candidate)) {
        return { start: candidateStart, end };
      }
    }
  }

  return null;
};

const wrapBarePreviewableArtifact = (
  markdownContent: string,
  options: NormalizePreviewableMarkdownOptions = {},
): string => {
  const content = markdownContent.trim();

  if (TOOL_RESULT_FRAGMENT_REGEX.test(content)) {
    return markdownContent;
  }

  const segment = extractArtifactSegment(content, options.isStreaming ?? false);

  if (segment) {
    const artifactLanguage = segment.markupType === 'html' ? LIVE_ARTIFACT_HTML_LANGUAGE : segment.markupType;
    const fence = `\`\`\`${artifactLanguage}\n${segment.html}\n\`\`\``;
    const suffix = segment.suffix ? `\n\n${segment.suffix}` : '';
    return `${fence}${suffix}`;
  }

  // Prose-wrapped artifact: splice the fence in place, keeping the prose as-is.
  const region = findBareArtifactRegion(content);
  if (!region) {
    return markdownContent;
  }

  const artifact = content.slice(region.start, region.end).trim();
  const markupType = getPreviewMarkupType(artifact);
  if (!markupType) {
    return markdownContent;
  }

  const artifactLanguage = markupType === 'html' ? LIVE_ARTIFACT_HTML_LANGUAGE : markupType;
  const before = content.slice(0, region.start).trimEnd();
  const after = content.slice(region.end).trimStart();
  const fence = `\`\`\`${artifactLanguage}\n${artifact}\n\`\`\``;

  return [before, fence, after].filter(Boolean).join('\n\n');
};

const wrapBareLiveArtifactInteraction = (
  markdownContent: string,
  options: NormalizePreviewableMarkdownOptions = {},
): string => {
  const content = markdownContent.trim();

  if (
    !isLikelyLiveArtifactInteractionJson(content) &&
    !(options.isStreaming && isLikelyStreamingLiveArtifactInteractionJson(content))
  ) {
    return markdownContent;
  }

  return `\`\`\`${LIVE_ARTIFACT_INTERACTION_LANGUAGE}\n${content}\n\`\`\``;
};

const unwrapMislabeledHtmlFragmentCodeBlocks = (
  markdownContent: string,
  options: NormalizePreviewableMarkdownOptions = {},
): string => {
  if (!markdownContent || options.unwrapMislabeledHtmlBlocks === false) {
    return markdownContent;
  }

  const normalizedClosedFences = markdownContent.replace(
    FENCED_CODE_BLOCK_REGEX,
    (match, rawLanguage: string = '', rawContent: string = '') => {
      const normalizedLanguage = normalizeLanguage(rawLanguage);
      const content = rawContent.trim();

      if (MISLABELED_HTML_FRAGMENT_LANGUAGES.has(normalizedLanguage) && shouldUnwrapMislabeledHtmlFence(content)) {
        return content;
      }

      return match;
    },
  );

  return normalizedClosedFences.replace(
    OPEN_FENCED_CODE_BLOCK_AT_END_REGEX,
    (match, rawLanguage: string = '', rawContent: string = '') => {
      const normalizedLanguage = normalizeLanguage(rawLanguage);
      const content = rawContent.trim();

      if (MISLABELED_HTML_FRAGMENT_LANGUAGES.has(normalizedLanguage) && shouldUnwrapMislabeledHtmlFence(content)) {
        return content;
      }

      return match;
    },
  );
};

const normalizeStandaloneRawHtmlFragment = (markdownContent: string): string => {
  const content = markdownContent.trim();

  if (!isStandaloneHtmlFragment(content) && !isLikelyStreamingStandaloneHtmlFragment(content)) {
    return markdownContent;
  }

  return content.replace(HTML_STRUCTURAL_BLANK_LINE_REGEX, '\n');
};

export const normalizePreviewableMarkdownContent = (
  markdownContent: string,
  options: NormalizePreviewableMarkdownOptions = {},
): string => {
  return wrapBareLiveArtifactInteraction(
    wrapBarePreviewableArtifact(
      normalizeStandaloneRawHtmlFragment(unwrapMislabeledHtmlFragmentCodeBlocks(markdownContent, options)),
      options,
    ),
    options,
  );
};

export const isLikelyHtml = (textContent: string): boolean => {
  return getPreviewMarkupType(textContent) !== null;
};
