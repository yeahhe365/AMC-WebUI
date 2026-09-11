import { getErrorMessage } from './errorMessage';
import { parseApiKeys } from './apiKeySelection';
import { getProxyProviderHeader } from './thirdPartyApiProviders';
import { sendAnthropicMessageNonStream } from '@/services/api/anthropicApi';
import { sendOpenAICompatibleMessageNonStream } from '@/services/api/openaiCompatibleApi';
import { sendOpenAIResponsesNonStream } from '@/services/api/openaiResponsesApi';
import type { ThirdPartyConnection } from '@/types';

export type LatencyGrade = 'fast' | 'normal' | 'slow' | 'error';

export interface ConnectionHealthProbeResult {
  connectionId: string;
  status: 'success' | 'error';
  latencyMs: number;
  modelId: string;
  timestamp: number;
  grade: LatencyGrade;
  errorMessage?: string;
  diagnosticTip?: string;
}

/**
 * Categorizes latency into fast (< 500ms), normal (500-1500ms), slow (>= 1500ms), or error.
 */
export const getLatencyGrade = (latencyMs: number, isSuccess: boolean): LatencyGrade => {
  if (!isSuccess) return 'error';
  if (latencyMs < 500) return 'fast';
  if (latencyMs < 1500) return 'normal';
  return 'slow';
};

/**
 * Returns Tailwind color classes corresponding to latency grade.
 */
export const getLatencyBadgeStyles = (
  grade: LatencyGrade,
): {
  badge: string;
  dot: string;
  text: string;
} => {
  switch (grade) {
    case 'fast':
      return {
        badge: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20',
        dot: 'bg-emerald-500',
        text: 'text-emerald-600 dark:text-emerald-400',
      };
    case 'normal':
      return {
        badge: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20',
        dot: 'bg-amber-500',
        text: 'text-amber-600 dark:text-amber-400',
      };
    case 'slow':
      return {
        badge: 'bg-orange-500/10 text-orange-600 dark:text-orange-400 border border-orange-500/20',
        dot: 'bg-orange-500',
        text: 'text-orange-600 dark:text-orange-400',
      };
    case 'error':
      return {
        badge: 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20',
        dot: 'bg-rose-500',
        text: 'text-rose-600 dark:text-rose-400',
      };
  }
};

/**
 * Format milliseconds into human-friendly string (e.g. 180ms or 1.45s).
 */
export const formatLatency = (latencyMs: number): string => {
  if (latencyMs < 1000) {
    return `${Math.round(latencyMs)}ms`;
  }
  return `${(latencyMs / 1000).toFixed(2)}s`;
};

/**
 * Analyzes error message and returns a helpful troubleshooting tip.
 */
export const diagnoseConnectionError = (errorMessage: string): string | undefined => {
  const lower = errorMessage.toLowerCase();

  if (lower.includes('401') || lower.includes('unauthorized') || lower.includes('invalid api key')) {
    return '401 Unauthorized: API Key is invalid or expired. Please check your key.';
  }
  if (lower.includes('403') || lower.includes('forbidden') || lower.includes('permission_denied')) {
    return '403 Forbidden: Access denied. Your account may lack permissions or be region-restricted.';
  }
  if (lower.includes('404') || lower.includes('not found') || lower.includes('model_not_found')) {
    return '404 Not Found: Base URL path or Model ID not found. Verify the URL and model identifier.';
  }
  if (lower.includes('429') || lower.includes('rate limit') || lower.includes('quota')) {
    return '429 Rate Limit: Quota exceeded or request frequency too high. Check provider account balance.';
  }
  if (lower.includes('timeout') || lower.includes('aborted') || lower.includes('timed out')) {
    return 'Request timed out (>15s): Server took too long to respond. Check network or proxy settings.';
  }
  if (
    lower.includes('failed to fetch') ||
    lower.includes('network error') ||
    lower.includes('cross-origin') ||
    lower.includes('cors')
  ) {
    return 'Network / CORS Error: Browser could not reach the endpoint. Check URL, network connection, or proxy.';
  }

  return undefined;
};

export interface ModelProbeSafety {
  isSafe: boolean;
  skipReason?: string;
  category?: 'image' | 'video' | 'audio' | 'embedding' | 'rerank' | 'moderation';
}

/**
 * Checks whether a model is safe and compatible with standard chat-completion probes.
 * Skips image, video, audio, and embedding models to prevent API errors and unintended billing.
 */
export const getModelProbeSafety = (modelId: string): ModelProbeSafety => {
  const lower = modelId.toLowerCase();

  if (
    lower.includes('dall-e') ||
    lower.includes('flux') ||
    lower.includes('stable-diffusion') ||
    lower.includes('sdxl') ||
    lower.includes('midjourney') ||
    lower.includes('imagen')
  ) {
    return {
      isSafe: false,
      category: 'image',
      skipReason:
        'Image generation models are not compatible with chat completion probes and would incur unintended generation costs.',
    };
  }

  if (
    lower.includes('sora') ||
    lower.includes('kling') ||
    lower.includes('cogvideox') ||
    lower.includes('runway') ||
    lower.includes('gen-2') ||
    lower.includes('gen-3')
  ) {
    return {
      isSafe: false,
      category: 'video',
      skipReason: 'Video generation models cannot be tested via chat completion probes.',
    };
  }

  if (lower.includes('whisper') || lower.includes('tts') || lower.includes('voice') || lower.includes('elevenlabs')) {
    return {
      isSafe: false,
      category: 'audio',
      skipReason:
        'Audio and speech models require specialized endpoints and are skipped during chat completion probes.',
    };
  }

  if (lower.includes('embed') || lower.includes('bge-') || lower.includes('e5-')) {
    return {
      isSafe: false,
      category: 'embedding',
      skipReason: 'Embedding models require /v1/embeddings and cannot be probed via chat completion.',
    };
  }

  if (lower.includes('rerank')) {
    return {
      isSafe: false,
      category: 'rerank',
      skipReason: 'Rerank models require /v1/rerank and cannot be probed via chat completion.',
    };
  }

  if (lower.includes('moderation')) {
    return {
      isSafe: false,
      category: 'moderation',
      skipReason: 'Moderation models require /v1/moderations and cannot be probed via chat completion.',
    };
  }

  return { isSafe: true };
};

export interface ProbeOptions {
  modelId?: string;
  timeoutMs?: number;
  signal?: AbortSignal;
}

/**
 * Probes a third-party API connection to measure latency and test connectivity.
 * Sends a minimal non-streaming prompt with temperature 0.
 * Automatically chooses a safe chat model and skips costly/incompatible generation models.
 */
export const probeThirdPartyConnection = async (
  connection: ThirdPartyConnection,
  options: ProbeOptions = {},
): Promise<ConnectionHealthProbeResult> => {
  // If a specific model was requested, check safety directly
  if (options.modelId) {
    const explicitSafety = getModelProbeSafety(options.modelId);
    if (!explicitSafety.isSafe) {
      return {
        connectionId: connection.id,
        status: 'error',
        latencyMs: 0,
        modelId: options.modelId,
        timestamp: Date.now(),
        grade: 'error',
        errorMessage: `Probe skipped: ${explicitSafety.skipReason}`,
        diagnosticTip: 'Please select a text or reasoning chat model for connection diagnostics.',
      };
    }
  }

  // Auto-resolve a safe model candidate
  let modelId = options.modelId || connection.modelId;
  if (!modelId || !getModelProbeSafety(modelId).isSafe) {
    const safeModelCandidate = connection.models.find((m) => getModelProbeSafety(m.id).isSafe);
    if (safeModelCandidate) {
      modelId = safeModelCandidate.id;
    } else {
      modelId = modelId || (connection.models.length > 0 ? connection.models[0].id : 'default');
      const candidateSafety = getModelProbeSafety(modelId);
      if (!candidateSafety.isSafe) {
        return {
          connectionId: connection.id,
          status: 'error',
          latencyMs: 0,
          modelId,
          timestamp: Date.now(),
          grade: 'error',
          errorMessage: `Probe skipped: ${candidateSafety.skipReason}`,
          diagnosticTip: 'No safe chat completion models found in this connection to run connectivity probe.',
        };
      }
    }
  }

  const keyToTest = connection.apiKey;
  if (!keyToTest && !connection.authOptional) {
    return {
      connectionId: connection.id,
      status: 'error',
      latencyMs: 0,
      modelId,
      timestamp: Date.now(),
      grade: 'error',
      errorMessage: 'No API key provided.',
      diagnosticTip: 'Please provide a valid API key for this provider.',
    };
  }

  const parsedKeys = keyToTest ? parseApiKeys(keyToTest) : [];
  const firstKey = parsedKeys[0] || (connection.authOptional ? 'auth-optional' : '');
  if (!firstKey && !connection.authOptional) {
    return {
      connectionId: connection.id,
      status: 'error',
      latencyMs: 0,
      modelId,
      timestamp: Date.now(),
      grade: 'error',
      errorMessage: 'Invalid API key format.',
      diagnosticTip: 'Please check your API key format.',
    };
  }

  const timeoutMs = options.timeoutMs ?? 15000;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    controller.abort(new Error(`Probe request timed out after ${timeoutMs}ms`));
  }, timeoutMs);

  const handleExternalAbort = () => {
    controller.abort();
  };
  if (options.signal) {
    options.signal.addEventListener('abort', handleExternalAbort);
  }

  const startTime = performance.now();
  let providerError: Error | null = null;
  const onError = (error: Error) => {
    providerError = error;
  };

  const providerConfig = {
    baseUrl: connection.baseUrl,
    temperature: 0,
    extraHeaders: connection.extraHeaders,
  };
  const proxyProviderId = getProxyProviderHeader(connection.templateId);

  try {
    if (connection.protocol === 'anthropic') {
      await sendAnthropicMessageNonStream(
        firstKey,
        modelId,
        [],
        [{ text: 'Hello' }],
        providerConfig,
        controller.signal,
        onError,
        () => undefined,
        'user',
        proxyProviderId,
      );
    } else if (connection.protocol === 'openai-responses') {
      await sendOpenAIResponsesNonStream(
        firstKey,
        modelId,
        [],
        [{ text: 'Hello' }],
        providerConfig,
        controller.signal,
        onError,
        () => undefined,
        'user',
        proxyProviderId,
      );
    } else {
      await sendOpenAICompatibleMessageNonStream(
        firstKey,
        modelId,
        [],
        [{ text: 'Hello' }],
        providerConfig,
        controller.signal,
        onError,
        () => undefined,
        'user',
        proxyProviderId,
      );
    }

    if (providerError) {
      throw providerError;
    }

    const latencyMs = Math.round(performance.now() - startTime);
    return {
      connectionId: connection.id,
      status: 'success',
      latencyMs,
      modelId,
      timestamp: Date.now(),
      grade: getLatencyGrade(latencyMs, true),
    };
  } catch (error) {
    const latencyMs = Math.round(performance.now() - startTime);
    const message = getErrorMessage(error);
    return {
      connectionId: connection.id,
      status: 'error',
      latencyMs,
      modelId,
      timestamp: Date.now(),
      grade: 'error',
      errorMessage: message,
      diagnosticTip: diagnoseConnectionError(message),
    };
  } finally {
    clearTimeout(timeoutId);
    if (options.signal) {
      options.signal.removeEventListener('abort', handleExternalAbort);
    }
  }
};
