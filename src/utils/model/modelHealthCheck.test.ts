import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ThirdPartyConnection, ModelOption } from '@/types';
import * as diagnostics from '@/utils/thirdPartyDiagnostics';
import { probeSingleModel, runBatchModelHealthCheck } from './modelHealthCheck';

const MOCK_CONNECTION: ThirdPartyConnection = {
  id: 'conn-test',
  name: 'Test Connection',
  templateId: 'openai',
  protocol: 'openai-compatible',
  apiKey: 'sk-test',
  baseUrl: 'https://api.openai.com/v1',
  extraHeaders: {},
  modelId: 'gpt-4o',
  models: [
    { id: 'gpt-4o', name: 'GPT-4o' },
    { id: 'gpt-4o-mini', name: 'GPT-4o Mini' },
    { id: 'dall-e-3', name: 'DALL-E 3' },
  ],
  enabled: true,
};

describe('modelHealthCheck', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('probes a single model with probeSingleModel', async () => {
    const probeSpy = vi.spyOn(diagnostics, 'probeThirdPartyConnection').mockResolvedValue({
      connectionId: 'conn-test',
      status: 'success',
      latencyMs: 150,
      modelId: 'gpt-4o',
      timestamp: Date.now(),
      grade: 'fast',
    });

    const result = await probeSingleModel(MOCK_CONNECTION, 'gpt-4o');

    expect(probeSpy).toHaveBeenCalledWith(
      MOCK_CONNECTION,
      expect.objectContaining({
        modelId: 'gpt-4o',
        timeoutMs: 12000,
      }),
    );
    expect(result.status).toBe('success');
    expect(result.latencyMs).toBe(150);
  });

  it('runs batch model check, computes average latency, and skips unsafe models', async () => {
    const probeSpy = vi.spyOn(diagnostics, 'probeThirdPartyConnection').mockImplementation(async (_, opts) => {
      if (opts?.modelId === 'gpt-4o') {
        return {
          connectionId: 'conn-test',
          status: 'success',
          latencyMs: 100,
          modelId: 'gpt-4o',
          timestamp: Date.now(),
          grade: 'fast',
        };
      }
      if (opts?.modelId === 'gpt-4o-mini') {
        return {
          connectionId: 'conn-test',
          status: 'success',
          latencyMs: 200,
          modelId: 'gpt-4o-mini',
          timestamp: Date.now(),
          grade: 'fast',
        };
      }
      return {
        connectionId: 'conn-test',
        status: 'error',
        latencyMs: 0,
        modelId: opts?.modelId || '',
        timestamp: Date.now(),
        grade: 'error',
        errorMessage: 'Fail',
      };
    });

    const progressUpdates: number[] = [];
    const models: ModelOption[] = [
      { id: 'gpt-4o', name: 'GPT-4o' },
      { id: 'gpt-4o-mini', name: 'GPT-4o Mini' },
      { id: 'dall-e-3', name: 'DALL-E 3' }, // Image model, should be skipped safely
    ];

    const summary = await runBatchModelHealthCheck(MOCK_CONNECTION, models, {
      concurrency: 2,
      onProgress: (p) => {
        progressUpdates.push(p.completed);
      },
    });

    expect(summary.total).toBe(3);
    expect(summary.successCount).toBe(2);
    expect(summary.errorCount).toBe(1); // dall-e-3 skipped
    expect(summary.skippedCount).toBe(1);
    expect(summary.avgLatencyMs).toBe(150); // (100 + 200) / 2
    expect(summary.results['gpt-4o'].status).toBe('success');
    expect(summary.results['gpt-4o-mini'].status).toBe('success');
    expect(summary.results['dall-e-3'].errorMessage).toContain('跳过探测');
    expect(progressUpdates).toEqual([1, 2, 3]);
    // dall-e-3 should NOT have called probeThirdPartyConnection
    expect(probeSpy).toHaveBeenCalledTimes(2);
  });

  it('handles empty models array gracefully', async () => {
    const summary = await runBatchModelHealthCheck(MOCK_CONNECTION, []);
    expect(summary.total).toBe(0);
    expect(summary.successCount).toBe(0);
    expect(summary.avgLatencyMs).toBe(0);
  });

  it('respects abort signal during batch check', async () => {
    const controller = new AbortController();
    controller.abort();

    const summary = await runBatchModelHealthCheck(MOCK_CONNECTION, [{ id: 'gpt-4o', name: 'GPT-4o' }], {
      signal: controller.signal,
    });

    expect(summary.successCount).toBe(0);
  });
});
