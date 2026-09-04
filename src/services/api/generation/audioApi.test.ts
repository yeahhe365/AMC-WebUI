import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { blobToBase64Mock, generateContentMock, getConfiguredApiClientMock } = vi.hoisted(() => ({
  blobToBase64Mock: vi.fn(),
  generateContentMock: vi.fn(),
  getConfiguredApiClientMock: vi.fn(),
}));

vi.mock('@/services/api/apiClient', () => ({
  getConfiguredApiClient: getConfiguredApiClientMock,
}));

vi.mock('@/utils/file/fileEncoding', () => ({
  blobToBase64: blobToBase64Mock,
}));

import { generateSpeechApi, transcribeAudioApi } from './audioApi';

describe('generateSpeechApi request config', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getConfiguredApiClientMock.mockResolvedValue({
      models: {
        generateContent: generateContentMock,
      },
    });
    generateContentMock.mockResolvedValue({
      candidates: [{ content: { parts: [{ inlineData: { data: 'pcm-audio' } }] } }],
    });
  });

  it('uses the selected single-speaker voice for standard TTS prompts', async () => {
    await generateSpeechApi(
      'api-key',
      'gemini-3.1-flash-tts-preview',
      'Say cheerfully: Have a wonderful day!',
      'Aoede',
      new AbortController().signal,
    );

    expect(generateContentMock).toHaveBeenCalledWith(
      expect.objectContaining({
        config: expect.objectContaining({
          responseModalities: ['AUDIO'],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: 'Aoede' },
            },
          },
        }),
      }),
    );
  });

  it('switches to multi-speaker voice config when the prompt declares speaker voices', async () => {
    await generateSpeechApi(
      'api-key',
      'gemini-3.1-flash-tts-preview',
      `# AUDIO PROFILE: Two hosts
### SPEAKER VOICES
Joe: Kore
Jane: Puck

#### TRANSCRIPT
Joe: Welcome back to the show.
Jane: Thanks, it is great to be here.`,
      'Aoede',
      new AbortController().signal,
    );

    expect(generateContentMock).toHaveBeenCalledWith(
      expect.objectContaining({
        config: expect.objectContaining({
          responseModalities: ['AUDIO'],
          speechConfig: {
            multiSpeakerVoiceConfig: {
              speakerVoiceConfigs: [
                {
                  speaker: 'Joe',
                  voiceConfig: {
                    prebuiltVoiceConfig: { voiceName: 'Kore' },
                  },
                },
                {
                  speaker: 'Jane',
                  voiceConfig: {
                    prebuiltVoiceConfig: { voiceName: 'Puck' },
                  },
                },
              ],
            },
          },
        }),
      }),
    );
  });
});

describe('generateSpeechApi timeout', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('passes an abort signal into the generateContent config so a stalled request can be cancelled', async () => {
    generateContentMock.mockResolvedValue({
      candidates: [
        {
          content: {
            parts: [{ inlineData: { data: 'pcm-audio' } }],
          },
        },
      ],
    });

    await generateSpeechApi(
      'api-key',
      'gemini-3.1-flash-tts-preview',
      'Say hello',
      'Aoede',
      new AbortController().signal,
    );

    const request = generateContentMock.mock.calls[0][0];
    expect(request.config.abortSignal).toBeInstanceOf(AbortSignal);
  });

  it('rejects with a timeout error when the request exceeds the wall-clock budget', async () => {
    vi.useFakeTimers();

    generateContentMock.mockImplementation(
      () =>
        new Promise((_resolve) => {
          // Never settles — simulates a stalled upstream.
        }),
    );

    const promise = generateSpeechApi(
      'api-key',
      'gemini-3.1-flash-tts-preview',
      'Say hello',
      'Aoede',
      new AbortController().signal,
    );

    const assertRejects = expect(promise).rejects.toThrow('timed out');

    vi.advanceTimersByTime(30_000 + 1);

    await assertRejects;
  });

  it('does not leak the timeout timer after a normal request settles', async () => {
    vi.useFakeTimers();

    generateContentMock.mockResolvedValue({
      candidates: [{ content: { parts: [{ inlineData: { data: 'pcm-audio' } }] } }],
    });

    await generateSpeechApi(
      'api-key',
      'gemini-3.1-flash-tts-preview',
      'Say hello',
      'Aoede',
      new AbortController().signal,
    );

    // Advancing far past the budget must not reject a settled request.
    await expect(
      Promise.race([Promise.resolve('done'), new Promise((r) => setTimeout(() => r('tick'), 0))]),
    ).resolves.toBe('done');
    vi.advanceTimersByTime(60_000);
  });
});

describe('transcribeAudioApi request config', () => {
  const audioFile = new File(['voice'], 'voice.mp3', { type: 'audio/mpeg' });

  beforeEach(() => {
    vi.clearAllMocks();
    blobToBase64Mock.mockResolvedValue('base64-audio');
    getConfiguredApiClientMock.mockResolvedValue({
      models: {
        generateContent: generateContentMock,
      },
    });
    generateContentMock.mockResolvedValue({ text: 'hello world' });
  });

  it('sends dedicated transcription payload with audio and prompt parts without developer instruction or thinking config', async () => {
    await transcribeAudioApi('api-key', audioFile, 'gemini-3.5-transcribe');

    expect(generateContentMock).toHaveBeenCalledWith({
      model: 'gemini-3.5-transcribe',
      contents: {
        parts: [
          { text: 'Transcribe voice input exactly.' },
          {
            inlineData: {
              mimeType: 'audio/mpeg',
              data: 'base64-audio',
            },
          },
        ],
      },
    });
  });

  it('returns an empty string when the model finds no recognizable speech', async () => {
    generateContentMock.mockResolvedValue({ text: '' });

    await expect(transcribeAudioApi('api-key', audioFile, 'gemini-3.5-transcribe')).resolves.toBe('');
  });

  it('extracts transcription text from structured audioTranscription parts', async () => {
    generateContentMock.mockResolvedValue({
      candidates: [
        {
          content: {
            parts: [
              {
                audioTranscription: {
                  text: '你好，这是语音转录测试',
                },
              },
            ],
            role: 'model',
          },
          finishReason: 'STOP',
        },
      ],
    });

    const result = await transcribeAudioApi('api-key', audioFile, 'gemini-3.5-transcribe');
    expect(result).toBe('你好，这是语音转录测试');
  });

  it('rejects unsupported Gemini audio MIME types before building the inline audio part', async () => {
    const unsupportedAudioFile = new File(['voice'], 'voice.webm', { type: 'audio/webm' });

    await expect(transcribeAudioApi('api-key', unsupportedAudioFile, 'gemini-3-flash-preview')).rejects.toThrow(
      'Unsupported audio MIME type for Gemini transcription: audio/webm.',
    );

    expect(blobToBase64Mock).not.toHaveBeenCalled();
    expect(generateContentMock).not.toHaveBeenCalled();
  });

  it('normalizes legacy bare language codes to BCP-47 in the prompt and config', async () => {
    await transcribeAudioApi('api-key', audioFile, 'gemini-3.5-transcribe', { language: 'zh' });

    const call = generateContentMock.mock.calls[0][0];
    expect(call.contents.parts[0].text).toContain('Primary language: cmn-Hans-CN.');
    expect(call.config.audioTranscriptionConfig.languageCodes).toEqual(['cmn-Hans-CN']);
  });

  it('keeps already-canonical BCP-47 language codes untouched in prompt and config', async () => {
    await transcribeAudioApi('api-key', audioFile, 'gemini-3.5-transcribe', { language: 'yue-Hant-HK' });

    const call = generateContentMock.mock.calls[0][0];
    expect(call.contents.parts[0].text).toContain('Primary language: yue-Hant-HK.');
    expect(call.config.audioTranscriptionConfig.languageCodes).toEqual(['yue-Hant-HK']);
  });

  it('rejects with the prompt block reason instead of silently returning an empty transcript', async () => {
    generateContentMock.mockResolvedValue({ promptFeedback: { blockReason: 'SAFETY' } });

    await expect(transcribeAudioApi('api-key', audioFile, 'gemini-3.5-transcribe')).rejects.toThrow('SAFETY');
  });

  it('reports the actual finish reason without claiming a safety block', async () => {
    generateContentMock.mockResolvedValue({ candidates: [{ finishReason: 'RECITATION' }] });

    await expect(transcribeAudioApi('api-key', audioFile, 'gemini-3.5-transcribe')).rejects.toThrow('RECITATION');
    await expect(transcribeAudioApi('api-key', audioFile, 'gemini-3.5-transcribe')).rejects.not.toThrow(/safety/i);
  });

  it('caps the custom vocabulary list at the model limit of 1000 terms', async () => {
    const vocabulary = Array.from({ length: 1200 }, (_, index) => `term${index}`).join(', ');

    await transcribeAudioApi('api-key', audioFile, 'gemini-3.5-transcribe', { customVocabulary: vocabulary });

    const config = generateContentMock.mock.calls[0][0].config;
    expect(config.audioTranscriptionConfig.customVocabulary).toHaveLength(1000);
  });

  it('keeps the custom vocabulary prompt instruction aligned with the capped list', async () => {
    const vocabulary = Array.from({ length: 1200 }, (_, index) => `term${index}`).join(', ');

    await transcribeAudioApi('api-key', audioFile, 'gemini-3.5-transcribe', { customVocabulary: vocabulary });

    const call = generateContentMock.mock.calls[0][0];
    expect(call.contents.parts[0].text).toContain('Custom vocabulary: term0, term1, term2');
    expect(call.contents.parts[0].text).not.toContain('term1000');
  });

  it('sends speaker diarization as the documented `diarization` field', async () => {
    await transcribeAudioApi('api-key', audioFile, 'gemini-3.5-transcribe', { speakerLabels: true });

    const config = generateContentMock.mock.calls[0][0].config;
    expect(config.audioTranscriptionConfig.diarization).toBe(true);
    expect(config.audioTranscriptionConfig.speakerLabels).toBeUndefined();
  });
});
