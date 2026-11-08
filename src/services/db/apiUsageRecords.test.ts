import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const DAY_MS = 24 * 60 * 60 * 1000;

const usageRecord = (timestamp: number, modelId: string) => ({
  timestamp,
  modelId,
  promptTokens: 1,
  completionTokens: 1,
});

describe('apiUsageRecords retention', () => {
  beforeEach(async () => {
    // `dbService` 在测试环境里是全局 mock（见 src/test/setup.ts），
    // 这里直接用真实模块的 clearApiUsage 清空，避免拿到空实现。
    vi.resetModules();
    const { clearApiUsage } = await import('./apiUsageRecords');
    await clearApiUsage();
  });

  afterEach(async () => {
    vi.resetModules();
  });

  // DB-5：这张表原本只进不出，用久了无界增长（日志那边只留 2 天）。
  it('drops records older than the retention window', async () => {
    const { addApiUsageRecord, getApiUsageByTimeRange, pruneApiUsage } = await import('./apiUsageRecords');
    const now = Date.now();

    await addApiUsageRecord(usageRecord(now - 400 * DAY_MS, 'expired'));
    await addApiUsageRecord(usageRecord(now - 10 * DAY_MS, 'recent'));

    const deleted = await pruneApiUsage(now);

    expect(deleted).toBe(1);
    const remaining = await getApiUsageByTimeRange(0, now + DAY_MS);
    expect(remaining.map((record) => record.modelId)).toEqual(['recent']);
  });

  it('caps the store by dropping the oldest records first', async () => {
    const { addApiUsageRecord, getApiUsageByTimeRange, pruneApiUsage } = await import('./apiUsageRecords');
    const now = Date.now();

    for (let index = 0; index < 5; index += 1) {
      await addApiUsageRecord(usageRecord(now - (5 - index) * DAY_MS, `model-${index}`));
    }

    const deleted = await pruneApiUsage(now, { retentionMs: 365 * DAY_MS, maxRecords: 3 });

    expect(deleted).toBe(2);
    const remaining = await getApiUsageByTimeRange(0, now + DAY_MS);
    expect(remaining.map((record) => record.modelId)).toEqual(['model-2', 'model-3', 'model-4']);
  });

  it('leaves a store within limits untouched', async () => {
    const { addApiUsageRecord, getApiUsageByTimeRange, pruneApiUsage } = await import('./apiUsageRecords');
    const now = Date.now();

    await addApiUsageRecord(usageRecord(now - DAY_MS, 'a'));
    await addApiUsageRecord(usageRecord(now, 'b'));

    expect(await pruneApiUsage(now)).toBe(0);
    expect(await getApiUsageByTimeRange(0, now + DAY_MS)).toHaveLength(2);
  });

  it('prunes automatically every 100 writes', async () => {
    const { addApiUsageRecord, getApiUsageByTimeRange } = await import('./apiUsageRecords');
    const now = Date.now();

    // 100 条全部落在保留期之外：第 100 次写入应当顺手把它们裁掉。
    for (let index = 0; index < 100; index += 1) {
      await addApiUsageRecord(usageRecord(now - 400 * DAY_MS + index, `old-${index}`));
    }

    expect(await getApiUsageByTimeRange(0, now + DAY_MS)).toHaveLength(0);
  });
});
