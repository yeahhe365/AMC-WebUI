import TurndownService from 'turndown';
import { gfm } from 'turndown-plugin-gfm';

import { logService } from '@/services/logService';
import { normalizeConvertedMarkdown } from './normalizeConvertedMarkdown';

const turndownService = new TurndownService({
  headingStyle: 'atx',
  codeBlockStyle: 'fenced',
  emDelimiter: '*',
});

turndownService.use(gfm);

turndownService.remove(['script', 'style', 'noscript', 'iframe', 'object', 'video', 'audio']);

turndownService.addRule('katex', {
  filter: (node) => {
    return node.nodeName === 'SPAN' && node.classList.contains('katex');
  },
  replacement: (content, node) => {
    const annotation = node.querySelector('annotation[encoding="application/x-tex"]');
    if (annotation) {
      const latex = annotation.textContent || '';
      const isDisplay = node.classList.contains('katex-display') || node.querySelector('.katex-display') !== null;

      return isDisplay ? `$$ ${latex} $$` : `$${latex}$`;
    }
    return content;
  },
});

const firstSrcsetUrl = (srcset: string): string => srcset.split(',')[0]?.trim().split(/\s+/)[0] ?? '';

const imageSourceFromNode = (node: HTMLElement): string => {
  const src = node.getAttribute('src')?.trim() || '';
  if (src) return src;

  const dataSrc = node.getAttribute('data-src')?.trim() || '';
  if (dataSrc) return dataSrc;

  return firstSrcsetUrl(node.getAttribute('srcset') || node.getAttribute('data-srcset') || '');
};

const escapeMarkdownAlt = (alt: string): string => alt.replace(/[[\]]/g, '');

turndownService.addRule('lightboxImage', {
  filter: (node) => {
    if (node.nodeName !== 'A') return false;
    const hasImage = Boolean(node.querySelector('img'));
    const isLightbox =
      node.classList.contains('lightbox') || Boolean(node.querySelector('.meta, .informations, .lightbox-wrapper'));
    return hasImage && isLightbox;
  },
  replacement: (_content, node) => {
    const image = node.querySelector('img');
    if (!image) return '';

    const src = imageSourceFromNode(image) || node.getAttribute('href')?.trim() || '';
    if (!src) return '';

    return `![${escapeMarkdownAlt(image.getAttribute('alt') || '')}](${src})`;
  },
});

turndownService.addRule('contentImage', {
  filter: 'img',
  replacement: (_content, node) => {
    const src = imageSourceFromNode(node);
    if (!src) return '';

    return `![${escapeMarkdownAlt(node.getAttribute('alt') || '')}](${src})`;
  },
});

const restoreReadableHeadingNumberPunctuation = (markdown: string): string =>
  markdown.replace(/^(#{1,6}\s+\d+)\\\./gm, '$1.');

export const convertHtmlToMarkdown = (html: string): string => {
  try {
    return normalizeConvertedMarkdown(restoreReadableHeadingNumberPunctuation(turndownService.turndown(html)));
  } catch (error) {
    logService.error('Failed to convert HTML to Markdown:', error);
    return '';
  }
};
