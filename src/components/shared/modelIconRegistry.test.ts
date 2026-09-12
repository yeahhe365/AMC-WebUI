import { describe, expect, it } from 'vitest';
import { CHERRY_MODEL_LOGOS, CHERRY_PROVIDER_LOGOS, resolveIconRef } from './modelIconRegistry';

describe('modelIconRegistry', () => {
  it('loads cherry models and providers via Vite glob', () => {
    expect(Object.keys(CHERRY_MODEL_LOGOS).length).toBeGreaterThan(150);
    expect(Object.keys(CHERRY_PROVIDER_LOGOS).length).toBeGreaterThan(150);
  });

  describe('resolveIconRef pattern boundaries and dedicated marks', () => {
    it('matches exact GPT sub-series icons', () => {
      expect(resolveIconRef('gpt-5.6-sol').key).toBe('gpt-5-6-sol');
      expect(resolveIconRef('gpt-5-6-luna').key).toBe('gpt-5-6-luna');
      expect(resolveIconRef('gpt-4o').key).toBe('gpt-4o');
      expect(resolveIconRef('gpt-4o-mini').key).toBe('gpt-4o-mini');
      expect(resolveIconRef('gpt-4-turbo').key).toBe('gpt-4-turbo');
    });

    it('matches dedicated model families', () => {
      expect(resolveIconRef('claude-3-5-sonnet-20241022').key).toBe('claude');
      expect(resolveIconRef('dall-e-3').key).toBe('dalle');
      expect(resolveIconRef('sora-2').key).toBe('sora');
      expect(resolveIconRef('flux-1-schnell').key).toBe('flux');
      expect(resolveIconRef('ideogram-v2').key).toBe('ideogram');
      expect(resolveIconRef('kling-v1').key).toBe('kling');
      expect(resolveIconRef('kolors').key).toBe('kolors');
      expect(resolveIconRef('suno-v3').key).toBe('suno');
    });

    it('respects pattern boundary safety (avoiding misfires)', () => {
      // SensNova vs Nova
      expect(resolveIconRef('sensenova-v6').key).toBe('sensenova');
      expect(resolveIconRef('nova-pro').key).toBe('nova');

      // Wan vs Taiwan
      expect(resolveIconRef('wan-2-1').key).toBe('qwen');
      expect(resolveIconRef('taiwan-llm').key).not.toBe('qwen');

      // Ling vs Spring
      expect(resolveIconRef('ling-1t').key).toBe('ling');
      expect(resolveIconRef('spring-1t').key).not.toBe('ling');

      // Seed vs Linseed
      expect(resolveIconRef('seed-2.0-lite').key).toBe('doubao');
      expect(resolveIconRef('linseed-embedding').key).not.toBe('doubao');

      // Hunyuan / hy3
      expect(resolveIconRef('hy-role').key).toBe('hunyuan');
      expect(resolveIconRef('hy3-preview').key).toBe('hunyuan');
    });

    it('falls back to provider inference when no dedicated mark exists', () => {
      expect(resolveIconRef('meta-llama/llama-3.3-70b-instruct').key).toBe('meta');
      expect(resolveIconRef('mistralai/codestral-2501').key).toBe('mistral');
      expect(resolveIconRef('baai/bge-m3').key).toBe('baai');
    });

    it('falls back to provider/template ID for unknown models', () => {
      expect(resolveIconRef('my-arbitrary-model', 'openrouter').key).toBe('openrouter');
      expect(resolveIconRef('my-arbitrary-model', 'siliconflow').key).toBe('silicon');
      expect(resolveIconRef('my-arbitrary-model', undefined, 'kimi').key).toBe('moonshot');
      expect(resolveIconRef('my-arbitrary-model', 'custom').key).toBe('custom');
    });
  });
});
