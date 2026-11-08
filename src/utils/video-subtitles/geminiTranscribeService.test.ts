import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { transcribeAudioWithGemini, extractWordAnnotations } from './geminiTranscribeService';

// Mock dependencies
vi.mock('@/services/api/fileApi', () => ({
  uploadFileApi: vi.fn(),
  deleteFileApi: vi.fn(),
}));

vi.mock('@/services/api/apiClient', () => ({
  getConfiguredApiClient: vi.fn(),
  getConfiguredApiClientContext: vi.fn(),
}));

import { uploadFileApi, deleteFileApi } from '@/services/api/fileApi';
import { getConfiguredApiClient, getConfiguredApiClientContext } from '@/services/api/apiClient';
import { useSettingsStore } from '@/stores/settingsStore';

describe('geminiTranscribeService', () => {
  const mockApiKey = 'test-gemini-api-key';
  const mockBlob = new Blob(['mock audio wav data'], { type: 'audio/wav' });
  const mockFileName = 'test-video.wav';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('extractWordAnnotations', () => {
    it('should correctly extract word_info annotations from interaction response', () => {
      const mockInteraction = {
        id: 'interactions/123',
        steps: [
          {
            id: 'step_1',
            type: 'model_output',
            content: [
              {
                type: 'text',
                text: 'Hello world',
                annotations: [
                  {
                    type: 'word_info',
                    text: 'Hello',
                    start_offset: '0.100s',
                    end_offset: '0.450s',
                    speaker: 'spk_0',
                  },
                  {
                    type: 'word_info',
                    text: 'world',
                    start_offset: '0.500s',
                    end_offset: '0.900s',
                    speaker: 'spk_0',
                  },
                ],
              },
            ],
          },
        ],
      };

      const result = extractWordAnnotations(mockInteraction);
      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        text: 'Hello',
        start_offset: '0.100s',
        end_offset: '0.450s',
        speaker: 'spk_0',
      });
      expect(result[1]).toEqual({
        text: 'world',
        start_offset: '0.500s',
        end_offset: '0.900s',
        speaker: 'spk_0',
      });
    });

    it('should correctly extract audioTranscription.text from generateContent candidates and allocate timestamps', () => {
      const mockGenerateContentResponse = {
        candidates: [
          {
            content: {
              parts: [
                {
                  audioTranscription: {
                    text: 'こんにちは世界。今日はいい天気ですね。',
                  },
                },
              ],
            },
          },
        ],
      };

      const result = extractWordAnnotations(mockGenerateContentResponse, 10.0);
      expect(result.length).toBeGreaterThanOrEqual(2);
      expect(result[0].text).toContain('こんにちは世界。');
      expect(result[1].text).toContain('今日はいい天気ですね。');
      expect(parseFloat(result[0].start_offset)).toBeCloseTo(0, 1);
      expect(parseFloat(result[result.length - 1].end_offset)).toBeLessThanOrEqual(10.0);
    });

    it('should correctly extract audio_transcription.words in snake_case format', () => {
      const mockGenerateContentResponse = {
        candidates: [
          {
            content: {
              parts: [
                {
                  audio_transcription: {
                    words: [
                      { word: 'Hello', start_offset: '0.100s', end_offset: '0.500s', speaker: 'spk_1' },
                      { word: 'world', start_offset: '0.600s', end_offset: '1.000s', speaker: 'spk_1' },
                    ],
                  },
                },
              ],
            },
          },
        ],
      };

      const result = extractWordAnnotations(mockGenerateContentResponse);
      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        text: 'Hello',
        start_offset: '0.100s',
        end_offset: '0.500s',
        speaker: 'spk_1',
      });
      expect(result[1]).toEqual({
        text: 'world',
        start_offset: '0.600s',
        end_offset: '1.000s',
        speaker: 'spk_1',
      });
    });

    it('should extract text from data.text() function when parts have no word timestamps', () => {
      const mockResponse = {
        candidates: [{ content: { parts: [{ text: '' }] } }],
        text: () => '第一句话。第二句话。',
      };

      const result = extractWordAnnotations(mockResponse, 6.0);
      expect(result.length).toBeGreaterThanOrEqual(2);
      expect(result[0].text).toBe('第一句话。');
    });

    it('should handle missing or malformed steps gracefully', () => {
      expect(extractWordAnnotations(null)).toEqual([]);
      expect(extractWordAnnotations({})).toEqual([]);
      expect(extractWordAnnotations({ steps: [] })).toEqual([]);
      expect(extractWordAnnotations({ steps: [{ content: [] }] })).toEqual([]);
      expect(extractWordAnnotations({ candidates: [] })).toEqual([]);
    });
  });

  describe('transcribeAudioWithGemini', () => {
    it('should throw if apiKey is empty', async () => {
      const controller = new AbortController();
      await expect(transcribeAudioWithGemini('', mockBlob, mockFileName, controller.signal)).rejects.toThrow(
        'API key is required',
      );
    });

    it('should throw immediately if signal is already aborted', async () => {
      const controller = new AbortController();
      controller.abort();

      await expect(transcribeAudioWithGemini(mockApiKey, mockBlob, mockFileName, controller.signal)).rejects.toThrow();

      expect(uploadFileApi).not.toHaveBeenCalled();
    });

    it('should successfully upload audio, invoke gemini-3.5-transcribe, and clean up temporary file', async () => {
      const controller = new AbortController();
      const progressPhases: string[] = [];

      const mockUploadedFile = {
        name: 'files/audio-temp-123',
        uri: 'https://generativelanguage.googleapis.com/v1beta/files/audio-temp-123',
        mimeType: 'audio/wav',
      };

      vi.mocked(uploadFileApi).mockImplementation(async (_key, _file, _mime, _disp, _sig, onProgress) => {
        onProgress?.(50, 100);
        onProgress?.(100, 100);
        return mockUploadedFile as any;
      });

      const mockGenerateContent = vi.fn().mockResolvedValue({
        candidates: [
          {
            content: {
              parts: [
                {
                  audioTranscription: {
                    text: 'Bonjour monde.',
                  },
                },
              ],
            },
          },
        ],
      });

      vi.mocked(getConfiguredApiClient).mockResolvedValue({
        models: {
          generateContent: mockGenerateContent,
        },
      } as any);

      vi.mocked(deleteFileApi).mockResolvedValue();

      const result = await transcribeAudioWithGemini(
        mockApiKey,
        mockBlob,
        mockFileName,
        controller.signal,
        (phase, percent) => {
          progressPhases.push(`${phase}:${percent ?? ''}`);
        },
        5.0,
      );

      // Verify upload was called with File object created from Blob
      expect(uploadFileApi).toHaveBeenCalledTimes(1);
      const [calledApiKey, calledFile, calledMime] = vi.mocked(uploadFileApi).mock.calls[0];
      expect(calledApiKey).toBe(mockApiKey);
      expect(calledFile.name).toBe(mockFileName);
      expect(calledMime).toBe('audio/wav');

      // Verify progress reporting
      expect(progressPhases).toContain('uploading:50');
      expect(progressPhases).toContain('uploading:100');
      expect(progressPhases).toContain('transcribing:');

      // Verify generateContent payload
      expect(mockGenerateContent).toHaveBeenCalledWith(
        expect.objectContaining({
          model: 'gemini-3.5-transcribe',
          contents: [
            {
              parts: [
                { text: 'Transcribe voice input exactly. Include word timestamps in the output.' },
                {
                  fileData: {
                    fileUri: mockUploadedFile.uri,
                    mimeType: 'audio/wav',
                  },
                },
              ],
            },
          ],
          config: expect.objectContaining({
            audioTranscriptionConfig: {
              wordTimestamp: true,
            },
          }),
        }),
      );

      // Verify result
      expect(result).toHaveLength(1);
      expect(result[0].text).toBe('Bonjour monde.');
      expect(result[0].start_offset).toBe('0.000s');

      // Verify cleanup of uploaded file
      expect(deleteFileApi).toHaveBeenCalledWith(mockApiKey, mockUploadedFile.name);
    });

    it('should clean up uploaded file even when transcription fails', async () => {
      const controller = new AbortController();
      const mockUploadedFile = {
        name: 'files/audio-temp-err',
        uri: 'https://generativelanguage.googleapis.com/v1beta/files/audio-temp-err',
        mimeType: 'audio/wav',
      };

      vi.mocked(uploadFileApi).mockResolvedValue(mockUploadedFile as any);

      const mockGenerateContent = vi.fn().mockRejectedValue(new Error('Transcription service error'));
      vi.mocked(getConfiguredApiClient).mockResolvedValue({
        models: {
          generateContent: mockGenerateContent,
        },
      } as any);

      vi.mocked(getConfiguredApiClientContext).mockResolvedValue({
        apiBaseUrl: 'https://generativelanguage.googleapis.com',
        proxyBaseUrl: null,
      } as any);

      const originalFetch = global.fetch;
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        text: async () => 'Internal Server Error',
      } as any);

      vi.mocked(deleteFileApi).mockResolvedValue();

      try {
        await expect(transcribeAudioWithGemini(mockApiKey, mockBlob, mockFileName, controller.signal)).rejects.toThrow(
          'Gemini Transcribe API call failed (500)',
        );
      } finally {
        global.fetch = originalFetch;
      }

      expect(deleteFileApi).toHaveBeenCalledWith(mockApiKey, mockUploadedFile.name);
    });

    it('should fallback to REST API if models.generateContent is not present on client', async () => {
      const controller = new AbortController();
      const mockUploadedFile = {
        name: 'files/audio-rest-123',
        uri: 'https://generativelanguage.googleapis.com/v1beta/files/audio-rest-123',
        mimeType: 'audio/wav',
      };

      vi.mocked(uploadFileApi).mockResolvedValue(mockUploadedFile as any);
      vi.mocked(getConfiguredApiClient).mockResolvedValue({} as any);

      const mockFetchResponse = {
        ok: true,
        json: async () => ({
          candidates: [
            {
              content: {
                parts: [
                  {
                    audioTranscription: {
                      text: 'Fallback transcript',
                    },
                  },
                ],
              },
            },
          ],
        }),
      };

      const originalFetch = global.fetch;
      global.fetch = vi.fn().mockResolvedValue(mockFetchResponse as any);

      vi.mocked(getConfiguredApiClientContext).mockResolvedValue({
        apiBaseUrl: 'https://custom-proxy.com',
        proxyBaseUrl: null,
      } as any);

      try {
        const result = await transcribeAudioWithGemini(
          mockApiKey,
          mockBlob,
          mockFileName,
          controller.signal,
          undefined,
          4.0,
        );
        expect(result).toHaveLength(1);
        expect(result[0].text).toBe('Fallback transcript');
        expect(global.fetch).toHaveBeenCalledWith(
          expect.stringContaining('/v1beta/models/gemini-3.5-transcribe:generateContent'),
          expect.objectContaining({
            method: 'POST',
          }),
        );
      } finally {
        global.fetch = originalFetch;
      }
    });

    // P0-9:这条兜底是手写 fetch,SDK 的 httpOptions 里那份口令它拿不到。
    it('should carry the deployment access password on the REST fallback only when proxied', async () => {
      const controller = new AbortController();
      const mockUploadedFile = {
        name: 'files/audio-rest-pwd',
        uri: 'https://generativelanguage.googleapis.com/v1beta/files/audio-rest-pwd',
        mimeType: 'audio/wav',
      };
      const restResponse = {
        ok: true,
        json: async () => ({
          candidates: [{ content: { parts: [{ audioTranscription: { text: 'pwd transcript' } }] } }],
        }),
      };

      const runFallback = async (context: Record<string, unknown>) => {
        vi.mocked(uploadFileApi).mockResolvedValue(mockUploadedFile as any);
        vi.mocked(getConfiguredApiClient).mockResolvedValue({} as any);
        vi.mocked(getConfiguredApiClientContext).mockResolvedValue(context as any);
        const originalFetch = global.fetch;
        const fetchMock = vi.fn().mockResolvedValue(restResponse as any);
        global.fetch = fetchMock as any;
        try {
          await transcribeAudioWithGemini(mockApiKey, mockBlob, mockFileName, controller.signal, undefined, 4.0);
          return (fetchMock.mock.calls[0]?.[1]?.headers ?? {}) as Record<string, string>;
        } finally {
          global.fetch = originalFetch;
        }
      };

      useSettingsStore.setState((state) => ({
        appSettings: { ...state.appSettings, serverAccessPassword: 'deploy-pwd' },
      }));
      try {
        const proxied = await runFallback({
          apiBaseUrl: 'https://generativelanguage.googleapis.com',
          proxyBaseUrl: 'https://amc.example.com/api/gemini',
        });
        expect(proxied['x-access-token']).toBe('deploy-pwd');

        const direct = await runFallback({
          apiBaseUrl: 'https://generativelanguage.googleapis.com',
          proxyBaseUrl: null,
        });
        expect(direct['x-access-token']).toBeUndefined();
      } finally {
        useSettingsStore.setState((state) => ({
          appSettings: { ...state.appSettings, serverAccessPassword: null },
        }));
      }
    });
  });
});
