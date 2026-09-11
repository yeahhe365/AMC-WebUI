import { createLocateTagPatterns, linkifyLocateTags } from './locateTagTransform';
import { normalizeBoxCoordinates, normalizePointCoordinates } from './coordinateSniffer';

const IMAGE_LOCATE_PATTERNS = createLocateTagPatterns('image-locate');

const buildImageSeekMarkdownLink = (attrs: Record<string, string>, inner: string): string | null => {
  const fileName = attrs.file?.trim() || attrs.image?.trim() || attrs.doc?.trim();
  const rawBox = attrs.box?.trim() || attrs.box2d?.trim() || attrs.box_2d?.trim();
  const rawPoint = attrs.point?.trim();

  const box = normalizeBoxCoordinates(rawBox);
  const point = normalizePointCoordinates(rawPoint);
  if (!box && !point) return null;

  const query = new URLSearchParams();
  if (fileName) query.set('file', fileName);

  if (box) {
    query.set('box', box.join(','));
  }

  if (point) {
    query.set('point', point.join(','));
  }

  if (attrs.arrow?.trim()) {
    query.set('arrow', attrs.arrow.trim());
  }

  const rawLabel = attrs.label?.trim();
  if (rawLabel) {
    query.set('label', rawLabel);
  }

  const cleanSnippet = inner.trim();
  if (cleanSnippet) {
    query.set('snippet', cleanSnippet);
  }

  let label: string;
  const lowerLabel = rawLabel?.toLowerCase() || '';
  const lowerSnippet = cleanSnippet.toLowerCase();

  if (rawLabel && cleanSnippet) {
    if (rawLabel === cleanSnippet) {
      label = rawLabel;
    } else if (lowerSnippet.includes(lowerLabel)) {
      label = cleanSnippet;
    } else if (lowerLabel.includes(lowerSnippet)) {
      label = rawLabel;
    } else {
      label = `${rawLabel} · ${cleanSnippet}`;
    }
  } else if (rawLabel) {
    label = rawLabel;
  } else if (cleanSnippet) {
    label = cleanSnippet;
  } else if (rawBox) {
    label = '目标框选';
  } else {
    label = '目标定位';
  }

  const safeLabel = label.replace(/[[\]]/g, '\\$&');
  return `[${safeLabel}](#image-seek?${query.toString()})`;
};

/**
 * Transforms <image-locate> tags into inline interactive `#image-seek` markdown links.
 * Avoids transforming inside code blocks.
 */
export const linkifyImageLocates = (text: string): string =>
  linkifyLocateTags(text, 'image-locate', IMAGE_LOCATE_PATTERNS, buildImageSeekMarkdownLink);
