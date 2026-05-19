import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppSettings, ModelOption } from '@/types';
import { FOCUS_HISTORY_SEARCH_EVENT } from '@/constants/shortcuts';
import { useAppEvents } from './useAppEvents';
import { createAppSettings, createChatSettings } from '@/test/factories';
import { setTestMatchMedia } from '@/test/browserEnvironment';
import { renderHook } from '@/test/testUtils';

const registerPwaMock = vi.fn();
const toggleFullscreenMock = vi.fn();
let needRefreshCallback: (() => void) | undefined;

vi.mock('@/pwa/register', () => ({
  registerPwa: (...args: unknown[]) => registerPwaMock(...args),
}));

vi.mock('@/pwa/loadRegisterSw', () => ({
  loadRegisterSW: vi.fn(async () => vi.fn()),
}));

vi.mock('@/hooks/ui/useFullscreen', () => ({
  useFullscreen: () => ({
    toggleFullscreen: toggleFullscreenMock,
  }),
}));

vi.mock('@/services/logService', async () => {
  const { createLogServiceMockModule } = await import('@/test/moduleMockDoubles');

  return createLogServiceMockModule();
});

vi.mock('@/pwa/install', () => ({
  getPwaInstallState: vi.fn(() => ({ state: 'installed' })),
  getManualInstallMessage: vi.fn(() => 'manual install'),
}));

describe('useAppEvents PWA lifecycle', () => {
  const appSettings = createAppSettings({
    language: 'en',
    customShortcuts: {},
  });

  const currentChatSettings = createChatSettings({
    modelId: 'gemini-3-flash-preview',
  });
  const availableModels: ModelOption[] = [
    { id: 'gemini-3.1-pro-preview', name: 'Gemini 3.1 Pro Preview', isPinned: true },
    { id: 'gemini-3.5-flash', name: 'Gemini 3.5 Flash', isPinned: true },
    { id: 'gemini-3-flash-preview', name: 'Gemini 3 Flash Preview', isPinned: true },
    { id: 'gemma-4-31b-it', name: 'Gemma 4 31B IT' },
    { id: 'imagen-4.0-generate-001', name: 'Imagen 4.0' },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('PROD', true);
    needRefreshCallback = undefined;
    registerPwaMock.mockImplementation(({ onNeedRefresh }: { onNeedRefresh?: () => void }) => {
      needRefreshCallback = onNeedRefresh;
      return vi.fn(async () => undefined);
    });

    setTestMatchMedia(false);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('marks an update as available when the service worker requests refresh', async () => {
    const { result, unmount } = renderHook(() =>
      useAppEvents({
        appSettings,
        setAppSettings: vi.fn(),
        startNewChat: vi.fn(),
        currentChatSettings,
        availableModels,
        handleSelectModelInHeader: vi.fn(),
        setIsLogViewerOpen: vi.fn(),
        onTogglePip: vi.fn(),
        isPipSupported: false,
        pipWindow: null,
        isLoading: false,
        onStopGenerating: vi.fn(),
      }),
    );

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
      needRefreshCallback?.();
    });

    expect(result.current.needRefresh).toBe(true);
    expect(result.current.updateDismissed).toBe(false);

    unmount();
  });

  it('cycles models using the default tab-cycle model subset when no manual selection is stored', async () => {
    const handleSelectModelInHeader = vi.fn();
    const textarea = document.createElement('textarea');
    textarea.dataset.chatInputTextarea = 'true';
    document.body.appendChild(textarea);
    textarea.focus();

    const { unmount } = renderHook(() =>
      useAppEvents({
        appSettings,
        setAppSettings: vi.fn(),
        startNewChat: vi.fn(),
        currentChatSettings: createChatSettings({ modelId: 'gemini-3.1-pro-preview' }),
        availableModels,
        handleSelectModelInHeader,
        setIsLogViewerOpen: vi.fn(),
        onTogglePip: vi.fn(),
        isPipSupported: false,
        pipWindow: null,
        isLoading: false,
        onStopGenerating: vi.fn(),
      }),
    );

    await act(async () => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }));
    });

    expect(handleSelectModelInHeader).toHaveBeenCalledWith('gemini-3.5-flash');

    textarea.remove();
    unmount();
  });

  it('dispatches the history search focus event with Command/Ctrl K', async () => {
    const focusSearchListener = vi.fn();
    document.addEventListener(FOCUS_HISTORY_SEARCH_EVENT, focusSearchListener);

    const { unmount } = renderHook(() =>
      useAppEvents({
        appSettings,
        setAppSettings: vi.fn(),
        startNewChat: vi.fn(),
        currentChatSettings,
        availableModels,
        handleSelectModelInHeader: vi.fn(),
        setIsLogViewerOpen: vi.fn(),
        onTogglePip: vi.fn(),
        isPipSupported: false,
        pipWindow: null,
        isLoading: false,
        onStopGenerating: vi.fn(),
      }),
    );

    const event = new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true, cancelable: true });

    await act(async () => {
      document.dispatchEvent(event);
    });

    expect(event.defaultPrevented).toBe(true);
    expect(focusSearchListener).toHaveBeenCalledTimes(1);

    document.removeEventListener(FOCUS_HISTORY_SEARCH_EVENT, focusSearchListener);
    unmount();
  });

  it('cycles models using the manually configured tab cycle selection when present', async () => {
    const handleSelectModelInHeader = vi.fn();
    const textarea = document.createElement('textarea');
    textarea.dataset.chatInputTextarea = 'true';
    document.body.appendChild(textarea);
    textarea.focus();

    const { unmount } = renderHook(() =>
      useAppEvents({
        appSettings: createAppSettings({
          ...appSettings,
          tabModelCycleIds: ['imagen-4.0-generate-001', 'gemini-3-flash-preview'],
        }),
        setAppSettings: vi.fn(),
        startNewChat: vi.fn(),
        currentChatSettings,
        availableModels,
        handleSelectModelInHeader,
        setIsLogViewerOpen: vi.fn(),
        onTogglePip: vi.fn(),
        isPipSupported: false,
        pipWindow: null,
        isLoading: false,
        onStopGenerating: vi.fn(),
      }),
    );

    await act(async () => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }));
    });

    expect(handleSelectModelInHeader).toHaveBeenCalledWith('imagen-4.0-generate-001');

    textarea.remove();
    unmount();
  });

  it('starts the Tab cycle from the configured Gemini list when a GPT-compatible model is active', async () => {
    const handleSelectModelInHeader = vi.fn();
    const setAppSettings = vi.fn();
    const openaiCompatibleSettings = createAppSettings({
      ...appSettings,
      apiMode: 'openai-compatible',
      isOpenAICompatibleApiEnabled: true,
      openaiCompatibleModelId: 'gpt-5.5',
    });
    const textarea = document.createElement('textarea');
    textarea.dataset.chatInputTextarea = 'true';
    document.body.appendChild(textarea);
    textarea.focus();

    const { unmount } = renderHook(() =>
      useAppEvents({
        appSettings: openaiCompatibleSettings,
        setAppSettings,
        startNewChat: vi.fn(),
        currentChatSettings: createChatSettings({
          modelId: 'gemini-3.1-pro-preview',
        }),
        availableModels: [
          { id: 'gemini-3.1-pro-preview', name: 'Gemini 3.1 Pro Preview', isPinned: true },
          { id: 'gemini-3-flash-preview', name: 'Gemini 3 Flash Preview', isPinned: true },
        ],
        handleSelectModelInHeader,
        setIsLogViewerOpen: vi.fn(),
        onTogglePip: vi.fn(),
        isPipSupported: false,
        pipWindow: null,
        isLoading: false,
        onStopGenerating: vi.fn(),
      }),
    );

    await act(async () => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }));
    });

    expect(handleSelectModelInHeader).toHaveBeenCalledWith('gemini-3.1-pro-preview');
    expect(setAppSettings).toHaveBeenCalledWith(expect.any(Function));

    const updateSettings = setAppSettings.mock.calls[0][0] as (prev: AppSettings) => AppSettings;
    expect(updateSettings(openaiCompatibleSettings)).toEqual(
      expect.objectContaining({
        apiMode: 'gemini-native',
        openaiCompatibleModelId: 'gpt-5.5',
      }),
    );

    textarea.remove();
    unmount();
  });

  it('switches to an OpenAI-compatible model when it is included in the configured Tab cycle', async () => {
    const handleSelectModelInHeader = vi.fn();
    const setAppSettings = vi.fn();
    const geminiSettings = createAppSettings({
      ...appSettings,
      apiMode: 'gemini-native',
      isOpenAICompatibleApiEnabled: true,
      openaiCompatibleModelId: 'gpt-4.1',
      tabModelCycleIds: ['gpt-5.5'],
    });
    const textarea = document.createElement('textarea');
    textarea.dataset.chatInputTextarea = 'true';
    document.body.appendChild(textarea);
    textarea.focus();

    const { unmount } = renderHook(() =>
      useAppEvents({
        appSettings: geminiSettings,
        setAppSettings,
        startNewChat: vi.fn(),
        currentChatSettings: createChatSettings({
          modelId: 'gemini-3.1-pro-preview',
        }),
        availableModels: [
          { id: 'gemini-3.1-pro-preview', name: 'Gemini 3.1 Pro Preview', isPinned: true, apiMode: 'gemini-native' },
          { id: 'gpt-5.5', name: 'GPT-5.5', isPinned: true, apiMode: 'openai-compatible' },
        ],
        handleSelectModelInHeader,
        setIsLogViewerOpen: vi.fn(),
        onTogglePip: vi.fn(),
        isPipSupported: false,
        pipWindow: null,
        isLoading: false,
        onStopGenerating: vi.fn(),
      }),
    );

    await act(async () => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }));
    });

    expect(handleSelectModelInHeader).not.toHaveBeenCalled();
    expect(setAppSettings).toHaveBeenCalledWith(expect.any(Function));

    const updateSettings = setAppSettings.mock.calls[0][0] as (prev: AppSettings) => AppSettings;
    expect(updateSettings(geminiSettings)).toEqual(
      expect.objectContaining({
        apiMode: 'openai-compatible',
        openaiCompatibleModelId: 'gpt-5.5',
        modelId: geminiSettings.modelId,
      }),
    );

    textarea.remove();
    unmount();
  });

  it('cycles from Gemini to an OpenAI-compatible model stored in settings when the event model list only contains Gemini models', async () => {
    const handleSelectModelInHeader = vi.fn();
    const setAppSettings = vi.fn();
    const geminiSettings = createAppSettings({
      ...appSettings,
      apiMode: 'gemini-native',
      isOpenAICompatibleApiEnabled: true,
      openaiCompatibleModelId: 'gpt-4.1',
      openaiCompatibleModels: [{ id: 'gpt-5.5', name: 'GPT-5.5', isPinned: true }],
      tabModelCycleIds: ['gemini-3.1-pro-preview', 'gemini-3-flash-preview', 'gpt-5.5'],
    });
    const textarea = document.createElement('textarea');
    textarea.dataset.chatInputTextarea = 'true';
    document.body.appendChild(textarea);
    textarea.focus();

    const { unmount } = renderHook(() =>
      useAppEvents({
        appSettings: geminiSettings,
        setAppSettings,
        startNewChat: vi.fn(),
        currentChatSettings: createChatSettings({
          modelId: 'gemini-3-flash-preview',
        }),
        availableModels: [
          { id: 'gemini-3.1-pro-preview', name: 'Gemini 3.1 Pro Preview', isPinned: true, apiMode: 'gemini-native' },
          { id: 'gemini-3-flash-preview', name: 'Gemini 3 Flash Preview', isPinned: true, apiMode: 'gemini-native' },
        ],
        handleSelectModelInHeader,
        setIsLogViewerOpen: vi.fn(),
        onTogglePip: vi.fn(),
        isPipSupported: false,
        pipWindow: null,
        isLoading: false,
        onStopGenerating: vi.fn(),
      }),
    );

    await act(async () => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }));
    });

    expect(handleSelectModelInHeader).not.toHaveBeenCalled();
    expect(setAppSettings).toHaveBeenCalledWith(expect.any(Function));

    const updateSettings = setAppSettings.mock.calls[0][0] as (prev: AppSettings) => AppSettings;
    expect(updateSettings(geminiSettings)).toEqual(
      expect.objectContaining({
        apiMode: 'openai-compatible',
        openaiCompatibleModelId: 'gpt-5.5',
        modelId: geminiSettings.modelId,
      }),
    );

    textarea.remove();
    unmount();
  });
});
