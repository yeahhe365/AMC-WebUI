import { isImageMimeType } from '@/utils/file/fileTypeClassification';

type ClipboardPastePlan =
  { kind: 'image'; file: File } | { kind: 'html'; html: string; plain: string } | { kind: 'default' };

const readClipboardText = (clipboardData: DataTransfer, type: 'text/html' | 'text/plain'): string => {
  try {
    return clipboardData.getData(type) || '';
  } catch {
    return '';
  }
};

const findClipboardImageFile = (clipboardData: DataTransfer): File | null => {
  const items = clipboardData.items;
  if (!items) return null;

  for (let itemIndex = 0; itemIndex < items.length; itemIndex++) {
    const item = items[itemIndex];
    if (!isImageMimeType(item.type)) continue;

    const file = item.getAsFile();
    if (file) return file;
  }

  return null;
};

export const getClipboardPastePlan = (
  clipboardData: DataTransfer | null | undefined,
  isPasteRichTextAsMarkdownEnabled: boolean,
): ClipboardPastePlan => {
  if (!clipboardData) return { kind: 'default' };

  const html = readClipboardText(clipboardData, 'text/html');
  const plain = readClipboardText(clipboardData, 'text/plain');
  const hasHtml = Boolean(html && /<[a-z][\s\S]*>/i.test(html));
  const hasPlain = Boolean(plain.trim());

  if (!hasHtml && !hasPlain) {
    const imageFile = findClipboardImageFile(clipboardData);
    if (imageFile) return { kind: 'image', file: imageFile };
  }

  if (isPasteRichTextAsMarkdownEnabled !== false && hasHtml) {
    return { kind: 'html', html, plain };
  }

  return { kind: 'default' };
};
