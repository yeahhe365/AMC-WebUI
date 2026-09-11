import { afterEach, beforeEach } from 'vitest';
import { useChatStore } from '@/stores/chatStore';
import { useChatDraftStore } from '@/stores/chatDraftStore';
import { useModelPreferencesStore } from '@/stores/modelPreferencesStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { useSettingsUiStore } from '@/stores/settingsUiStore';
import { useUIStore } from '@/stores/uiStore';
import { useMcpRuntimeStore } from '@/stores/mcpRuntimeStore';
import { useLibraryStore } from '@/stores/libraryStore';

const initialSettingsState = useSettingsStore.getState();
const initialChatState = useChatStore.getState();
const initialChatDraftState = useChatDraftStore.getState();
const initialSettingsUiState = useSettingsUiStore.getState();
const initialModelPreferencesState = useModelPreferencesStore.getState();
const initialUiState = useUIStore.getState();
const initialMcpRuntimeState = useMcpRuntimeStore.getState();
const initialLibraryState = useLibraryStore.getState();

export const resetSettingsStoreState = () => {
  useSettingsStore.setState({
    appSettings: { ...initialSettingsState.appSettings },
    currentTheme: initialSettingsState.currentTheme,
    language: initialSettingsState.language,
    isSettingsLoaded: initialSettingsState.isSettingsLoaded,
    pendingPreloadSettingsOverrides: initialSettingsState.pendingPreloadSettingsOverrides,
  });
};

export const resetChatStoreState = () => {
  const currentState = useChatStore.getState();

  currentState._activeJobs.current.clear();
  currentState._userScrolledUp.current = false;
  currentState._fileDrafts.current = {};

  useChatStore.setState({
    savedSessions: [...initialChatState.savedSessions],
    savedGroups: [...initialChatState.savedGroups],
    activeSessionId: initialChatState.activeSessionId,
    activeMessages: [...initialChatState.activeMessages],
    editingMessageId: initialChatState.editingMessageId,
    editMode: initialChatState.editMode,
    commandedInput: initialChatState.commandedInput,
    loadingSessionIds: new Set(initialChatState.loadingSessionIds),
    generatingTitleSessionIds: new Set(initialChatState.generatingTitleSessionIds),
    selectedFiles: [...initialChatState.selectedFiles],
    appFileError: initialChatState.appFileError,
    isAppProcessingFile: initialChatState.isAppProcessingFile,
    aspectRatio: initialChatState.aspectRatio,
    imageSize: initialChatState.imageSize,
    imageOutputMode: initialChatState.imageOutputMode,
    isSwitchingModel: initialChatState.isSwitchingModel,
    _activeJobs: initialChatState._activeJobs,
    _userScrolledUp: initialChatState._userScrolledUp,
    _fileDrafts: initialChatState._fileDrafts,
  });
};

export const resetAllStoreState = () => {
  resetSettingsStoreState();
  resetChatStoreState();
  useChatDraftStore.setState({ drafts: { ...initialChatDraftState.drafts } });
  useSettingsUiStore.setState({
    activeTab: initialSettingsUiState.activeTab,
    scrollPositions: { ...initialSettingsUiState.scrollPositions },
    legacySettingsUiHydrated: initialSettingsUiState.legacySettingsUiHydrated,
  });
  useModelPreferencesStore.setState({
    customModels: initialModelPreferencesState.customModels,
    modelSettingsCache: { ...initialModelPreferencesState.modelSettingsCache },
    legacyModelPreferencesHydrated: initialModelPreferencesState.legacyModelPreferencesHydrated,
  });
  useUIStore.setState({
    isSettingsModalOpen: initialUiState.isSettingsModalOpen,
    isPreloadedMessagesModalOpen: initialUiState.isPreloadedMessagesModalOpen,
    isHistorySidebarOpen: initialUiState.isHistorySidebarOpen,
    desktopHistorySidebarOpen: initialUiState.desktopHistorySidebarOpen,
    mobileHistorySidebarOpen: initialUiState.mobileHistorySidebarOpen,
    isLogViewerOpen: initialUiState.isLogViewerOpen,
    chatInputHeight: initialUiState.chatInputHeight,
    activeView: 'chat',
  });
  useMcpRuntimeStore.setState({
    masterEnabled: initialMcpRuntimeState.masterEnabled,
    selectedServerIds: initialMcpRuntimeState.selectedServerIds,
  });
  useLibraryStore.setState({
    viewMode: initialLibraryState.viewMode,
    categoryFilter: initialLibraryState.categoryFilter,
    sourceFilter: initialLibraryState.sourceFilter,
    fileTypeFilter: initialLibraryState.fileTypeFilter,
    sortOption: initialLibraryState.sortOption,
    searchQuery: initialLibraryState.searchQuery,
    selectedFileIds: new Set(),
    isFilterMenuOpen: false,
    isNewDropdownOpen: false,
  });
};

export const setupStoreStateReset = () => {
  beforeEach(resetAllStoreState);
  afterEach(resetAllStoreState);
};
