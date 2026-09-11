import type { ModelOption, ThirdPartyConnection } from '@/types';
import {
  type ConnectionHealthProbeResult,
  probeThirdPartyConnection,
  getModelProbeSafety,
} from '@/utils/thirdPartyDiagnostics';

export interface BatchHealthCheckProgress {
  completed: number;
  total: number;
  currentModelId: string;
  latestResult: ConnectionHealthProbeResult;
}

export interface BatchHealthCheckOptions {
  /** Maximum number of concurrent model probe requests. Defaults to 3. */
  concurrency?: number;
  /** Timeout in ms per model request. Defaults to 12000. */
  timeoutMs?: number;
  /** AbortSignal to cancel running batch check. */
  signal?: AbortSignal;
  /** Callback fired as each model finishes checking. */
  onProgress?: (progress: BatchHealthCheckProgress) => void;
}

export interface BatchHealthCheckSummary {
  total: number;
  successCount: number;
  errorCount: number;
  skippedCount: number;
  avgLatencyMs: number;
  results: Record<string, ConnectionHealthProbeResult>;
}

/**
 * Probes a single model within a third-party connection.
 */
export async function probeSingleModel(
  connection: ThirdPartyConnection,
  modelId: string,
  options: { timeoutMs?: number; signal?: AbortSignal } = {},
): Promise<ConnectionHealthProbeResult> {
  return probeThirdPartyConnection(connection, {
    modelId,
    timeoutMs: options.timeoutMs ?? 12000,
    signal: options.signal,
  });
}

/**
 * Runs a concurrency-controlled batch health check across models.
 */
export async function runBatchModelHealthCheck(
  connection: ThirdPartyConnection,
  models: ModelOption[],
  options: BatchHealthCheckOptions = {},
): Promise<BatchHealthCheckSummary> {
  const { concurrency = 3, timeoutMs = 12000, signal, onProgress } = options;

  const results: Record<string, ConnectionHealthProbeResult> = {};
  let completed = 0;
  let successCount = 0;
  let errorCount = 0;
  let skippedCount = 0;
  let totalLatencyMs = 0;

  if (models.length === 0) {
    return {
      total: 0,
      successCount: 0,
      errorCount: 0,
      skippedCount: 0,
      avgLatencyMs: 0,
      results: {},
    };
  }

  // Worker pool for concurrency control
  let cursor = 0;
  const workerCount = Math.min(Math.max(1, concurrency), models.length);

  const worker = async () => {
    while (cursor < models.length) {
      if (signal?.aborted) {
        break;
      }
      const index = cursor++;
      const model = models[index];
      if (!model) break;

      const safety = getModelProbeSafety(model.id);
      let res: ConnectionHealthProbeResult;

      if (!safety.isSafe) {
        res = {
          connectionId: connection.id,
          status: 'error',
          latencyMs: 0,
          modelId: model.id,
          timestamp: Date.now(),
          grade: 'error',
          errorMessage: `跳过探测: ${safety.skipReason}`,
          diagnosticTip: '该模型类型不支持标准对话测活。',
        };
        skippedCount++;
        errorCount++;
      } else {
        try {
          res = await probeSingleModel(connection, model.id, { timeoutMs, signal });
          if (res.status === 'success') {
            successCount++;
            totalLatencyMs += res.latencyMs;
          } else {
            errorCount++;
          }
        } catch (probeExecutionError) {
          res = {
            connectionId: connection.id,
            status: 'error',
            latencyMs: 0,
            modelId: model.id,
            timestamp: Date.now(),
            grade: 'error',
            errorMessage:
              probeExecutionError instanceof Error ? probeExecutionError.message : String(probeExecutionError),
            diagnosticTip: '请求异常中断。',
          };
          errorCount++;
        }
      }

      results[model.id] = res;
      completed++;

      if (onProgress) {
        onProgress({
          completed,
          total: models.length,
          currentModelId: model.id,
          latestResult: res,
        });
      }
    }
  };

  const workers = Array.from({ length: workerCount }, () => worker());
  await Promise.all(workers);

  const avgLatencyMs = successCount > 0 ? Math.round(totalLatencyMs / successCount) : 0;

  return {
    total: models.length,
    successCount,
    errorCount,
    skippedCount,
    avgLatencyMs,
    results,
  };
}
