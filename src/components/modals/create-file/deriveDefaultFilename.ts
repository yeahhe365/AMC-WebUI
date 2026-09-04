const MAX_DERIVED_FILENAME_LENGTH = 60;
const MARKDOWN_LINK_PATTERN = /\[([^\]]+)\]\([^)]*\)/g;
const MARKDOWN_IMAGE_PATTERN = /!\[([^\]]*)\]\([^)]*\)/g;
const MARKDOWN_EMPHASIS_PATTERN = /\*\*|__|\*|~~|`/g;
const UNSAFE_FILENAME_CHAR_PATTERN = /[<>:"/\\|?*#]/g;

/**
 * Derives a human-friendly default filename from editor content: the first
 * markdown heading wins, otherwise the first non-empty line. Returns null when
 * nothing usable can be extracted.
 */
const cleanFilenameCandidate = (candidate: string): string | null => {
  const cleaned = candidate
    .replace(MARKDOWN_IMAGE_PATTERN, '$1')
    .replace(MARKDOWN_LINK_PATTERN, '$1')
    .replace(MARKDOWN_EMPHASIS_PATTERN, '')
    .replace(UNSAFE_FILENAME_CHAR_PATTERN, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_DERIVED_FILENAME_LENGTH)
    .trim();
  return cleaned || null;
};

export const deriveDefaultFilename = (content: string): string | null => {
  let firstNonEmptyLine: string | null = null;

  for (const rawLine of content.split('\n')) {
    const line = rawLine.trim();
    if (!line) continue;

    const headingMatch = line.match(/^#{1,6}\s+(.*)$/);
    if (headingMatch) {
      const heading = cleanFilenameCandidate(headingMatch[1]);
      if (heading) return heading;
      continue;
    }
    if (firstNonEmptyLine === null) firstNonEmptyLine = line;
  }

  return firstNonEmptyLine === null ? null : cleanFilenameCandidate(firstNonEmptyLine);
};
