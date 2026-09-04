import { beforeEach, describe, expect, it, vi } from 'vitest';

const { generateContentMock, getConfiguredApiClientMock, recordTokenUsageMock, blobToBase64Mock } = vi.hoisted(() => ({
  generateContentMock: vi.fn(),
  getConfiguredApiClientMock: vi.fn(),
  recordTokenUsageMock: vi.fn(),
  blobToBase64Mock: vi.fn(),
}));

vi.mock('@/services/api/apiClient', () => ({
  getConfiguredApiClient: getConfiguredApiClientMock,
}));

vi.mock('@/services/logService', async () => {
  const { createLogServiceMockModule } = await import('@/test/doubles/moduleMocks');

  return createLogServiceMockModule({ recordTokenUsage: recordTokenUsageMock });
});

vi.mock('@/utils/file/fileEncoding', () => ({
  blobToBase64: blobToBase64Mock,
}));

import { generateSpeechApi, transcribeAudioApi } from './audioApi';

describe('audio pricing usage logging', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getConfiguredApiClientMock.mockResolvedValue({
      models: {
        generateContent: generateContentMock,
      },
    });
    blobToBase64Mock.mockResolvedValue('base64-audio');
  });

  it('records strict TTS pricing metadata from usage details', async () => {
    generateContentMock.mockResolvedValue({
      candidates: [{ content: { parts: [{ inlineData: { data: 'pcm-audio' } }] } }],
      usageMetadata: {
        promptTokenCount: 120,
        responseTokenCount: 240,
        promptTokensDetails: [{ modality: 'TEXT', tokenCount: 120 }],
        responseTokensDetails: [{ modality: 'AUDIO', tokenCount: 240 }],
      },
    });

    await generateSpeechApi(
      'api-key',
      'gemini-3.1-flash-tts-preview',
      'hello world',
      'Aoede',
      new AbortController().signal,
    );

    expect(recordTokenUsageMock).toHaveBeenCalledWith(
      'gemini-3.1-flash-tts-preview',
      expect.objectContaining({
        promptTokens: 120,
        completionTokens: 240,
      }),
      expect.objectContaining({
        requestKind: 'tts',
        promptTokensDetails: [{ modality: 'TEXT', tokenCount: 120 }],
        responseTokensDetails: [{ modality: 'AUDIO', tokenCount: 240 }],
      }),
    );
  });

  it('records strict transcription pricing metadata from usage details', async () => {
    generateContentMock.mockResolvedValue({
      text: 'transcribed text',
      usageMetadata: {
        promptTokenCount: 1000,
        responseTokenCount: 80,
        promptTokensDetails: [{ modality: 'AUDIO', tokenCount: 1000 }],
        responseTokensDetails: [{ modality: 'TEXT', tokenCount: 80 }],
      },
    });

    await transcribeAudioApi(
      'api-key',
      new File(['audio'], 'sample.wav', { type: 'audio/wav' }),
      'gemini-3-flash-preview',
    );

    expect(recordTokenUsageMock).toHaveBeenCalledWith(
      'gemini-3-flash-preview',
      expect.objectContaining({
        promptTokens: 1000,
        completionTokens: 80,
      }),
      expect.objectContaining({
        requestKind: 'transcription',
        promptTokensDetails: [{ modality: 'AUDIO', tokenCount: 1000 }],
        responseTokensDetails: [{ modality: 'TEXT', tokenCount: 80 }],
      }),
    );
  });

  it('does not send thinkingConfig when using dedicated gemini-3.5-transcribe model', async () => {
    generateContentMock.mockResolvedValue({
      text: 'transcribed text from gemini 3.5 transcribe',
      usageMetadata: {
        promptTokenCount: 500,
        responseTokenCount: 50,
      },
    });

    const result = await transcribeAudioApi(
      'api-key',
      new File(['audio'], 'sample.wav', { type: 'audio/wav' }),
      'gemini-3.5-transcribe',
    );

    expect(result).toBe('transcribed text from gemini 3.5 transcribe');
    expect(generateContentMock).toHaveBeenCalledWith({
      model: 'gemini-3.5-transcribe',
      contents: {
        parts: [
          { text: 'Transcribe voice input exactly.' },
          { inlineData: { data: 'base64-audio', mimeType: 'audio/wav' } },
        ],
      },
    });
  });
});
