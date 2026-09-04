import { act, type ReactNode } from 'react';
import { vi } from 'vitest';

import {
  ChatRuntimeProvider,
  type useChatHeaderRuntime,
  type useChatInputRuntime,
  type useChatMessageListRuntime,
} from '@/components/layout/chat-runtime/ChatRuntimeContext';
import { AVAILABLE_THEMES } from '@/constants/themeRegistry';
import { I18nProvider } from '@/contexts/I18nContext';
import type { AppViewModel } from '@/hooks/app/useApp';
import type { QuickTtsResult } from '@/hooks/chat/message/useTextToSpeechHandler';
import { WindowProvider } from '@/contexts/WindowContext';
import { useChatStore } from '@/stores/chatStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { useUIStore } from '@/stores/uiStore';
import type { AppSettings, ChatMessage, ChatSettings, ChatToolToggleStates, ModelOption, UploadedFile } from '@/types';

import { createChatToolToggleStates } from '@/test/chat-tools/fixtures';
import { createAppSettings, createChatSettings } from '@/test/data/factories';
import { createTestRenderer, type TestRenderer } from '@/test/render/renderer';

export { createAppSettings, createChatSettings } from '@/test/data/factories';

type ChatRuntimeValues = {
  header: ReturnType<typeof useChatHeaderRuntime>;
  messageList: ReturnType<typeof useChatMessageListRuntime>;
  input: ReturnType<typeof useChatInputRuntime>;
};

type ChatAreaInputValue = {
  appSettings: AppSettings;
  currentChatSettings: ChatSettings;
  setAppFileError: (error: string | null) => void;
  activeSessionId: string | null;
  commandedInput: { id: number; text: string; mode?: 'replace' | 'append' | 'quote' | 'insert' } | null;
  onMessageSent: () => void;
  selectedFiles: UploadedFile[];
  setSelectedFiles: (files: UploadedFile[] | ((prev: UploadedFile[]) => UploadedFile[])) => void;
  onSendMessage: (text: string, options?: { isFastMode?: boolean; files?: UploadedFile[] }) => void;
  isLoading: boolean;
  isEditing: boolean;
  onStopGenerating: () => void;
  onCancelEdit: () => void;
  onProcessFiles: (files: FileList | File[]) => Promise<void>;
  onAddFileById: (fileId: string) => Promise<void>;
  onCancelUpload: (fileId: string) => void;
  onTranscribeAudio: (file: File) => Promise<string | null>;
  isProcessingFile: boolean;
  fileError: string | null;
  aspectRatio?: string;
  setAspectRatio?: (ratio: string) => void;
  imageSize?: string;
  setImageSize?: (size: string) => void;
  toolStates: ChatToolToggleStates;
  onClearChat: () => void;
  onNewChat: () => void;
  onOpenSettings: () => void;
  onToggleLiveArtifactsPrompt: () => void;
  onTogglePinCurrentSession: () => void;
  onRetryLastTurn: () => void;
  onSelectModel: (modelId: string) => void;
  availableModels: ModelOption[];
  onEditLastUserMessage: () => void;
  onTogglePip: () => void;
  isPipActive: boolean;
  generateQuadImages: boolean;
  onToggleQuadImages: () => void;
  setCurrentChatSettings: (updater: (prev: ChatSettings) => ChatSettings) => void;
  onSuggestionClick: (suggestion: string) => void;
  onOrganizeInfoClick: (suggestion: string) => void;
  showEmptyStateSuggestions: boolean;
  editMode: 'update' | 'resend';
  onUpdateMessageContent: (messageId: string, content: string) => void;
  editingMessageId: string | null;
  setEditingMessageId: (id: string | null) => void;
  onAddUserMessage: (text: string, files?: UploadedFile[]) => void;
  onLiveTranscript: () => void;
  onToggleBBox: () => void;
  isBBoxModeActive: boolean;
  onToggleGuide: () => void;
  isGuideModeActive: boolean;
  themeId: string;
};

type ChatAreaMessageListValue = {
  messages: ChatMessage[];
  sessionTitle: string;
  setScrollContainerRef: (node: HTMLDivElement | null) => void;
  onEditMessage: (messageId: string, mode?: 'update' | 'resend') => void;
  onDeleteMessage: (messageId: string) => void;
  onRetryMessage: (messageId: string) => void;
  onUpdateMessageFile: () => void;
  showThoughts: boolean;
  onSuggestionClick: (suggestion: string) => void;
  onOrganizeInfoClick: (suggestion: string) => void;
  onFollowUpSuggestionClick: (suggestion: string) => void;
  onFollowUpSuggestionFill: (suggestion: string) => void;
  onContinueGeneration: (messageId: string) => void;
  onForkMessage: (messageId: string) => void;
  onQuickTTS: (text: string) => Promise<QuickTtsResult>;
  chatInputHeight: number;
  currentModelId: string;
  onOpenSidePanel: () => void;
  activeSessionId: string | null;
};

export interface ChatAreaProviderValue {
  header: ChatRuntimeValues['header'];
  messageList: ChatAreaMessageListValue;
  input: ChatAreaInputValue;
}

type ChatAreaInputOverrides = Omit<
  Partial<ChatAreaInputValue>,
  'appSettings' | 'currentChatSettings' | 'toolStates'
> & {
  appSettings?: Partial<AppSettings>;
  currentChatSettings?: Partial<ChatSettings>;
  toolStates?: Partial<ChatToolToggleStates>;
};

interface ChatAreaProviderValueOverrides {
  header?: Partial<ChatRuntimeValues['header']>;
  messageList?: Partial<ChatAreaMessageListValue>;
  input?: ChatAreaInputOverrides;
}

export const createChatAreaProviderValue = (overrides: ChatAreaProviderValueOverrides = {}): ChatAreaProviderValue => {
  const { appSettings, currentChatSettings, toolStates, ...inputOverrides } = overrides.input ?? {};

  return {
    header: {
      isAppDraggingOver: false,
      modelsLoadingError: null,
      handleAppDragEnter: vi.fn(),
      handleAppDragOver: vi.fn(),
      handleAppDragLeave: vi.fn(),
      handleAppDrop: vi.fn(),
      currentModelName: 'Test Model',
      availableModels: inputOverrides.availableModels ?? [],
      selectedModelId: currentChatSettings?.modelId ?? createChatSettings().modelId,
      isLiveArtifactsPromptActive: false,
      isLiveArtifactsPromptBusy: false,
      isPipSupported: true,
      isPipActive: inputOverrides.isPipActive ?? false,
      onNewChat: inputOverrides.onNewChat ?? vi.fn(),
      newChatHref: '/',
      onOpenScenariosModal: vi.fn(),
      onToggleHistorySidebar: vi.fn(),
      onLoadLiveArtifactsPrompt: inputOverrides.onToggleLiveArtifactsPrompt ?? vi.fn(),
      onSelectModel: inputOverrides.onSelectModel ?? vi.fn(),
      onTogglePip: inputOverrides.onTogglePip ?? vi.fn(),
      ...overrides.header,
    },
    messageList: {
      messages: [],
      sessionTitle: 'Test',
      setScrollContainerRef: vi.fn(),
      onEditMessage: vi.fn(),
      onDeleteMessage: vi.fn(),
      onRetryMessage: vi.fn(),
      onUpdateMessageFile: vi.fn(),
      showThoughts: false,
      onSuggestionClick: vi.fn(),
      onOrganizeInfoClick: vi.fn(),
      onFollowUpSuggestionClick: vi.fn(),
      onFollowUpSuggestionFill: vi.fn(),
      onContinueGeneration: vi.fn(),
      onForkMessage: vi.fn(),
      onQuickTTS: vi.fn(async () => ({ error: 'Mock TTS error' })),
      chatInputHeight: 0,
      currentModelId: 'gemini-3.1-pro-preview',
      onOpenSidePanel: vi.fn(),
      activeSessionId: 'session-1',
      ...overrides.messageList,
    },
    input: {
      appSettings: createAppSettings(appSettings),
      currentChatSettings: createChatSettings(currentChatSettings),
      setAppFileError: vi.fn(),
      activeSessionId: 'session-1',
      commandedInput: null,
      onMessageSent: vi.fn(),
      selectedFiles: [],
      setSelectedFiles: vi.fn(),
      onSendMessage: vi.fn(),
      isLoading: false,
      isEditing: false,
      onStopGenerating: vi.fn(),
      onCancelEdit: vi.fn(),
      onProcessFiles: vi.fn(async () => {}),
      onAddFileById: vi.fn(async () => {}),
      onCancelUpload: vi.fn(),
      onTranscribeAudio: vi.fn(async () => null),
      isProcessingFile: false,
      fileError: null,
      aspectRatio: '1:1',
      setAspectRatio: vi.fn(),
      imageSize: '1K',
      setImageSize: vi.fn(),
      toolStates: createChatToolToggleStates(toolStates),
      onClearChat: vi.fn(),
      onNewChat: vi.fn(),
      onOpenSettings: vi.fn(),
      onToggleLiveArtifactsPrompt: vi.fn(),
      onTogglePinCurrentSession: vi.fn(),
      onRetryLastTurn: vi.fn(),
      onSelectModel: vi.fn(),
      availableModels: [],
      onEditLastUserMessage: vi.fn(),
      onTogglePip: vi.fn(),
      isPipActive: false,
      generateQuadImages: false,
      onToggleQuadImages: vi.fn(),
      setCurrentChatSettings: vi.fn(),
      onSuggestionClick: vi.fn(),
      onOrganizeInfoClick: vi.fn(),
      showEmptyStateSuggestions: false,
      editMode: 'update',
      onUpdateMessageContent: vi.fn(),
      editingMessageId: null,
      setEditingMessageId: vi.fn(),
      onAddUserMessage: vi.fn(),
      onLiveTranscript: vi.fn(),
      onToggleBBox: vi.fn(),
      isBBoxModeActive: false,
      onToggleGuide: vi.fn(),
      isGuideModeActive: false,
      themeId: 'pearl',
      ...inputOverrides,
    },
  };
};

export const applyChatAreaProviderValue = (value: ChatAreaProviderValue) => {
  useSettingsStore.setState({
    appSettings: value.input.appSettings,
    currentTheme: AVAILABLE_THEMES.find((theme) => theme.id === value.input.themeId) ?? AVAILABLE_THEMES[0],
  });

  useChatStore.setState({
    activeSessionId: value.input.activeSessionId,
    savedSessions: value.input.activeSessionId
      ? [
          {
            id: value.input.activeSessionId,
            title: value.messageList.sessionTitle,
            timestamp: Date.parse('2026-04-12T00:00:00.000Z'),
            messages: [],
            settings: value.input.currentChatSettings,
          },
        ]
      : [],
    activeMessages: value.messageList.messages,
    selectedFiles: value.input.selectedFiles,
    commandedInput: value.input.commandedInput,
    editingMessageId: value.input.editingMessageId,
    editMode: value.input.editMode,
    isAppProcessingFile: value.input.isProcessingFile,
    appFileError: value.input.fileError,
    aspectRatio: value.input.aspectRatio ?? '1:1',
    imageSize: value.input.imageSize ?? '1K',
    loadingSessionIds:
      value.input.isLoading && value.input.activeSessionId ? new Set([value.input.activeSessionId]) : new Set(),
  });

  useUIStore.setState({ chatInputHeight: value.messageList.chatInputHeight });
};

export const createChatRuntimeApp = (value: ChatAreaProviderValue): AppViewModel => {
  const app = {
    appSettings: value.input.appSettings,
    setAppSettings: vi.fn(),
    currentTheme: AVAILABLE_THEMES.find((theme) => theme.id === value.input.themeId) ?? AVAILABLE_THEMES[0],
    language: 'en',
    t: vi.fn((key: string) => key),
    uiState: {
      isHistorySidebarOpen: false,
      setIsHistorySidebarOpen: vi.fn(),
      setIsHistorySidebarOpenTransient: vi.fn(),
      isSettingsModalOpen: false,
      setIsSettingsModalOpen: vi.fn(),
      isPreloadedMessagesModalOpen: false,
      setIsPreloadedMessagesModalOpen: vi.fn(),
      isLogViewerOpen: false,
      setIsLogViewerOpen: vi.fn(),
      handleTouchStart: vi.fn(),
      handleTouchEnd: vi.fn(),
    },
    pipState: {
      isPipSupported: value.header.isPipSupported,
      isPipActive: value.input.isPipActive,
      togglePip: value.input.onTogglePip,
      pipContainer: null,
      pipWindow: null,
    },
    eventsState: {
      installPromptEvent: null,
      installState: { state: 'installed', canInstall: false },
      handleInstallPwa: vi.fn(async () => {}),
      needRefresh: false,
      updateDismissed: false,
      dismissUpdateBanner: vi.fn(),
      handleRefreshApp: vi.fn(async () => {}),
    },
    chatState: {
      activeChat: undefined,
      activeSessionId: value.input.activeSessionId,
      apiModels: value.header.availableModels,
      currentChatSettings: value.input.currentChatSettings,
      messages: value.messageList.messages,
      isLoading: value.input.isLoading,
      editingMessageId: value.input.editingMessageId,
      editMode: value.input.editMode,
      commandedInput: value.input.commandedInput,
      isAppDraggingOver: value.header.isAppDraggingOver,
      isProcessingDrop: false,
      selectedFiles: value.input.selectedFiles,
      appFileError: value.input.fileError,
      isAppProcessingFile: value.input.isProcessingFile,
      savedSessions: [],
      savedGroups: [],
      savedScenarios: [],
      loadingSessionIds:
        value.input.isLoading && value.input.activeSessionId ? new Set([value.input.activeSessionId]) : new Set(),
      generatingTitleSessionIds: new Set(),
      isModelsLoading: false,
      modelsLoadingError: value.header.modelsLoadingError,
      isSwitchingModel: false,
      aspectRatio: value.input.aspectRatio ?? '1:1',
      imageSize: value.input.imageSize ?? '1K',
      updateAndPersistSessions: vi.fn(),
      updateAndPersistGroups: vi.fn(),
      scrollContainerRef: { current: null },
      loadChatSession: vi.fn(),
      handleSendMessage: async (message = {}) => {
        value.input.onSendMessage(message.text ?? '', { isFastMode: message.isFastMode, files: message.files });
      },
      setScrollContainerRef: value.messageList.setScrollContainerRef,
      handleEditMessage: value.messageList.onEditMessage,
      handleDeleteMessage: value.messageList.onDeleteMessage,
      handleRetryMessage: async (messageId: string) => value.messageList.onRetryMessage(messageId),
      handleUpdateMessageFile: async (...args: Parameters<typeof value.messageList.onUpdateMessageFile>) =>
        value.messageList.onUpdateMessageFile(...args),
      handleContinueGeneration: async (messageId: string) => value.messageList.onContinueGeneration(messageId),
      handleForkMessage: value.messageList.onForkMessage,
      handleQuickTTS: value.messageList.onQuickTTS,
      handleStopGenerating: (() => {
        value.input.onStopGenerating();
        return 'not_loading' as const;
      }) as (options?: { silent?: boolean; skipLoadingUpdate?: boolean }) => 'stopped' | 'no_local_job' | 'not_loading',
      handleCancelEdit: value.input.onCancelEdit,
      setCommandedInput: vi.fn(),
      handleProcessAndAddFiles: value.input.onProcessFiles,
      handleAddFileById: value.input.onAddFileById,
      handleCancelFileUpload: value.input.onCancelUpload,
      handleTranscribeAudio: value.input.onTranscribeAudio,
      handleClearCurrentChat: value.input.onClearChat,
      handleTogglePinCurrentSession: value.input.onTogglePinCurrentSession,
      handleTogglePinSession: vi.fn(),
      handleRetryLastTurn: async () => value.input.onRetryLastTurn(),
      handleEditLastUserMessage: value.input.onEditLastUserMessage,
      setCurrentChatSettings: value.input.setCurrentChatSettings,
      handleAddUserMessage: value.input.onAddUserMessage,
      handleLiveTranscript: value.input.onLiveTranscript,
      liveClientFunctions: {},
      handleUpdateMessageContent: value.input.onUpdateMessageContent,
      startNewChat: value.input.onNewChat,
      handleDeleteChatHistorySession: vi.fn(),
      handleRenameSession: vi.fn(),
      handleDuplicateSession: vi.fn(),
      handleAddNewGroup: vi.fn(),
      handleDeleteGroup: vi.fn(),
      handleClearGroup: vi.fn(),
      handleRenameGroup: vi.fn(),
      handleMoveSessionToGroup: vi.fn(),
      handleToggleGroupExpansion: vi.fn(),
      handleReorderGroups: vi.fn(),
      handleNewChatInGroup: vi.fn(),
      clearCacheAndReload: vi.fn(),
      clearAllHistory: vi.fn(),
      handleSaveAllScenarios: vi.fn(),
      handleLoadPreloadedScenario: vi.fn(),
      setApiModels: vi.fn(),
      handleSelectModelInHeader: value.input.onSelectModel,
      handleAppDragEnter: value.header.handleAppDragEnter,
      handleAppDragOver: value.header.handleAppDragOver,
      handleAppDragLeave: value.header.handleAppDragLeave,
      handleAppDrop: async (event: Parameters<typeof value.header.handleAppDrop>[0]) =>
        value.header.handleAppDrop(event),
    },
    activeChat: undefined,
    sidePanelContent: null,
    handleOpenSidePanel: value.messageList.onOpenSidePanel,
    handleCloseSidePanel: vi.fn(),
    isExportModalOpen: false,
    setIsExportModalOpen: vi.fn(),
    exportStatus: 'idle',
    handleExportChat: vi.fn(),
    sessionTitle: value.messageList.sessionTitle,
    handleSaveSettings: vi.fn(),
    handleSaveCurrentChatSettings: vi.fn(),
    handleLoadLiveArtifactsPromptAndSave: async () => value.input.onToggleLiveArtifactsPrompt(),
    handleToggleBBoxMode: async () => value.input.onToggleBBox(),
    handleToggleGuideMode: async () => value.input.onToggleGuide(),
    handleSuggestionClick: vi.fn(),
    isLiveArtifactsPromptActive: value.header.isLiveArtifactsPromptActive,
    isLiveArtifactsPromptBusy: value.header.isLiveArtifactsPromptBusy,
    handleSetThinkingLevel: vi.fn(),
    getCurrentModelDisplayName: vi.fn(() => value.header.currentModelName),
    handleExportAllScenarios: vi.fn(),
    handleImportAllScenarios: vi.fn(),
  } satisfies AppViewModel;

  return app;
};

export const ChatRuntimeTestProvider = ({ value, children }: { value: ChatAreaProviderValue; children: ReactNode }) => (
  <ChatRuntimeProvider app={createChatRuntimeApp(value)}>{children}</ChatRuntimeProvider>
);

export const renderWithChatAreaProviders = (
  children: ReactNode,
  options: {
    attachToDocument?: boolean;
    chatArea?: ChatAreaProviderValueOverrides;
    value?: ChatAreaProviderValue;
  } = {},
) => {
  const root: TestRenderer = createTestRenderer({ attachToDocument: options.attachToDocument !== false });
  const { container } = root;
  const providerValue = options.value ?? createChatAreaProviderValue(options.chatArea);

  applyChatAreaProviderValue(providerValue);

  act(() => {
    root.render(
      <I18nProvider>
        <WindowProvider>
          <ChatRuntimeTestProvider value={providerValue}>{children}</ChatRuntimeTestProvider>
        </WindowProvider>
      </I18nProvider>,
    );
  });

  return {
    container,
    providerValue,
    root,
    unmount: () => {
      act(() => {
        root.unmount();
      });
    },
  };
};
