import { logService } from '@/services/logService';

/**
 * Copies the given plain text string to the system clipboard.
 * Uses navigator.clipboard.writeText with fallback to document.execCommand('copy').
 *
 * @param text The string to copy.
 * @param targetDoc Optional document reference for the execCommand fallback.
 * @returns A Promise resolving to true if copy succeeded, false otherwise.
 */
export const copyTextToClipboard = async (text: string, targetDoc?: Document): Promise<boolean> => {
  if (!text) {
    return false;
  }

  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (clipboardError) {
      logService.warn('navigator.clipboard.writeText failed, attempting fallback:', clipboardError);
    }
  }

  const doc = targetDoc ?? (typeof document !== 'undefined' ? document : null);
  if (doc && typeof doc.createElement === 'function' && typeof doc.execCommand === 'function') {
    try {
      const textarea = doc.createElement('textarea');
      textarea.value = text;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      textarea.style.pointerEvents = 'none';
      doc.body.appendChild(textarea);
      textarea.select();
      const successful = doc.execCommand('copy');
      textarea.remove();
      if (successful) {
        return true;
      }
    } catch (execError) {
      logService.error('execCommand copy fallback failed:', execError);
    }
  }

  logService.error('Failed to copy text: clipboard API unavailable or rejected');
  return false;
};

export interface RichTableClipboardContent {
  plainText: string;
  html?: string;
}

/**
 * Copies table content to system clipboard with dual-channel rich text support.
 * Writes both 'text/plain' (Markdown/TSV) and 'text/html' (HTML table) when ClipboardItem
 * is supported, so pasting into spreadsheets (Excel, Google Sheets, Numbers) or rich text
 * editors parses as tabular grid cells, while pasting into code/plain editors preserves Markdown.
 *
 * Automatically falls back to copyTextToClipboard(plainText) if ClipboardItem or write() fails.
 */
export const copyRichTableToClipboard = async (
  content: RichTableClipboardContent,
  targetDoc?: Document,
): Promise<boolean> => {
  if (!content?.plainText) {
    return false;
  }

  const { plainText, html } = content;

  if (typeof navigator !== 'undefined' && navigator.clipboard?.write && typeof ClipboardItem !== 'undefined') {
    try {
      const items: Record<string, Blob> = {
        'text/plain': new Blob([plainText], { type: 'text/plain' }),
      };
      if (html) {
        items['text/html'] = new Blob([html], { type: 'text/html' });
      }
      await navigator.clipboard.write([new ClipboardItem(items)]);
      return true;
    } catch (clipboardError) {
      logService.warn('navigator.clipboard.write failed, falling back to plainText copy:', clipboardError);
    }
  }

  return copyTextToClipboard(plainText, targetDoc);
};
