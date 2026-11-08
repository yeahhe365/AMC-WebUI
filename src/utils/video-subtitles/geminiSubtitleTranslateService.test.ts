import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { translateSubtitlesWithGemini } from './geminiSubtitleTranslateService';
import type { SubtitleCue } from './subtitleFormatter';
import { getConfiguredApiClient, getConfiguredApiClientContext } from '@/services/api/apiClient';
import { useSettingsStore } from '@/stores/settingsStore';

vi.mock('@/services/api/apiClient', () => ({
  getConfiguredApiClient: vi.fn(),
  getConfiguredApiClientContext: vi.fn(),
}));

describe('geminiSubtitleTranslateService', () => {
  const mockApiKey = 'test-gemini-api-key';

  const mockCues: SubtitleCue[] = [
    {
      id: 1,
      startSeconds: 0,
      endSeconds: 2.5,
      startTimeSrt: '00:00:00,000',
      endTimeSrt: '00:00:02,500',
      startTimeVtt: '00:00:00.000',
      endTimeVtt: '00:00:02.500',
      text: 'Good morning everyone.',
    },
    {
      id: 2,
      startSeconds: 2.6,
      endSeconds: 5.0,
      startTimeSrt: '00:00:02,600',
      endTimeSrt: '00:00:05,000',
      startTimeVtt: '00:00:02.600',
      endTimeVtt: '00:00:05.000',
      text: 'Welcome to this session.',
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('translates cues and attaches translation field to each cue', async () => {
    const mockGenerateContent = vi.fn().mockResolvedValue({
      text: JSON.stringify([
        { id: 1, translation: '大家早上好。' },
        { id: 2, translation: '欢迎来到本次会议。' },
      ]),
    });

    vi.mocked(getConfiguredApiClient).mockResolvedValue({
      models: {
        generateContent: mockGenerateContent,
      },
    } as any);

    const translatedCues = await translateSubtitlesWithGemini(mockApiKey, mockCues, {
      targetLanguage: 'Chinese',
    });

    expect(translatedCues).toHaveLength(2);
    expect(translatedCues[0].translation).toBe('大家早上好。');
    expect(translatedCues[1].translation).toBe('欢迎来到本次会议。');
    expect(mockGenerateContent).toHaveBeenCalledTimes(1);
  });

  it('returns empty array when cues array is empty', async () => {
    const result = await translateSubtitlesWithGemini(mockApiKey, []);
    expect(result).toEqual([]);
  });

  it('throws error when apiKey is missing', async () => {
    await expect(translateSubtitlesWithGemini('', mockCues)).rejects.toThrow('API key is required');
  });

  it('handles markdown code block wrapped JSON response', async () => {
    const mockGenerateContent = vi.fn().mockResolvedValue({
      text: '```json\n[\n  {"id": 1, "translation": "大家早上好。"},\n  {"id": 2, "translation": "欢迎来到本次会议。"}\n]\n```',
    });

    vi.mocked(getConfiguredApiClient).mockResolvedValue({
      models: {
        generateContent: mockGenerateContent,
      },
    } as any);

    const translatedCues = await translateSubtitlesWithGemini(mockApiKey, mockCues);
    expect(translatedCues[0].translation).toBe('大家早上好。');
    expect(translatedCues[1].translation).toBe('欢迎来到本次会议。');
  });

  it('handles partial translations gracefully by keeping untranslated cue without throwing', async () => {
    const mockGenerateContent = vi.fn().mockResolvedValue({
      text: JSON.stringify([
        { id: 1, translation: '大家早上好。' },
        // ID 2 is missing from response
      ]),
    });

    vi.mocked(getConfiguredApiClient).mockResolvedValue({
      models: {
        generateContent: mockGenerateContent,
      },
    } as any);

    const translatedCues = await translateSubtitlesWithGemini(mockApiKey, mockCues);
    expect(translatedCues[0].translation).toBe('大家早上好。');
    expect(translatedCues[1].translation).toBeUndefined();
  });

  it('falls back to REST endpoint if SDK call fails', async () => {
    vi.mocked(getConfiguredApiClient).mockRejectedValueOnce(new Error('SDK network error'));
    vi.mocked(getConfiguredApiClientContext).mockResolvedValue({
      apiBaseUrl: 'https://test-gemini-proxy.com',
    } as any);

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        candidates: [
          {
            content: {
              parts: [
                {
                  text: JSON.stringify([
                    { id: 1, translation: 'REST 翻译 1' },
                    { id: 2, translation: 'REST 翻译 2' },
                  ]),
                },
              ],
            },
          },
        ],
      }),
    });
    globalThis.fetch = fetchMock as any;

    const translatedCues = await translateSubtitlesWithGemini(mockApiKey, mockCues);
    expect(translatedCues[0].translation).toBe('REST 翻译 1');
    expect(translatedCues[1].translation).toBe('REST 翻译 2');
    expect(fetchMock).toHaveBeenCalled();
  });

  // P0-9:这条兜底是手写 fetch,SDK 的 httpOptions 里那份口令它拿不到。
  describe('deployment access password on the REST fallback', () => {
    const setPassword = (password: string | null) =>
      useSettingsStore.setState((state) => ({ appSettings: { ...state.appSettings, serverAccessPassword: password } }));

    const mockFallback = async (context: Record<string, unknown>) => {
      vi.mocked(getConfiguredApiClient).mockRejectedValueOnce(new Error('SDK network error'));
      vi.mocked(getConfiguredApiClientContext).mockResolvedValue(context as any);
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          candidates: [{ content: { parts: [{ text: JSON.stringify([{ id: 1, translation: 'ok' }]) }] } }],
        }),
      });
      globalThis.fetch = fetchMock as any;
      await translateSubtitlesWithGemini(mockApiKey, [mockCues[0]!]);
      return (fetchMock.mock.calls[0]?.[1]?.headers ?? {}) as Record<string, string>;
    };

    afterEach(() => setPassword(null));

    it('sends x-access-token when the request goes through the deployment proxy', async () => {
      setPassword('deploy-pwd');
      const headers = await mockFallback({
        apiBaseUrl: 'https://generativelanguage.googleapis.com',
        proxyBaseUrl: 'https://amc.example.com/api/gemini',
      });
      expect(headers['x-access-token']).toBe('deploy-pwd');
    });

    it('never sends the password to Google when there is no proxy', async () => {
      setPassword('deploy-pwd');
      const headers = await mockFallback({ apiBaseUrl: 'https://generativelanguage.googleapis.com' });
      expect(headers['x-access-token']).toBeUndefined();
      expect(headers.authorization).toBeUndefined();
    });
  });
});
