import { describe, expect, it, vi } from 'vitest';
import { renderHook } from '@/test/render/renderer';
import { useChatInputRuntimeValues } from '@/components/layout/chat-runtime/inputRuntimeValues';
import { useChatMessageListRuntimeValues } from '@/components/layout/chat-runtime/messageListRuntimeValues';
import type { AppViewModel } from '@/hooks/app/useApp';
import type { ModelOption } from '@/types';

type DeepPartial<T> = { [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K] };

// Stable across rerenders, mirroring headerAvailableModels which is cached in a
// useMemo upstream. A fresh `[]` per call would change identity every render
// and defeat the reference-stability assertion.
const EMPTY_MODELS: ModelOption[] = [];

// A background-session churn produces a fresh `chatState` object literal (the
// whole useChat return value) while every other app member — useCallback
// references that do not depend on savedSessions — stays identical. This
// fixture models exactly that: the members below are created once and reused
// across rerenders, so only the chatState object identity changes.
const stableAppMembers = (): DeepPartial<AppViewModel> => ({
  setAppSettings: vi.fn(),
  pipState: {
    togglePip: vi.fn(),
    isPipActive: false,
    isPipSupported: false,
    pipWindow: null,
  },
  handleLoadLiveArtifactsPromptAndSave: vi.fn(),
  handleToggleBBoxMode: vi.fn(),
  handleToggleGuideMode: vi.fn(),
  handleSuggestionClick: vi.fn(),
  handleOpenSidePanel: vi.fn(),
  sessionTitle: 'Test session',
});

const stableChatState = (): DeepPartial<AppViewModel['chatState']> => ({
  handleSendMessage: vi.fn(),
  handleStopGenerating: vi.fn(),
  handleCancelEdit: vi.fn(),
  handleProcessAndAddFiles: vi.fn(),
  handleAddFileById: vi.fn(),
  handleCancelFileUpload: vi.fn(),
  handleTranscribeAudio: vi.fn(),
  handleClearCurrentChat: vi.fn(),
  startNewChat: vi.fn(),
  handleTogglePinCurrentSession: vi.fn(),
  handleRetryLastTurn: vi.fn(),
  handleEditLastUserMessage: vi.fn(),
  setCurrentChatSettings: vi.fn(),
  handleAddUserMessage: vi.fn(),
  handleLiveTranscript: vi.fn(),
  liveClientFunctions: undefined,
  handleUpdateMessageContent: vi.fn(),
  setScrollContainerRef: vi.fn(),
  handleEditMessage: vi.fn(),
  handleDeleteMessage: vi.fn(),
  handleRetryMessage: vi.fn(),
  handleUpdateMessageFile: vi.fn(),
  handleContinueGeneration: vi.fn(),
  handleForkMessage: vi.fn(),
  handleQuickTTS: vi.fn(),
});

// Builds a new app object each call — like useApp's render — with stable member
// references but a fresh chatState object identity.
const makeApp = (appMembers: DeepPartial<AppViewModel>, chatState: DeepPartial<AppViewModel['chatState']>) => ({
  ...appMembers,
  chatState,
});

describe('chat-runtime input values reference stability', () => {
  it('keeps the context value stable when chatState identity changes but members do not', () => {
    const appMembers = stableAppMembers();
    const chatState = stableChatState();
    const onOpenSettings = vi.fn();
    const onSelectModel = vi.fn();
    let app = makeApp(appMembers, chatState);

    const { result, rerender } = renderHook(() =>
      useChatInputRuntimeValues({
        app: app as AppViewModel,
        availableModels: EMPTY_MODELS,
        onOpenSettings,
        onSelectModel,
      }),
    );
    const first = result.current;

    // New chatState object identity, identical member references.
    app = makeApp(appMembers, { ...chatState });
    rerender();

    expect(result.current).toBe(first);
  });

  it('stays stable across multiple churns and keeps onSendMessage identity', () => {
    const appMembers = stableAppMembers();
    const chatState = stableChatState();
    const onOpenSettings = vi.fn();
    const onSelectModel = vi.fn();
    let app = makeApp(appMembers, chatState);

    const { result, rerender } = renderHook(() =>
      useChatInputRuntimeValues({
        app: app as AppViewModel,
        availableModels: EMPTY_MODELS,
        onOpenSettings,
        onSelectModel,
      }),
    );
    const firstSend = result.current.onSendMessage;

    for (let i = 0; i < 3; i += 1) {
      app = makeApp(appMembers, { ...chatState });
      rerender();
    }

    expect(result.current).toBeDefined();
    expect(result.current.onSendMessage).toBe(firstSend);
    expect(result.current.onStopGenerating).toBe(chatState.handleStopGenerating);
  });
});

describe('chat-runtime message list values reference stability', () => {
  it('keeps the context value stable when chatState identity changes but members do not', () => {
    const appMembers = stableAppMembers();
    const chatState = stableChatState();
    let app = makeApp(appMembers, chatState);

    const { result, rerender } = renderHook(() => useChatMessageListRuntimeValues({ app: app as AppViewModel }));
    const first = result.current;

    app = makeApp(appMembers, { ...chatState });
    rerender();

    expect(result.current).toBe(first);
  });
});
