import { type UploadedFile } from '@/types';
import { generateUniqueId } from './ids';
import { base64ToBlob } from '@/utils/file/fileEncoding';
import { getExtensionFromMimeType } from '@/utils/file/fileMime';
import { createManagedObjectUrl } from '@/services/objectUrlManager';

const buildGeneratedFileName = (baseName: string, extension: string): string => {
  if (baseName.toLowerCase().endsWith(extension)) {
    return baseName;
  }

  if (baseName === 'generated-file' || baseName === 'generated-image') {
    return `${baseName}-${generateUniqueId().slice(-4)}${extension}`;
  }

  return `${baseName}${extension}`;
};

/**
 * Creates a standardized UploadedFile object from Base64 data.
 * Used for handling generated content from API (images, audio, etc.)
 */
export const createUploadedFileFromBase64 = (
  base64Data: string,
  mimeType: string,
  baseName: string = 'generated-file',
): UploadedFile => {
  const extension = getExtensionFromMimeType(mimeType);
  const fileName = buildGeneratedFileName(baseName, extension);

  const blob = base64ToBlob(base64Data, mimeType);
  const file = new File([blob], fileName, { type: mimeType });
  const dataUrl = createManagedObjectUrl(file);

  return {
    id: generateUniqueId(),
    name: fileName,
    type: mimeType,
    size: blob.size,
    dataUrl,
    rawFile: file,
    uploadState: 'active',
  };
};

/**
 * Creates an UploadedFile directly from raw bytes, skipping the base64
 * encode/decode round-trip used by {@link createUploadedFileFromBase64}.
 * Used for Pyodide execution artifacts, which arrive as zero-copy ArrayBuffers.
 */
export const createUploadedFileFromBytes = (
  bytes: ArrayBuffer,
  mimeType: string,
  baseName: string = 'generated-file',
): UploadedFile => {
  const extension = getExtensionFromMimeType(mimeType);
  const fileName = buildGeneratedFileName(baseName, extension);

  const file = new File([bytes], fileName, { type: mimeType });
  const dataUrl = createManagedObjectUrl(file);

  return {
    id: generateUniqueId(),
    name: fileName,
    type: mimeType,
    size: bytes.byteLength,
    dataUrl,
    rawFile: file,
    uploadState: 'active',
  };
};

/**
 * Extracts a plain-text tail of the thought stream for the ThinkingStrip.
 * Strips markdown heading markers (`## `) and full-line bold markers (`**x**` / `__x__`)
 * because the strip is a plain-text preview (Gemini heading streams would otherwise
 * show literal `## ` characters). Bounded to the last `maxLines` source lines.
 */
export const getThinkingStreamTail = (thoughts: string | undefined, maxLines: number): string => {
  if (!thoughts) {
    return '';
  }

  return thoughts
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) =>
      line
        .replace(/^#{1,6}\s+/, '')
        .replace(/^\*\*(.+)\*\*$/, '$1')
        .replace(/^__(.+)__$/, '$1'),
    )
    .slice(-maxLines)
    .join('\n');
};

export interface ThinkingSection {
  /** Section title; the loose preamble before the first title is null. */
  title: string | null;
  body: string;
}

// A section title is a full line of the form `**Title**` (optionally with
// trailing spaces). Inline bold like `some **bold** text` must not count, and an
// unclosed trailing `**Partial` must not either — the `$` anchor requires the
// closing `**` at the end of the line, so a stream mid-title keeps showing the
// previous section until the opener completes.
const THINKING_SECTION_TITLE_REGEX = /^\*\*([^*\n]+)\*\*[ \t]*$/gm;

/** Returns null when the stream is flat (or empty) — callers fall back to the
 *  existing tail-window rendering, so third-party paths stay byte-identical. */
export const parseThinkingSections = (thoughts: string | undefined): ThinkingSection[] | null => {
  if (!thoughts) {
    return null;
  }

  const matches = Array.from(thoughts.matchAll(THINKING_SECTION_TITLE_REGEX));
  if (matches.length === 0) {
    return null;
  }

  const sections: ThinkingSection[] = [];
  const preamble = thoughts.slice(0, matches[0].index).trim();
  if (preamble) {
    sections.push({ title: null, body: preamble });
  }

  matches.forEach((match, i) => {
    const bodyStart = match.index! + match[0].length;
    const bodyEnd = i + 1 < matches.length ? matches[i + 1].index! : thoughts.length;
    sections.push({ title: match[1].trim(), body: thoughts.slice(bodyStart, bodyEnd).trim() });
  });

  return sections;
};
