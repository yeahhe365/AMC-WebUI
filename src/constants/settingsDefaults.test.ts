import { describe, expect, it } from 'vitest';
import { DEFAULT_APP_SETTINGS } from './settingsDefaults';
import { DEFAULT_THOUGHT_TRANSLATION_TARGET_LANGUAGE } from './translationOptions';
import { AVAILABLE_TRANSCRIPTION_MODELS } from './settingsModelOptions';

describe('DEFAULT_APP_SETTINGS', () => {
  it('defaults input toolbar visibility to translate off and edit helpers on', () => {
    expect(DEFAULT_APP_SETTINGS.showInputTranslationButton).toBe(false);
    expect(DEFAULT_APP_SETTINGS.showInputPasteButton).toBe(true);
    expect(DEFAULT_APP_SETTINGS.showInputClearButton).toBe(true);
  });

  it('defaults the Live Artifacts custom prompt to blank', () => {
    expect((DEFAULT_APP_SETTINGS as { liveArtifactsSystemPrompt?: string }).liveArtifactsSystemPrompt).toBe('');
    expect(
      (
        DEFAULT_APP_SETTINGS as {
          liveArtifactsSystemPrompts?: Record<string, string>;
        }
      ).liveArtifactsSystemPrompts,
    ).toEqual({
      inline: '',
    });
  });

  it('reuses the shared default thought translation language', () => {
    expect(DEFAULT_THOUGHT_TRANSLATION_TARGET_LANGUAGE).toBe('Simplified Chinese');
    expect(DEFAULT_APP_SETTINGS.thoughtTranslationTargetLanguage).toBe(DEFAULT_THOUGHT_TRANSLATION_TARGET_LANGUAGE);
  });

  it('defaults speech-to-text to Gemini 3.5 Transcribe', () => {
    expect(DEFAULT_APP_SETTINGS.transcriptionModelId).toBe('gemini-3.5-transcribe');
    expect(AVAILABLE_TRANSCRIPTION_MODELS.some((model) => model.id === DEFAULT_APP_SETTINGS.transcriptionModelId)).toBe(
      true,
    );
  });

  it('defaults logging off', () => {
    expect(DEFAULT_APP_SETTINGS.isLoggingEnabled).toBe(false);
  });
});

describe('Live Translate settings defaults', () => {
  it('defaults target language to English (en) and echo off', () => {
    expect(DEFAULT_APP_SETTINGS.liveTranslateTargetLanguageCode).toBe('en');
    expect(DEFAULT_APP_SETTINGS.liveTranslateEchoTargetLanguage).toBe(false);
  });
});
