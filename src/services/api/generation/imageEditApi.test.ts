import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { Part } from '@google/genai';

const buildGenerationConfigMock = vi.fn();
const sendStatelessMessageNonStreamApiMock = vi.fn();

vi.mock('@/services/api/generationConfig', () => ({
  buildGenerationConfig: buildGenerationConfigMock,
}));

vi.mock('@/services/api/chatApi', () => ({
  sendStatelessMessageNonStreamApi: sendStatelessMessageNonStreamApiMock,
}));

describe('editImageApi', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('uses shared generation config for image edits', async () => {
    buildGenerationConfigMock.mockResolvedValue({
      responseModalities: ['TEXT', 'IMAGE'],
      thinkingConfig: { includeThoughts: true, thinkingLevel: 'HIGH' },
      tools: [{ googleSearch: {} }],
    });

    sendStatelessMessageNonStreamApiMock.mockImplementation(
      async (
        _apiKey: string,
        _modelId: string,
        _history: unknown,
        _parts: unknown,
        config: unknown,
        _abortSignal: AbortSignal,
        _onError: (error: Error) => void,
        onComplete: (parts: Part[]) => void,
      ) => {
        onComplete([{ text: 'edited' }]);
        return config;
      },
    );

    const { editImageApi } = await import('./imageEditApi');

    await editImageApi(
      'key',
      'gemini-3.1-flash-image',
      [],
      [{ text: 'edit this image' }],
      new AbortController().signal,
      '1:1',
      '2K',
      {
        systemInstruction: 'Keep the composition intact.',
        showThoughts: true,
        thinkingBudget: 0,
        thinkingLevel: 'HIGH',
        isGoogleSearchEnabled: true,
      },
    );

    expect(buildGenerationConfigMock).toHaveBeenCalled();
    expect(sendStatelessMessageNonStreamApiMock).toHaveBeenCalledWith(
      'key',
      'gemini-3.1-flash-image',
      [],
      [{ text: 'edit this image' }],
      expect.objectContaining({
        thinkingConfig: { includeThoughts: true, thinkingLevel: 'HIGH' },
        tools: [{ googleSearch: {} }],
      }),
      expect.any(AbortSignal),
      expect.any(Function),
      expect.any(Function),
    );
  });
});
