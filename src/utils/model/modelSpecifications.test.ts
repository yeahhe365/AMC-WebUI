import { describe, expect, it } from 'vitest';
import { getModelSpecification, formatThinkingLevelSpec } from './modelSpecifications';
import type { ModelOption } from '@/types';
import { getTranslator } from '@/i18n/coreTranslations';

describe('modelSpecifications', () => {
  it('resolves specifications for Gemini 3.1 Pro text model', () => {
    const model: ModelOption = {
      id: 'gemini-3.1-pro-preview',
      name: 'Gemini 3.1 Pro Preview',
    };

    const spec = getModelSpecification(model);
    expect(spec.providerDisplayName).toBe('Google Gemini');
    expect(spec.contextWindow).toContain('1M');
    expect(spec.maxOutput).toContain('64K');
    expect(spec.isReasoning).toBe(true);
    expect(spec.isMultimodalVision).toBe(true);
    expect(spec.isToolSupported).toBe(true);
    expect(spec.thinkingLevelRange).toBe('Low ~ High (默认 High)');
    expect(spec.thinkingBudgetRange).toBeUndefined();
    expect(spec.capabilities.some((c) => c.id === 'reasoning')).toBe(true);
    expect(spec.capabilities.some((c) => c.id === 'vision')).toBe(true);
    expect(spec.capabilities.some((c) => c.id === 'tools')).toBe(true);
  });

  it('resolves specifications for Gemini 3.8 Flash', () => {
    const model: ModelOption = {
      id: 'gemini-3.8-flash',
      name: 'Gemini 3.8 Flash',
    };

    const spec = getModelSpecification(model);
    expect(spec.contextWindow).toContain('1M');
    expect(spec.maxOutput).toContain('64K');
    expect(spec.isReasoning).toBe(true);
    expect(spec.thinkingLevelRange).toBe('Low ~ High (默认 Medium)');
    expect(spec.thinkingBudgetRange).toBeUndefined();
    expect(spec.capabilities.some((c) => c.id === 'reasoning')).toBe(true);
  });

  it('resolves specifications for Gemini 3.5 Flash-Lite', () => {
    const model: ModelOption = {
      id: 'gemini-3.5-flash-lite',
      name: 'Gemini 3.5 Flash-Lite',
    };

    const spec = getModelSpecification(model);
    expect(spec.contextWindow).toContain('1M');
    expect(spec.maxOutput).toContain('64K');
    expect(spec.thinkingLevelRange).toBe('Minimal ~ High (默认 Minimal)');
    expect(spec.thinkingBudgetRange).toBeUndefined();
  });

  it('resolves specifications for Gemini Robotics-ER 2', () => {
    const model: ModelOption = {
      id: 'gemini-robotics-er-2-preview',
      name: 'Gemini Robotics-ER 2',
    };

    const spec = getModelSpecification(model);
    expect(spec.contextWindow).toContain('128K');
    expect(spec.maxOutput).toContain('64K');
    expect(spec.thinkingLevelRange).toBe('Low ~ High (推荐 Medium)');
    expect(spec.thinkingBudgetRange).toBeUndefined();
  });

  it('resolves specifications for Gemini 3.1 Flash Live', () => {
    const model: ModelOption = {
      id: 'gemini-3.1-flash-live-preview',
      name: 'Gemini 3.1 Flash Live',
    };

    const spec = getModelSpecification(model);
    expect(spec.contextWindow).toContain('128K');
    expect(spec.maxOutput).toContain('64K');
    expect(spec.thinkingLevelRange).toBe('Minimal ~ High (默认 Minimal)');
    expect(spec.thinkingBudgetRange).toBeUndefined();
  });

  it('resolves specifications for Gemini 3.1 Flash TTS (no thinking)', () => {
    const model: ModelOption = {
      id: 'gemini-3.1-flash-tts-preview',
      name: 'Gemini 3.1 Flash TTS',
    };

    const spec = getModelSpecification(model);
    expect(spec.contextWindow).toContain('8K');
    expect(spec.maxOutput).toContain('16K');
    expect(spec.thinkingLevelRange).toBeUndefined();
    expect(spec.thinkingBudgetRange).toBeUndefined();
    expect(spec.capabilities.some((c) => c.id === 'reasoning')).toBe(false);
  });

  it('resolves specifications for Image models (Nano Banana series)', () => {
    const flashImage = getModelSpecification({ id: 'gemini-3.1-flash-image-preview', name: 'Nano Banana 2' });
    expect(flashImage.contextWindow).toContain('128K');
    expect(flashImage.maxOutput).toContain('32K');
    expect(flashImage.thinkingLevelRange).toBe('Minimal / High (默认 Minimal)');
    expect(flashImage.thinkingBudgetRange).toBeUndefined();

    const liteImage = getModelSpecification({ id: 'gemini-3.1-flash-lite-image', name: 'Nano Banana Lite' });
    expect(liteImage.contextWindow).toContain('64K');
    expect(liteImage.maxOutput).toContain('4K');
    expect(liteImage.thinkingLevelRange).toBe('Minimal / High (默认 Minimal)');
    expect(liteImage.thinkingBudgetRange).toBeUndefined();

    const proImage = getModelSpecification({ id: 'gemini-3-pro-image-preview', name: 'Nano Banana Pro' });
    expect(proImage.contextWindow).toContain('64K');
    expect(proImage.maxOutput).toContain('32K');
    expect(proImage.thinkingLevelRange).toBe('内置思考（不可调节）');
    expect(proImage.thinkingBudgetRange).toBeUndefined();
  });

  it('resolves input modalities (vision, audio, video) and pdf capability for multimodal models', () => {
    const flashModel = getModelSpecification({ id: 'gemini-3.8-flash', name: 'Gemini 3.8 Flash' });
    expect(flashModel.modalities.map((m) => m.id)).toEqual(['vision', 'audio', 'video']);
    expect(flashModel.capabilities.some((c) => c.id === 'pdf')).toBe(true);

    const deepseekModel = getModelSpecification({ id: 'deepseek-reasoner', name: 'DeepSeek R1' });
    expect(deepseekModel.modalities).toEqual([]);
    expect(deepseekModel.capabilities.some((c) => c.id === 'pdf')).toBe(false);
  });

  it('resolves specifications for Gemma 4 models with reasoning', () => {
    const model: ModelOption = {
      id: 'gemma-4-31b-it',
      name: 'Gemma 4 31B IT',
    };

    const spec = getModelSpecification(model);
    expect(spec.contextWindow).toContain('256K');
    expect(spec.maxOutput).toContain('8K');
    expect(spec.isReasoning).toBe(true);
    expect(spec.thinkingLevelRange).toBe('Minimal / High (默认 Minimal)');
    expect(spec.thinkingBudgetRange).toBeUndefined();
    expect(spec.capabilities.some((c) => c.id === 'reasoning')).toBe(true);
  });

  it('resolves specifications for Claude 3.7 Sonnet with budget range', () => {
    const model: ModelOption = {
      id: 'claude-3-7-sonnet-20250219',
      name: 'Claude 3.7 Sonnet',
      templateId: 'anthropic',
    };

    const spec = getModelSpecification(model);
    expect(spec.providerDisplayName).toBe('Anthropic');
    expect(spec.contextWindow).toContain('200K');
    expect(spec.isReasoning).toBe(true);
    expect(spec.isMultimodalVision).toBe(true);
    expect(spec.thinkingBudgetRange).toBe('1,024 ~ 64,000');
    expect(spec.thinkingLevelRange).toBeUndefined();
  });

  it('resolves specifications for DeepSeek R1', () => {
    const model: ModelOption = {
      id: 'deepseek-reasoner',
      name: 'DeepSeek R1',
      templateId: 'deepseek',
    };

    const spec = getModelSpecification(model);
    expect(spec.providerDisplayName).toBe('DeepSeek');
    expect(spec.isReasoning).toBe(true);
    expect(spec.capabilities.some((c) => c.id === 'reasoning')).toBe(true);
  });

  it('resolves specifications for latest OpenAI GPT-5 and o4 models', () => {
    const gpt5Model: ModelOption = {
      id: 'gpt-5.6-sol',
      name: 'GPT-5.6 Sol',
    };
    const gpt5Spec = getModelSpecification(gpt5Model);
    expect(gpt5Spec.providerDisplayName).toBe('OpenAI');
    expect(gpt5Spec.contextWindow).toContain('200K');
    expect(gpt5Spec.maxOutput).toContain('100K');
    expect(gpt5Spec.isReasoning).toBe(true);
    expect(gpt5Spec.isMultimodalVision).toBe(true);

    const o4Model: ModelOption = {
      id: 'o4-mini',
      name: 'o4-mini',
    };
    const o4Spec = getModelSpecification(o4Model);
    expect(o4Spec.providerDisplayName).toBe('OpenAI');
    expect(o4Spec.contextWindow).toContain('200K');
    expect(o4Spec.maxOutput).toContain('100K');
    expect(o4Spec.isReasoning).toBe(true);
    expect(o4Spec.isMultimodalVision).toBe(true);
    expect(o4Spec.description).toContain('next-generation reasoning model');
  });

  it('resolves custom provider connection names', () => {
    const model: ModelOption = {
      id: 'custom-gpt-4o',
      name: 'Company GPT-4o',
      connectionName: 'Enterprise Gateway',
    };

    const spec = getModelSpecification(model);
    expect(spec.providerDisplayName).toBe('Enterprise Gateway');
  });

  it('resolves localized description keys and thinking level specs for Gemini and fixed models', () => {
    const tZh = getTranslator('zh');
    const tEn = getTranslator('en');

    const geminiProSpec = getModelSpecification({ id: 'gemini-3.1-pro-preview', name: 'Gemini 3.1 Pro' });
    expect(geminiProSpec.descriptionKey).toBe('modelDescGemini31Pro');
    expect(formatThinkingLevelSpec(geminiProSpec.thinkingLevelSpec, tZh)).toBe('低 ~ 高 (默认 高)');
    expect(formatThinkingLevelSpec(geminiProSpec.thinkingLevelSpec, tEn)).toBe('Low ~ High (Default High)');

    const flashSpec = getModelSpecification({ id: 'gemini-3.8-flash', name: 'Gemini 3.8 Flash' });
    expect(flashSpec.descriptionKey).toBe('modelDescGemini3Flash');
    expect(formatThinkingLevelSpec(flashSpec.thinkingLevelSpec, tZh)).toBe('低 ~ 高 (默认 中)');
    expect(formatThinkingLevelSpec(flashSpec.thinkingLevelSpec, tEn)).toBe('Low ~ High (Default Medium)');

    const flashLiteSpec = getModelSpecification({ id: 'gemini-3.5-flash-lite', name: 'Gemini 3.5 Flash-Lite' });
    expect(flashLiteSpec.descriptionKey).toBe('modelDescGemini35FlashLite');
    expect(formatThinkingLevelSpec(flashLiteSpec.thinkingLevelSpec, tZh)).toBe('极简 ~ 高 (默认 极简)');
    expect(formatThinkingLevelSpec(flashLiteSpec.thinkingLevelSpec, tEn)).toBe('Minimal ~ High (Default Minimal)');

    const roboticsSpec = getModelSpecification({ id: 'gemini-robotics-er-2-preview', name: 'Gemini Robotics ER-2' });
    expect(roboticsSpec.descriptionKey).toBe('modelDescGeminiRobotics');
    expect(formatThinkingLevelSpec(roboticsSpec.thinkingLevelSpec, tZh)).toBe('低 ~ 高 (推荐 中)');
    expect(formatThinkingLevelSpec(roboticsSpec.thinkingLevelSpec, tEn)).toBe('Low ~ High (Recommended Medium)');

    const fixedImageSpec = getModelSpecification({ id: 'gemini-3-pro-image-preview', name: 'Nano Banana Pro' });
    expect(fixedImageSpec.descriptionKey).toBe('modelDescGeminiImage');
    expect(formatThinkingLevelSpec(fixedImageSpec.thinkingLevelSpec, tZh)).toBe('内置思考（不可调节）');
    expect(formatThinkingLevelSpec(fixedImageSpec.thinkingLevelSpec, tEn)).toBe('Built-in (Fixed)');
  });
});
