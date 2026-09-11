import { describe, expect, it } from 'vitest';
import {
  arrayBufferToBase64,
  base64ToBlob,
  blobToBase64,
  blobToDataUrl,
  decodeBase64ToArrayBuffer,
  fileToString,
} from './fileEncoding';

describe('fileEncoding', () => {
  it('encodes and decodes base64 and typed array buffers symmetrically', () => {
    const originalText = 'Hello Antigravity 🚀! 1234567890';
    const encoder = new TextEncoder();
    const bytes = encoder.encode(originalText);

    const base64 = arrayBufferToBase64(bytes);
    const decodedBytes = decodeBase64ToArrayBuffer(base64);
    const decoder = new TextDecoder();
    expect(decoder.decode(decodedBytes)).toBe(originalText);
  });

  it('handles large buffers exceeding 32KB chunk boundary in arrayBufferToBase64', () => {
    const size = 70 * 1024; // 70 KB
    const buffer = new Uint8Array(size);
    for (let i = 0; i < size; i++) {
      buffer[i] = i % 256;
    }

    const base64 = arrayBufferToBase64(buffer);
    const decoded = decodeBase64ToArrayBuffer(base64);
    expect(decoded.length).toBe(size);
    expect(decoded[0]).toBe(0);
    expect(decoded[100]).toBe(100 % 256);
    expect(decoded[size - 1]).toBe((size - 1) % 256);
  });

  it('supports Int16Array and other ArrayBufferView types in arrayBufferToBase64', () => {
    const int16 = new Int16Array([100, 200, 300, -100, -200]);
    const base64 = arrayBufferToBase64(int16);
    expect(typeof base64).toBe('string');
    expect(base64.length).toBeGreaterThan(0);

    const decoded = decodeBase64ToArrayBuffer(base64);
    const reconstructed = new Int16Array(decoded.buffer);
    expect(Array.from(reconstructed)).toEqual([100, 200, 300, -100, -200]);
  });

  it('converts blob to data URL via blobToDataUrl', async () => {
    const blob = new Blob(['sample content'], { type: 'text/plain' });
    const dataUrl = await blobToDataUrl(blob);
    expect(dataUrl).toMatch(/^data:text\/plain;base64,/);
  });

  it('extracts base64 data without prefix via blobToBase64', async () => {
    const blob = new Blob(['sample content'], { type: 'text/plain' });
    const base64 = await blobToBase64(blob);
    expect(base64).not.toContain('data:');
    expect(base64).not.toContain('base64,');

    const decoded = decodeBase64ToArrayBuffer(base64);
    expect(new TextDecoder().decode(decoded)).toBe('sample content');
  });

  it('reads file content to string via fileToString', async () => {
    const file = new File(['file string content'], 'test.txt', { type: 'text/plain' });
    const content = await fileToString(file);
    expect(content).toBe('file string content');
  });

  it('converts base64 back to Blob via base64ToBlob', async () => {
    const text = 'test blob conversion';
    const base64 = btoa(text);
    const blob = base64ToBlob(base64, 'text/plain');
    expect(blob.type).toBe('text/plain');

    const resultText = await blob.text();
    expect(resultText).toBe(text);
  });
});
