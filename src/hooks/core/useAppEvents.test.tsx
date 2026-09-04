import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ModelOption } from '@/types';
import { FOCUS_HISTORY_SEARCH_EVENT } from '@/constants/layout';
import { useAppEvents } from './useAppEvents';
import { createAppSettings, createChatSettings, createThirdPartyConnection } from '@/test/data/factories';
import { setTestMatchMedia } from '@/test/browser/environment';
import { renderHook } from '@/test/render/renderer';

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
    { id: 'gemini-3.8-flash', name: 'Gemini 3.8 Flash', isPinned: true },
    { id: 'gemini-3.7-flash', name: 'Gemini 3.7 Flash', isPinned: true },
    { id: 'gemini-3.6-flash', name: 'Gemini 3.6 Flash', isPinned: true },
    { id: 'gemini-3-flash-preview', name: 'Gemini 3 Flash Preview', isPinned: true },
    { id: 'gemma-4-31b-it', name: 'Gemma 4 31B IT' },
    { id: 'gemini-3.1-flash-image-preview', name: 'Nano Banana 2' },
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

    expect(handleSelectModelInHeader).toHaveBeenCalledWith('gemini-3.8-flash');

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
          tabModelCycleIds: ['gemini-3.1-flash-image-preview', 'gemini-3-flash-preview'],
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

    expect(handleSelectModelInHeader).toHaveBeenCalledWith('gemini-3.1-flash-image-preview');

    textarea.remove();
    unmount();
  });

  it('starts the Tab cycle from the configured Gemini list when a GPT-compatible model is active', async () => {
    const handleSelectModelInHeader = vi.fn();
    const setAppSettings = vi.fn();
    const openaiProviderSettings = createAppSettings({
      ...appSettings,
      thirdPartyApi: {
        connections: [createThirdPartyConnection({ id: 'openai', modelId: 'gpt-5.5', enabled: true })],
      },
    });
    const textarea = document.createElement('textarea');
    textarea.dataset.chatInputTextarea = 'true';
    document.body.appendChild(textarea);
    textarea.focus();

    const { unmount } = renderHook(() =>
      useAppEvents({
        appSettings: openaiProviderSettings,
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

    // The apiMode switch is handled inside handleSelectModelInHeader
    // (useModelSelection resolves the target model's provider); the Tab cycle
    // itself only delegates the selection.
    expect(handleSelectModelInHeader).toHaveBeenCalledWith('gemini-3.1-pro-preview');
    expect(setAppSettings).not.toHaveBeenCalled();

    textarea.remove();
    unmount();
  });

  it('switches to a third-party model when it is included in the configured Tab cycle', async () => {
    const handleSelectModelInHeader = vi.fn();
    const setAppSettings = vi.fn();
    const geminiSettings = createAppSettings({
      ...appSettings,
      thirdPartyApi: {
        connections: [createThirdPartyConnection({ id: 'openai', modelId: 'gpt-4.1', enabled: true })],
      },
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
          { id: 'gpt-5.5', name: 'GPT-5.5', isPinned: true, apiMode: 'third-party' },
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

    // Tab cycle delegates the selection; the apiMode/third-party wiring lives
    // in handleSelectModelInHeader (useModelSelection), not in the shortcut.
    expect(handleSelectModelInHeader).toHaveBeenCalledWith('gpt-5.5');
    expect(setAppSettings).not.toHaveBeenCalled();

    textarea.remove();
    unmount();
  });

  it('cycles from Gemini to a third-party model stored in settings when the event model list only contains Gemini models', async () => {
    const handleSelectModelInHeader = vi.fn();
    const setAppSettings = vi.fn();
    const geminiSettings = createAppSettings({
      ...appSettings,
      thirdPartyApi: {
        connections: [
          createThirdPartyConnection({
            id: 'openai',
            modelId: 'gpt-4.1',
            enabled: true,
            models: [{ id: 'gpt-5.5', name: 'GPT-5.5', isPinned: true }],
          }),
        ],
      },
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

    // gpt-5.5 is configured in the cycle; buildTabCycleAvailableModels merges
    // configured third-party models into the list even when they are absent
    // from availableModels, so the cycle selects it and delegates to
    // handleSelectModelInHeader (which wires up the third-party routing).
    expect(handleSelectModelInHeader).toHaveBeenCalledWith('gpt-5.5');
    expect(setAppSettings).not.toHaveBeenCalled();

    textarea.remove();
    unmount();
  });
});
