import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { AppSettings, ChatSettings, InputCommand, SavedChatSession } from '@/types';
import { createAppSettings, createChatSettings, createSavedChatSession } from '@/test/data/factories';

const { mockLoadLiveArtifactsSystemPrompt, mockFocusChatInput } = vi.hoisted(() => ({
  mockLoadLiveArtifactsSystemPrompt: vi.fn(),
  mockFocusChatInput: vi.fn(),
}));

vi.mock('@/features/prompts/promptRegistry', async () => {
  const actual = await vi.importActual<typeof import('@/features/prompts/promptRegistry')>(
    '@/features/prompts/promptRegistry',
  );

  return {
    ...actual,
    loadLiveArtifactsSystemPrompt: mockLoadLiveArtifactsSystemPrompt,
  };
});

vi.mock('@/utils/chat-input/focus', () => ({
  focusChatInput: mockFocusChatInput,
}));

import { useAppPromptModes } from './useAppPromptModes';
import { createDeferred, renderHook } from '@/test/render/renderer';
import { useMediaNavStore } from '@/stores/mediaNavStore';
import { useChatDraftStore } from '@/stores/chatDraftStore';

const LIVE_ARTIFACTS_PROMPT = '[Live Artifacts Protocol - zh]\nLive Artifacts prompt';
const LIVE_ARTIFACTS_PROMPT_EN = '[Live Artifacts Protocol - en]\nLive Artifacts prompt';

type UseAppPromptModesTestOptions = Parameters<typeof useAppPromptModes>[0];

const createSetCommandedInputMock = () => vi.fn<(command: InputCommand) => void>();

const useAppPromptModesWithDefaultTheme = (options: UseAppPromptModesTestOptions) => useAppPromptModes(options);

const createLiveArtifactsChatSettings = (overrides: Partial<ChatSettings> = {}) =>
  createChatSettings({
    modelId: 'gemini-3-flash-preview',
    systemInstruction: '',
    ...overrides,
  });

const createLiveArtifactsSession = (
  overrides: Partial<SavedChatSession> = {},
  settingsOverrides: Partial<ChatSettings> = {},
): SavedChatSession =>
  createSavedChatSession({
    id: 'session-1',
    title: 'Session',
    timestamp: Date.now(),
    messages: [],
    settings: createLiveArtifactsChatSettings(settingsOverrides),
    ...overrides,
  });

describe('useAppPromptModes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockLoadLiveArtifactsSystemPrompt.mockReset();
    mockLoadLiveArtifactsSystemPrompt.mockResolvedValue(LIVE_ARTIFACTS_PROMPT);
    useMediaNavStore.setState({
      isOpen: false,
      openKind: null,
      activeFileId: null,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('optimistically marks the Live Artifacts prompt active while it is loading', async () => {
    const deferred = createDeferred<string>();
    mockLoadLiveArtifactsSystemPrompt.mockReturnValue(deferred.promise);

    const setAppSettings = vi.fn();
    const setCurrentChatSettings = vi.fn();
    const { result, unmount } = renderHook(() =>
      useAppPromptModesWithDefaultTheme({
        appSettings: createAppSettings(),
        setAppSettings,
        activeChat: createLiveArtifactsSession(),
        activeSessionId: 'session-1',
        currentChatSettings: createLiveArtifactsChatSettings(),
        setCurrentChatSettings,
        handleSendMessage: vi.fn(),
        setCommandedInput: createSetCommandedInputMock(),
      }),
    );

    let pendingPromise: Promise<void> | undefined;
    act(() => {
      pendingPromise = result.current.handleLoadLiveArtifactsPromptAndSave();
    });

    expect(result.current.isLiveArtifactsPromptActive).toBe(true);
    expect(result.current.isLiveArtifactsPromptBusy).toBe(true);

    await act(async () => {
      deferred.resolve(LIVE_ARTIFACTS_PROMPT);
      await pendingPromise;
    });

    expect(setAppSettings).toHaveBeenCalled();
    expect(setCurrentChatSettings).toHaveBeenCalled();
    unmount();
  });

  it('loads the Live Artifacts prompt in the active UI language', async () => {
    mockLoadLiveArtifactsSystemPrompt.mockResolvedValue(LIVE_ARTIFACTS_PROMPT_EN);

    const setAppSettings = vi.fn();
    const setCurrentChatSettings = vi.fn();
    const { result, unmount } = renderHook(() =>
      useAppPromptModesWithDefaultTheme({
        appSettings: createAppSettings(),
        setAppSettings,
        activeChat: createLiveArtifactsSession(),
        activeSessionId: 'session-1',
        currentChatSettings: createLiveArtifactsChatSettings(),
        setCurrentChatSettings,
        handleSendMessage: vi.fn(),
        setCommandedInput: createSetCommandedInputMock(),
        language: 'en',
      }),
    );

    await act(async () => {
      await result.current.handleLoadLiveArtifactsPromptAndSave();
    });

    expect(mockLoadLiveArtifactsSystemPrompt).toHaveBeenCalledWith('en', 'inline');
    expect(setAppSettings).toHaveBeenCalledWith(expect.any(Function));
    const appSettingsUpdater = setAppSettings.mock.calls.at(-1)?.[0] as (prev: AppSettings) => AppSettings;
    expect(appSettingsUpdater(createAppSettings()).systemInstruction).toBe(LIVE_ARTIFACTS_PROMPT_EN);

    unmount();
  });

  it('keeps the current page theme out of the built-in Live Artifacts prompt loader', async () => {
    mockLoadLiveArtifactsSystemPrompt.mockResolvedValue(LIVE_ARTIFACTS_PROMPT_EN);

    const setAppSettings = vi.fn();
    const { result, unmount } = renderHook(() =>
      useAppPromptModesWithDefaultTheme({
        appSettings: createAppSettings(),
        setAppSettings,
        activeChat: createLiveArtifactsSession(),
        activeSessionId: 'session-1',
        currentChatSettings: createLiveArtifactsChatSettings(),
        setCurrentChatSettings: vi.fn(),
        handleSendMessage: vi.fn(),
        setCommandedInput: createSetCommandedInputMock(),
        language: 'en',
      }),
    );

    await act(async () => {
      await result.current.handleLoadLiveArtifactsPromptAndSave();
    });

    expect(mockLoadLiveArtifactsSystemPrompt).toHaveBeenCalledWith('en', 'inline');
    const appSettingsUpdater = setAppSettings.mock.calls.at(-1)?.[0] as (prev: AppSettings) => AppSettings;
    expect(appSettingsUpdater(createAppSettings()).systemInstruction).toBe(LIVE_ARTIFACTS_PROMPT_EN);

    unmount();
  });

  it('does not refresh an active built-in Live Artifacts prompt when only the page theme changes', async () => {
    const setAppSettings = vi.fn();
    const setCurrentChatSettings = vi.fn();
    const { unmount } = renderHook(() =>
      useAppPromptModesWithDefaultTheme({
        appSettings: createAppSettings({ systemInstruction: LIVE_ARTIFACTS_PROMPT_EN }),
        setAppSettings,
        activeChat: createLiveArtifactsSession({ title: 'Session 1' }, { systemInstruction: LIVE_ARTIFACTS_PROMPT_EN }),
        activeSessionId: 'session-1',
        currentChatSettings: createLiveArtifactsChatSettings({ systemInstruction: LIVE_ARTIFACTS_PROMPT_EN }),
        setCurrentChatSettings,
        handleSendMessage: vi.fn(),
        setCommandedInput: createSetCommandedInputMock(),
        language: 'en',
      }),
    );

    await act(async () => {
      await Promise.resolve();
    });

    expect(mockLoadLiveArtifactsSystemPrompt).not.toHaveBeenCalled();
    expect(setAppSettings).not.toHaveBeenCalled();
    expect(setCurrentChatSettings).not.toHaveBeenCalled();

    unmount();
  });

  it('uses the configured custom Live Artifacts prompt for prompt-mode activation', async () => {
    const customPrompt = 'Custom Live Artifacts prompt without built-in marker';
    const setAppSettings = vi.fn();
    const setCurrentChatSettings = vi.fn();

    const { result, unmount } = renderHook(() =>
      useAppPromptModesWithDefaultTheme({
        appSettings: createAppSettings({ liveArtifactsSystemPrompt: customPrompt }),
        setAppSettings,
        activeChat: createLiveArtifactsSession(),
        activeSessionId: 'session-1',
        currentChatSettings: createLiveArtifactsChatSettings(),
        setCurrentChatSettings,
        handleSendMessage: vi.fn(),
        setCommandedInput: createSetCommandedInputMock(),
        language: 'en',
      }),
    );

    await act(async () => {
      await result.current.handleLoadLiveArtifactsPromptAndSave();
    });

    expect(mockLoadLiveArtifactsSystemPrompt).not.toHaveBeenCalled();
    expect(setAppSettings).toHaveBeenCalledWith(expect.any(Function));
    const appSettingsUpdater = setAppSettings.mock.calls.at(-1)?.[0] as (prev: AppSettings) => AppSettings;
    expect(appSettingsUpdater(createAppSettings()).systemInstruction).toBe(customPrompt);

    unmount();
  });

  it('ignores repeated Live Artifacts button presses while a Live Artifacts prompt load is already in flight', async () => {
    const deferred = createDeferred<string>();
    mockLoadLiveArtifactsSystemPrompt.mockReturnValue(deferred.promise);

    const { result, unmount } = renderHook(() =>
      useAppPromptModesWithDefaultTheme({
        appSettings: createAppSettings(),
        setAppSettings: vi.fn(),
        activeChat: createLiveArtifactsSession(),
        activeSessionId: 'session-1',
        currentChatSettings: createLiveArtifactsChatSettings(),
        setCurrentChatSettings: vi.fn(),
        handleSendMessage: vi.fn(),
        setCommandedInput: createSetCommandedInputMock(),
      }),
    );

    let firstCall: Promise<void> | undefined;
    act(() => {
      firstCall = result.current.handleLoadLiveArtifactsPromptAndSave();
    });

    await act(async () => {
      await result.current.handleLoadLiveArtifactsPromptAndSave();
    });

    expect(mockLoadLiveArtifactsSystemPrompt).toHaveBeenCalledTimes(1);

    await act(async () => {
      deferred.resolve(LIVE_ARTIFACTS_PROMPT);
      await firstCall;
    });

    unmount();
  });

  it('allows toggling the Live Artifacts prompt in a different session after switching away from an in-flight load', async () => {
    const deferred = createDeferred<string>();
    mockLoadLiveArtifactsSystemPrompt.mockReturnValueOnce(deferred.promise).mockResolvedValue(LIVE_ARTIFACTS_PROMPT);

    const setAppSettings = vi.fn();
    const setCurrentChatSettings = vi.fn();
    const options = {
      appSettings: createAppSettings(),
      setAppSettings,
      activeChat: createLiveArtifactsSession({ title: 'Session 1' }),
      activeSessionId: 'session-1' as string | null,
      currentChatSettings: createLiveArtifactsChatSettings(),
      setCurrentChatSettings,
      handleSendMessage: vi.fn(),
      setCommandedInput: createSetCommandedInputMock(),
    };

    const { result, rerender, unmount } = renderHook(() => useAppPromptModesWithDefaultTheme(options));

    act(() => {
      void result.current.handleLoadLiveArtifactsPromptAndSave();
    });

    options.activeChat = createLiveArtifactsSession({
      id: 'session-2',
      title: 'Session 2',
    });
    options.activeSessionId = 'session-2';
    options.currentChatSettings = createLiveArtifactsChatSettings();
    rerender();

    await act(async () => {
      await result.current.handleLoadLiveArtifactsPromptAndSave();
    });

    expect(mockLoadLiveArtifactsSystemPrompt).toHaveBeenCalledTimes(2);

    await act(async () => {
      deferred.resolve(LIVE_ARTIFACTS_PROMPT);
      await Promise.resolve();
    });

    unmount();
  });

  it('does not write the Live Artifacts prompt into the newly active session when an older load resolves late', async () => {
    const deferred = createDeferred<string>();
    mockLoadLiveArtifactsSystemPrompt.mockReturnValue(deferred.promise);

    const setAppSettings = vi.fn();
    const setCurrentChatSettings = vi.fn();
    const options = {
      appSettings: createAppSettings(),
      setAppSettings,
      activeChat: createLiveArtifactsSession({ title: 'Session 1' }),
      activeSessionId: 'session-1' as string | null,
      currentChatSettings: createLiveArtifactsChatSettings(),
      setCurrentChatSettings,
      handleSendMessage: vi.fn(),
      setCommandedInput: createSetCommandedInputMock(),
    };

    const { result, rerender, unmount } = renderHook(() => useAppPromptModesWithDefaultTheme(options));

    act(() => {
      void result.current.handleLoadLiveArtifactsPromptAndSave();
    });

    options.activeChat = createLiveArtifactsSession({
      id: 'session-2',
      title: 'Session 2',
    });
    options.activeSessionId = 'session-2';
    options.currentChatSettings = createLiveArtifactsChatSettings();
    rerender();

    await act(async () => {
      deferred.resolve(LIVE_ARTIFACTS_PROMPT);
      await Promise.resolve();
    });

    expect(setCurrentChatSettings).not.toHaveBeenCalled();

    unmount();
  });

  it('keeps the Live Artifacts button inactive when only app settings contain the Live Artifacts prompt', () => {
    const { result, unmount } = renderHook(() =>
      useAppPromptModesWithDefaultTheme({
        appSettings: createAppSettings({ systemInstruction: LIVE_ARTIFACTS_PROMPT }),
        setAppSettings: vi.fn(),
        activeChat: createLiveArtifactsSession({ title: 'Session 1' }),
        activeSessionId: 'session-1',
        currentChatSettings: createLiveArtifactsChatSettings(),
        setCurrentChatSettings: vi.fn(),
        handleSendMessage: vi.fn(),
        setCommandedInput: createSetCommandedInputMock(),
      }),
    );

    // Button tracks the active session only so it cannot look "on" when this chat has no LA prompt.
    expect(result.current.isLiveArtifactsPromptActive).toBe(false);

    unmount();
  });

  it('marks the Live Artifacts button active only when the current session has the Live Artifacts prompt', () => {
    const { result, unmount } = renderHook(() =>
      useAppPromptModesWithDefaultTheme({
        appSettings: createAppSettings({ systemInstruction: '' }),
        setAppSettings: vi.fn(),
        activeChat: createLiveArtifactsSession({ title: 'Session 1' }, { systemInstruction: LIVE_ARTIFACTS_PROMPT }),
        activeSessionId: 'session-1',
        currentChatSettings: createLiveArtifactsChatSettings({ systemInstruction: LIVE_ARTIFACTS_PROMPT }),
        setCurrentChatSettings: vi.fn(),
        handleSendMessage: vi.fn(),
        setCommandedInput: createSetCommandedInputMock(),
      }),
    );

    expect(result.current.isLiveArtifactsPromptActive).toBe(true);

    unmount();
  });

  it('stays inactive after disabling the Live Artifacts prompt once persisted settings are cleared', async () => {
    const options = {
      appSettings: createAppSettings({ systemInstruction: LIVE_ARTIFACTS_PROMPT }),
      setAppSettings: vi.fn(),
      activeChat: createLiveArtifactsSession({ title: 'Session 1' }, { systemInstruction: LIVE_ARTIFACTS_PROMPT }),
      activeSessionId: 'session-1' as string | null,
      currentChatSettings: createLiveArtifactsChatSettings({ systemInstruction: LIVE_ARTIFACTS_PROMPT }),
      setCurrentChatSettings: vi.fn(),
      handleSendMessage: vi.fn(),
      setCommandedInput: createSetCommandedInputMock(),
    };

    const { result, rerender, unmount } = renderHook(() => useAppPromptModesWithDefaultTheme(options));

    await act(async () => {
      await result.current.handleLoadLiveArtifactsPromptAndSave();
    });

    expect(result.current.isLiveArtifactsPromptActive).toBe(false);

    options.appSettings = createAppSettings({ systemInstruction: '' });
    options.activeChat = {
      ...options.activeChat,
      settings: createLiveArtifactsChatSettings(),
    };
    options.currentChatSettings = createLiveArtifactsChatSettings();

    rerender();
    await act(async () => {
      await Promise.resolve();
    });

    expect(result.current.isLiveArtifactsPromptActive).toBe(false);

    unmount();
  });

  it('fills the Live Artifacts suggestion into the input and activates the prompt without sending', async () => {
    const setAppSettings = vi.fn();
    const setCurrentChatSettings = vi.fn();
    const setCommandedInput = createSetCommandedInputMock();
    const handleSendMessage = vi.fn();

    const { result, unmount } = renderHook(() =>
      useAppPromptModesWithDefaultTheme({
        appSettings: createAppSettings(),
        setAppSettings,
        activeChat: createLiveArtifactsSession({ title: 'Session 1' }),
        activeSessionId: 'session-1',
        currentChatSettings: createLiveArtifactsChatSettings(),
        setCurrentChatSettings,
        handleSendMessage,
        setCommandedInput,
      }),
    );

    mockLoadLiveArtifactsSystemPrompt.mockClear();

    await act(async () => {
      await result.current.handleSuggestionClick('organize', 'Create interactive HTML board.');
    });

    expect(handleSendMessage).not.toHaveBeenCalled();
    expect(setCommandedInput).toHaveBeenCalledWith({
      text: 'Create interactive HTML board.\n',
      id: expect.any(Number),
      mode: 'replace',
    });
    expect(mockFocusChatInput).toHaveBeenCalledWith(50, { caret: 'end' });
    expect(setAppSettings).toHaveBeenCalledWith(expect.any(Function));
    expect(result.current.isLiveArtifactsPromptActive).toBe(true);

    unmount();
  });

  it('sends follow-up suggestions immediately even when the legacy auto-send preference is false', async () => {
    const setCommandedInput = createSetCommandedInputMock();
    const handleSendMessage = vi.fn();

    const { result, unmount } = renderHook(() =>
      useAppPromptModesWithDefaultTheme({
        appSettings: createAppSettings({ isAutoSendOnSuggestionClick: false }),
        setAppSettings: vi.fn(),
        activeChat: createLiveArtifactsSession({ title: 'Session 1' }),
        activeSessionId: 'session-1',
        currentChatSettings: createLiveArtifactsChatSettings(),
        setCurrentChatSettings: vi.fn(),
        handleSendMessage,
        setCommandedInput,
      }),
    );

    await act(async () => {
      await result.current.handleSuggestionClick('follow-up', 'Show a short example.');
    });

    expect(handleSendMessage).toHaveBeenCalledWith({ text: 'Show a short example.' });
    expect(setCommandedInput).not.toHaveBeenCalled();

    unmount();
  });

  it('fills follow-up suggestions into the input when the fill action is used', async () => {
    const setCommandedInput = createSetCommandedInputMock();
    const handleSendMessage = vi.fn();

    const { result, unmount } = renderHook(() =>
      useAppPromptModesWithDefaultTheme({
        appSettings: createAppSettings(),
        setAppSettings: vi.fn(),
        activeChat: createLiveArtifactsSession({ title: 'Session 1' }),
        activeSessionId: 'session-1',
        currentChatSettings: createLiveArtifactsChatSettings(),
        setCurrentChatSettings: vi.fn(),
        handleSendMessage,
        setCommandedInput,
      }),
    );

    await act(async () => {
      await result.current.handleSuggestionClick('follow-up-fill', 'Compare both options.');
    });

    expect(handleSendMessage).not.toHaveBeenCalled();
    expect(setCommandedInput).toHaveBeenCalledWith({
      text: 'Compare both options.\n',
      id: expect.any(Number),
    });
    expect(mockFocusChatInput).toHaveBeenCalledWith(50, { caret: 'end' });

    unmount();
  });

  it('toggles Live Artifacts off when the organize suggestion is clicked while already active', async () => {
    const setAppSettings = vi.fn();
    const setCurrentChatSettings = vi.fn();
    const setCommandedInput = createSetCommandedInputMock();
    const handleSendMessage = vi.fn();

    useChatDraftStore.setState({
      drafts: {
        'session-1': {
          inputText: 'Create interactive HTML board.\n',
          quotes: [],
          ttsContext: '',
        },
      },
    });

    const { result, unmount } = renderHook(() =>
      useAppPromptModesWithDefaultTheme({
        appSettings: createAppSettings({ systemInstruction: LIVE_ARTIFACTS_PROMPT }),
        setAppSettings,
        activeChat: createLiveArtifactsSession({ title: 'Session 1' }, { systemInstruction: LIVE_ARTIFACTS_PROMPT }),
        activeSessionId: 'session-1',
        currentChatSettings: createLiveArtifactsChatSettings({ systemInstruction: LIVE_ARTIFACTS_PROMPT }),
        setCurrentChatSettings,
        handleSendMessage,
        setCommandedInput,
      }),
    );

    expect(result.current.isLiveArtifactsPromptActive).toBe(true);

    await act(async () => {
      await result.current.handleSuggestionClick('organize', 'Create interactive HTML board.');
    });

    expect(handleSendMessage).not.toHaveBeenCalled();
    expect(setCommandedInput).toHaveBeenCalledWith({
      text: 'Create interactive HTML board.\n',
      id: expect.any(Number),
      mode: 'replace',
    });
    expect(result.current.isLiveArtifactsPromptActive).toBe(true);

    unmount();
  });

  it('keeps Live Artifacts active when toggled on the homepage and then a new session is activated', async () => {
    mockLoadLiveArtifactsSystemPrompt.mockResolvedValue(LIVE_ARTIFACTS_PROMPT);

    const setAppSettings = vi.fn((updater) => {
      const next = typeof updater === 'function' ? updater(options.appSettings) : updater;
      options.appSettings = next;
    });
    const setCurrentChatSettings = vi.fn((updater) => {
      const next = typeof updater === 'function' ? updater(options.currentChatSettings) : updater;
      options.currentChatSettings = next;
    });
    const options = {
      appSettings: createAppSettings({ systemInstruction: '' }),
      setAppSettings,
      activeChat: undefined as any,
      activeSessionId: null as string | null,
      currentChatSettings: createLiveArtifactsChatSettings({ systemInstruction: '' }),
      setCurrentChatSettings,
      handleSendMessage: vi.fn(),
      setCommandedInput: createSetCommandedInputMock(),
    };

    const { result, rerender, unmount } = renderHook(() => useAppPromptModesWithDefaultTheme(options));

    // Initially inactive on homepage
    expect(result.current.isLiveArtifactsPromptActive).toBe(false);

    // Toggle on homepage
    await act(async () => {
      await result.current.handleLoadLiveArtifactsPromptAndSave();
    });
    rerender();

    expect(result.current.isLiveArtifactsPromptActive).toBe(true);
    expect(setCurrentChatSettings).toHaveBeenCalled();

    // Now user sends a message / file, creating a new session
    options.activeSessionId = 'new-session-id';
    options.activeChat = createLiveArtifactsSession(
      { id: 'new-session-id', title: 'New Chat' },
      { systemInstruction: LIVE_ARTIFACTS_PROMPT },
    );
    options.currentChatSettings = createLiveArtifactsChatSettings({ systemInstruction: LIVE_ARTIFACTS_PROMPT });
    rerender();

    // Live Artifacts must remain active!
    expect(result.current.isLiveArtifactsPromptActive).toBe(true);

    unmount();
  });

  it('automatically deactivates Live Artifacts when PDF navigation is enabled', async () => {
    const setAppSettings = vi.fn();
    const setCurrentChatSettings = vi.fn();
    const options = {
      appSettings: createAppSettings({ systemInstruction: LIVE_ARTIFACTS_PROMPT }),
      setAppSettings,
      activeChat: createLiveArtifactsSession({ title: 'Session 1' }, { systemInstruction: LIVE_ARTIFACTS_PROMPT }),
      activeSessionId: 'session-1' as string | null,
      currentChatSettings: createLiveArtifactsChatSettings({
        systemInstruction: LIVE_ARTIFACTS_PROMPT,
        isPdfNavEnabled: false,
      }),
      setCurrentChatSettings,
      handleSendMessage: vi.fn(),
      setCommandedInput: createSetCommandedInputMock(),
    };

    const { result, rerender, unmount } = renderHook(() => useAppPromptModesWithDefaultTheme(options));

    expect(result.current.isLiveArtifactsPromptActive).toBe(true);

    // User enables PDF navigation
    options.currentChatSettings = createLiveArtifactsChatSettings({
      systemInstruction: LIVE_ARTIFACTS_PROMPT,
      isPdfNavEnabled: true,
    });
    rerender();

    expect(result.current.isLiveArtifactsPromptActive).toBe(false);
    expect(setAppSettings).toHaveBeenCalledWith(expect.any(Function));
    expect(setCurrentChatSettings).toHaveBeenCalledWith(expect.any(Function));

    const chatSettingsUpdater = setCurrentChatSettings.mock.calls.at(-1)?.[0] as (prev: ChatSettings) => ChatSettings;
    expect(chatSettingsUpdater(options.currentChatSettings).systemInstruction).toBe('');

    unmount();
  });

  it('automatically deactivates Live Artifacts when image, video, or audio navigation is enabled', async () => {
    for (const kind of ['isImageNavEnabled', 'isVideoNavEnabled', 'isAudioNavEnabled'] as const) {
      const setAppSettings = vi.fn();
      const setCurrentChatSettings = vi.fn();
      const options = {
        appSettings: createAppSettings({ systemInstruction: LIVE_ARTIFACTS_PROMPT }),
        setAppSettings,
        activeChat: createLiveArtifactsSession({ title: 'Session 1' }, { systemInstruction: LIVE_ARTIFACTS_PROMPT }),
        activeSessionId: 'session-1' as string | null,
        currentChatSettings: createLiveArtifactsChatSettings({
          systemInstruction: LIVE_ARTIFACTS_PROMPT,
          [kind]: false,
        }),
        setCurrentChatSettings,
        handleSendMessage: vi.fn(),
        setCommandedInput: createSetCommandedInputMock(),
      };

      const { result, rerender, unmount } = renderHook(() => useAppPromptModesWithDefaultTheme(options));

      expect(result.current.isLiveArtifactsPromptActive).toBe(true);

      options.currentChatSettings = createLiveArtifactsChatSettings({
        systemInstruction: LIVE_ARTIFACTS_PROMPT,
        [kind]: true,
      });
      rerender();

      expect(result.current.isLiveArtifactsPromptActive).toBe(false);
      unmount();
    }
  });

  it('does not automatically deactivate Live Artifacts when the media navigation panel is opened', async () => {
    const setAppSettings = vi.fn();
    const setCurrentChatSettings = vi.fn();
    const options = {
      appSettings: createAppSettings({ systemInstruction: LIVE_ARTIFACTS_PROMPT }),
      setAppSettings,
      activeChat: createLiveArtifactsSession({ title: 'Session 1' }, { systemInstruction: LIVE_ARTIFACTS_PROMPT }),
      activeSessionId: 'session-1' as string | null,
      currentChatSettings: createLiveArtifactsChatSettings({
        systemInstruction: LIVE_ARTIFACTS_PROMPT,
      }),
      setCurrentChatSettings,
      handleSendMessage: vi.fn(),
      setCommandedInput: createSetCommandedInputMock(),
    };

    const { result, rerender, unmount } = renderHook(() => useAppPromptModesWithDefaultTheme(options));

    expect(result.current.isLiveArtifactsPromptActive).toBe(true);

    act(() => {
      useMediaNavStore.getState().openAs('pdf');
    });
    rerender();

    expect(result.current.isLiveArtifactsPromptActive).toBe(true);
    expect(setCurrentChatSettings).not.toHaveBeenCalled();

    unmount();
  });

  it('closes media navigation panel and resets navigation flags when activating Live Artifacts', async () => {
    act(() => {
      useMediaNavStore.getState().openAs('pdf');
    });

    const setAppSettings = vi.fn();
    const setCurrentChatSettings = vi.fn();
    const options = {
      appSettings: createAppSettings({ systemInstruction: '' }),
      setAppSettings,
      activeChat: createLiveArtifactsSession({ title: 'Session 1' }, { isPdfNavEnabled: true }),
      activeSessionId: 'session-1' as string | null,
      currentChatSettings: createLiveArtifactsChatSettings({
        systemInstruction: '',
        isPdfNavEnabled: true,
      }),
      setCurrentChatSettings,
      handleSendMessage: vi.fn(),
      setCommandedInput: createSetCommandedInputMock(),
    };

    const { result, unmount } = renderHook(() => useAppPromptModesWithDefaultTheme(options));

    expect(useMediaNavStore.getState().isOpen).toBe(true);

    await act(async () => {
      await result.current.handleLoadLiveArtifactsPromptAndSave();
    });

    expect(useMediaNavStore.getState().isOpen).toBe(false);
    expect(setCurrentChatSettings).toHaveBeenCalledWith(expect.any(Function));
    const updater = setCurrentChatSettings.mock.calls[0][0] as (prev: ChatSettings) => ChatSettings;
    const nextSettings = updater(options.currentChatSettings);
    expect(nextSettings.isPdfNavEnabled).toBe(false);
    expect(nextSettings.isVideoNavEnabled).toBe(false);
    expect(nextSettings.isAudioNavEnabled).toBe(false);
    expect(nextSettings.isImageNavEnabled).toBe(false);

    unmount();
  });

  it('sets isLiveArtifactsEnabled to true when activating Live Artifacts', async () => {
    const setAppSettings = vi.fn();
    const setCurrentChatSettings = vi.fn();
    const options = {
      appSettings: createAppSettings({ isLiveArtifactsEnabled: false }),
      setAppSettings,
      activeChat: createLiveArtifactsSession(),
      activeSessionId: 'session-1',
      currentChatSettings: createLiveArtifactsChatSettings({ isLiveArtifactsEnabled: false }),
      setCurrentChatSettings,
      handleSendMessage: vi.fn(),
      setCommandedInput: createSetCommandedInputMock(),
    };

    const { result, unmount } = renderHook(() => useAppPromptModesWithDefaultTheme(options));

    await act(async () => {
      await result.current.handleLoadLiveArtifactsPromptAndSave();
    });

    expect(setAppSettings).toHaveBeenCalledWith(expect.any(Function));
    const appUpdater = setAppSettings.mock.calls.at(-1)?.[0] as (prev: AppSettings) => AppSettings;
    expect(appUpdater(createAppSettings()).isLiveArtifactsEnabled).toBe(true);

    expect(setCurrentChatSettings).toHaveBeenCalledWith(expect.any(Function));
    const chatUpdater = setCurrentChatSettings.mock.calls.at(-1)?.[0] as (prev: ChatSettings) => ChatSettings;
    expect(chatUpdater(createLiveArtifactsChatSettings({ isLiveArtifactsEnabled: false })).isLiveArtifactsEnabled).toBe(
      true,
    );

    unmount();
  });

  it('sets isLiveArtifactsEnabled to false when deactivating Live Artifacts', async () => {
    const setAppSettings = vi.fn();
    const setCurrentChatSettings = vi.fn();
    const options = {
      appSettings: createAppSettings({ isLiveArtifactsEnabled: true }),
      setAppSettings,
      activeChat: createLiveArtifactsSession(),
      activeSessionId: 'session-1',
      currentChatSettings: createLiveArtifactsChatSettings({ isLiveArtifactsEnabled: true }),
      setCurrentChatSettings,
      handleSendMessage: vi.fn(),
      setCommandedInput: createSetCommandedInputMock(),
    };

    const { result, unmount } = renderHook(() => useAppPromptModesWithDefaultTheme(options));

    await act(async () => {
      await result.current.handleLoadLiveArtifactsPromptAndSave();
    });

    expect(setAppSettings).toHaveBeenCalledWith(expect.any(Function));
    const appUpdater = setAppSettings.mock.calls.at(-1)?.[0] as (prev: AppSettings) => AppSettings;
    expect(appUpdater(createAppSettings({ isLiveArtifactsEnabled: true })).isLiveArtifactsEnabled).toBe(false);

    expect(setCurrentChatSettings).toHaveBeenCalledWith(expect.any(Function));
    const chatUpdater = setCurrentChatSettings.mock.calls.at(-1)?.[0] as (prev: ChatSettings) => ChatSettings;
    expect(chatUpdater(createLiveArtifactsChatSettings({ isLiveArtifactsEnabled: true })).isLiveArtifactsEnabled).toBe(
      false,
    );

    unmount();
  });

  it('toggles visionPromptMode between bbox and null', async () => {
    const setAppSettings = vi.fn();
    const setCurrentChatSettings = vi.fn();
    const options = {
      appSettings: createAppSettings(),
      setAppSettings,
      activeChat: createLiveArtifactsSession(),
      activeSessionId: 'session-1',
      currentChatSettings: createLiveArtifactsChatSettings(),
      setCurrentChatSettings,
      handleSendMessage: vi.fn(),
      setCommandedInput: createSetCommandedInputMock(),
    };

    const { result, unmount } = renderHook(() => useAppPromptModesWithDefaultTheme(options));

    await act(async () => {
      await result.current.handleToggleBBoxMode();
    });

    expect(setCurrentChatSettings).toHaveBeenCalledWith(expect.any(Function));
    const updater = setCurrentChatSettings.mock.calls.at(-1)?.[0] as (prev: ChatSettings) => ChatSettings;
    expect(updater(createLiveArtifactsChatSettings()).visionPromptMode).toBe('bbox');

    unmount();
  });

  it('clears busy state and does not leave session-1 locked when switching to session-2 and returning to session-1', async () => {
    const deferred = createDeferred<string>();
    mockLoadLiveArtifactsSystemPrompt.mockReturnValue(deferred.promise);

    const setAppSettings = vi.fn();
    const setCurrentChatSettings = vi.fn();
    const options = {
      appSettings: createAppSettings(),
      setAppSettings,
      activeChat: createLiveArtifactsSession({ title: 'Session 1' }),
      activeSessionId: 'session-1' as string | null,
      currentChatSettings: createLiveArtifactsChatSettings(),
      setCurrentChatSettings,
      handleSendMessage: vi.fn(),
      setCommandedInput: createSetCommandedInputMock(),
    };

    const { result, rerender, unmount } = renderHook(() => useAppPromptModesWithDefaultTheme(options));

    act(() => {
      void result.current.handleLoadLiveArtifactsPromptAndSave();
    });

    expect(result.current.isLiveArtifactsPromptBusy).toBe(true);

    // Switch to session-2
    options.activeChat = createLiveArtifactsSession({ id: 'session-2', title: 'Session 2' });
    options.activeSessionId = 'session-2';
    options.currentChatSettings = createLiveArtifactsChatSettings();
    rerender();

    // Session 2 should not be busy
    expect(result.current.isLiveArtifactsPromptBusy).toBe(false);

    // Resolve the prompt load that was started on session-1
    await act(async () => {
      deferred.resolve(LIVE_ARTIFACTS_PROMPT);
      await Promise.resolve();
    });

    // Switch back to session-1
    options.activeChat = createLiveArtifactsSession({ id: 'session-1', title: 'Session 1' });
    options.activeSessionId = 'session-1';
    options.currentChatSettings = createLiveArtifactsChatSettings();
    rerender();

    // Session 1 must NOT be stuck busy!
    expect(result.current.isLiveArtifactsPromptBusy).toBe(false);

    unmount();
  });

  it('does not deactivate Live Artifacts when activating while media navigation was open', async () => {
    act(() => {
      useMediaNavStore.getState().openAs('pdf');
    });

    const setAppSettings = vi.fn();
    const setCurrentChatSettings = vi.fn();
    const options = {
      appSettings: createAppSettings({ systemInstruction: '' }),
      setAppSettings,
      activeChat: createLiveArtifactsSession({ title: 'Session 1' }, { isPdfNavEnabled: true }),
      activeSessionId: 'session-1' as string | null,
      currentChatSettings: createLiveArtifactsChatSettings({
        systemInstruction: '',
        isPdfNavEnabled: true,
      }),
      setCurrentChatSettings,
      handleSendMessage: vi.fn(),
      setCommandedInput: createSetCommandedInputMock(),
    };

    const { result, unmount } = renderHook(() => useAppPromptModesWithDefaultTheme(options));

    await act(async () => {
      await result.current.handleLoadLiveArtifactsPromptAndSave();
    });

    // Must be active and not auto-deactivated
    expect(result.current.isLiveArtifactsPromptActive).toBe(true);
    expect(useMediaNavStore.getState().isOpen).toBe(false);

    unmount();
  });

  it('preserves separate custom prompts for different sessions on toggle deactivation', async () => {
    const customPrompt1 = 'System prompt for session 1';
    const customPrompt2 = 'System prompt for session 2';
    const setAppSettings = vi.fn();
    const setCurrentChatSettings = vi.fn();

    const options = {
      appSettings: createAppSettings({ systemInstruction: '' }),
      setAppSettings,
      activeChat: createLiveArtifactsSession({ title: 'Session 1' }, { systemInstruction: customPrompt1 }),
      activeSessionId: 'session-1' as string | null,
      currentChatSettings: createLiveArtifactsChatSettings({ systemInstruction: customPrompt1 }),
      setCurrentChatSettings,
      handleSendMessage: vi.fn(),
      setCommandedInput: createSetCommandedInputMock(),
    };

    const { result, rerender, unmount } = renderHook(() => useAppPromptModesWithDefaultTheme(options));

    // Turn ON in session 1
    await act(async () => {
      await result.current.handleLoadLiveArtifactsPromptAndSave();
    });

    // Switch to session 2 with its own custom prompt
    options.activeChat = createLiveArtifactsSession(
      { id: 'session-2', title: 'Session 2' },
      { systemInstruction: customPrompt2 },
    );
    options.activeSessionId = 'session-2';
    options.currentChatSettings = createLiveArtifactsChatSettings({ systemInstruction: customPrompt2 });
    rerender();

    // Turn ON in session 2
    await act(async () => {
      await result.current.handleLoadLiveArtifactsPromptAndSave();
    });

    // Turn OFF in session 2
    await act(async () => {
      await result.current.handleLoadLiveArtifactsPromptAndSave();
    });

    // Session 2 should restore customPrompt2
    const session2Updater = setCurrentChatSettings.mock.calls.at(-1)?.[0] as (prev: ChatSettings) => ChatSettings;
    expect(session2Updater(options.currentChatSettings).systemInstruction).toBe(customPrompt2);

    // Switch back to session 1
    options.activeChat = createLiveArtifactsSession(
      { id: 'session-1', title: 'Session 1' },
      {
        isLiveArtifactsEnabled: true,
        systemInstruction: LIVE_ARTIFACTS_PROMPT,
      },
    );
    options.activeSessionId = 'session-1';
    options.currentChatSettings = createLiveArtifactsChatSettings({
      isLiveArtifactsEnabled: true,
      systemInstruction: LIVE_ARTIFACTS_PROMPT,
    });
    rerender();

    // Turn OFF in session 1
    await act(async () => {
      await result.current.handleLoadLiveArtifactsPromptAndSave();
    });

    // Session 1 should restore customPrompt1, NOT customPrompt2!
    const session1Updater = setCurrentChatSettings.mock.calls.at(-1)?.[0] as (prev: ChatSettings) => ChatSettings;
    expect(session1Updater(options.currentChatSettings).systemInstruction).toBe(customPrompt1);

    unmount();
  });

  it('atomically disables media navigation flags in currentChatSettings when activating Live Artifacts', async () => {
    const setCurrentChatSettings = vi.fn();
    const options = {
      appSettings: createAppSettings(),
      setAppSettings: vi.fn(),
      activeChat: createLiveArtifactsSession(
        { id: 'session-nav' },
        {
          isPdfNavEnabled: true,
          isVideoNavEnabled: true,
          isAudioNavEnabled: true,
          isImageNavEnabled: true,
        },
      ),
      activeSessionId: 'session-nav',
      currentChatSettings: createLiveArtifactsChatSettings({
        isPdfNavEnabled: true,
        isVideoNavEnabled: true,
        isAudioNavEnabled: true,
        isImageNavEnabled: true,
      }),
      setCurrentChatSettings,
      handleSendMessage: vi.fn(),
      setCommandedInput: createSetCommandedInputMock(),
    };

    const { result, unmount } = renderHook(() => useAppPromptModesWithDefaultTheme(options));

    await act(async () => {
      await result.current.handleLoadLiveArtifactsPromptAndSave();
    });

    const updater = setCurrentChatSettings.mock.calls.at(-1)?.[0] as (prev: ChatSettings) => ChatSettings;
    const nextSettings = updater(options.currentChatSettings);
    expect(nextSettings.isLiveArtifactsEnabled).toBe(true);
    expect(nextSettings.isPdfNavEnabled).toBe(false);
    expect(nextSettings.isVideoNavEnabled).toBe(false);
    expect(nextSettings.isAudioNavEnabled).toBe(false);
    expect(nextSettings.isImageNavEnabled).toBe(false);

    unmount();
  });

  it('cancels pending activation when deactivated before activeChat stabilizes', async () => {
    const setCurrentChatSettings = vi.fn();
    const options = {
      appSettings: createAppSettings(),
      setAppSettings: vi.fn(),
      activeChat: undefined as SavedChatSession | undefined,
      activeSessionId: 'session-slow',
      currentChatSettings: createLiveArtifactsChatSettings({ isLiveArtifactsEnabled: false }),
      setCurrentChatSettings,
      handleSendMessage: vi.fn(),
      setCommandedInput: createSetCommandedInputMock(),
    };

    const { result, rerender, unmount } = renderHook(() => useAppPromptModesWithDefaultTheme(options));

    // Turn ON while activeChat is still undefined
    await act(async () => {
      await result.current.handleLoadLiveArtifactsPromptAndSave();
    });

    // Immediately turn OFF
    act(() => {
      result.current.handleDeactivateLiveArtifactsPrompt();
    });

    // Now activeChat arrives
    options.activeChat = createLiveArtifactsSession({ id: 'session-slow' }, { isLiveArtifactsEnabled: false });
    setCurrentChatSettings.mockClear();
    rerender();

    // The stabilizing effect should NOT re-enable Live Artifacts
    expect(setCurrentChatSettings).not.toHaveBeenCalled();

    unmount();
  });

  it('activates Live Artifacts safely when media navigation was active without auto-deactivating', async () => {
    let currentSettings = createLiveArtifactsChatSettings({
      isLiveArtifactsEnabled: false,
      isPdfNavEnabled: true,
      systemInstruction: 'Custom user prompt',
    });
    let appSettings = createAppSettings({
      isLiveArtifactsEnabled: false,
      systemInstruction: 'Custom user prompt',
    });

    const setAppSettings = vi.fn((updater) => {
      appSettings = typeof updater === 'function' ? updater(appSettings) : updater;
    });
    const setCurrentChatSettings = vi.fn((updater) => {
      currentSettings = typeof updater === 'function' ? updater(currentSettings) : updater;
    });

    useMediaNavStore.setState({
      isOpen: true,
      openKind: 'pdf',
      activeFileId: 'pdf-1',
    });

    const options: UseAppPromptModesTestOptions = {
      appSettings,
      setAppSettings,
      activeChat: createLiveArtifactsSession({ id: 'session-1' }, currentSettings),
      activeSessionId: 'session-1',
      currentChatSettings: currentSettings,
      setCurrentChatSettings,
      handleSendMessage: vi.fn(),
      setCommandedInput: createSetCommandedInputMock(),
    };

    const { result, rerender, unmount } = renderHook(() => useAppPromptModesWithDefaultTheme(options));

    await act(async () => {
      await result.current.handleSuggestionClick('organize', 'Organize this into HTML.');
    });

    // Media nav panel should have been closed
    expect(useMediaNavStore.getState().isOpen).toBe(false);

    // Apply updated state to options and rerender
    options.appSettings = appSettings;
    options.currentChatSettings = currentSettings;
    options.activeChat = createLiveArtifactsSession({ id: 'session-1' }, currentSettings);
    rerender();

    // Live Artifacts must remain active and not be auto-deactivated by mutual exclusion
    expect(result.current.isLiveArtifactsPromptActive).toBe(true);
    expect(currentSettings.isLiveArtifactsEnabled).toBe(true);
    expect(currentSettings.isPdfNavEnabled).toBe(false);

    // Toggling Live Artifacts off later should safely restore the previous custom instruction
    act(() => {
      result.current.handleDeactivateLiveArtifactsPrompt();
    });

    options.appSettings = appSettings;
    options.currentChatSettings = currentSettings;
    rerender();

    expect(currentSettings.systemInstruction).toBe('Custom user prompt');

    unmount();
  });

  it('cancels in-flight async activation when deactivation occurs before prompt finishes loading', async () => {
    const deferred = createDeferred<string>();
    mockLoadLiveArtifactsSystemPrompt.mockReturnValue(deferred.promise);

    const setAppSettings = vi.fn();
    const setCurrentChatSettings = vi.fn();
    const options = {
      appSettings: createAppSettings(),
      setAppSettings,
      activeChat: createLiveArtifactsSession({ id: 'session-cancel' }),
      activeSessionId: 'session-cancel',
      currentChatSettings: createLiveArtifactsChatSettings({ isLiveArtifactsEnabled: false }),
      setCurrentChatSettings,
      handleSendMessage: vi.fn(),
      setCommandedInput: createSetCommandedInputMock(),
    };

    const { result, unmount } = renderHook(() => useAppPromptModesWithDefaultTheme(options));

    // Start activating (async load begins)
    let pendingActivation: Promise<void> | undefined;
    act(() => {
      pendingActivation = result.current.handleLoadLiveArtifactsPromptAndSave();
    });

    expect(result.current.isLiveArtifactsPromptActive).toBe(true);

    // User deactivates while prompt load is still pending
    act(() => {
      result.current.handleDeactivateLiveArtifactsPrompt();
    });

    expect(result.current.isLiveArtifactsPromptActive).toBe(false);

    setAppSettings.mockClear();
    setCurrentChatSettings.mockClear();

    // Now the delayed async prompt arrives
    await act(async () => {
      deferred.resolve(LIVE_ARTIFACTS_PROMPT);
      await pendingActivation;
    });

    // It must NOT re-enable Live Artifacts after being cancelled
    expect(setAppSettings).not.toHaveBeenCalled();
    expect(setCurrentChatSettings).not.toHaveBeenCalled();
    expect(result.current.isLiveArtifactsPromptActive).toBe(false);

    unmount();
  });

  it('sets busy state during deactivation to debounce rapid re-activation clicks', () => {
    const options = {
      appSettings: createAppSettings({ isLiveArtifactsEnabled: true }),
      setAppSettings: vi.fn(),
      activeChat: createLiveArtifactsSession({ id: 'session-busy' }, { isLiveArtifactsEnabled: true }),
      activeSessionId: 'session-busy',
      currentChatSettings: createLiveArtifactsChatSettings({ isLiveArtifactsEnabled: true }),
      setCurrentChatSettings: vi.fn(),
      handleSendMessage: vi.fn(),
      setCommandedInput: createSetCommandedInputMock(),
    };

    const { result, unmount } = renderHook(() => useAppPromptModesWithDefaultTheme(options));

    expect(result.current.isLiveArtifactsPromptActive).toBe(true);

    act(() => {
      result.current.handleDeactivateLiveArtifactsPrompt();
    });

    // Busy flag should be active during deactivation
    expect(result.current.isLiveArtifactsPromptBusy).toBe(true);
    expect(result.current.isLiveArtifactsPromptActive).toBe(false);

    unmount();
  });

  it('preserves user instruction when deactivating if instruction contains user text before legacy protocol', () => {
    const combinedPrompt = 'You are a chemistry expert.\n\n[Live Artifacts Inline Protocol - zh]\nProtocol...';
    let currentSettings = createLiveArtifactsChatSettings({
      isLiveArtifactsEnabled: true,
      systemInstruction: combinedPrompt,
    });
    const setCurrentChatSettings = vi.fn((updater) => {
      currentSettings = typeof updater === 'function' ? updater(currentSettings) : updater;
    });

    const options = {
      appSettings: createAppSettings(),
      setAppSettings: vi.fn(),
      activeChat: createLiveArtifactsSession({ id: 'session-combined' }, currentSettings),
      activeSessionId: 'session-combined',
      currentChatSettings: currentSettings,
      setCurrentChatSettings,
      handleSendMessage: vi.fn(),
      setCommandedInput: createSetCommandedInputMock(),
    };

    const { result, unmount } = renderHook(() => useAppPromptModesWithDefaultTheme(options));

    act(() => {
      result.current.handleDeactivateLiveArtifactsPrompt();
    });

    expect(currentSettings.isLiveArtifactsEnabled).toBe(false);
    expect(currentSettings.systemInstruction).toBe('You are a chemistry expert.');

    unmount();
  });
});
