import { afterEach, expect, it, vi } from 'vitest';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

it('loads font bytes as a binary string without encoding or concatenating full font buffers', async () => {
  const bytes = new Uint8Array([0, 1, 0, 0, 128, 255]);
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(bytes)),
  );
  const { loadCjkFontData } = await import('./markdownPdfFonts');
  const data = await loadCjkFontData();
  expect(data?.slice(0, 4)).toBe('\x00\x01\x00\x00');
  expect(data?.charCodeAt(4)).toBe(128);
  expect(data?.charCodeAt(5)).toBe(255);
});
