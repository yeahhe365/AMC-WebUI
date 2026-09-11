import { arrayBufferToBase64 } from '@/utils/file/fileEncoding';

export const CJK_FONT_NAME = 'NotoSansCJKsc';
export const CJK_FONT_FILE = 'NotoSansCJKsc-VF.ttf';
export const CJK_TEXT_PATTERN = /[\u3040-\u30ff\u3400-\u9fff\uac00-\ud7af\uf900-\ufaff]/;

const CJK_FONT_PART_URLS = [`/fonts/${CJK_FONT_FILE}.part-00`, `/fonts/${CJK_FONT_FILE}.part-01`];

let cjkFontBase64Promise: Promise<string | null> | null = null;

const concatenateArrayBuffers = (buffers: ArrayBuffer[]): ArrayBuffer => {
  const totalLength = buffers.reduce((sum, buffer) => sum + buffer.byteLength, 0);
  const bytes = new Uint8Array(totalLength);
  let offset = 0;

  buffers.forEach((buffer) => {
    bytes.set(new Uint8Array(buffer), offset);
    offset += buffer.byteLength;
  });

  return bytes.buffer;
};

export const loadCjkFontBase64 = async (): Promise<string | null> => {
  if (!cjkFontBase64Promise) {
    cjkFontBase64Promise = Promise.all(
      CJK_FONT_PART_URLS.map(async (url) => {
        const response = await fetch(url);
        if (!response.ok) {
          throw new Error(`Failed to load CJK font part: ${url}`);
        }

        return response.arrayBuffer();
      }),
    )
      .then((buffers) => arrayBufferToBase64(concatenateArrayBuffers(buffers)))
      .catch(() => null);
  }

  const fontBase64 = await cjkFontBase64Promise;
  if (!fontBase64) {
    cjkFontBase64Promise = null;
  }

  return fontBase64;
};
