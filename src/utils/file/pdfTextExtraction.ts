import { decodeBase64ToArrayBuffer } from './fileEncoding';
import { logService } from '@/services/logService';

export interface PdfInspectionResult {
  numPages: number;
  text: string;
  /** 实际读取过文本的页数(受 maxPages 限制)。 */
  pagesRead?: number;
  /** 是否因页数或字符数上限而只取了文档的一部分。 */
  truncated?: boolean;
}

export interface PdfInspectionOptions {
  /** Maximum number of pages to inspect for text extraction. Defaults to 50. */
  maxPages?: number;
  /** Maximum total characters of text to extract before terminating extraction. Defaults to 64,000. */
  maxChars?: number;
}

const DEFAULT_MAX_PAGES = 50;
const DEFAULT_MAX_CHARS = 64_000;

/**
 * Extracts plain text and page count from raw PDF binary data using pdfjs-dist.
 * Works across both browser and Node.js environments.
 */
const inspectPdfData = async (
  data: Uint8Array | ArrayBuffer,
  options: PdfInspectionOptions = {},
): Promise<PdfInspectionResult> => {
  try {
    const pdfjs = await import('pdfjs-dist');
    const loadingTask = pdfjs.getDocument({
      data: data instanceof Uint8Array ? data : new Uint8Array(data),
      isEvalSupported: false,
      useSystemFonts: true,
    });
    try {
      const pdfDoc = await loadingTask.promise;
      try {
        const pageTexts: string[] = [];
        const pageLimit = Math.min(pdfDoc.numPages, options.maxPages ?? DEFAULT_MAX_PAGES);
        const charLimit = options.maxChars ?? DEFAULT_MAX_CHARS;
        let accumulatedChars = 0;
        let pagesRead = 0;
        let truncatedByChars = false;

        for (let pageNum = 1; pageNum <= pageLimit; pageNum++) {
          pagesRead = pageNum;
          const page = await pdfDoc.getPage(pageNum);
          const content = await page.getTextContent();
          const pageText = content.items
            .map((item) => ('str' in item ? item.str : ''))
            .filter(Boolean)
            .join(' ')
            .trim();

          if (pageText) {
            pageTexts.push(pdfDoc.numPages > 1 ? `[Page ${pageNum}]\n${pageText}` : pageText);
            accumulatedChars += pageText.length;
            if (accumulatedChars >= charLimit) {
              truncatedByChars = true;
              break;
            }
          }
        }

        return {
          numPages: pdfDoc.numPages,
          text: pageTexts.join('\n\n'),
          pagesRead,
          truncated: truncatedByChars || pdfDoc.numPages > pageLimit,
        };
      } finally {
        try {
          await pdfDoc.destroy();
        } catch {
          // ignore
        }
      }
    } finally {
      try {
        await loadingTask.destroy();
      } catch {
        // ignore
      }
    }
  } catch (pdfInspectionError) {
    logService.warn('Failed to inspect PDF data', { error: pdfInspectionError });
    return { numPages: 1, text: '' };
  }
};

/**
 * Decodes a base64-encoded PDF and extracts its plain text content.
 */
export const extractPdfTextFromBase64 = async (base64: string, options: PdfInspectionOptions = {}): Promise<string> => {
  try {
    const uint8Array = decodeBase64ToArrayBuffer(base64);
    const { text } = await inspectPdfData(uint8Array, options);
    return text;
  } catch (base64DecodeError) {
    logService.warn('Failed to decode base64 for PDF text extraction', { error: base64DecodeError });
    return '';
  }
};

/**
 * 同 `extractPdfTextFromBase64`，但额外返回页数与截断信息，便于在 prompt 里
 * 明确告知模型"只收到了前 N 页"，避免它对着残缺文本自信地总结整份文档。
 */
export const extractPdfTextFromBase64WithMeta = async (
  base64: string,
  options: PdfInspectionOptions = {},
): Promise<PdfInspectionResult> => {
  try {
    const uint8Array = decodeBase64ToArrayBuffer(base64);
    return await inspectPdfData(uint8Array, options);
  } catch (base64DecodeError) {
    logService.warn('Failed to decode base64 for PDF text extraction', { error: base64DecodeError });
    return { numPages: 1, text: '' };
  }
};

/**
 * Inspects a PDF Blob to get its total page count and extracted text.
 */
export const inspectPdfBlob = async (blob: Blob, options: PdfInspectionOptions = {}): Promise<PdfInspectionResult> => {
  try {
    const arrayBuffer = await blob.arrayBuffer();
    return await inspectPdfData(arrayBuffer, options);
  } catch (pdfBlobError) {
    logService.warn('Failed to inspect PDF blob', { error: pdfBlobError });
    return { numPages: 1, text: '' };
  }
};
