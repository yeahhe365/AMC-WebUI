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

  it('leads the image section with the recommended Nano Banana 2.1 and drops the deprecated Nano Banana 2', () => {
    const models = getDefaultModelOptions();
    const imageIds = models
      .filter((model) => model.id.includes('image') || model.id.includes('nano-banana'))
      .map((model) => model.id);

    // gemini-3.1-flash-image has been deprecated in favour of gemini-nano-banana-2.1,
    // so the picker must lead with 2.1 and stop advertising the old id.
    expect(imageIds).toEqual(['gemini-nano-banana-2.1', 'gemini-3-pro-image', 'gemini-3.1-flash-lite-image']);
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

  it('does not include deprecated Gemini 3.1 Flash Lite or auto-routed 3.5 Flash', () => {
    const models = getDefaultModelOptions();

    // 3.1 Flash-Lite has a shutdown date (2027-05-07); 3.5 Flash no longer exists in
    // AI Studio and routes every API call to 3.6 Flash, so listing it would lie.
    expect(models.some((model) => model.id === 'gemini-3.1-flash-lite')).toBe(false);
    expect(models.some((model) => model.id === 'gemini-3.5-flash')).toBe(false);
    expect(models.some((model) => model.id === 'gemini-3.5-flash-lite')).toBe(true);
  });

  it('keeps Gemini 3.6 Flash selectable — Stable and served, with no shutdown date', () => {
    const models = getDefaultModelOptions();

    // Released 2026-07-21; Google lists it as Stable with "No shutdown date announced",
    // and 3.5 Flash auto-routes *to* it, so it must stay selectable as an unpinned model.
    const flash36 = models.find((model) => model.id === 'gemini-3.6-flash');
    expect(flash36).toBeDefined();
    expect(flash36?.isPinned).toBe(false);
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

  it('pins both Gemini 4 flagships, with Carbon first and Argon right behind it', () => {
    const models = getDefaultModelOptions();
    const carbon = models.find((model) => model.id === 'gemini-4-carbon');
    const argon = models.find((model) => model.id === 'gemini-4-argon');

    expect(carbon).toBeDefined();
    expect(argon).toBeDefined();
    expect(carbon?.isPinned).toBe(true);
    expect(argon?.isPinned).toBe(true);
    expect(models[0]?.id).toBe('gemini-4-carbon');
    expect(models[1]?.id).toBe('gemini-4-argon');
  });
});
