/**
 * Repairs Markdown image syntax that HTML converters commonly leave behind:
 * a space between `![]` and `(url)`, escaped `[` / `]` from Turndown, and
 * Discourse-style lightbox wrappers that nest an image plus size metadata
 * inside a link.
 */
export const normalizeConvertedMarkdown = (markdown: string): string =>
  markdown
    .replace(/!\\?\[([^\]]*?)\\?\]\s+\(/g, '![$1](')
    .replace(/\\?\[!\\?\[([^\]]*?)\\?\]\(([^)]+)\)[\s\S]{0,200}?\\?\]\((https?:[^)]+)\)/g, '![$1]($2)');
