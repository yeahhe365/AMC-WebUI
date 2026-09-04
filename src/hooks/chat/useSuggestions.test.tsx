import { renderHook } from '@/test/render/renderer';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_APP_SETTINGS } from '@/constants/settingsDefaults';
import type { SavedChatSession } from '@/types';
import { useSuggestions } from './useSuggestions';
import { createThirdPartyConnection } from '@/test/data/factories';

const { generateSuggestionsApiMock, getGeminiKeyForRequestMock } = vi.hoisted(() => ({
  generateSuggestionsApiMock: vi.fn(),
  getGeminiKeyForRequestMock: vi.fn(),
}));

vi.mock('@/services/api/generation/textApi', () => ({
  generateSuggestionsApi: generateSuggestionsApiMock,
}));

vi.mock('@/utils/apiKeySelection', () => ({
  getGeminiKeyForRequest: getGeminiKeyForRequestMock,
}));

const createSession = (overrides: Partial<SavedChatSession> = {}): SavedChatSession => ({
  id: 'session-1',
  title: 'Routing',
  timestamp: 1,
  settings: {
    ...DEFAULT_APP_SETTINGS,
    modelId: 'gemini-3-flash-preview',
  },
  messages: [
    {
      id: 'message-user',
      role: 'user',
      content: 'Explain routing',
      timestamp: new Date('2026-05-09T00:00:00.000Z'),
    },
    {
      id: 'message-model',
      role: 'model',
      content: 'Routing decides which handler receives a request.',
      timestamp: new Date('2026-05-09T00:00:01.000Z'),
    },
  ],
  ...overrides,
});

describe('useSuggestions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getGeminiKeyForRequestMock.mockReturnValue({ key: 'gemini-key', isNewKey: true });
    generateSuggestionsApiMock.mockResolvedValue(['Show example', 'Compare options', 'What can fail?']);
  });

  it('does not reuse a Gemini sticky key when the session routes third-party', async () => {
    const updateMessageInSession = vi.fn();
    const sessionKeyMapRef = {
      current: new Map([['session-1', 'gemini-sticky-key']]),
    };
    const appSettings = {
      ...DEFAULT_APP_SETTINGS,
      apiKey: 'gemini-key',
      thirdPartyApi: {
        connections: [createThirdPartyConnection({ id: 'openai', apiKey: 'openai-key', enabled: true })],
      },
    };
    // The active session routes third-party (providerId openai). The Gemini
    // sticky key from a previous Gemini chat must NOT be reused — suggestions
    // get a fresh Gemini key via getGeminiKeyForRequest.
    const activeChat = createSession({
      settings: {
        ...DEFAULT_APP_SETTINGS,
        modelId: 'gpt-5.6-sol',
        providerId: 'openai',
      },
    });
    let isLoading = true;

    const { rerender, unmount } = renderHook(() =>
      useSuggestions({
        appSettings,
        activeChat,
        isLoading,
        updateMessageInSession,
        language: 'en',
        sessionKeyMapRef,
      }),
    );

    isLoading = false;
    rerender();

    await vi.waitFor(() => {
      expect(generateSuggestionsApiMock).toHaveBeenCalledWith(
        'gemini-key',
        'Explain routing',
        'Routing decides which handler receives a request.',
        'en',
      );
    });
    expect(getGeminiKeyForRequestMock).toHaveBeenCalled();
    unmount();
  });
});
