import { act } from 'react';
import { setupProviderTestRenderer as setupTestRenderer } from '@/test/render/providerRenderer';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockGetApiUsageByTimeRange,
  mockPruneLogs,
  mockAddLogs,
  mockClearLogs,
  mockAddApiUsageRecord,
  mockGetLogs,
  mockClearApiUsage,
} = vi.hoisted(() => ({
  mockGetApiUsageByTimeRange: vi.fn(),
  mockPruneLogs: vi.fn(),
  mockAddLogs: vi.fn(),
  mockClearLogs: vi.fn(),
  mockAddApiUsageRecord: vi.fn(),
  mockGetLogs: vi.fn(),
  mockClearApiUsage: vi.fn(),
}));

vi.mock('@/services/db/dbService', async () => {
  const { createDbServiceMockModule } = await import('@/test/doubles/moduleMocks');

  return createDbServiceMockModule({
    getApiUsageByTimeRange: mockGetApiUsageByTimeRange,
    pruneLogs: mockPruneLogs,
    addLogs: mockAddLogs,
    clearLogs: mockClearLogs,
    addApiUsageRecord: mockAddApiUsageRecord,
    getLogs: mockGetLogs,
    clearApiUsage: mockClearApiUsage,
  });
});

import { UsageOverviewTab } from './UsageOverviewTab';

describe('UsageOverviewTab', () => {
  const renderer = setupTestRenderer({ providers: { language: 'en' } });

  beforeEach(() => {
    vi.clearAllMocks();
    mockPruneLogs.mockResolvedValue(undefined);
    mockAddLogs.mockResolvedValue(undefined);
    mockClearLogs.mockResolvedValue(undefined);
    mockAddApiUsageRecord.mockResolvedValue(undefined);
    mockGetLogs.mockResolvedValue([]);
    mockClearApiUsage.mockResolvedValue(undefined);
  });

  it('aggregates request counts and per-model token totals for the selected range', async () => {
    mockGetApiUsageByTimeRange.mockResolvedValue([
      {
        id: 1,
        timestamp: Date.now(),
        modelId: 'gemini-3.1-pro-preview',
        promptTokens: 1_000_000,
        cachedPromptTokens: 500_000,
        completionTokens: 0,
        thoughtTokens: 10_000,
        toolUsePromptTokens: 25_000,
        totalTokens: 1_035_000,
        exactPricing: {
          version: 1,
          requestKind: 'chat',
          promptTokensDetails: [{ modality: 'TEXT', tokenCount: 500_000 }],
          cacheTokensDetails: [{ modality: 'TEXT', tokenCount: 500_000 }],
          toolUsePromptTokensDetails: [{ modality: 'TEXT', tokenCount: 25_000 }],
          responseTokensDetails: [{ modality: 'TEXT', tokenCount: 10_000 }],
        },
      },
      {
        id: 2,
        timestamp: Date.now() - 1000,
        modelId: 'gemini-3-flash-preview',
        promptTokens: 500_000,
        cachedPromptTokens: 50_000,
        completionTokens: 500_000,
        thoughtTokens: 20_000,
        toolUsePromptTokens: 30_000,
        totalTokens: 1_050_000,
      },
      {
        id: 3,
        timestamp: Date.now() - 2000,
        modelId: 'gemini-3.1-flash-image-preview',
        promptTokens: 10,
        cachedPromptTokens: 0,
        completionTokens: 20,
        thoughtTokens: 0,
        toolUsePromptTokens: 0,
        totalTokens: 30,
      },
    ]);

    await act(async () => {
      renderer.root.render(<UsageOverviewTab />);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(renderer.container.textContent).toContain('Time Range');
    expect(renderer.container.textContent).toContain('All Time');
    expect(renderer.container.textContent).toContain('3');
    expect(renderer.container.textContent).toContain('1,005,010');
    expect(renderer.container.textContent).toContain('550,000');
    expect(renderer.container.textContent).toContain('530,020');
    expect(renderer.container.textContent).toContain('2,085,030');
    expect(renderer.container.textContent).toContain('Cached Tokens');
    expect(renderer.container.textContent).toContain('$2.48');
    expect(renderer.container.textContent).toContain('2 unavailable');
    expect(renderer.container.textContent).toContain('—');
    expect(renderer.container.textContent).toContain('gemini-3.1-pro-preview');
    expect(renderer.container.textContent).toContain('gemini-3-flash-preview');
    expect(renderer.container.textContent).toContain('gemini-3.1-flash-image-preview');
    expect(renderer.container.textContent).toContain('Strict official mode');
    expect(renderer.container.innerHTML).not.toContain('xl:grid-cols-6');
    expect(renderer.container.innerHTML).not.toContain('rounded-2xl');
  });
});
