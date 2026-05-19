import { describe, expect, it } from 'vitest';
import { MODELS_SUPPORTING_RAW_MODE } from '@/constants/modelConstants';
import {
  getDefaultThinkingLevelForModel,
  getModelCapabilities,
  isGemini3Model,
  shouldStripThinkingFromContext,
} from './modelCapabilities';

describe('raw mode support', () => {
  it('includes Gemini Robotics-ER 1.6', () => {
    expect(MODELS_SUPPORTING_RAW_MODE).toContain('gemini-robotics-er-1.6-preview');
  });
});

describe('isGemini3Model', () => {
  it('returns false for empty string', () => {
    expect(isGemini3Model('')).toBe(false);
  });

  it('returns true for gemini-3-flash-preview', () => {
    expect(isGemini3Model('gemini-3-flash-preview')).toBe(true);
  });

  it('returns true for gemini-3.5-flash', () => {
    expect(isGemini3Model('gemini-3.5-flash')).toBe(true);
    expect(isGemini3Model('models/gemini-3.5-flash')).toBe(true);
  });

  it('returns true for stable gemini-3-flash IDs', () => {
    expect(isGemini3Model('gemini-3-flash')).toBe(true);
    expect(isGemini3Model('models/gemini-3-flash')).toBe(true);
  });

  it('returns true for gemini-3-pro', () => {
    expect(isGemini3Model('gemini-3-pro-image-preview')).toBe(true);
  });

  it('returns true for gemini-3.1-flash', () => {
    expect(isGemini3Model('gemini-3.1-flash-lite')).toBe(true);
  });

  it('returns true for models/ prefixed IDs', () => {
    expect(isGemini3Model('models/gemini-3-flash-preview')).toBe(true);
  });

  it('returns false for gemini-2.5-flash', () => {
    expect(isGemini3Model('gemini-2.5-flash')).toBe(false);
  });

  it('is case insensitive', () => {
    expect(isGemini3Model('Gemini-3-Flash-Preview')).toBe(true);
  });
});

describe('getModelCapabilities', () => {
  it('treats flash live preview models as live audio models', () => {
    expect(getModelCapabilities('gemini-3.1-flash-live-preview').isNativeAudioModel).toBe(true);
  });

  it('does not mark Gemini 3.1 Flash TTS Preview as supporting thinking', () => {
    const capabilities = getModelCapabilities('gemini-3.1-flash-tts-preview');

    expect(capabilities.isTtsModel).toBe(true);
    expect(capabilities.supportsThinkingLevel).toBe(false);
  });

  it('marks Gemini Robotics-ER 1.6 as supporting thinking levels', () => {
    const capabilities = getModelCapabilities('gemini-robotics-er-1.6-preview');

    expect(capabilities.supportsThinkingLevel).toBe(true);
    expect(capabilities.isGemini3).toBe(false);
  });

  it('marks stable Gemini 3 Flash as supporting thinking levels', () => {
    const capabilities = getModelCapabilities('gemini-3-flash');

    expect(capabilities.isGemini3).toBe(true);
    expect(capabilities.supportsThinkingLevel).toBe(true);
  });

  it('exposes raw reasoning prefill support as a model capability', () => {
    expect(getModelCapabilities('gemini-3-flash-preview').supportsRawReasoningPrefill).toBe(true);
    expect(getModelCapabilities('gemini-3.5-flash').supportsRawReasoningPrefill).toBe(true);
    expect(getModelCapabilities('gemini-2.5-flash').supportsRawReasoningPrefill).toBe(false);
  });

  it('exposes interaction permissions so UI code does not branch on model families', () => {
    const textCapabilities = getModelCapabilities('gemini-3.1-pro-preview');
    const ttsCapabilities = getModelCapabilities('gemini-3.1-flash-tts-preview');
    const liveCapabilities = getModelCapabilities('gemini-3.1-flash-live-preview');
    const geminiImageCapabilities = getModelCapabilities('gemini-3.1-flash-image-preview');
    const imagenCapabilities = getModelCapabilities('imagen-4.0-generate-preview');

    expect(textCapabilities.permissions).toMatchObject({
      canAcceptAttachments: true,
      canUseCodeExecution: true,
      canUseUrlContext: true,
      canGenerateSuggestions: true,
      requiresTextPrompt: false,
    });
    expect(ttsCapabilities.permissions).toMatchObject({
      canAcceptAttachments: false,
      canUseTools: false,
      canGenerateSuggestions: false,
      requiresTextPrompt: true,
    });
    expect(liveCapabilities.permissions).toMatchObject({
      canAcceptAttachments: false,
      canUseGoogleSearch: true,
      canUseLocalPython: true,
      canUseCodeExecution: false,
      canGenerateSuggestions: false,
      requiresTextPrompt: false,
    });
    expect(geminiImageCapabilities.permissions).toMatchObject({
      canAcceptAttachments: true,
      canUseGoogleSearch: true,
      canUseCodeExecution: false,
      canGenerateSuggestions: false,
      requiresTextPrompt: true,
    });
    expect(imagenCapabilities.permissions).toMatchObject({
      canAcceptAttachments: false,
      canUseGoogleSearch: false,
      canUseTokenCount: true,
      requiresTextPrompt: true,
    });
  });

  it('exposes the latest Gemini 3.1 Flash Image ratios and sizes', () => {
    const capabilities = getModelCapabilities('gemini-3.1-flash-image-preview');

    expect(capabilities.supportedAspectRatios).toEqual(expect.arrayContaining(['1:4', '4:1', '1:8', '8:1']));
    expect(capabilities.supportedImageSizes).toEqual(expect.arrayContaining(['512', '1K', '2K', '4K']));
  });
});

describe('getDefaultThinkingLevelForModel', () => {
  it('defaults Gemini 3.1 Flash Live to MINIMAL', () => {
    expect(getDefaultThinkingLevelForModel('gemini-3.1-flash-live-preview')).toBe('MINIMAL');
  });

  it('defaults Gemini 3.1 Flash Image to MINIMAL', () => {
    expect(getDefaultThinkingLevelForModel('gemini-3.1-flash-image-preview')).toBe('MINIMAL');
  });

  it('keeps fallback thinking level for non-special models', () => {
    expect(getDefaultThinkingLevelForModel('gemini-2.5-flash', 'HIGH')).toBe('HIGH');
  });
});

describe('shouldStripThinkingFromContext', () => {
  it('defaults Gemma conversations to stripping thoughts from follow-up context', () => {
    expect(shouldStripThinkingFromContext('gemma-4-31b-it', false)).toBe(true);
  });

  it('keeps non-Gemma models unchanged when the user has not enabled stripping', () => {
    expect(shouldStripThinkingFromContext('gemini-3-flash-preview', false)).toBe(false);
  });

  it('honors the explicit strip toggle for non-Gemma models', () => {
    expect(shouldStripThinkingFromContext('gemini-3-flash-preview', true)).toBe(true);
  });
});
