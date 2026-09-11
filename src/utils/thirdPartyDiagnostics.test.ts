import { describe, expect, it, vi } from 'vitest';
import {
  diagnoseConnectionError,
  formatLatency,
  getLatencyBadgeStyles,
  getLatencyGrade,
  getModelProbeSafety,
  probeThirdPartyConnection,
} from './thirdPartyDiagnostics';
import type { ThirdPartyConnection } from '@/types';

vi.mock('@/services/api/openaiCompatibleApi', () => ({
  sendOpenAICompatibleMessageNonStream: vi.fn(),
}));

vi.mock('@/services/api/anthropicApi', () => ({
  sendAnthropicMessageNonStream: vi.fn(),
}));

vi.mock('@/services/api/openaiResponsesApi', () => ({
  sendOpenAIResponsesNonStream: vi.fn(),
}));

describe('thirdPartyDiagnostics', () => {
  describe('getLatencyGrade', () => {
    it('returns error when isSuccess is false', () => {
      expect(getLatencyGrade(100, false)).toBe('error');
    });

    it('returns fast for latency < 500ms', () => {
      expect(getLatencyGrade(150, true)).toBe('fast');
      expect(getLatencyGrade(499, true)).toBe('fast');
    });

    it('returns normal for latency between 500ms and 1499ms', () => {
      expect(getLatencyGrade(500, true)).toBe('normal');
      expect(getLatencyGrade(1200, true)).toBe('normal');
    });

    it('returns slow for latency >= 1500ms', () => {
      expect(getLatencyGrade(1500, true)).toBe('slow');
      expect(getLatencyGrade(3000, true)).toBe('slow');
    });
  });

  describe('getLatencyBadgeStyles', () => {
    it('returns style mappings for each grade', () => {
      expect(getLatencyBadgeStyles('fast').badge).toContain('emerald');
      expect(getLatencyBadgeStyles('normal').badge).toContain('amber');
      expect(getLatencyBadgeStyles('slow').badge).toContain('orange');
      expect(getLatencyBadgeStyles('error').badge).toContain('rose');
    });
  });

  describe('formatLatency', () => {
    it('formats millisecond and second values', () => {
      expect(formatLatency(42)).toBe('42ms');
      expect(formatLatency(999)).toBe('999ms');
      expect(formatLatency(1000)).toBe('1.00s');
      expect(formatLatency(1540)).toBe('1.54s');
    });
  });

  describe('diagnoseConnectionError', () => {
    it('detects 401 unauthorized errors', () => {
      expect(diagnoseConnectionError('Error: 401 Unauthorized')).toContain('API Key is invalid');
      expect(diagnoseConnectionError('invalid api key provided')).toContain('API Key is invalid');
    });

    it('detects 403 forbidden errors', () => {
      expect(diagnoseConnectionError('403 Forbidden access')).toContain('Access denied');
    });

    it('detects 404 not found errors', () => {
      expect(diagnoseConnectionError('HTTP 404 Not Found')).toContain('Base URL path or Model ID not found');
    });

    it('detects 429 quota/rate limit errors', () => {
      expect(diagnoseConnectionError('429 Too Many Requests: quota exceeded')).toContain('Quota exceeded');
    });

    it('detects network and timeout errors', () => {
      expect(diagnoseConnectionError('Failed to fetch')).toContain('Network / CORS Error');
      expect(diagnoseConnectionError('Request timed out')).toContain('Request timed out');
    });

    it('returns undefined for unknown errors', () => {
      expect(diagnoseConnectionError('Something strange happened')).toBeUndefined();
    });
  });

  describe('probeThirdPartyConnection', () => {
    const mockConnection: ThirdPartyConnection = {
      id: 'test-conn',
      templateId: 'openai',
      name: 'Test OpenAI',
      enabled: true,
      apiKey: 'sk-test-key',
      baseUrl: 'https://api.openai.com/v1',
      modelId: 'gpt-5.6-sol',
      models: [{ id: 'gpt-5.6-sol', name: 'GPT-5.6 Sol' }],
      protocol: 'openai-compatible',
      extraHeaders: {},
    };

    it('returns error when API key is missing and auth is required', async () => {
      const result = await probeThirdPartyConnection({
        ...mockConnection,
        apiKey: null,
      });

      expect(result.status).toBe('error');
      expect(result.grade).toBe('error');
      expect(result.errorMessage).toContain('No API key');
    });

    it('successfully measures latency for openai-compatible protocol', async () => {
      const { sendOpenAICompatibleMessageNonStream } = await import('@/services/api/openaiCompatibleApi');
      vi.mocked(sendOpenAICompatibleMessageNonStream).mockImplementation(
        async (_key, _model, _hist, _parts, _cfg, _sig, _onError, onComplete) => {
          onComplete?.([], undefined, undefined);
        },
      );

      const result = await probeThirdPartyConnection(mockConnection);
      expect(result.status).toBe('success');
      expect(result.connectionId).toBe('test-conn');
      expect(result.modelId).toBe('gpt-5.6-sol');
      expect(result.latencyMs).toBeGreaterThanOrEqual(0);
      expect(['fast', 'normal', 'slow']).toContain(result.grade);
    });

    it('successfully probes anthropic protocol', async () => {
      const { sendAnthropicMessageNonStream } = await import('@/services/api/anthropicApi');
      vi.mocked(sendAnthropicMessageNonStream).mockImplementation(
        async (_key, _model, _hist, _parts, _cfg, _sig, _onError, onComplete) => {
          onComplete?.([], undefined, undefined);
        },
      );

      const anthropicConn: ThirdPartyConnection = {
        ...mockConnection,
        id: 'anthropic-conn',
        protocol: 'anthropic',
        modelId: 'claude-3-7-sonnet',
        models: [{ id: 'claude-3-7-sonnet', name: 'Claude 3.7 Sonnet' }],
      };

      const result = await probeThirdPartyConnection(anthropicConn);
      expect(result.status).toBe('success');
      expect(result.connectionId).toBe('anthropic-conn');
      expect(result.modelId).toBe('claude-3-7-sonnet');
    });

    it('handles provider error and includes diagnostic tip', async () => {
      const { sendOpenAICompatibleMessageNonStream } = await import('@/services/api/openaiCompatibleApi');
      vi.mocked(sendOpenAICompatibleMessageNonStream).mockImplementation(
        async (_key, _model, _hist, _parts, _cfg, _sig, onError) => {
          onError?.(new Error('401 Unauthorized: Invalid API key'));
        },
      );

      const result = await probeThirdPartyConnection(mockConnection);
      expect(result.status).toBe('error');
      expect(result.grade).toBe('error');
      expect(result.errorMessage).toContain('401');
      expect(result.diagnosticTip).toContain('API Key is invalid');
    });

    it('skips probe when explicitly requesting an unsafe generation model', async () => {
      const result = await probeThirdPartyConnection(mockConnection, {
        modelId: 'dall-e-3',
      });

      expect(result.status).toBe('error');
      expect(result.errorMessage).toContain('Probe skipped');
      expect(result.errorMessage).toContain('Image generation models');
      expect(result.diagnosticTip).toContain('chat model');
    });

    it('automatically picks a safe chat model if primary connection model is non-chat', async () => {
      const { sendOpenAICompatibleMessageNonStream } = await import('@/services/api/openaiCompatibleApi');
      vi.mocked(sendOpenAICompatibleMessageNonStream).mockResolvedValue(undefined as never);

      const mixedConn: ThirdPartyConnection = {
        ...mockConnection,
        id: 'mixed-conn',
        modelId: 'text-embedding-3-large',
        models: [
          { id: 'text-embedding-3-large', name: 'Embedding' },
          { id: 'gpt-4o', name: 'GPT-4o' },
        ],
      };

      const result = await probeThirdPartyConnection(mixedConn);
      expect(result.status).toBe('success');
      expect(result.modelId).toBe('gpt-4o');
    });
  });

  describe('getModelProbeSafety', () => {
    it('identifies image generation models as unsafe for chat probe', () => {
      expect(getModelProbeSafety('dall-e-3').isSafe).toBe(false);
      expect(getModelProbeSafety('flux-schnell').isSafe).toBe(false);
      expect(getModelProbeSafety('stable-diffusion-v3').isSafe).toBe(false);
    });

    it('identifies video and audio models as unsafe for chat probe', () => {
      expect(getModelProbeSafety('sora-1.0').isSafe).toBe(false);
      expect(getModelProbeSafety('whisper-large-v3').isSafe).toBe(false);
    });

    it('identifies embedding and rerank models as unsafe for chat probe', () => {
      expect(getModelProbeSafety('text-embedding-3-small').isSafe).toBe(false);
      expect(getModelProbeSafety('bge-reranker-large').isSafe).toBe(false);
    });

    it('marks normal chat and reasoning models as safe', () => {
      expect(getModelProbeSafety('gpt-4o').isSafe).toBe(true);
      expect(getModelProbeSafety('deepseek-r1').isSafe).toBe(true);
      expect(getModelProbeSafety('claude-3-7-sonnet').isSafe).toBe(true);
    });
  });
});
