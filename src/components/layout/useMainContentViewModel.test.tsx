import { act, type PropsWithChildren } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppViewModel } from '@/hooks/app/useApp';
import { renderHook } from '@/test/render/renderer';
import {
  createAppSettings,
  createChatAreaProviderValue,
  createChatRuntimeApp,
  createChatSettings,
} from '@/test/layout/fixtures';
import { createThirdPartyConnection } from '@/test/data/factories';
import { ChatRuntimeProvider, useChatHeaderRuntime } from './chat-runtime/ChatRuntimeContext';
import { useMainContentViewModel } from './useMainContentViewModel';

const mockStores = vi.hoisted(() => {
  const ui = {
    isSettingsModalOpen: false,
    setIsSettingsModalOpen: vi.fn(),
    isPreloadedMessagesModalOpen: false,
    setIsPreloadedMessagesModalOpen: vi.fn(),
    isLogViewerOpen: false,
    setIsLogViewerOpen: vi.fn(),
  };
  const chat = {
    setCommandedInput: vi.fn(),
  };
  const useChatStoreMock = Object.assign((selector: (state: typeof chat) => unknown) => selector(chat), {
    getState: () => chat,
  });

  return {
    ui,
    chat,
    useChatStoreMock,
  };
});

vi.mock('@/stores/uiStore', () => ({
  useUIStore: (selector: (state: typeof mockStores.ui) => unknown) => selector(mockStores.ui),
}));

vi.mock('@/stores/chatStore', () => ({
  useChatStore: mockStores.useChatStoreMock,
}));

vi.mock('@/utils/keyboardShortcuts', () => ({
  getShortcutDisplay: vi.fn(() => 'shortcut'),
}));

const renderChatHeaderRuntime = (app: AppViewModel) =>
  renderHook(() => useChatHeaderRuntime(), {
    wrapper: ({ children }: PropsWithChildren) => <ChatRuntimeProvider app={app}>{children}</ChatRuntimeProvider>,
  });

type BuildAppOverrides = Omit<Partial<AppViewModel>, 'chatState'> & {
  chatState?: Partial<AppViewModel['chatState']>;
};

const buildApp = (overrides: BuildAppOverrides = {}) => {
  const { chatState: chatStateOverrides, ...appOverrides } = overrides;
  const appSettings = createAppSettings({
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
  });
  const handleSelectModelInHeader = vi.fn();
  const setAppSettings = vi.fn<AppViewModel['setAppSettings']>();
  const app = createChatRuntimeApp(
    createChatAreaProviderValue({
      header: {
        availableModels: [{ id: 'gemini-3-flash-preview', name: 'Gemini 3 Flash Preview' }],
        currentModelName: 'GPT-5.6 Sol',
        isPipSupported: false,
      },
      input: {
        appSettings,
        currentChatSettings: { modelId: 'gemini-3-flash-preview' },
        onSelectModel: handleSelectModelInHeader,
      },
    }),
  );

  return {
    ...app,
    appSettings,
    setAppSettings,
    getCurrentModelDisplayName: vi.fn(() => 'GPT-5.6 Sol'),
    ...appOverrides,
    chatState: {
      ...app.chatState,
      handleSelectModelInHeader,
      ...chatStateOverrides,
    },
  } satisfies AppViewModel;
};

const buildOpenaiProviderAppSettings = (overrides: {
  enabled?: boolean;
  modelId?: string;
  models?: Array<{ id: string; name: string; isPinned?: boolean }>;
}) => {
  const enabled = overrides.enabled ?? true;
  return {
    ...createAppSettings(),
    modelId: 'gemini-3-flash-preview',
    thirdPartyApi: {
      connections: [
        createThirdPartyConnection({
          id: 'openai',
          apiKey: null,
          modelId: overrides.modelId,
          models: overrides.models,
          enabled,
        }),
      ],
    },
  };
};

describe('chat runtime values', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    document.body.innerHTML = '';
  });

  it('shows enabled OpenAI-compatible models in the header', () => {
    const app = buildApp({
      chatState: {
        currentChatSettings: {
          ...createChatSettings(),
          modelId: 'gpt-5.6-sol',
          providerId: 'openai',
        },
      },
    });
    const { result, unmount } = renderChatHeaderRuntime(app);
    const header = result.current;

    expect(header.availableModels).toEqual([
      { id: 'gemini-3-flash-preview', name: 'Gemini 3 Flash Preview', apiMode: 'gemini-native' },
      {
        id: 'gpt-5.6-sol',
        name: 'GPT-5.6 Sol',
        isPinned: true,
        apiMode: 'third-party',
        providerId: 'openai',
        templateId: 'openai',
        connectionName: 'OpenAI',
        missingApiKey: true,
      },
      {
        id: 'gpt-4.1',
        name: 'GPT-4.1',
        apiMode: 'third-party',
        providerId: 'openai',
        templateId: 'openai',
        connectionName: 'OpenAI',
        missingApiKey: true,
      },
    ]);
    expect(header.selectedModelId).toBe('gpt-5.6-sol');
    expect(header.currentModelName).toBe('GPT-5.6 Sol');

    act(() => {
      header.onSelectModel('gpt-4.1');
    });

    // Selecting a model only delegates to the session handler — it never
    // touches global settings (no apiMode/isThirdPartyApiEnabled/activeProvider).
    expect(app.chatState.handleSelectModelInHeader).toHaveBeenCalledWith('gpt-4.1', undefined);
    expect(app.setAppSettings).not.toHaveBeenCalled();

    unmount();
  });

  it('shows third-party provider models in the header alongside Gemini models', () => {
    const app = buildApp({
      appSettings: buildOpenaiProviderAppSettings({
        enabled: true,
        modelId: 'gpt-5.6-sol',
        models: [{ id: 'gpt-5.6-sol', name: 'GPT-5.6 Sol', isPinned: true }],
      }),
      getCurrentModelDisplayName: vi.fn(() => 'Gemini 3 Flash Preview'),
    });
    const { result, unmount } = renderChatHeaderRuntime(app);
    const header = result.current;

    expect(header.availableModels).toEqual([
      { id: 'gemini-3-flash-preview', name: 'Gemini 3 Flash Preview', apiMode: 'gemini-native' },
      {
        id: 'gpt-5.6-sol',
        name: 'GPT-5.6 Sol',
        isPinned: true,
        apiMode: 'third-party',
        providerId: 'openai',
        templateId: 'openai',
        connectionName: 'OpenAI',
        missingApiKey: true,
      },
    ]);
    expect(header.selectedModelId).toBe('gemini-3-flash-preview');

    act(() => {
      header.onSelectModel('gemini-3.1-pro-preview');
    });

    expect(app.chatState.handleSelectModelInHeader).toHaveBeenCalledWith('gemini-3.1-pro-preview', undefined);
    expect(app.setAppSettings).not.toHaveBeenCalled();

    act(() => {
      header.onSelectModel('gpt-5.6-sol');
    });

    expect(app.chatState.handleSelectModelInHeader).toHaveBeenCalledWith('gpt-5.6-sol', undefined);
    expect(app.setAppSettings).not.toHaveBeenCalled();

    unmount();
  });

  it('delegates third-party model selection to the session handler', () => {
    const app = buildApp({
      appSettings: buildOpenaiProviderAppSettings({
        enabled: true,
        modelId: 'gpt-5.6-sol',
        models: [{ id: 'gpt-5.6-sol', name: 'GPT-5.6 Sol', isPinned: true }],
      }),
      getCurrentModelDisplayName: vi.fn(() => 'Gemini 3 Flash Preview'),
    });
    const { result, unmount } = renderChatHeaderRuntime(app);

    act(() => {
      result.current.onSelectModel('gpt-5.6-sol');
    });

    expect(app.chatState.handleSelectModelInHeader).toHaveBeenCalledWith('gpt-5.6-sol', undefined);
    expect(app.setAppSettings).not.toHaveBeenCalled();

    unmount();
  });

  it('shows enabled third-party models in the header', () => {
    const app = buildApp({
      appSettings: {
        ...createAppSettings(),
        modelId: 'gemini-3-flash-preview',
        thirdPartyApi: {
          connections: [
            createThirdPartyConnection({
              id: 'openai',
              apiKey: null,
              modelId: 'gpt-5.6-sol',
              models: [{ id: 'gpt-5.6-sol', name: 'GPT-5.6 Sol', isPinned: true }],
              enabled: true,
            }),
          ],
        },
      } as AppViewModel['appSettings'],
      getCurrentModelDisplayName: vi.fn(() => 'Gemini 3 Flash Preview'),
    });
    const { result, unmount } = renderChatHeaderRuntime(app);
    const header = result.current;

    expect(header.availableModels).toEqual([
      { id: 'gemini-3-flash-preview', name: 'Gemini 3 Flash Preview', apiMode: 'gemini-native' },
      {
        id: 'gpt-5.6-sol',
        name: 'GPT-5.6 Sol',
        isPinned: true,
        apiMode: 'third-party',
        providerId: 'openai',
        templateId: 'openai',
        connectionName: 'OpenAI',
        missingApiKey: true,
      },
    ]);
    expect(header.selectedModelId).toBe('gemini-3-flash-preview');

    act(() => {
      header.onSelectModel('gpt-5.6-sol');
    });

    expect(app.chatState.handleSelectModelInHeader).toHaveBeenCalledWith('gpt-5.6-sol', undefined);
    expect(app.setAppSettings).not.toHaveBeenCalled();

    unmount();
  });

  it('keeps third-party provider models hidden while the provider is disabled', () => {
    const app = buildApp({
      appSettings: buildOpenaiProviderAppSettings({
        enabled: false,
        modelId: 'gpt-5.6-sol',
        models: [{ id: 'gpt-5.6-sol', name: 'GPT-5.6 Sol', isPinned: true }],
      }),
      getCurrentModelDisplayName: vi.fn(() => 'Gemini 3 Flash Preview'),
    });
    const { result, unmount } = renderChatHeaderRuntime(app);
    const header = result.current;

    expect(header.availableModels).toEqual([
      { id: 'gemini-3-flash-preview', name: 'Gemini 3 Flash Preview', apiMode: 'gemini-native' },
    ]);
    expect(header.selectedModelId).toBe('gemini-3-flash-preview');

    act(() => {
      header.onSelectModel('gpt-5.6-sol');
    });

    // Disabled providers' models aren't in the list, but selecting one still
    // delegates (the session handler resolves the provider from the modelId).
    expect(app.setAppSettings).not.toHaveBeenCalled();
    expect(app.chatState.handleSelectModelInHeader).toHaveBeenCalledWith('gpt-5.6-sol', undefined);

    unmount();
  });

  it('uses the session third-party model as the header selection', () => {
    const app = buildApp({
      chatState: {
        currentChatSettings: {
          ...createChatSettings(),
          modelId: 'gpt-4.1',
          providerId: 'openai',
        },
      },
    });
    const { result, unmount } = renderChatHeaderRuntime(app);

    expect(result.current.selectedModelId).toBe('gpt-4.1');

    unmount();
  });

  it('selecting a Gemini model from a third-party session only delegates', () => {
    const app = buildApp();
    const { result, unmount } = renderChatHeaderRuntime(app);
    const header = result.current;

    act(() => {
      header.onSelectModel('gemini-3-flash-preview');
    });

    expect(app.chatState.handleSelectModelInHeader).toHaveBeenCalledWith('gemini-3-flash-preview', undefined);
    expect(app.setAppSettings).not.toHaveBeenCalled();

    unmount();
  });
});

describe('useMainContentViewModel sidebar wiring', () => {
  it('routes the sidebar pin toggle to the clicked session, not the active session', () => {
    const handleTogglePinSession = vi.fn();
    const handleTogglePinCurrentSession = vi.fn();
    const app = buildApp({ chatState: { handleTogglePinSession, handleTogglePinCurrentSession } });
    const { result, unmount } = renderHook(() => useMainContentViewModel({ app }));

    result.current.sidebarProps.onTogglePinSession('session-42');

    expect(handleTogglePinSession).toHaveBeenCalledWith('session-42');
    expect(handleTogglePinCurrentSession).not.toHaveBeenCalled();

    unmount();
  });
});
