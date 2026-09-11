import { createLocateTagPatterns, linkifyLocateTags } from './locateTagTransform';

const PDF_LOCATE_PATTERNS = createLocateTagPatterns('pdf-locate');

const buildPdfSeekMarkdownLink = (attrs: Record<string, string>, inner: string): string | null => {
  const rawPage = attrs.page?.trim();
  const pageNumber = Number.parseInt(rawPage || '', 10);
  if (!Number.isFinite(pageNumber) || pageNumber < 1) return null;

  const query = new URLSearchParams();
  query.set('page', String(pageNumber));
  if (attrs.doc?.trim()) query.set('doc', attrs.doc.trim());
  if (attrs.box?.trim()) {
    const normalizedBox = attrs.box
      .replace(/[()[\]]/g, '')
      .split(/[,;\s]+/)
      .map((v) => v.trim())
      .filter(Boolean)
      .join(',');
    if (normalizedBox) query.set('box', normalizedBox);
  }
  if (attrs.point?.trim()) {
    const normalizedPoint = attrs.point
      .replace(/[()[\]]/g, '')
      .split(/[,;\s]+/)
      .map((v) => v.trim())
      .filter(Boolean)
      .join(',');
    if (normalizedPoint) query.set('point', normalizedPoint);
  }
  const cleanSnippet = inner.trim();
  if (cleanSnippet) query.set('snippet', cleanSnippet);

  let label: string;
  const mentionsPage = new RegExp(
    `(?:第\\s*${pageNumber}\\s*页|page\\s*${pageNumber}\\b|\\bp\\.?\\s*${pageNumber}\\b)`,
    'i',
  );
  if (!cleanSnippet) {
    label = `第 ${pageNumber} 页`;
  } else if (mentionsPage.test(cleanSnippet) || /^(?:第\s*\d+\s*页|page\s*\d+|p\.\s*\d+)/i.test(cleanSnippet)) {
    label = cleanSnippet;
  } else {
    label = `第 ${pageNumber} 页 · ${cleanSnippet}`;
  }

  const safeLabel = label.replace(/[[\]]/g, '\\$&');
  return `[${safeLabel}](#pdf-seek?${query.toString()})`;
};

/**
 * Transforms <pdf-locate> tags into inline interactive `#pdf-seek` markdown links.
 * Avoids transforming inside code blocks.
 */
export const linkifyPdfLocates = (text: string): string =>
  linkifyLocateTags(text, 'pdf-locate', PDF_LOCATE_PATTERNS, buildPdfSeekMarkdownLink);
