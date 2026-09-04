import { jsPDF } from 'jspdf';

import { CJK_FONT_FILE, CJK_FONT_NAME, loadCjkFontBase64 } from './markdownPdfFonts';
import { ensurePdfEmbeddableImage, fetchImageAsDataUrl, getImageFormat, getImageSize } from './markdownPdfImages';
import type { MarkdownNode } from './markdownPdfTypes';
import { isDarkThemeId } from '@/utils/themeMode';

type PdfDocument = InstanceType<typeof jsPDF>;

const PAGE = {
  marginX: 18,
  marginTop: 18,
  marginBottom: 18,
};

const TEXT = {
  body: 11,
  code: 9,
  small: 9,
  h1: 22,
  h2: 18,
  h3: 15,
};

const HEADING_FONT_SIZE_BY_DEPTH: Record<number, number> = { 1: TEXT.h1, 2: TEXT.h2 };

const LINE_HEIGHT = 5.8;
const CODE_LINE_HEIGHT = 5;
const TEXT_STROKE_WIDTH = 0.06;

const getTextColor = (themeId: string) => (isDarkThemeId(themeId) ? [255, 255, 255] : [0, 0, 0]);
const getMutedTextColor = (themeId: string) => (isDarkThemeId(themeId) ? [161, 161, 170] : [82, 82, 91]);
const getRuleColor = (themeId: string) => (isDarkThemeId(themeId) ? [63, 63, 70] : [212, 212, 216]);
const getCodeFillColor = (themeId: string) => (isDarkThemeId(themeId) ? [39, 39, 42] : [244, 244, 245]);

const normalizeWhitespace = (value: string): string => value.replace(/\s+/g, ' ').trim();

const collectInlineText = (node: MarkdownNode): string => {
  if (node.type === 'text' || node.type === 'inlineCode') {
    return node.value ?? '';
  }

  if (node.type === 'break') {
    return '\n';
  }

  if (node.type === 'image') {
    const label = node.alt || 'image';
    if (!node.url || node.url.startsWith('data:')) {
      return `Image: ${label}`;
    }

    return `Image: ${label} (${node.url})`;
  }

  if (node.type === 'link') {
    const label = normalizeWhitespace((node.children ?? []).map(collectInlineText).join('')) || node.url || '';
    return label;
  }

  return (node.children ?? []).map(collectInlineText).join('');
};

const containsImage = (node: MarkdownNode): boolean =>
  node.type === 'image' || (node.children ?? []).some(containsImage);

const unwrapLinkedImages = (children: MarkdownNode[]): MarkdownNode[] =>
  children.flatMap((child) => {
    if (child.type === 'link' && containsImage(child)) {
      return unwrapLinkedImages(child.children ?? []);
    }

    return [child];
  });

export class MarkdownPdfRenderer {
  private readonly doc: PdfDocument;
  private readonly pageWidth: number;
  private readonly pageHeight: number;
  private readonly contentWidth: number;
  private bodyFontFamily = 'helvetica';
  private cursorY = PAGE.marginTop;

  constructor(
    private readonly themeId: string,
    private readonly filename: string,
    private readonly shouldUseCjkFont: boolean,
  ) {
    this.doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
    this.pageWidth = this.doc.internal.pageSize.getWidth();
    this.pageHeight = this.doc.internal.pageSize.getHeight();
    this.contentWidth = this.pageWidth - PAGE.marginX * 2;
  }

  async render(root: MarkdownNode): Promise<Blob> {
    await this.configureFonts();
    this.paintPageBackground();
    this.applyBodyStyle();
    await this.renderBlocks(root.children ?? []);
    this.renderFooter();
    return this.doc.output('blob') as Blob;
  }

  private async configureFonts() {
    if (!this.shouldUseCjkFont) {
      return;
    }

    const fontBase64 = await loadCjkFontBase64();
    if (!fontBase64) {
      return;
    }

    this.doc.addFileToVFS(CJK_FONT_FILE, fontBase64);
    this.doc.addFont(CJK_FONT_FILE, CJK_FONT_NAME, 'normal', 'Identity-H');
    this.bodyFontFamily = CJK_FONT_NAME;
  }

  private paintPageBackground() {
    if (!isDarkThemeId(this.themeId)) {
      return;
    }

    this.doc.setFillColor(12, 12, 14);
    this.doc.rect(0, 0, this.pageWidth, this.pageHeight, 'F');
  }

  private applyBodyStyle() {
    const [r, g, b] = getTextColor(this.themeId);
    this.doc.setFont(this.bodyFontFamily, 'normal');
    this.doc.setFontSize(TEXT.body);
    this.doc.setTextColor(r, g, b);
  }

  private setTextColor(color: number[]) {
    this.doc.setTextColor(color[0], color[1], color[2]);
  }

  private ensureSpace(height: number) {
    if (this.cursorY + height <= this.pageHeight - PAGE.marginBottom) {
      return;
    }

    this.doc.addPage();
    this.paintPageBackground();
    this.cursorY = PAGE.marginTop;
    this.applyBodyStyle();
  }

  private writeLines(lines: string[], options: { fontSize?: number; color?: number[]; indent?: number } = {}) {
    const fontSize = options.fontSize ?? TEXT.body;
    const color = options.color ?? getTextColor(this.themeId);
    const indent = options.indent ?? 0;
    const lineHeight = fontSize <= TEXT.code ? CODE_LINE_HEIGHT : LINE_HEIGHT;

    this.doc.setFontSize(fontSize);
    this.setTextColor(color);
    this.doc.setDrawColor(color[0], color[1], color[2]);
    this.doc.setLineWidth(TEXT_STROKE_WIDTH);

    lines.forEach((line) => {
      this.ensureSpace(lineHeight);
      this.doc.text(line, PAGE.marginX + indent, this.cursorY, {
        renderingMode: this.shouldUseCjkFont ? 'fill' : 'fillThenStroke',
      });
      this.cursorY += lineHeight;
    });
  }

  private splitText(text: string, width = this.contentWidth, fontSize?: number): string[] {
    if (fontSize != null) {
      this.doc.setFontSize(fontSize);
    }

    if (this.shouldUseCjkFont && typeof this.doc.getTextWidth === 'function') {
      return this.splitMeasuredText(text, width);
    }

    const result = this.doc.splitTextToSize(text, width);
    return Array.isArray(result) ? result : [result];
  }

  private splitMeasuredText(text: string, width: number): string[] {
    const lines: string[] = [];
    let current = '';

    for (const character of text) {
      const next = current + character;
      if (current && this.doc.getTextWidth(next) > width) {
        lines.push(current);
        current = character;
      } else {
        current = next;
      }
    }

    if (current) {
      lines.push(current);
    }

    return lines.length > 0 ? lines : [''];
  }

  private async renderBlocks(nodes: MarkdownNode[], options: { indent?: number } = {}) {
    for (const node of nodes) {
      await this.renderBlock(node, options);
    }
  }

  private async renderBlock(node: MarkdownNode, options: { indent?: number } = {}) {
    switch (node.type) {
      case 'heading':
        this.renderHeading(node);
        break;
      case 'paragraph':
        await this.renderParagraph(node, options);
        break;
      case 'list':
        await this.renderList(node, options);
        break;
      case 'code':
        this.renderCode(node, options);
        break;
      case 'blockquote':
        await this.renderBlockquote(node, options);
        break;
      case 'thematicBreak':
        this.renderRule();
        break;
      case 'table':
        this.renderTable(node, options);
        break;
      case 'html':
        this.renderPlainText(node.value ?? '', options);
        break;
      default:
        if (node.children?.length) {
          await this.renderBlocks(node.children, options);
        } else if (node.value) {
          this.renderPlainText(node.value, options);
        }
        break;
    }
  }

  private renderHeading(node: MarkdownNode) {
    const depth = Number((node as MarkdownNode & { depth?: number }).depth ?? 1);
    const fontSize = HEADING_FONT_SIZE_BY_DEPTH[depth] ?? TEXT.h3;
    const text = normalizeWhitespace((node.children ?? []).map(collectInlineText).join(''));
    if (!text) return;

    this.cursorY += this.cursorY === PAGE.marginTop ? 0 : 3;
    this.doc.setFont(this.bodyFontFamily, this.bodyFontFamily === CJK_FONT_NAME ? 'normal' : 'bold');
    this.writeLines(this.splitText(text, this.contentWidth, fontSize), { fontSize });
    this.doc.setFont(this.bodyFontFamily, 'normal');
    this.cursorY += 2;
  }

  private async renderParagraph(node: MarkdownNode, options: { indent?: number; prefix?: string }) {
    const children = unwrapLinkedImages(node.children ?? []);
    const hasImage = children.some(containsImage);
    if (hasImage) {
      await this.renderParagraphWithImages(children, options);
      return;
    }

    const text = normalizeWhitespace(`${options.prefix ?? ''}${children.map(collectInlineText).join('')}`);
    if (!text) return;

    const indent = options.indent ?? 0;
    this.applyBodyStyle();
    this.writeLines(this.splitText(text, this.contentWidth - indent), { indent });
    this.cursorY += 3;
  }

  private async renderParagraphWithImages(children: MarkdownNode[], options: { indent?: number; prefix?: string }) {
    const flushText = (parts: string[], prefix = '') => {
      const text = normalizeWhitespace(`${prefix}${parts.join('')}`);
      if (!text) return;

      const indent = options.indent ?? 0;
      this.applyBodyStyle();
      this.writeLines(this.splitText(text, this.contentWidth - indent), { indent });
      this.cursorY += 3;
    };

    const textParts: string[] = [];
    let pendingPrefix = options.prefix ?? '';
    for (const child of children) {
      if (child.type === 'image') {
        flushText(textParts, pendingPrefix);
        pendingPrefix = '';
        textParts.length = 0;
        await this.renderImage(child, options);
        continue;
      }

      textParts.push(collectInlineText(child));
    }

    flushText(textParts, pendingPrefix);
  }

  private renderPlainText(text: string, options: { indent?: number }) {
    const normalizedText = normalizeWhitespace(text);
    if (!normalizedText) return;

    const indent = options.indent ?? 0;
    this.writeLines(this.splitText(normalizedText, this.contentWidth - indent), { indent });
    this.cursorY += 3;
  }

  private async renderImage(node: MarkdownNode, options: { indent?: number }) {
    const src = node.url;
    const label = node.alt || 'image';
    const indent = options.indent ?? 0;
    if (!src) {
      this.renderPlainText(`Image: ${label}`, options);
      return;
    }

    const dataUrl = await fetchImageAsDataUrl(src);
    if (!dataUrl) {
      this.renderPlainText(`Image: ${label} (${src})`, options);
      return;
    }

    try {
      const embeddableUrl = await ensurePdfEmbeddableImage(dataUrl);
      if (!embeddableUrl) {
        this.renderPlainText(`Image: ${label}`, options);
        return;
      }

      const size = await getImageSize(embeddableUrl);
      const maxWidth = this.contentWidth - indent;
      const maxHeight = this.pageHeight - PAGE.marginTop - PAGE.marginBottom - 6;
      const naturalWidth = Math.max(1, size.width);
      const naturalHeight = Math.max(1, size.height);
      let width = maxWidth;
      let height = width * (naturalHeight / naturalWidth);
      if (height > maxHeight) {
        height = maxHeight;
        width = height * (naturalWidth / naturalHeight);
      }
      this.ensureSpace(height + 6);
      this.doc.addImage(
        embeddableUrl,
        getImageFormat(embeddableUrl),
        PAGE.marginX + indent,
        this.cursorY,
        width,
        height,
      );
      this.cursorY += height + 5;
    } catch {
      this.renderPlainText(`Image: ${label} (${src})`, options);
    }
  }

  private async renderList(node: MarkdownNode, options: { indent?: number }) {
    const baseIndent = options.indent ?? 0;
    const items = node.children ?? [];

    for (let index = 0; index < items.length; index += 1) {
      const marker = node.ordered ? `${index + 1}. ` : '- ';
      await this.renderListItem(items[index], marker, baseIndent);
      this.cursorY += 1.5;
    }

    this.cursorY += 2;
  }

  private async renderListItem(item: MarkdownNode, marker: string, baseIndent: number) {
    const children = item.children ?? [];
    if (children.length === 0) {
      this.writeLines([marker.trimEnd()], { indent: baseIndent });
      return;
    }

    let isFirstBlock = true;
    for (const child of children) {
      if (child.type === 'paragraph') {
        await this.renderParagraph(child, { indent: baseIndent, prefix: isFirstBlock ? marker : undefined });
        isFirstBlock = false;
        continue;
      }

      if (isFirstBlock) {
        this.writeLines(this.splitText(marker.trimEnd(), this.contentWidth - baseIndent), { indent: baseIndent });
        isFirstBlock = false;
      }

      await this.renderBlock(child, { indent: baseIndent + 6 });
    }
  }

  private renderCode(node: MarkdownNode, options: { indent?: number }) {
    const indent = options.indent ?? 0;
    const lines = (node.value ?? '').split('\n');
    const wrappedLines = lines.flatMap((line) => this.splitText(line || ' ', this.contentWidth - indent - 6));
    const blockHeight = wrappedLines.length * CODE_LINE_HEIGHT + 6;

    this.ensureSpace(blockHeight);
    const [fillR, fillG, fillB] = getCodeFillColor(this.themeId);
    this.doc.setFillColor(fillR, fillG, fillB);
    this.doc.rect(PAGE.marginX + indent, this.cursorY - 3, this.contentWidth - indent, blockHeight, 'F');
    this.doc.setFont(this.bodyFontFamily === CJK_FONT_NAME ? CJK_FONT_NAME : 'courier', 'normal');
    this.writeLines(wrappedLines, {
      fontSize: TEXT.code,
      color: getTextColor(this.themeId),
      indent: indent + 3,
    });
    this.doc.setFont(this.bodyFontFamily, 'normal');
    this.cursorY += 5;
  }

  private async renderBlockquote(node: MarkdownNode, options: { indent?: number }) {
    const indent = (options.indent ?? 0) + 5;
    const [r, g, b] = getRuleColor(this.themeId);
    this.ensureSpace(8);
    this.doc.setDrawColor(r, g, b);
    this.doc.setLineWidth(0.4);
    this.doc.line(PAGE.marginX + indent - 3, this.cursorY - 2, PAGE.marginX + indent - 3, this.cursorY + 8);
    await this.renderBlocks(node.children ?? [], { indent });
    this.cursorY += 2;
  }

  private renderRule() {
    this.ensureSpace(8);
    const [r, g, b] = getRuleColor(this.themeId);
    this.doc.setDrawColor(r, g, b);
    this.doc.line(PAGE.marginX, this.cursorY, this.pageWidth - PAGE.marginX, this.cursorY);
    this.cursorY += 8;
  }

  private renderTable(node: MarkdownNode, options: { indent?: number }) {
    const rows = node.children ?? [];
    rows.forEach((row) => {
      const rowText = (row.children ?? [])
        .map((cell) => normalizeWhitespace((cell.children ?? []).map(collectInlineText).join('')))
        .join(' | ');
      this.renderPlainText(rowText, options);
    });
  }

  private renderFooter() {
    const [r, g, b] = getMutedTextColor(this.themeId);
    const footer = `Generated with AMC WebUI - ${this.filename}`;
    this.doc.setFont(this.bodyFontFamily, 'normal');
    this.doc.setFontSize(TEXT.small);
    this.doc.setTextColor(r, g, b);
    this.doc.text(footer, PAGE.marginX, this.pageHeight - 8);
  }
}
