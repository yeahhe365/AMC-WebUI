import { describe, expect, it } from 'vitest';
import { getDefaultModelOptions } from './defaultModelOptions';

describe('getDefaultModelOptions', () => {
  it('includes the current Gemini 3.1 Flash Live model in pinned defaults', () => {
    const models = getDefaultModelOptions();

    expect(models.some((model) => model.id === 'gemini-3.1-flash-live-preview')).toBe(true);
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

    expect(ttsIds).toEqual(['gemini-3.1-flash-tts-preview']);
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
});
