import { describe, expect, it } from 'vitest';
import { AVAILABLE_TRANSCRIPTION_MODELS, CONNECTION_TEST_MODELS } from './settingsModelOptions';

describe('settingsModelOptions', () => {
  it('keeps connection test models aligned with the supported defaults', () => {
    expect(CONNECTION_TEST_MODELS.map((model) => model.id)).toEqual([
      'gemini-3.5-flash',
      'gemini-3-flash-preview',
      'gemini-3.1-flash-lite',
      'gemini-3.1-pro-preview',
      'gemini-robotics-er-1.6-preview',
      'gemma-4-31b-it',
      'gemma-4-26b-a4b-it',
    ]);
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
    expect(AVAILABLE_TRANSCRIPTION_MODELS.map((model) => model.id)).toEqual([
      'gemini-3.5-flash',
      'gemini-3-flash-preview',
      'gemini-3.1-flash-lite',
      'gemini-3.1-pro-preview',
    ]);
  });

  it('shows the Gemini 3 Flash transcription option without the Fastest suffix', () => {
    expect(AVAILABLE_TRANSCRIPTION_MODELS.find((model) => model.id === 'gemini-3-flash-preview')?.name).toBe(
      'Gemini 3.0 Flash',
    );
  });

  it('shows Gemini 3.5 Flash with matching supported option groups', () => {
    expect(CONNECTION_TEST_MODELS.find((model) => model.id === 'gemini-3.5-flash')?.name).toBe('Gemini 3.5 Flash');
    expect(AVAILABLE_TRANSCRIPTION_MODELS.find((model) => model.id === 'gemini-3.5-flash')?.name).toBe(
      'Gemini 3.5 Flash',
    );
  });
});
