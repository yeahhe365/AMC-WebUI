export interface MarkdownTocItem {
  id: string;
  text: string;
  level: number;
  line: number;
  index: number;
}

const HEADING_REGEX = /^(#{1,6})\s+(.+)$/;

const cleanHeadingText = (raw: string): string => {
  return raw
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/(`+)(.*?)\1/g, '$2')
    .replace(/(\*\*|__)(.*?)\1/g, '$2')
    .replace(/(\*|_)(.*?)\1/g, '$2')
    .replace(/~~(.*?)~~/g, '$1')
    .replace(/<[^>]+>/g, '')
    .trim();
};

const slugifyHeading = (text: string, index: number): string => {
  const slug = text
    .toLowerCase()
    .replace(/[^\w\u4e00-\u9fff\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80);

  return slug || `heading-${index}`;
};

export const extractMarkdownToc = (content: string): MarkdownTocItem[] => {
  if (!content) return [];

  const lines = content.split(/\r\n|\r|\n/);
  const items: MarkdownTocItem[] = [];
  let inCodeBlock = false;
  let codeFenceChar = '';

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
    const line = lines[lineIndex];

    const fenceMatch = line.match(/^(\s*)(`{3,}|~{3,})/);
    if (fenceMatch) {
      const fenceChar = fenceMatch[2][0];
      if (!inCodeBlock) {
        inCodeBlock = true;
        codeFenceChar = fenceChar;
      } else if (fenceChar === codeFenceChar) {
        inCodeBlock = false;
        codeFenceChar = '';
      }
      continue;
    }

    if (inCodeBlock) continue;

    const match = line.match(HEADING_REGEX);
    if (!match) continue;

    const level = match[1].length;
    const rawText = match[2].replace(/\s+#+\s*$/, '').trim();
    if (!rawText) continue;

    const cleanText = cleanHeadingText(rawText);
    const displayText = cleanText || rawText;

    items.push({
      id: slugifyHeading(displayText, items.length),
      text: displayText,
      level,
      line: lineIndex,
      index: items.length,
    });
  }

  return items;
};
