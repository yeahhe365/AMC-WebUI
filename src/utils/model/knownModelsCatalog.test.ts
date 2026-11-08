import { describe, it, expect } from 'vitest';
import {
  normalizeCanonicalModelId,
  formatContextWindow,
  KNOWN_MODELS_CATALOG,
  inferModelCapabilities,
  enrichModelMetadata,
  getOrInferModelCapabilities,
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

  describe('normalizeCanonicalModelId', () => {
    it('strips org/provider prefixes', () => {
      expect(normalizeCanonicalModelId('openai/gpt-4o')).toBe('gpt-4o');
      expect(normalizeCanonicalModelId('anthropic/claude-3-5-sonnet')).toBe('claude-3-5-sonnet');
      expect(normalizeCanonicalModelId('deepseek-ai/deepseek-v3')).toBe('deepseek-v3');
      expect(normalizeCanonicalModelId('meta-llama/llama-3.3-70b-instruct')).toBe('llama-3.3-70b-instruct');
    });

    it('strips aws bedrock prefixes', () => {
      expect(normalizeCanonicalModelId('us.anthropic.claude-3-5-sonnet-20241022-v2:0')).toBe('claude-3-5-sonnet');
      expect(normalizeCanonicalModelId('anthropic.claude-3-haiku-20240307-v1:0')).toBe('claude-3-haiku');
    });

    it('strips date suffixes and tags', () => {
      expect(normalizeCanonicalModelId('gpt-4o-2024-08-06')).toBe('gpt-4o');
      expect(normalizeCanonicalModelId('gpt-4o-mini-2024-07-18')).toBe('gpt-4o-mini');
      expect(normalizeCanonicalModelId('claude-3-7-sonnet-20250219')).toBe('claude-3-7-sonnet');
      expect(normalizeCanonicalModelId('deepseek-r1:free')).toBe('deepseek-r1');
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

      expect(KNOWN_MODELS_CATALOG['grok-4.6']).toBeDefined();
      expect(KNOWN_MODELS_CATALOG['grok-4.6'].contextWindow).toBe(500_000);
      expect(KNOWN_MODELS_CATALOG['grok-4.6'].capabilities.thinking).toBe(true);
      expect(KNOWN_MODELS_CATALOG['grok-4.6'].capabilities.vision).toBe(true);

      expect(KNOWN_MODELS_CATALOG['grok-build-0.1']).toBeDefined();
      expect(KNOWN_MODELS_CATALOG['grok-build-0.1'].contextWindow).toBe(256_000);
      expect(KNOWN_MODELS_CATALOG['grok-build-0.1'].capabilities.thinking).toBe(true);

      expect(KNOWN_MODELS_CATALOG['grok-4.5']).toBeDefined();
      expect(KNOWN_MODELS_CATALOG['grok-4.5'].contextWindow).toBe(500_000);

      expect(KNOWN_MODELS_CATALOG['grok-4.3']).toBeDefined();
      expect(KNOWN_MODELS_CATALOG['grok-4.3'].contextWindow).toBe(1_000_000);

      expect(KNOWN_MODELS_CATALOG['grok-4.20-0309-reasoning']).toBeDefined();
      expect(KNOWN_MODELS_CATALOG['grok-4.20-0309-reasoning'].contextWindow).toBe(1_000_000);
      expect(KNOWN_MODELS_CATALOG['grok-4.20-0309-reasoning'].capabilities.thinking).toBe(true);

      expect(KNOWN_MODELS_CATALOG['grok-420-reasoning']).toBeDefined();
      expect(KNOWN_MODELS_CATALOG['grok-420-reasoning'].contextWindow).toBe(1_000_000);
      expect(KNOWN_MODELS_CATALOG['grok-420-reasoning'].capabilities.thinking).toBe(true);
    });

    it('no longer lists the shut-down Gemini 2.x text models', () => {
      // 2.0 Flash was shut down 2026-06-01; 2.5 Pro / 2.5 Flash were retired on 2026-10-20.
      // Listing them let users pick an id the provider answers with a hard error.
      expect(KNOWN_MODELS_CATALOG['gemini-2.0-flash']).toBeUndefined();
      expect(KNOWN_MODELS_CATALOG['gemini-2.5-pro']).toBeUndefined();
      expect(KNOWN_MODELS_CATALOG['gemini-2.5-flash']).toBeUndefined();
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

      const o4Inferred = inferModelCapabilities('openai/o4-mini-preview');
      expect(o4Inferred.capabilities.thinking).toBe(true);
      expect(o4Inferred.ownedBy).toBe('openai');
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

  describe('Gemini 3 and Gemma model capabilities', () => {
    it('accurately identifies pure audio models (Transcribe, TTS, Live Translate) without vision tags', () => {
      const transcribeCaps = getOrInferModelCapabilities({ id: 'gemini-3.5-transcribe' });
      expect(transcribeCaps.vision).toBe(false);
      expect(transcribeCaps.audio).toBe(true);
      expect(transcribeCaps.tools).toBe(false);

      const transcribeLiveCaps = getOrInferModelCapabilities({ id: 'gemini-3.5-transcribe-live' });
      expect(transcribeLiveCaps.vision).toBe(false);
      expect(transcribeLiveCaps.audio).toBe(true);

      const liveTranslateCaps = getOrInferModelCapabilities({ id: 'gemini-3.5-live-translate-preview' });
      expect(liveTranslateCaps.vision).toBe(false);
      expect(liveTranslateCaps.audio).toBe(true);

      const ttsCaps = getOrInferModelCapabilities({ id: 'gemini-3.1-flash-tts-preview' });
      expect(ttsCaps.vision).toBe(false);
      expect(ttsCaps.audio).toBe(true);
    });

    it('accurately identifies Nano Banana image generation models with image, vision, and thinking tags', () => {
      const nanoBanana2 = getOrInferModelCapabilities({ id: 'gemini-3.1-flash-image' });
      expect(nanoBanana2.image).toBe(true);
      expect(nanoBanana2.vision).toBe(true);
      expect(nanoBanana2.thinking).toBe(true);

      const nanoBananaLite = getOrInferModelCapabilities({ id: 'gemini-3.1-flash-lite-image' });
      expect(nanoBananaLite.image).toBe(true);
      expect(nanoBananaLite.vision).toBe(true);
      expect(nanoBananaLite.thinking).toBe(true);

      const nanoBananaPro = getOrInferModelCapabilities({ id: 'gemini-3-pro-image' });
      expect(nanoBananaPro.image).toBe(true);
      expect(nanoBananaPro.vision).toBe(true);
      expect(nanoBananaPro.thinking).toBe(true);
    });

    it('accurately identifies Gemma 4 models with vision and thinking tags', () => {
      const gemma31b = getOrInferModelCapabilities({ id: 'gemma-4-31b-it' });
      expect(gemma31b.vision).toBe(true);
      expect(gemma31b.thinking).toBe(true);

      const gemma26b = getOrInferModelCapabilities({ id: 'gemma-4-26b-a4b-it' });
      expect(gemma26b.vision).toBe(true);
      expect(gemma26b.thinking).toBe(true);
    });

    it('accurately identifies Gemini 3.8 Live models with vision, audio, and thinking tags', () => {
      const live = getOrInferModelCapabilities({ id: 'gemini-3.8-live' });
      expect(live.vision).toBe(true);
      expect(live.audio).toBe(true);
      expect(live.thinking).toBe(true);

      const liveThinking = getOrInferModelCapabilities({ id: 'gemini-3.8-live-extended-thinking' });
      expect(liveThinking.vision).toBe(true);
      expect(liveThinking.audio).toBe(true);
      expect(liveThinking.thinking).toBe(true);
    });
  });
});
