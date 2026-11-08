import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildAttachmentTextCacheKey, clearAttachmentTextCache, withAttachmentTextCache } from './attachmentTextCache';

describe('attachmentTextCache', () => {
  afterEach(() => clearAttachmentTextCache());

  it('reuses a finished extraction instead of running it again', async () => {
    const extract = vi.fn(async () => 'extracted text');

    await expect(withAttachmentTextCache('k', extract)).resolves.toBe('extracted text');
    await expect(withAttachmentTextCache('k', extract)).resolves.toBe('extracted text');

    expect(extract).toHaveBeenCalledTimes(1);
  });

  // 历史里同一个 PDF 出现两次时是**并发**抽取的，只缓存结果会重复解析（CTX-1）。
  it('shares one in-flight extraction between concurrent callers', async () => {
    let resolveExtraction: ((value: string) => void) | undefined;
    const extract = vi.fn(
      () =>
        new Promise<string>((resolve) => {
          resolveExtraction = resolve;
        }),
    );

    const first = withAttachmentTextCache('k', extract);
    const second = withAttachmentTextCache('k', extract);
    expect(extract).toHaveBeenCalledTimes(1);

    resolveExtraction?.('shared text');
    await expect(Promise.all([first, second])).resolves.toEqual(['shared text', 'shared text']);
  });

  it('does not remember empty results so a transient failure can retry', async () => {
    const extract = vi.fn(async () => '');

    await withAttachmentTextCache('k', extract);
    await withAttachmentTextCache('k', extract);

    expect(extract).toHaveBeenCalledTimes(2);
  });

  it('drops the entry when extraction rejects', async () => {
    const failing = vi.fn(async () => {
      throw new Error('pdf.js not ready');
    });
    await expect(withAttachmentTextCache('k', failing)).rejects.toThrow('pdf.js not ready');

    const succeeding = vi.fn(async () => 'recovered');
    await expect(withAttachmentTextCache('k', succeeding)).resolves.toBe('recovered');
  });

  it('evicts the oldest entry once the cache is full', async () => {
    for (let index = 0; index < 64; index += 1) {
      await withAttachmentTextCache(`key-${index}`, async () => `text-${index}`);
    }

    // 第 65 个键会挤掉最早写入的那个。
    await withAttachmentTextCache('key-new', async () => 'text-new');

    const oldest = vi.fn(async () => 'recomputed');
    await expect(withAttachmentTextCache('key-0', oldest)).resolves.toBe('recomputed');
    expect(oldest).toHaveBeenCalledTimes(1);

    const recent = vi.fn(async () => 'should not run');
    await expect(withAttachmentTextCache('key-new', recent)).resolves.toBe('text-new');
    expect(recent).not.toHaveBeenCalled();
  });

  it('builds distinct keys for distinct file identities', () => {
    expect(buildAttachmentTextCacheKey('text', 'file-1', 10, 'a.txt')).not.toBe(
      buildAttachmentTextCacheKey('text', 'file-2', 10, 'a.txt'),
    );
    expect(buildAttachmentTextCacheKey('pdf', 'a', 1, 'b')).toBe(buildAttachmentTextCacheKey('pdf', 'a', 1, 'b'));
    // 片段里的分隔符会被剔除，避免 ["a", "b"] 与 ["a\u0000b"] 撞键。
    expect(buildAttachmentTextCacheKey('a\u0000b')).not.toBe(buildAttachmentTextCacheKey('a', 'b'));
  });
});
