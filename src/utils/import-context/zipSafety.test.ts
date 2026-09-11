import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import { runWithConcurrency, sanitizeZipEntryPath, validateZipStructure } from './zipSafety';

describe('sanitizeZipEntryPath', () => {
  it('allows safe relative paths', () => {
    expect(sanitizeZipEntryPath('src/index.ts')).toBe('src/index.ts');
    expect(sanitizeZipEntryPath('README.md')).toBe('README.md');
    expect(sanitizeZipEntryPath('deeply/nested/folder/file.json')).toBe('deeply/nested/folder/file.json');
    expect(sanitizeZipEntryPath('./relative/path.ts')).toBe('relative/path.ts');
  });

  it('normalizes Windows style backslashes', () => {
    expect(sanitizeZipEntryPath('src\\components\\Button.tsx')).toBe('src/components/Button.tsx');
  });

  it('blocks Zip Slip path traversal attempts', () => {
    expect(sanitizeZipEntryPath('../evil.sh')).toBeNull();
    expect(sanitizeZipEntryPath('..\\evil.sh')).toBeNull();
    expect(sanitizeZipEntryPath('src/../../evil.sh')).toBeNull();
    expect(sanitizeZipEntryPath('a/b/../../../c')).toBeNull();
    expect(sanitizeZipEntryPath('../../etc/passwd')).toBeNull();
  });

  it('blocks absolute paths and Windows drive letters', () => {
    expect(sanitizeZipEntryPath('/etc/passwd')).toBeNull();
    expect(sanitizeZipEntryPath('/root/.ssh/id_rsa')).toBeNull();
    expect(sanitizeZipEntryPath('C:\\Windows\\system.ini')).toBeNull();
    expect(sanitizeZipEntryPath('D:/projects/app.js')).toBeNull();
  });

  it('blocks null bytes and control characters', () => {
    expect(sanitizeZipEntryPath('src/\0/evil.js')).toBeNull();
    expect(sanitizeZipEntryPath('file\x1b.txt')).toBeNull();
  });

  it('handles trailing slashes for directories', () => {
    expect(sanitizeZipEntryPath('src/components/')).toBe('src/components');
    expect(sanitizeZipEntryPath('dist/')).toBe('dist');
  });

  it('returns null for empty or invalid paths', () => {
    expect(sanitizeZipEntryPath('')).toBeNull();
    expect(sanitizeZipEntryPath('.')).toBeNull();
    expect(sanitizeZipEntryPath('///')).toBeNull();
  });
});

describe('validateZipStructure', () => {
  it('passes a standard valid zip', async () => {
    const zip = new JSZip();
    zip.file('file1.txt', 'hello');
    zip.file('file2.txt', 'world');

    const result = validateZipStructure(zip);
    expect(result.valid).toBe(true);
    expect(result.entryCount).toBe(2);
  });

  it('rejects zip exceeding maxEntries limit', () => {
    const zip = new JSZip();
    for (let i = 0; i < 15; i++) {
      zip.file(`f${i}.txt`, 'x');
    }

    const result = validateZipStructure(zip, { maxEntries: 10 });
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('exceeding the maximum safe limit');
  });

  it('rejects zip exceeding total uncompressed size limit', () => {
    const zip = new JSZip();
    zip.file('large1.txt', 'x');
    zip.file('large2.txt', 'x');

    const entry1 = zip.file('large1.txt') as unknown as { _data: { uncompressedSize: number } };
    entry1._data = { uncompressedSize: 40 * 1024 * 1024 };

    const entry2 = zip.file('large2.txt') as unknown as { _data: { uncompressedSize: number } };
    entry2._data = { uncompressedSize: 40 * 1024 * 1024 };

    const result = validateZipStructure(zip, {
      maxSingleFileBytes: 50 * 1024 * 1024,
      maxTotalUncompressedBytes: 60 * 1024 * 1024,
    });
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('total uncompressed size exceeds limit');
  });

  it('rejects zip containing single file exceeding limit', () => {
    const zip = new JSZip();
    zip.file('huge.bin', 'x');

    const entry = zip.file('huge.bin') as unknown as { _data: { uncompressedSize: number } };
    entry._data = { uncompressedSize: 60 * 1024 * 1024 };

    const result = validateZipStructure(zip, { maxSingleFileBytes: 50 * 1024 * 1024 });
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('exceeds single file size limit');
  });

  it('rejects zip with suspicious compression ratio', () => {
    const zip = new JSZip();
    zip.file('bomb.txt', 'x');

    const entry = zip.file('bomb.txt') as unknown as { _data: { uncompressedSize: number; compressedSize: number } };
    entry._data = {
      uncompressedSize: 20 * 1024 * 1024,
      compressedSize: 1000,
    };

    const result = validateZipStructure(zip, { maxCompressionRatio: 100 });
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('anomalously high compression ratio');
  });
});

describe('runWithConcurrency', () => {
  it('executes tasks in parallel within concurrency limits while preserving result order', async () => {
    let running = 0;
    let peakConcurrency = 0;

    const items = [10, 20, 30, 40, 50, 60, 70, 80];
    const results = await runWithConcurrency(items, 3, async (val) => {
      running++;
      peakConcurrency = Math.max(peakConcurrency, running);
      await new Promise((resolve) => setTimeout(resolve, 5));
      running--;
      return val * 2;
    });

    expect(peakConcurrency).toBeLessThanOrEqual(3);
    expect(results).toEqual([20, 40, 60, 80, 100, 120, 140, 160]);
  });

  it('handles empty input gracefully', async () => {
    const results = await runWithConcurrency([], 4, async () => 1);
    expect(results).toEqual([]);
  });
});
