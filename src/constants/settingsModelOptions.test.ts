import { describe, expect, it } from 'vitest';
import { AVAILABLE_TRANSCRIPTION_MODELS, CONNECTION_TEST_MODELS } from './settingsModelOptions';

describe('settingsModelOptions', () => {
  it('keeps connection test models aligned with the supported defaults', () => {
    expect(CONNECTION_TEST_MODELS.map((model) => model.id)).toEqual([
      'gemini-3.8-flash',
      'gemini-3.7-flash',
      'gemini-3.5-flash-lite',
      'gemini-3.1-pro-preview',
      'gemini-robotics-er-2-preview',
      'gemma-4-31b-it',
      'gemma-4-26b-a4b-it',
    ]);
  });

  it('does not expose Gemini 3 Flash in connection tests', () => {
    expect(CONNECTION_TEST_MODELS.some((model) => model.id === 'gemini-3-flash-preview')).toBe(false);
  });

  it('does not expose removed Gemini 2.5 Flash preview models in connection tests', () => {
    expect(CONNECTION_TEST_MODELS.some((model) => model.id === 'gemini-2.5-flash-preview-09-2025')).toBe(false);
    expect(CONNECTION_TEST_MODELS.some((model) => model.id === 'gemini-2.5-flash-lite-preview-09-2025')).toBe(false);
  });

  it('does not expose removed Gemini 2.5 Flash preview models for transcription', () => {
    expect(AVAILABLE_TRANSCRIPTION_MODELS.some((model) => model.id === 'gemini-2.5-flash-preview-09-2025')).toBe(false);
    expect(AVAILABLE_TRANSCRIPTION_MODELS.some((model) => model.id === 'gemini-2.5-flash-lite-preview-09-2025')).toBe(
      false,
    );
  });

  it('does not expose live-only native audio models for file transcription', () => {
    expect(
      AVAILABLE_TRANSCRIPTION_MODELS.some((model) => model.id === 'gemini-2.5-flash-native-audio-preview-12-2025'),
    ).toBe(false);
  });

  it('keeps transcription models aligned with the supported list', () => {
    expect(AVAILABLE_TRANSCRIPTION_MODELS.map((model) => model.id)).toEqual(['gemini-3.5-transcribe']);
  });

  it('does not expose Gemini 3 Flash for transcription', () => {
    expect(AVAILABLE_TRANSCRIPTION_MODELS.some((model) => model.id === 'gemini-3-flash-preview')).toBe(false);
  });

  it('does not expose removed Gemini 3.5 Flash text model', () => {
    expect(CONNECTION_TEST_MODELS.some((model) => model.id === 'gemini-3.5-flash')).toBe(false);
    expect(AVAILABLE_TRANSCRIPTION_MODELS.some((model) => model.id === 'gemini-3.5-flash')).toBe(false);
  });

  it('does not expose removed Gemini 3.6 Flash', () => {
    expect(CONNECTION_TEST_MODELS.some((model) => model.id === 'gemini-3.6-flash')).toBe(false);
    expect(AVAILABLE_TRANSCRIPTION_MODELS.some((model) => model.id === 'gemini-3.6-flash')).toBe(false);
  });

  it('shows Gemini 3.8 Flash and Gemini 3.7 Flash in connection test models and Gemini 3.5 Transcribe for transcription', () => {
    expect(CONNECTION_TEST_MODELS.find((model) => model.id === 'gemini-3.8-flash')?.name).toBe('Gemini 3.8 Flash');
    expect(CONNECTION_TEST_MODELS.find((model) => model.id === 'gemini-3.7-flash')?.name).toBe('Gemini 3.7 Flash');
    expect(AVAILABLE_TRANSCRIPTION_MODELS.find((model) => model.id === 'gemini-3.5-transcribe')?.name).toBe(
      'Gemini 3.5 Transcribe',
    );
    expect(AVAILABLE_TRANSCRIPTION_MODELS.some((model) => model.id === 'gemini-3.8-flash')).toBe(false);
    expect(AVAILABLE_TRANSCRIPTION_MODELS.some((model) => model.id === 'gemini-3.7-flash')).toBe(false);
  });
});
