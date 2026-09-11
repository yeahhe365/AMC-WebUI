import { transformMarkdownTextSegments } from '@/utils/markdownSegments';
import { parseTagAttributes } from './tagAttributes';

export interface LocateTagPatterns {
  tagRegex: RegExp;
  inlineTagRegex: RegExp;
  partialTagRegex: RegExp;
}

export const createLocateTagPatterns = (tagName: string): LocateTagPatterns => ({
  tagRegex: new RegExp(`<${tagName}\\b([^>]*?)(?:\\/>|>([\\s\\S]*?)<\\/${tagName}>)`, 'gi'),
  inlineTagRegex: new RegExp(
    `(?:(\\r?\\n[ \\t]*)|([ \\t]*))<${tagName}\\b([^>]*?)(?:\\/>|>([\\s\\S]*?)<\\/${tagName}>)`,
    'gi',
  ),
  partialTagRegex: new RegExp(`<${tagName}\\b[^>]*(?:>[^<]*)?$`, 'i'),
});

export const linkifyLocateTags = (
  text: string,
  tagName: string,
  patterns: LocateTagPatterns,
  buildMarkdownLink: (attrs: Record<string, string>, inner: string) => string | null,
): string => {
  const { tagRegex, inlineTagRegex, partialTagRegex } = patterns;

  if (!text || !text.includes(tagName)) {
    return text ? text.replace(partialTagRegex, '') : text;
  }

  const trailingPattern = new RegExp(
    `^([\\s\\S]*?\\n)\\s*\\n\\s*((?:<${tagName}\\b[^>]*(?:\\/>|>[\\s\\S]*?<\\/${tagName}>)\\s*)+)$`,
    'i',
  );

  return transformMarkdownTextSegments(text, (plainText) => {
    let processedText = plainText;

    if (processedText.includes(`<${tagName}`)) {
      const trailingMatch = processedText.match(trailingPattern);
      const bodyPart = trailingMatch ? trailingMatch[1] : processedText;
      const trailingPart = trailingMatch ? trailingMatch[2] : '';
      const existingLinkHrefs = new Set<string>();

      let transformedBody = bodyPart.replace(
        inlineTagRegex,
        (
          _full,
          leadingNewline: string | undefined,
          leadingSpace: string | undefined,
          attrStr: string,
          inner: string | undefined,
        ) => {
          const attrs = parseTagAttributes(attrStr);
          const link = buildMarkdownLink(attrs, inner || '');
          if (link) {
            const hrefMatch = link.match(/\((#[^)]+)\)/);
            if (hrefMatch) existingLinkHrefs.add(hrefMatch[1]);
            const prefix = leadingNewline || leadingSpace || ' ';
            return `${prefix}${link}`;
          }
          return '';
        },
      );

      transformedBody = transformedBody.replace(/\n\s*(\n\s*)+/g, '\n\n');
      transformedBody = transformedBody.replace(/[ \t]+([。，、！？；：.!?])/g, '$1');

      const transformedTrailingButtons: string[] = [];
      tagRegex.lastIndex = 0;
      let trailingMatchItem: RegExpExecArray | null;
      while ((trailingMatchItem = tagRegex.exec(trailingPart)) !== null) {
        const attrs = parseTagAttributes(trailingMatchItem[1]);
        const link = buildMarkdownLink(attrs, trailingMatchItem[2] || '');
        if (link) {
          const hrefMatch = link.match(/\((#[^)]+)\)/);
          if (hrefMatch && existingLinkHrefs.has(hrefMatch[1])) {
            // Already represented by an inline button in the body text
            continue;
          }
          transformedTrailingButtons.push(link);
          if (hrefMatch) existingLinkHrefs.add(hrefMatch[1]);
        }
      }

      if (transformedTrailingButtons.length > 0) {
        const trailingRow = transformedTrailingButtons.join(' ');
        processedText = transformedBody.trimEnd() ? `${transformedBody.trimEnd()}\n\n${trailingRow}` : trailingRow;
      } else {
        processedText = transformedBody;
      }
    }

    return processedText.replace(partialTagRegex, '');
  });
};
