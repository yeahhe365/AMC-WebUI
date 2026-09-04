import { act } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppSettings, ChatMessage, ModelOption, SavedChatSession } from '@/types';
import { createAppSettings, createChatSettings } from '@/test/layout/fixtures';
import { createThirdPartyConnection } from '@/test/data/factories';
import { useApp } from './useApp';
import { renderHook } from '@/test/render/renderer';

const mockSetIsHistorySidebarOpen = vi.fn();
const mockSetIsLogViewerOpen = vi.fn();
const mockSetAppSettings = vi.fn();
const LIVE_ARTIFACTS_PROMPT = '[Live Artifacts Protocol - zh]\nLive Artifacts prompt';

const fullMessages: ChatMessage[] = [
  {
    id: 'message-1',
    role: 'user',
    content: 'Export me',
    timestamp: new Date('2026-04-20T08:00:00.000Z'),
  },
];

const metadataOnlySession: SavedChatSession = {
  id: 'session-1',
  title: 'Portable Export',
  timestamp: Date.now(),
  messages: [],
  settings: createChatSettings({
    modelId: 'gemini-test',
  }),
};

const hydratedSession: SavedChatSession = {
  ...metadataOnlySession,
  messages: fullMessages,
};

let currentAppSettings = createAppSettings({
  modelId: 'gemini-test',
  language: 'en',
  themeId: 'pearl',
  systemInstruction: '',
});

type MockChatState = ReturnType<typeof buildChatState>;

const buildChatState = () => ({
  activeChat: hydratedSession as SavedChatSession | undefined,
  activeSessionId: 'session-1',
  apiModels: [] as ModelOption[],
  currentChatSettings: hydratedSession.settings,
  handleSaveAllScenarios: vi.fn(),
  handleSelectModelInHeader: vi.fn(),
  handleSendMessage: vi.fn(),
  handleStopGenerating: vi.fn(),
  isLoading: false,
  isSwitchingModel: false,
  messages: fullMessages,
  savedGroups: [],
  savedScenarios: [],
  savedSessions: [metadataOnlySession],
  scrollContainerRef: { current: null },
  setCommandedInput: vi.fn(),
  startNewChat: vi.fn(),
  updateAndPersistGroups: vi.fn(),
  updateAndPersistSessions: vi.fn(),
});

let currentChatState: MockChatState;
const mockSetCurrentChatSettings = vi.fn(
  (updater: (prev: SavedChatSession['settings']) => SavedChatSession['settings']) => {
    if (!currentChatState.activeChat) {
      return;
    }

    const nextSettings = updater(currentChatState.activeChat.settings);
    currentChatState.activeChat = {
      ...currentChatState.activeChat,
      settings: nextSettings,
    };
  },
);

vi.mock('@/hooks/core/useAppSettings', () => ({
  useAppSettings: () => ({
    appSettings: currentAppSettings,
    setAppSettings: mockSetAppSettings,
    currentTheme: { id: 'pearl' },
    language: 'en',
  }),
}));

vi.mock('@/hooks/chat/useChat', () => ({
  useChat: () => ({
    ...currentChatState,
    currentChatSettings: currentChatState.activeChat?.settings ?? currentAppSettings,
    setCurrentChatSettings: mockSetCurrentChatSettings,
  }),
}));

vi.mock('@/features/prompts/promptRegistry', () => ({
  isLiveArtifactsSystemInstruction: (instruction?: string | null) =>
    !!instruction && instruction.includes('[Live Artifacts Protocol - zh]'),
  isBboxSystemInstruction: () => false,
  isHdGuideSystemInstruction: () => false,
  loadLiveArtifactsSystemPrompt: vi.fn(async () => LIVE_ARTIFACTS_PROMPT),
  loadBboxSystemPrompt: vi.fn(async () => 'bbox prompt'),
  loadHdGuideSystemPrompt: vi.fn(async () => 'guide prompt'),
}));

vi.mock('@/hooks/core/useAppUi', () => ({
  useAppUi: () => ({}),
}));

vi.mock('@/hooks/core/useAppEvents', () => ({
  useAppEvents: () => ({}),
}));

vi.mock('@/hooks/core/usePictureInPicture', () => ({
  usePictureInPicture: () => ({
    pipWindow: null,
    togglePip: vi.fn(),
    isPipSupported: false,
  }),
}));

vi.mock('./useAppInitialization', () => ({
  useAppInitialization: vi.fn(),
}));

vi.mock('./useAppTitle', () => ({
  useAppTitle: vi.fn(),
}));

vi.mock('@/hooks/data-management/useDataExport', () => ({
  useDataExport: () => ({
    handleExportSettings: vi.fn(),
    handleExportHistory: vi.fn(),
    handleExportAllScenarios: vi.fn(),
  }),
}));

vi.mock('@/hooks/data-management/useDataImport', () => ({
  useDataImport: () => ({
    handleImportSettings: vi.fn(),
    handleImportHistory: vi.fn(),
    handleImportAllScenarios: vi.fn(),
  }),
}));

vi.mock('@/hooks/data-management/useChatSessionExport', () => ({
  useChatSessionExport: () => ({
    exportChatLogic: vi.fn(),
  }),
}));

vi.mock('@/stores/uiStore', () => ({
  useUIStore: (
    selector: (state: {
      setIsHistorySidebarOpen: typeof mockSetIsHistorySidebarOpen;
      setIsLogViewerOpen: typeof mockSetIsLogViewerOpen;
    }) => unknown,
  ) =>
    selector({
      setIsHistorySidebarOpen: mockSetIsHistorySidebarOpen,
      setIsLogViewerOpen: mockSetIsLogViewerOpen,
    }),
}));

vi.mock('@/i18n/translations', () => ({
  getTranslator: () => (key: string) => key,
}));

vi.mock('@/utils/themeDom', () => ({
  applyThemeToDocument: vi.fn(),
}));

describe('useApp', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    currentAppSettings = createAppSettings({
      modelId: 'gemini-test',
      language: 'en',
      themeId: 'pearl',
      systemInstruction: '',
    });
    mockSetAppSettings.mockImplementation((updater: AppSettings | ((prev: AppSettings) => AppSettings)) => {
      currentAppSettings = typeof updater === 'function' ? updater(currentAppSettings) : updater;
    });
    currentChatState = buildChatState();
    mockSetCurrentChatSettings.mockClear();
  });

  it('exposes the hydrated active chat instead of sidebar metadata when exporting', () => {
    const { result, unmount } = renderHook(() => useApp());

    expect(result.current.activeChat?.messages).toEqual(fullMessages);
    expect(result.current.sessionTitle).toBe('Portable Export');

    unmount();
  });

  it('re-applies the Live Artifacts prompt after the active session stabilizes', async () => {
    currentChatState.activeChat = undefined;
    currentChatState.activeSessionId = 'session-race';
    currentChatState.savedSessions = [];

    const { result, rerender, unmount } = renderHook(() => useApp());

    await act(async () => {
      await result.current.handleSuggestionClick('organize', 'Create an interactive HTML board');
    });

    expect(currentAppSettings.systemInstruction).toBe(LIVE_ARTIFACTS_PROMPT);
    expect(currentChatState.activeChat).toBeUndefined();

    currentChatState.activeChat = {
      id: 'session-race',
      title: 'New Chat',
      timestamp: Date.now(),
      messages: [],
      settings: createChatSettings({
        modelId: 'gemini-test',
        systemInstruction: '',
      }),
    };
    currentChatState.savedSessions = [{ ...currentChatState.activeChat, messages: [] }];

    rerender();
    rerender();

    expect(currentChatState.activeChat.settings.systemInstruction).toBe(LIVE_ARTIFACTS_PROMPT);

    unmount();
  });

  it('resets Gemini thinking budget when switching to a fast thinking preset', () => {
    currentAppSettings = {
      ...currentAppSettings,
      modelId: 'gemini-3-flash-preview',
      thinkingBudget: 4096,
      thinkingLevel: 'HIGH',
    };

    currentChatState.activeChat = {
      ...hydratedSession,
      settings: {
        ...hydratedSession.settings,
        modelId: 'gemini-3-flash-preview',
        thinkingBudget: 4096,
        thinkingLevel: 'HIGH',
      },
    };

    const { result, unmount } = renderHook(() => useApp());

    act(() => {
      result.current.handleSetThinkingLevel('MINIMAL');
    });

    expect(currentAppSettings.thinkingLevel).toBe('MINIMAL');
    expect(currentAppSettings.thinkingBudget).toBe(-1);
    expect(currentChatState.activeChat?.settings.thinkingLevel).toBe('MINIMAL');
    expect(currentChatState.activeChat?.settings.thinkingBudget).toBe(-1);

    unmount();
  });

  it('keeps Gemini header thinking toggles in level mode when switching back to high thinking', () => {
    currentAppSettings = {
      ...currentAppSettings,
      modelId: 'gemini-3.1-pro-preview',
      thinkingBudget: 2048,
      thinkingLevel: 'LOW',
    };

    currentChatState.activeChat = {
      ...hydratedSession,
      settings: {
        ...hydratedSession.settings,
        modelId: 'gemini-3.1-pro-preview',
        thinkingBudget: 2048,
        thinkingLevel: 'LOW',
      },
    };

    const { result, unmount } = renderHook(() => useApp());

    act(() => {
      result.current.handleSetThinkingLevel('HIGH');
    });

    expect(currentAppSettings.thinkingLevel).toBe('HIGH');
    expect(currentAppSettings.thinkingBudget).toBe(-1);
    expect(currentChatState.activeChat?.settings.thinkingLevel).toBe('HIGH');
    expect(currentChatState.activeChat?.settings.thinkingBudget).toBe(-1);

    unmount();
  });

  it('propagates changed chat settings to the active chat but keeps its session-scoped model', () => {
    currentChatState.activeChat = {
      ...hydratedSession,
      settings: {
        ...hydratedSession.settings,
        modelId: 'session-model',
        temperature: 0.2,
      },
    };

    const { result, unmount } = renderHook(() => useApp());

    act(() => {
      result.current.handleSaveSettings({
        ...currentAppSettings,
        modelId: 'default-model',
        temperature: 1.4,
      });
    });

    expect(currentAppSettings.modelId).toBe('default-model');
    expect(currentAppSettings.temperature).toBe(1.4);
    // The model is chosen per chat via the header picker, so a global default
    // change must not yank the open session away from its own model.
    expect(currentChatState.activeChat.settings.modelId).toBe('session-model');
    // Generation settings have no per-session UI, so they must reach the open
    // chat instead of being silently shadowed by the session snapshot.
    expect(currentChatState.activeChat.settings.temperature).toBe(1.4);

    unmount();
  });

  it('saves current chat settings without mutating default settings', () => {
    currentAppSettings = {
      ...currentAppSettings,
      modelId: 'default-model',
      temperature: 0.8,
    };
    currentChatState.activeChat = {
      ...hydratedSession,
      settings: {
        ...hydratedSession.settings,
        modelId: 'session-model',
        temperature: 0.2,
      },
    };

    const { result, unmount } = renderHook(() => useApp());

    act(() => {
      result.current.handleSaveCurrentChatSettings({
        ...currentChatState.activeChat!.settings,
        modelId: 'current-model',
        temperature: 1.2,
      });
    });

    expect(currentChatState.activeChat.settings.modelId).toBe('current-model');
    expect(currentChatState.activeChat.settings.temperature).toBe(1.2);
    expect(currentAppSettings.modelId).toBe('default-model');
    expect(currentAppSettings.temperature).toBe(0.8);

    unmount();
  });

  it('preserves the locked API key when saving chat settings if Files API references remain', () => {
    const fileMessage: ChatMessage = {
      id: 'message-file',
      role: 'user',
      content: 'see this',
      timestamp: new Date('2026-04-20T08:00:00.000Z'),
      files: [
        {
          id: 'file-1',
          name: 'notes.pdf',
          type: 'application/pdf',
          size: 10,
          fileApiName: 'files/abc',
          fileUri: 'https://files/abc',
          uploadState: 'active',
        },
      ],
    };
    currentChatState.messages = [fileMessage];
    currentChatState.activeChat = {
      ...hydratedSession,
      messages: [fileMessage],
      settings: {
        ...hydratedSession.settings,
        lockedApiKey: 'locked-key',
        temperature: 0.2,
      },
    };

    const { result, unmount } = renderHook(() => useApp());

    act(() => {
      result.current.handleSaveCurrentChatSettings({
        ...currentChatState.activeChat!.settings,
        temperature: 1.2,
      });
    });

    expect(currentChatState.activeChat.settings.temperature).toBe(1.2);
    expect(currentChatState.activeChat.settings.lockedApiKey).toBe('locked-key');

    unmount();
  });

  it('preserves the locked API key when saving chat settings even if no Files API references remain', () => {
    currentChatState.activeChat = {
      ...hydratedSession,
      settings: {
        ...hydratedSession.settings,
        lockedApiKey: 'locked-key',
        temperature: 0.2,
      },
    };

    const { result, unmount } = renderHook(() => useApp());

    act(() => {
      result.current.handleSaveCurrentChatSettings({
        ...currentChatState.activeChat!.settings,
        temperature: 1.2,
      });
    });

    expect(currentChatState.activeChat.settings.temperature).toBe(1.2);
    expect(currentChatState.activeChat.settings.lockedApiKey).toBe('locked-key');

    unmount();
  });

  it('displays the independent OpenAI-compatible model name in a third-party session', () => {
    currentAppSettings = {
      ...currentAppSettings,
      modelId: 'gemini-3-flash-preview',
      thirdPartyApi: {
        connections: [
          createThirdPartyConnection({
            id: 'openai',
            apiKey: null,
            modelId: 'gpt-5.6-sol',
            models: [
              { id: 'gpt-5.6-sol', name: 'GPT-5.6 Sol', isPinned: true },
              { id: 'gpt-4.1', name: 'GPT-4.1' },
            ],
            enabled: true,
          }),
        ],
      },
    };
    currentChatState.activeChat = {
      ...hydratedSession,
      settings: {
        ...hydratedSession.settings,
        modelId: 'gpt-5.6-sol',
        providerId: 'openai',
      },
    };
    currentChatState.apiModels = [{ id: 'gemini-3-flash-preview', name: 'Gemini 3 Flash Preview' }];

    const { result, unmount } = renderHook(() => useApp());

    expect(result.current.getCurrentModelDisplayName()).toBe('GPT-5.6 Sol');

    unmount();
  });
});
