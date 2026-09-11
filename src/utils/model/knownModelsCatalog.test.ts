import { describe, it, expect } from 'vitest';
import {
  normalizeModelId,
  formatContextWindow,
  KNOWN_MODELS_CATALOG,
  inferModelCapabilities,
  enrichModelMetadata,
} from './knownModelsCatalog';

describe('knownModelsCatalog', () => {
  describe('formatContextWindow', () => {
    it('formats tokens into K and M units correctly', () => {
      expect(formatContextWindow(null)).toBe('');
      expect(formatContextWindow(0)).toBe('');
      expect(formatContextWindow(8192)).toBe('8K');
      expect(formatContextWindow(32768)).toBe('33K');
      expect(formatContextWindow(128000)).toBe('128K');
      expect(formatContextWindow(200000)).toBe('200K');
      expect(formatContextWindow(1000000)).toBe('1M');
      expect(formatContextWindow(1048576)).toBe('1M');
      expect(formatContextWindow(1500000)).toBe('1.5M');
    });
  });

  describe('normalizeModelId', () => {
    it('strips org/provider prefixes', () => {
      expect(normalizeModelId('openai/gpt-4o')).toBe('gpt-4o');
      expect(normalizeModelId('anthropic/claude-3-5-sonnet')).toBe('claude-3-5-sonnet');
      expect(normalizeModelId('deepseek-ai/deepseek-v3')).toBe('deepseek-v3');
      expect(normalizeModelId('meta-llama/llama-3.3-70b-instruct')).toBe('llama-3.3-70b-instruct');
    });

    it('strips aws bedrock prefixes', () => {
      expect(normalizeModelId('us.anthropic.claude-3-5-sonnet-20241022-v2:0')).toBe('claude-3-5-sonnet');
      expect(normalizeModelId('anthropic.claude-3-haiku-20240307-v1:0')).toBe('claude-3-haiku');
    });

    it('strips date suffixes and tags', () => {
      expect(normalizeModelId('gpt-4o-2024-08-06')).toBe('gpt-4o');
      expect(normalizeModelId('gpt-4o-mini-2024-07-18')).toBe('gpt-4o-mini');
      expect(normalizeModelId('claude-3-7-sonnet-20250219')).toBe('claude-3-7-sonnet');
      expect(normalizeModelId('deepseek-r1:free')).toBe('deepseek-r1');
    });
  });

  describe('KNOWN_MODELS_CATALOG', () => {
    it('has valid entries for mainstream models', () => {
      expect(KNOWN_MODELS_CATALOG['gpt-4o']).toBeDefined();
      expect(KNOWN_MODELS_CATALOG['gpt-4o'].capabilities.vision).toBe(true);
      expect(KNOWN_MODELS_CATALOG['gpt-4o'].capabilities.thinking).toBe(false);

      expect(KNOWN_MODELS_CATALOG['deepseek-r1']).toBeDefined();
      expect(KNOWN_MODELS_CATALOG['deepseek-r1'].capabilities.thinking).toBe(true);

      expect(KNOWN_MODELS_CATALOG['claude-3-7-sonnet']).toBeDefined();
      expect(KNOWN_MODELS_CATALOG['claude-3-7-sonnet'].capabilities.thinking).toBe(true);
      expect(KNOWN_MODELS_CATALOG['claude-3-7-sonnet'].capabilities.vision).toBe(true);
    });
  });

  describe('inferModelCapabilities', () => {
    it('infers thinking, vision, and context window from raw ID when not in catalog', () => {
      const customThinking = inferModelCapabilities('my-custom-r1-model-128k');
      expect(customThinking.capabilities.thinking).toBe(true);
      expect(customThinking.contextWindow).toBe(128000);

      const customVision = inferModelCapabilities('org/company-vl-model-1m');
      expect(customVision.capabilities.vision).toBe(true);
      expect(customVision.contextWindow).toBe(1000000);
    });
  });

  describe('enrichModelMetadata', () => {
    it('enriches catalog known models with contextWindow and capabilities', () => {
      const enriched = enrichModelMetadata({ id: 'openai/gpt-4o-2024-08-06' });
      expect(enriched.id).toBe('openai/gpt-4o-2024-08-06');
      expect(enriched.name).toBe('GPT-4o');
      expect(enriched.contextWindow).toBe(128000);
      expect(enriched.capabilities?.vision).toBe(true);
      expect(enriched.capabilities?.thinking).toBe(false);
      expect(enriched.enableThinking).toBe(false);
      expect(enriched.enableTools).toBe(true);
    });

    it('enriches DeepSeek R1 with thinking capability', () => {
      const enriched = enrichModelMetadata({ id: 'deepseek-reasoner' });
      expect(enriched.capabilities?.thinking).toBe(true);
      expect(enriched.enableThinking).toBe(true);
    });

    it('falls back gracefully to heuristics for completely unknown models', () => {
      const enriched = enrichModelMetadata({ id: 'custom-internal-model-32k' });
      expect(enriched.id).toBe('custom-internal-model-32k');
      expect(enriched.name).toBe('custom-internal-model-32k');
      expect(enriched.contextWindow).toBe(32000);
      expect(enriched.visibleInSelector).toBe(true);
    });
  });
});
