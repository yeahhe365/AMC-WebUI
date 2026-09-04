import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.unmock('./logService');
import { createDeferred } from '@/test/render/renderer';

const { mockAddApiUsageRecord, mockAddLogs, mockPruneLogs, mockClearLogs, mockClearApiUsage, mockGetLogs } = vi.hoisted(
  () => ({
    mockAddApiUsageRecord: vi.fn(),
    mockAddLogs: vi.fn(),
    mockPruneLogs: vi.fn(),
    mockClearLogs: vi.fn(),
    mockClearApiUsage: vi.fn(),
    mockGetLogs: vi.fn(),
  }),
);

vi.mock('@/services/db/dbService', async () => {
  const { createDbServiceMockModule } = await import('@/test/doubles/moduleMocks');

  return createDbServiceMockModule({
    addApiUsageRecord: mockAddApiUsageRecord,
    addLogs: mockAddLogs,
    pruneLogs: mockPruneLogs,
    clearLogs: mockClearLogs,
    clearApiUsage: mockClearApiUsage,
    getLogs: mockGetLogs,
  });
});

const flushMicrotasks = async () => {
  await Promise.resolve();
  await Promise.resolve();
};

describe('logService', () => {
  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();
    localStorage.clear();
    mockAddApiUsageRecord.mockResolvedValue(undefined);
    mockAddLogs.mockResolvedValue(undefined);
    mockPruneLogs.mockResolvedValue(undefined);
    mockClearLogs.mockResolvedValue(undefined);
    mockClearApiUsage.mockResolvedValue(undefined);
    mockGetLogs.mockResolvedValue([]);
    // The gate defaults OFF; the persistence-focused tests below assume the
    // enabled path, so open it before each case. Dedicated gating tests reset
    // it back to disabled explicitly.
    const { logService } = await import('./logService');
    logService.setEnabled(true);
  });

  it('writes timestamped usage records to IndexedDB when token usage is recorded', async () => {
    const { logService } = await import('./logService');
    mockAddApiUsageRecord.mockClear();

    logService.recordTokenUsage('gemini-3.1-pro-preview', {
      promptTokens: 123,
      cachedPromptTokens: 78,
      completionTokens: 456,
      thoughtTokens: 22,
      toolUsePromptTokens: 17,
      totalTokens: 618,
    });
    await Promise.resolve();

    expect(mockAddApiUsageRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        modelId: 'gemini-3.1-pro-preview',
        promptTokens: 123,
        completionTokens: 456,
        cachedPromptTokens: 78,
        thoughtTokens: 22,
        toolUsePromptTokens: 17,
        totalTokens: 618,
        timestamp: expect.any(Number),
      }),
    );
  });

  it('persists exact pricing metadata when usage details are provided', async () => {
    const { logService } = await import('./logService');
    mockAddApiUsageRecord.mockClear();

    logService.recordTokenUsage(
      'gemini-3-flash-preview',
      {
        promptTokens: 123,
        cachedPromptTokens: 23,
        completionTokens: 45,
        totalTokens: 168,
      },
      {
        version: 1,
        requestKind: 'chat',
        promptTokensDetails: [{ modality: 'TEXT', tokenCount: 100 }],
        cacheTokensDetails: [{ modality: 'TEXT', tokenCount: 23 }],
        responseTokensDetails: [{ modality: 'TEXT', tokenCount: 45 }],
      },
    );
    await Promise.resolve();

    expect(mockAddApiUsageRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        modelId: 'gemini-3-flash-preview',
        exactPricing: expect.objectContaining({
          version: 1,
          requestKind: 'chat',
          promptTokensDetails: [{ modality: 'TEXT', tokenCount: 100 }],
        }),
      }),
    );
  });

  it('serializes direct Error arguments with message and stack details', async () => {
    const { logService } = await import('./logService');
    await logService.getRecentLogs();
    mockAddLogs.mockClear();

    logService.error('Streaming exploded', new Error('kaput'));
    await logService.getRecentLogs();

    expect(mockAddLogs).toHaveBeenCalledWith([
      expect.objectContaining({
        level: 'ERROR',
        category: 'NETWORK',
        message: 'Streaming exploded',
        data: expect.objectContaining({
          message: 'kaput',
          name: 'Error',
          stack: expect.any(String),
        }),
      }),
    ]);
  });

  it('infers non-system categories when no explicit category is provided', async () => {
    const { logService } = await import('./logService');
    await logService.getRecentLogs();
    mockAddLogs.mockClear();

    logService.warn('Failed to upload file "report.pdf"');
    await logService.getRecentLogs();

    expect(mockAddLogs).toHaveBeenCalledWith([
      expect.objectContaining({
        level: 'WARN',
        category: 'FILE',
      }),
    ]);
  });

  it('requeues failed flush batches so they can be retried later', async () => {
    const { logService } = await import('./logService');
    await logService.getRecentLogs();
    mockAddLogs.mockReset();
    mockGetLogs.mockResolvedValue([]);
    mockAddLogs.mockRejectedValueOnce(new Error('db unavailable')).mockResolvedValueOnce(undefined);

    logService.info('Retry me');
    await logService.getRecentLogs();
    await logService.getRecentLogs();

    expect(mockAddLogs).toHaveBeenCalledTimes(2);
    expect(mockAddLogs.mock.calls[1][0]).toEqual([
      expect.objectContaining({
        message: 'Retry me',
      }),
    ]);
  });

  it('waits for in-flight flushes before clearing and does not recreate logs during clear', async () => {
    const { logService } = await import('./logService');
    await logService.getRecentLogs();
    mockAddLogs.mockReset();
    mockClearLogs.mockClear();
    mockClearApiUsage.mockClear();
    mockGetLogs.mockResolvedValue([]);

    const deferredFlush = createDeferred();
    mockAddLogs.mockReturnValueOnce(deferredFlush.promise);

    logService.info('Pending log before clear');
    const pendingRead = logService.getRecentLogs();
    await flushMicrotasks();

    const clearPromise = logService.clearLogs();
    await flushMicrotasks();

    expect(mockClearLogs).not.toHaveBeenCalled();

    deferredFlush.resolve();
    await pendingRead;
    await clearPromise;

    expect(mockClearLogs).toHaveBeenCalledTimes(1);
    expect(mockClearApiUsage).toHaveBeenCalledTimes(1);
    expect(mockAddLogs).toHaveBeenCalledTimes(1);
  });

  // ── isLoggingEnabled gate (default OFF) ──

  it('defaults to disabled and drops info/warn/debug until enabled', async () => {
    const { logService } = await import('./logService');
    // beforeEach opened the gate; close it to exercise the default-off path.
    logService.setEnabled(false);
    await logService.getRecentLogs();
    mockAddLogs.mockClear();

    logService.info('dropped info');
    logService.warn('dropped warn');
    logService.debug('dropped debug');
    await logService.getRecentLogs();

    expect(mockAddLogs).not.toHaveBeenCalled();
  });

  it('records a confirm log when enabled and drops the buffer when disabled', async () => {
    const { logService } = await import('./logService');
    await logService.getRecentLogs();
    mockAddLogs.mockClear();

    // Enable from a disabled base: the confirm log must persist (the gate is
    // already open when info() runs, so it is not gated away).
    logService.setEnabled(false);
    logService.setEnabled(true);
    await logService.getRecentLogs();

    expect(mockAddLogs).toHaveBeenCalledWith([expect.objectContaining({ level: 'INFO', message: 'Logging enabled.' })]);
  });

  it('flushes buffered logs to DB once enabled', async () => {
    const { logService } = await import('./logService');
    logService.setEnabled(false);
    await logService.getRecentLogs();
    mockAddLogs.mockClear();

    logService.info('before enable');
    await logService.getRecentLogs();
    expect(mockAddLogs).not.toHaveBeenCalled();

    logService.setEnabled(true);
    logService.info('after enable');
    await logService.getRecentLogs();
    expect(mockAddLogs).toHaveBeenCalledWith([
      expect.objectContaining({ message: 'Logging enabled.' }),
      expect.objectContaining({ message: 'after enable' }),
    ]);
  });

  it('calls console.error (not the DB) while disabled', async () => {
    const { logService } = await import('./logService');
    logService.setEnabled(false);
    await logService.getRecentLogs();
    mockAddLogs.mockClear();
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const boom = new Error('kaput');
      logService.error('Streaming exploded', { error: boom });
      await logService.getRecentLogs();

      expect(mockAddLogs).not.toHaveBeenCalled();
      // The disabled branch passes the raw error through (options.error is
      // unwrapped for the console), so the stack stays intact.
      expect(consoleErrorSpy).toHaveBeenCalledWith('Streaming exploded', boom);
    } finally {
      consoleErrorSpy.mockRestore();
    }
  });
});
