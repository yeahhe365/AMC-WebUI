import { describe, it, expect } from 'vitest';
import {
  normalizeCanonicalModelId,
  formatContextWindow,
  KNOWN_MODELS_CATALOG,
  inferModelCapabilities,
  enrichModelMetadata,
  getOrInferModelCapabilities,
} from './knownModelsCatalog';
import { ANTHROPIC_MODELS } from './catalogs/anthropic';
import { OPENAI_MODELS } from './catalogs/openai';
import { DEEPSEEK_MODELS } from './catalogs/deepseek';
import { DOMESTIC_MODELS } from './catalogs/domestic';
import { OPENSOURCE_MODELS } from './catalogs/opensource';

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
      expect(normalizeCanonicalModelId('openai/gpt-6-astra')).toBe('gpt-6-astra');
      expect(normalizeCanonicalModelId('anthropic/claude-opus-5-5')).toBe('claude-opus-5-5');
      expect(normalizeCanonicalModelId('deepseek-ai/deepseek-flash')).toBe('deepseek-flash');
      expect(normalizeCanonicalModelId('meta-llama/Llama-4-Scout-17B-16E-Instruct')).toBe(
        'llama-4-scout-17b-16e-instruct',
      );
    });

    it('strips aws bedrock prefixes', () => {
      expect(normalizeCanonicalModelId('us.anthropic.claude-haiku-4-5-20251001-v1:0')).toBe('claude-haiku-4-5');
      expect(normalizeCanonicalModelId('anthropic.claude-3-haiku-20240307-v1:0')).toBe('claude-3-haiku');
    });

    it('strips date suffixes and tags', () => {
      expect(normalizeCanonicalModelId('gpt-6-astra-2026-05-01')).toBe('gpt-6-astra');
      expect(normalizeCanonicalModelId('claude-opus-5-5-20261001')).toBe('claude-opus-5-5');
      expect(normalizeCanonicalModelId('grok-4.6:free')).toBe('grok-4.6');
      expect(normalizeCanonicalModelId('kimi-k3.1-pro:extended')).toBe('kimi-k3.1-pro');
    });
  });

  describe('KNOWN_MODELS_CATALOG', () => {
    it('has valid entries for mainstream models', () => {
      expect(KNOWN_MODELS_CATALOG['gpt-6-astra']).toBeDefined();
      expect(KNOWN_MODELS_CATALOG['gpt-6-astra'].contextWindow).toBe(1_050_000);
      expect(KNOWN_MODELS_CATALOG['gpt-6-astra'].maxOutputTokens).toBe(128_000);
      expect(KNOWN_MODELS_CATALOG['gpt-6-astra'].capabilities.vision).toBe(true);
      expect(KNOWN_MODELS_CATALOG['gpt-6-astra'].capabilities.thinking).toBe(true);

      expect(KNOWN_MODELS_CATALOG['claude-opus-5-5']).toBeDefined();
      expect(KNOWN_MODELS_CATALOG['claude-opus-5-5'].contextWindow).toBe(1_000_000);
      expect(KNOWN_MODELS_CATALOG['claude-opus-5-5'].capabilities.vision).toBe(true);
      expect(KNOWN_MODELS_CATALOG['claude-opus-5-5'].capabilities.thinking).toBe(true);

      expect(KNOWN_MODELS_CATALOG['deepseek-flash']).toBeDefined();
      expect(KNOWN_MODELS_CATALOG['deepseek-flash'].contextWindow).toBe(1_000_000);
      expect(KNOWN_MODELS_CATALOG['deepseek-flash'].capabilities.thinking).toBe(true);
      expect(KNOWN_MODELS_CATALOG['deepseek-flash'].capabilities.vision).toBe(true);
      expect(KNOWN_MODELS_CATALOG['deepseek-v4-pro'].capabilities.vision).toBe(false);

      expect(KNOWN_MODELS_CATALOG['qwen3.8-max']).toBeDefined();
      expect(KNOWN_MODELS_CATALOG['qwen3.8-max'].contextWindow).toBe(1_000_000);
      expect(KNOWN_MODELS_CATALOG['qwen3.8-max'].maxOutputTokens).toBe(131_072);

      expect(KNOWN_MODELS_CATALOG['glm-5.3']).toBeDefined();
      expect(KNOWN_MODELS_CATALOG['glm-5.3'].contextWindow).toBe(1_000_000);
      expect(KNOWN_MODELS_CATALOG['glm-5.3'].capabilities.vision).toBe(false);

      expect(KNOWN_MODELS_CATALOG['kimi-k3.1-pro']).toBeDefined();
      expect(KNOWN_MODELS_CATALOG['kimi-k3.1-pro'].contextWindow).toBe(1_048_576);

      expect(KNOWN_MODELS_CATALOG['llama-4-scout']).toBeDefined();
      expect(KNOWN_MODELS_CATALOG['llama-4-scout'].contextWindow).toBe(10_485_760);
      expect(KNOWN_MODELS_CATALOG['llama-4-scout'].capabilities.vision).toBe(true);

      expect(KNOWN_MODELS_CATALOG['grok-4.7']).toBeDefined();
      expect(KNOWN_MODELS_CATALOG['grok-4.7'].contextWindow).toBe(500_000);
      expect(KNOWN_MODELS_CATALOG['grok-4.7'].capabilities.thinking).toBe(true);
      expect(KNOWN_MODELS_CATALOG['grok-4.7'].capabilities.vision).toBe(true);

      expect(KNOWN_MODELS_CATALOG['grok-build-0.1']).toBeDefined();
      expect(KNOWN_MODELS_CATALOG['grok-build-0.1'].contextWindow).toBe(256_000);
      expect(KNOWN_MODELS_CATALOG['grok-build-0.1'].capabilities.vision).toBe(true);

      expect(KNOWN_MODELS_CATALOG['grok-4.3']).toBeDefined();
      expect(KNOWN_MODELS_CATALOG['grok-4.3'].contextWindow).toBe(1_000_000);
    });

    it('does not advertise retired or never-existing third-party model ids', () => {
      // Every id here is either shut down or was never a valid API model name, so
      // advertising it would show users a model that cannot be called.
      const retiredIds = [
        'claude-3-7-sonnet',
        'claude-3-5-sonnet',
        'claude-3-5-haiku',
        'claude-3-opus',
        'claude-3-haiku',
        'gpt-4o',
        'gpt-4o-mini',
        'gpt-4-turbo',
        'o1',
        'o3',
        'o3-mini',
        'chatgpt-4o-latest',
        'deepseek-chat',
        'deepseek-reasoner',
        'deepseek-v3',
        'deepseek-r1',
        'moonshot-v1-8k',
        'moonshot-v1-32k',
        'moonshot-v1-128k',
        'kimi-k1.5',
        'llama-3.1-405b-instruct',
        'llama-3.2-11b-vision-instruct',
        'llama-3.2-90b-vision-instruct',
        'pixtral-large-latest',
        'grok-3',
        'grok-2',
        'grok-420-reasoning',
        'qwen-2.5-72b-instruct',
        'qwq-32b',
        'glm-4-plus',
        'glm-zero-preview',
      ];
      for (const id of retiredIds) {
        expect(KNOWN_MODELS_CATALOG[id], `${id} should not be in the catalog`).toBeUndefined();
      }
    });

    it('keeps every entry internally consistent', () => {
      // Guards against typos that no vendor check would catch: an `id` that does not
      // point back into the map, a non-positive window, or an output cap above the
      // context window (Mistral xAI and Moonshot publish no cap, so the field is optional).
      const vendorMaps = {
        anthropic: ANTHROPIC_MODELS,
        openai: OPENAI_MODELS,
        deepseek: DEEPSEEK_MODELS,
        domestic: DOMESTIC_MODELS,
        opensource: OPENSOURCE_MODELS,
      };
      for (const [vendor, models] of Object.entries(vendorMaps)) {
        for (const [key, spec] of Object.entries(models)) {
          expect(models[spec.id], `${vendor}/${key}: spec.id must resolve to the same entry`).toBe(spec);
          expect(spec.name.length, `${vendor}/${key} needs a display name`).toBeGreaterThan(0);
          expect(Number.isInteger(spec.contextWindow)).toBe(true);
          expect(spec.contextWindow, `${vendor}/${key} context window`).toBeGreaterThan(0);
          expect(spec.ownedBy.length).toBeGreaterThan(0);
          if (spec.maxOutputTokens !== undefined) {
            expect(spec.maxOutputTokens).toBeGreaterThan(0);
            expect(spec.maxOutputTokens, `${vendor}/${key} output cap must fit the context`).toBeLessThanOrEqual(
              spec.contextWindow,
            );
          }
        }
      }
    });

    it('no longer lists shut-down Gemini 2.0 models but keeps the still-served 2.5 ones', () => {
      // 2.0 Flash was shut down on 2026-06-01. 2.5 Pro / 2.5 Flash shut down on
      // 2026-12-01 and 2.5 Flash-Lite has no shutdown date, so their metadata
      // must stay for ids that are already saved.
      expect(KNOWN_MODELS_CATALOG['gemini-2.0-flash']).toBeUndefined();
      expect(KNOWN_MODELS_CATALOG['gemini-2.5-pro']?.contextWindow).toBe(1_048_576);
      expect(KNOWN_MODELS_CATALOG['gemini-2.5-flash']?.contextWindow).toBe(1_048_576);
      // Google states 2.5 Flash-Lite is not deprecated and has no shutdown date —
      // it was only restricted to existing 2.5 users, so ids must keep resolving.
      expect(KNOWN_MODELS_CATALOG['gemini-2.5-flash-lite']?.contextWindow).toBe(1_048_576);
      expect(KNOWN_MODELS_CATALOG['gemini-2.5-flash-lite']?.maxOutputTokens).toBe(65_536);
    });

    it('drops the preview TTS model that Google retires on 2026-11-17', () => {
      // Never selectable in this app: the registry only ever offered the 3.8 TTS
      // models, which Google names as the replacement.
      expect(KNOWN_MODELS_CATALOG['gemini-3.1-flash-tts-preview']).toBeUndefined();
      expect(KNOWN_MODELS_CATALOG['gemini-3.8-flash-tts']?.contextWindow).toBe(8_192);
      expect(KNOWN_MODELS_CATALOG['gemini-3.8-flash-lite-tts']?.contextWindow).toBe(8_192);
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
      const enriched = enrichModelMetadata({ id: 'openai/gpt-6-astra-2026-05-01' });
      expect(enriched.id).toBe('openai/gpt-6-astra-2026-05-01');
      expect(enriched.name).toBe('GPT-6 Astra');
      expect(enriched.contextWindow).toBe(1_050_000);
      expect(enriched.capabilities?.vision).toBe(true);
      expect(enriched.capabilities?.thinking).toBe(true);
      expect(enriched.enableThinking).toBe(true);
      expect(enriched.enableTools).toBe(true);
    });

    it('enriches DeepSeek V4.1 Flash with thinking capability', () => {
      const enriched = enrichModelMetadata({ id: 'deepseek-flash' });
      expect(enriched.capabilities?.thinking).toBe(true);
      expect(enriched.enableThinking).toBe(true);
      expect(enriched.contextWindow).toBe(1_000_000);
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

      const ttsCaps = getOrInferModelCapabilities({ id: 'gemini-3.8-flash-tts' });
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
