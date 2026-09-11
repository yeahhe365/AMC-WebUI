import { releaseManagedObjectUrl } from '@/services/objectUrlManager';

const FALLBACK_EXPORT_FILENAME = 'export';
const MAX_FILENAME_LENGTH = 100;
const CONTROL_CHARACTER_MAX_CODE = 31;
const ILLEGAL_FILENAME_CHARACTER_PATTERN = /[<>:"/\\|?*]/;
const WINDOWS_TRAILING_FILENAME_CHARACTER_PATTERN = /[. ]+$/;

/**
 * Triggers a file download in the browser.
 * @param href The URL or data URI of the file to download.
 * @param filename The desired name of the file.
 * @param revokeBlob Whether to revoke the object URL after download (if it is a blob URL). Defaults to true.
 */
export const triggerDownload = (href: string, filename: string, revokeBlob: boolean = true): void => {
  const link = document.createElement('a');
  link.href = href;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  if (revokeBlob && href.startsWith('blob:')) {
    setTimeout(() => {
      releaseManagedObjectUrl(href);
    }, 1000);
  }
};

/**
 * Sanitizes a string to be used as a filename.
 * @param name The original string to sanitize.
 * @returns A filesystem-safe filename string.
 */
export const sanitizeFilename = (name: string): string => {
  if (!name || typeof name !== 'string') {
    return FALLBACK_EXPORT_FILENAME;
  }

  const safeName = Array.from(name.trim(), (character) => {
    const isControlCharacter = character.charCodeAt(0) <= CONTROL_CHARACTER_MAX_CODE;
    return isControlCharacter || ILLEGAL_FILENAME_CHARACTER_PATTERN.test(character) ? '_' : character;
  })
    .join('')
    .replace(WINDOWS_TRAILING_FILENAME_CHARACTER_PATTERN, '')
    .slice(0, MAX_FILENAME_LENGTH);

  return safeName || FALLBACK_EXPORT_FILENAME;
};

export const formatExportDateTime = (date: Date): string => `${date.toLocaleDateString()} ${date.toLocaleTimeString()}`;
