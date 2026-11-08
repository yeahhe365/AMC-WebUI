import { describe, expect, it } from 'vitest';
import { getDefaultModelOptions } from './defaultModelOptions';

describe('getDefaultModelOptions', () => {
  it('includes the current Gemini 3.8 Live models in pinned defaults and omits 3.1 Flash Live', () => {
    const models = getDefaultModelOptions();

    expect(models.some((model) => model.id === 'gemini-3.8-live')).toBe(true);
    expect(models.some((model) => model.id === 'gemini-3.8-live-extended-thinking')).toBe(true);
    expect(models.some((model) => model.id === 'gemini-3.1-flash-live-preview')).toBe(false);
  });

  it('includes Gemini Robotics-ER 2 in pinned defaults', () => {
    const models = getDefaultModelOptions();

    expect(models.some((model) => model.id === 'gemini-robotics-er-2-preview')).toBe(true);
  });

  it('keeps only the supported TTS defaults pinned', () => {
    const models = getDefaultModelOptions();
    const ttsIds = models
      .filter((model) => model.id.includes('-tts'))
      .map((model) => model.id)
      .sort();

    expect(ttsIds).toEqual(['gemini-3.8-flash-lite-tts', 'gemini-3.8-flash-tts']);
  });

  it('offers Nano Banana 2.1 in the image group', () => {
    const models = getDefaultModelOptions();
    const nano = models.find((model) => model.id === 'gemini-nano-banana-2.1');

    expect(nano).toBeDefined();
    expect(nano?.name).toBe('Nano Banana 2.1');
  });

  it('uses Google’s “Nano Banana 2 Lite” name for the lite image model', () => {
    const models = getDefaultModelOptions();
    const lite = models.find((model) => model.id === 'gemini-3.1-flash-lite-image');

    expect(lite?.name).toBe('Nano Banana 2 Lite');
  });

  it('does not offer the shut-down Gemini 2.0 models', () => {
    const models = getDefaultModelOptions();

    expect(models.some((model) => model.id === 'gemini-2.0-flash')).toBe(false);
  });

  it('does not include removed Imagen models', () => {
    const models = getDefaultModelOptions();

    expect(models.some((model) => model.id.includes('imagen'))).toBe(false);
  });

  it('does not include removed Gemini 2.5 Flash preview models', () => {
    const models = getDefaultModelOptions();

    expect(models.some((model) => model.id === 'gemini-2.5-flash-preview-09-2025')).toBe(false);
    expect(models.some((model) => model.id === 'gemini-2.5-flash-lite-preview-09-2025')).toBe(false);
    expect(models.some((model) => model.id === 'gemini-2.5-flash-native-audio-preview-12-2025')).toBe(false);
  });

  it('does not include removed Gemini 3 Flash', () => {
    const models = getDefaultModelOptions();

    expect(models.some((model) => model.id === 'gemini-3-flash-preview')).toBe(false);
    expect(models.some((model) => model.id === 'gemini-3-flash')).toBe(false);
  });

  it('does not include removed Gemini 3.1 Flash Lite, 3.5 Flash or 3.6 Flash text models', () => {
    const models = getDefaultModelOptions();

    expect(models.some((model) => model.id === 'gemini-3.1-flash-lite')).toBe(false);
    expect(models.some((model) => model.id === 'gemini-3.5-flash')).toBe(false);
    expect(models.some((model) => model.id === 'gemini-3.6-flash')).toBe(false);
    expect(models.some((model) => model.id === 'gemini-3.5-flash-lite')).toBe(true);
  });

  it('includes Gemini 3.8 Flash and Gemini 3.5 Transcribe in pinned defaults, and omits Gemini 3.7 Flash by default', () => {
    const models = getDefaultModelOptions();

    expect(models.some((model) => model.id === 'gemini-3.8-flash')).toBe(true);
    expect(models.some((model) => model.id === 'gemini-3.7-flash')).toBe(false);
    expect(models.some((model) => model.id === 'gemini-3.5-transcribe')).toBe(true);
  });

  it('keeps preview ids but omits Preview from default display names', () => {
    const models = getDefaultModelOptions();

    expect(models.some((model) => model.id.includes('preview'))).toBe(true);
    expect(models.every((model) => !/\bpreview\b/i.test(model.name))).toBe(true);
  });

  it('includes Gemini 4 Argon in top pinned defaults as the first model', () => {
    const models = getDefaultModelOptions();
    const argon = models.find((model) => model.id === 'gemini-4-argon');

    expect(argon).toBeDefined();
    expect(argon?.isPinned).toBe(true);
    expect(models[0]?.id).toBe('gemini-4-argon');
  });
});
