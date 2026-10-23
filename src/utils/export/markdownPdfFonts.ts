export const CJK_FONT_NAME = 'NotoSansCJKsc';
export const CJK_FONT_FILE = 'NotoSansCJKsc-Regular.ttf';
export const CJK_TEXT_PATTERN = /[\u3040-\u30ff\u3400-\u9fff\uac00-\ud7af\uf900-\ufaff]/;

let cjkFontDataPromise: Promise<string | null> | null = null;

/** jsPDF accepts a TTF binary string, avoiding a second full-size Base64 copy. */
export const loadCjkFontData = async (): Promise<string | null> => {
  if (!cjkFontDataPromise) {
    cjkFontDataPromise = fetch(`${import.meta.env.BASE_URL || '/'}fonts/${CJK_FONT_FILE}`)
      .then(async (response) => {
        if (!response.ok) throw new Error('Failed to load CJK font.');
        const bytes = new Uint8Array(await response.arrayBuffer());
        const parts: string[] = [];
        for (let offset = 0; offset < bytes.length; offset += 0x8000) {
          parts.push(String.fromCharCode(...bytes.subarray(offset, offset + 0x8000)));
        }
        return parts.join('');
      })
      .catch(() => null);
  }
  const font = await cjkFontDataPromise;
  if (!font) cjkFontDataPromise = null;
  return font;
};
