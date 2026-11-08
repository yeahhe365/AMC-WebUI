import { API_USAGE_STORE } from './dbSchema';
import { getDb, transactionToPromise, withWriteLock } from './indexedDbAccess';

export interface ApiUsageRecord {
  id?: number;
  timestamp: number;
  modelId: string;
  promptTokens: number;
  cachedPromptTokens?: number;
  completionTokens: number;
  thoughtTokens?: number;
  toolUsePromptTokens?: number;
  totalTokens?: number;
  exactPricing?: ApiUsageExactPricing;
}

export type ApiUsageRequestKind = 'chat' | 'tts' | 'transcription' | 'image_generate';
export type ApiUsageModality = 'TEXT' | 'IMAGE' | 'AUDIO';

export interface ApiUsageModalityTokenCount {
  modality: ApiUsageModality;
  tokenCount: number;
}

export interface ApiUsageExactPricing {
  version: 1;
  requestKind: ApiUsageRequestKind;
  promptTokensDetails?: ApiUsageModalityTokenCount[];
  cacheTokensDetails?: ApiUsageModalityTokenCount[];
  responseTokensDetails?: ApiUsageModalityTokenCount[];
  toolUsePromptTokensDetails?: ApiUsageModalityTokenCount[];
  generatedImageCount?: number;
}

/**
 * 用量记录的保留策略。这张表原来**只进不出**：每次 API 调用 add 一条，从来没有清理，
 * 而同一时期的日志只保留 2 天。用久了库会无界增长，按时间区间读全部记录的用量面板
 * 也会越来越慢。两条规则先到者生效。
 */
export interface ApiUsageRetentionLimits {
  /** 记录保留时长。 */
  retentionMs: number;
  /** 记录条数上限，超出时从最旧的开始丢。 */
  maxRecords: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;

const DEFAULT_API_USAGE_RETENTION: ApiUsageRetentionLimits = {
  retentionMs: 365 * DAY_MS,
  maxRecords: 50_000,
};

/** 每写入这么多条裁剪一次，避免每条记录都去扫一遍索引。 */
const PRUNE_EVERY_WRITES = 100;

let writesSinceLastPrune = 0;

const API_USAGE_TIMESTAMP_INDEX = 'timestamp';

/**
 * 在给定 store 上执行裁剪（不自己开事务），返回删掉的条数。
 * 先按时间删过期的，再按条数从最旧的开始删，直到回到上限内。
 */
const pruneUsageStore = (store: IDBObjectStore, now: number, limits: ApiUsageRetentionLimits): Promise<number> =>
  new Promise((resolve, reject) => {
    let deleted = 0;

    const enforceCap = () => {
      const countReq = store.count();
      countReq.onsuccess = () => {
        let excess = countReq.result - limits.maxRecords;
        if (excess <= 0) {
          resolve(deleted);
          return;
        }
        // 按 timestamp 升序走，最旧的先删。
        const cursorReq = store.index(API_USAGE_TIMESTAMP_INDEX).openKeyCursor();
        cursorReq.onsuccess = () => {
          const cursor = cursorReq.result;
          if (!cursor || excess <= 0) {
            resolve(deleted);
            return;
          }
          store.delete(cursor.primaryKey);
          deleted += 1;
          excess -= 1;
          cursor.continue();
        };
        cursorReq.onerror = () => reject(cursorReq.error);
      };
      countReq.onerror = () => reject(countReq.error);
    };

    const expireOldRecords = () => {
      const cutoff = now - limits.retentionMs;
      const cursorReq = store.index(API_USAGE_TIMESTAMP_INDEX).openKeyCursor(IDBKeyRange.upperBound(cutoff));
      cursorReq.onsuccess = () => {
        const cursor = cursorReq.result;
        if (!cursor) {
          enforceCap();
          return;
        }
        store.delete(cursor.primaryKey);
        deleted += 1;
        cursor.continue();
      };
      cursorReq.onerror = () => reject(cursorReq.error);
    };

    expireOldRecords();
  });

/** 手动裁剪一次（测试、或"清空历史"这类入口需要时调用）。返回删掉的条数。 */
export const pruneApiUsage = (
  now: number = Date.now(),
  limits: ApiUsageRetentionLimits = DEFAULT_API_USAGE_RETENTION,
): Promise<number> =>
  withWriteLock(async () => {
    const db = await getDb();
    const tx = db.transaction(API_USAGE_STORE, 'readwrite');
    const deleted = await pruneUsageStore(tx.objectStore(API_USAGE_STORE), now, limits);
    await transactionToPromise(tx);
    return deleted;
  });

export const addApiUsageRecord = (record: ApiUsageRecord) =>
  withWriteLock(async () => {
    const db = await getDb();
    const tx = db.transaction(API_USAGE_STORE, 'readwrite');
    const store = tx.objectStore(API_USAGE_STORE);
    store.add(record);

    writesSinceLastPrune += 1;
    if (writesSinceLastPrune >= PRUNE_EVERY_WRITES) {
      writesSinceLastPrune = 0;
      // 和写入放在同一个事务里完成，避免"裁剪跑在另一条事务上、把刚写的记录也扫掉"。
      await pruneUsageStore(store, Date.now(), DEFAULT_API_USAGE_RETENTION);
    }

    return transactionToPromise(tx);
  });

export const getApiUsageByTimeRange = (startTime: number, endTime: number): Promise<ApiUsageRecord[]> =>
  getDb().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(API_USAGE_STORE, 'readonly');
        const store = tx.objectStore(API_USAGE_STORE);
        const index = store.index('timestamp');
        const range = IDBKeyRange.bound(startTime, endTime);
        const request = index.getAll(range);
        request.onsuccess = () => resolve((request.result as ApiUsageRecord[]) ?? []);
        request.onerror = () => reject(request.error);
      }),
  );

export const clearApiUsage = () =>
  withWriteLock(async () => {
    const db = await getDb();
    const tx = db.transaction(API_USAGE_STORE, 'readwrite');
    tx.objectStore(API_USAGE_STORE).clear();
    return transactionToPromise(tx);
  });
