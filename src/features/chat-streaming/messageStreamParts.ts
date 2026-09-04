import type { Part } from '@google/genai';
import type { UploadedFile } from '@/types';
import { SUPPORTED_GENERATED_MIME_TYPES } from '@/constants/fileTypeSupport';
import { createUploadedFileFromBase64 } from '@/utils/chat/parsing';
import { generateUniqueId } from '@/utils/chat/ids';
import { escapeHtml } from '@/utils/escapeHtml';
import { isAudioMimeType, isImageMimeType, isVideoMimeType } from '@/utils/file/fileTypeClassification';

const hasThoughtSignature = (part: Part) =>
  Boolean(
    (part as Part & { thoughtSignature?: string; thought_signature?: string }).thoughtSignature ||
    (part as Part & { thoughtSignature?: string; thought_signature?: string }).thought_signature,
  );

const isPlainTextOnlyPart = (part: Part) => Object.keys(part).every((key) => key === 'text');

export const appendApiPart = (parts: Part[] = [], newPart: Part) => {
  const newParts = [...parts];

  if ('text' in newPart && typeof newPart.text === 'string') {
    const lastPart = newParts[newParts.length - 1];
    if (
      lastPart &&
      'text' in lastPart &&
      typeof lastPart.text === 'string' &&
      !('thought' in lastPart && lastPart.thought) &&
      !hasThoughtSignature(lastPart) &&
      !hasThoughtSignature(newPart) &&
      isPlainTextOnlyPart(lastPart) &&
      isPlainTextOnlyPart(newPart)
    ) {
      newParts[newParts.length - 1] = { ...lastPart, text: lastPart.text + newPart.text } as Part;
      return newParts;
    }
  }

  newParts.push({ ...newPart });
  return newParts;
};

// Server code execution round-trips are emitted as single-line raw HTML blocks:
// CommonMark ends an HTML block at the first blank line, so real newlines inside
// code/output would break the block apart and leak the remainder as plain text.
// Newlines are encoded as &#10; (decoded by rehype-raw inside <pre>) and blank
// lines additionally keep a &#10;-only line so the block never sees a blank line.
const toPreSafeHtmlText = (value: string): string => {
  const escaped = escapeHtml(value);
  return escaped
    .split(/\r\n|\r|\n/)
    .map((line) => (line.trim() === '' ? '&#10;' : line))
    .join('&#10;');
};

const CODE_EXEC_CODE_CLASS = 'code-exec-code';
const CODE_EXEC_RESULT_CLASS = 'tool-result';

// While streaming, the model's executableCode part lands before the sandbox
// has produced its codeExecutionResult part. The content string then ends with
// a code-exec block that has no following tool-result block — that's the
// "sandbox is running" signal for the renderer's live status strip.
export const isCodeExecutionPendingInContent = (content: string): boolean => {
  const lastCodeBlock = content.lastIndexOf(`<pre class="${CODE_EXEC_CODE_CLASS}"`);
  if (lastCodeBlock === -1) {
    return false;
  }
  return content.lastIndexOf(`class="${CODE_EXEC_RESULT_CLASS} outcome-`) < lastCodeBlock;
};

export const getContentDeltaFromPart = (part: Part): string => {
  const anyPart = part as Part & {
    text?: string;
    executableCode?: { language?: string; code?: string };
    codeExecutionResult?: { outcome?: string; output?: string };
  };

  if (anyPart.text) {
    return anyPart.text;
  }

  if (anyPart.executableCode) {
    const language = anyPart.executableCode.language?.toLowerCase() || 'python';
    const code = toPreSafeHtmlText(anyPart.executableCode.code || '');
    return `\n\n<pre class="${CODE_EXEC_CODE_CLASS}"><code class="language-${language}">${code}</code></pre>\n\n`;
  }

  if (anyPart.codeExecutionResult) {
    // The API serializes the proto enum ("OUTCOME_OK"), so strip the prefix to
    // match the outcome-ok/outcome-failed/outcome-dead CSS classes.
    const outcome = (anyPart.codeExecutionResult.outcome || 'UNKNOWN').toLowerCase().replace(/^outcome_/, '');
    // The localized outcome header is rendered by ToolResultBlock from the
    // outcome class; the content only carries the raw output text.
    const output = anyPart.codeExecutionResult.output;
    const outputHtml = output ? `<pre><code class="language-text">${toPreSafeHtmlText(output)}</code></pre>` : '';
    return `\n\n<div class="${CODE_EXEC_RESULT_CLASS} outcome-${outcome}">${outputHtml}</div>\n\n`;
  }

  return '';
};

export const getGeneratedFileFromPart = (part: Part): UploadedFile | undefined => {
  const partWithInlineData = part as Part & { inlineData?: { mimeType?: string; data?: string } };
  const mimeType = partWithInlineData.inlineData?.mimeType;
  const inlineDataBase64 = partWithInlineData.inlineData?.data;

  if (!mimeType || !inlineDataBase64) {
    return undefined;
  }

  const isSupportedFile =
    isImageMimeType(mimeType) ||
    isAudioMimeType(mimeType) ||
    isVideoMimeType(mimeType) ||
    SUPPORTED_GENERATED_MIME_TYPES.has(mimeType);

  if (!isSupportedFile) {
    return undefined;
  }

  return createUploadedFileFromBase64(
    inlineDataBase64,
    mimeType,
    isImageMimeType(mimeType) ? `generated-plot-${generateUniqueId().slice(-4)}` : 'generated-file',
  );
};

export const mergeUniqueFiles = (existing: UploadedFile[] = [], incoming: UploadedFile[] = []) => {
  const files = [...existing];
  const seen = new Set(files.map((file) => file.id));

  for (const file of incoming) {
    if (!seen.has(file.id)) {
      files.push(file);
      seen.add(file.id);
    }
  }

  return files;
};
