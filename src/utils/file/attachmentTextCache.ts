/**
 * 附件"物化成 prompt 素材"的进程内一级缓存。
 *
 * 背景（CTX-1 / CTX-2）：一条会话里挂了几份附件之后，**每发一条消息**都会把历史里的
 * 附件重新物化一遍——PDF 重跑 pdf.js、docx 重解压、文本重读 rawFile/dataUrl。抽取结果
 * 从来不落库（`extractPersistedSessionFileRecords` 只存 rawFile），所以刷新页面连内存缓存
 * 也没了。用户感受就是"这个会话越聊越慢"，而且卡在请求发出之前。
 *
 * 这里只做**进程内**一层：键由"文件身份 + 尺寸 + 抽取器种类"组成，值就是抽取出的文本。
 * 不引入新的存储，也不改变持久层结构；把结果落库（DB 侧 `textContent`）是后续独立一步。
 *
 * 缓存的是 **Promise 而不是已完成的结果**：`normalizeHistoryForNonAnthropicProvider` 用
 * `Promise.all` 并发处理整段历史，同一个 PDF 在历史里出现两次时两次抽取是同时发起的，
 * 只缓存"已解析好的文本"会让两个并发调用同时 miss、重复解析（去重必须落在"进行中"这一层）。
 *
 * 容量有上限并做 LRU，避免长时间使用后把历史里所有大文本都留在内存里。
 */

const MAX_CACHED_EXTRACTIONS = 64;

const cache = new Map<string, Promise<string>>();

/** 由若干稳定片段拼出缓存键；片段里出现的分隔符会被替换，避免不同组合撞到同一个键。 */
export const buildAttachmentTextCacheKey = (...parts: Array<string | number | null | undefined>): string =>
  parts
    .map((part) =>
      String(part ?? '')
        .split('\u0000')
        .join(''),
    )
    .join('\u0000');

const touch = (key: string): void => {
  const entry = cache.get(key);
  if (entry === undefined) {
    return;
  }
  // LRU：命中后移到队尾，让"最近用过的"最后被淘汰。
  cache.delete(key);
  cache.set(key, entry);
};

const evictOldestIfFull = (): void => {
  if (cache.size < MAX_CACHED_EXTRACTIONS) {
    return;
  }
  const oldestKey = cache.keys().next().value;
  if (oldestKey !== undefined) {
    cache.delete(oldestKey);
  }
};

/** 命中则复用（含并发中的同一次抽取），否则执行 `extract` 并把结果留在缓存里。 */
export const withAttachmentTextCache = (key: string, extract: () => Promise<string>): Promise<string> => {
  const cached = cache.get(key);
  if (cached !== undefined) {
    touch(key);
    return cached;
  }

  evictOldestIfFull();
  const pending = extract().then(
    (text) => {
      if (!text) {
        // 空结果不留在缓存里：抽取失败往往是暂时性的（例如 pdf.js 还没就绪），下次应该重试。
        cache.delete(key);
      }
      return text;
    },
    (error: unknown) => {
      cache.delete(key);
      throw error;
    },
  );
  cache.set(key, pending);
  return pending;
};

/** 只给测试与会话清理用。 */
export const clearAttachmentTextCache = (): void => {
  cache.clear();
};
