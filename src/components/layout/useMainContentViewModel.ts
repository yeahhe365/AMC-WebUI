import { useCallback, useMemo } from 'react';

import type { AppViewModel } from '@/hooks/app/useApp';
import { useUIStore } from '@/stores/uiStore';
import { getShortcutDisplay } from '@/utils/keyboardShortcuts';
import { buildNewTabHref, writeLastActiveSessionSnapshot } from '@/utils/chat/lastActiveSession';
import { buildSidePanelKey } from './mainContentModels';

interface UseMainContentViewModelOptions {
  app: AppViewModel;
}

export const useMainContentViewModel = ({ app }: UseMainContentViewModelOptions) => {
  const {
    appSettings,
    currentTheme,
    chatState,
    uiState,
    eventsState,
    sidePanelContent,
    handleCloseSidePanel,
    isExportModalOpen,
    setIsExportModalOpen,
    exportStatus,
    handleExportChat,
    handleSaveSettings,
    handleSaveCurrentChatSettings,
    handleExportAllScenarios,
    handleImportAllScenarios,
  } = app;
  const { setIsHistorySidebarOpen, setIsHistorySidebarOpenTransient } = uiState;
  const { loadChatSession } = chatState;

  const isSettingsModalOpen = useUIStore((state) => state.isSettingsModalOpen);
  const setIsSettingsModalOpen = useUIStore((state) => state.setIsSettingsModalOpen);
  const isPreloadedMessagesModalOpen = useUIStore((state) => state.isPreloadedMessagesModalOpen);
  const setIsPreloadedMessagesModalOpen = useUIStore((state) => state.setIsPreloadedMessagesModalOpen);
  const isLogViewerOpen = useUIStore((state) => state.isLogViewerOpen);
  const setIsLogViewerOpen = useUIStore((state) => state.setIsLogViewerOpen);
  const historyDisplayMode = useUIStore((state) => state.historyDisplayMode);
  const setHistoryDisplayMode = useUIStore((state) => state.setHistoryDisplayMode);

  const openSettingsModal = useCallback(() => {
    setIsSettingsModalOpen(true);
  }, [setIsSettingsModalOpen]);

  const toggleHistorySidebar = useCallback(() => {
    setIsHistorySidebarOpen((prev) => !prev);
  }, [setIsHistorySidebarOpen]);

  const closeHistorySidebar = useCallback(() => {
    setIsHistorySidebarOpen(false);
  }, [setIsHistorySidebarOpen]);

  const activeView = useUIStore((state) => state.activeView);
  const setActiveView = useUIStore((state) => state.setActiveView);

  const selectSession = useCallback(
    (id: string) => {
      useUIStore.getState().setActiveView('chat');
      return loadChatSession(id);
    },
    [loadChatSession],
  );

  const openExportModal = useCallback(
    async (sessionId?: string) => {
      if (sessionId && sessionId !== chatState.activeSessionId) {
        await loadChatSession(sessionId);
      }
      setIsExportModalOpen(true);
    },
    [chatState.activeSessionId, loadChatSession, setIsExportModalOpen],
  );

  // 点击 logo / 新聊天入口开新标签页时，先把当前会话快照同步写入 localStorage。
  // 快照写入是同步的，先于新标签页启动，兜住 DB 异步持久化未落盘的竞态；
  // 新标签页的 ?from 仍以 DB 会话为真源，快照仅在同一会话时提供更新 settings。
  const handleBrandClick = useCallback(() => {
    if (chatState.activeSessionId) {
      writeLastActiveSessionSnapshot({
        sessionId: chatState.activeSessionId,
        settings: chatState.currentChatSettings,
      });
    }
  }, [chatState.activeSessionId, chatState.currentChatSettings]);

  const { startNewChat } = chatState;
  const handleNewChat = useCallback(() => {
    useUIStore.getState().setActiveView('chat');
    startNewChat();
  }, [startNewChat]);

  const sidebarProps = useMemo(
    () => ({
      isOpen: uiState.isHistorySidebarOpen,
      onToggle: toggleHistorySidebar,
      onAutoClose: () => setIsHistorySidebarOpenTransient(false),
      sessions: chatState.savedSessions,
      groups: chatState.savedGroups,
      activeSessionId: chatState.activeSessionId,
      loadingSessionIds: chatState.loadingSessionIds,
      generatingTitleSessionIds: chatState.generatingTitleSessionIds,
      onSelectSession: selectSession,
      onNewChat: handleNewChat,
      onDeleteSession: chatState.handleDeleteChatHistorySession,
      onRenameSession: chatState.handleRenameSession,
      onTogglePinSession: chatState.handleTogglePinSession,
      onDuplicateSession: chatState.handleDuplicateSession,
      onOpenExportModal: openExportModal,
      onAddNewGroup: chatState.handleAddNewGroup,
      onDeleteGroup: chatState.handleDeleteGroup,
      onClearGroup: chatState.handleClearGroup,
      onRenameGroup: chatState.handleRenameGroup,
      onMoveSessionToGroup: chatState.handleMoveSessionToGroup,
      onToggleGroupExpansion: chatState.handleToggleGroupExpansion,
      onReorderGroups: chatState.handleReorderGroups,
      onNewChatInGroup: chatState.handleNewChatInGroup,
      onOpenSettingsModal: openSettingsModal,
      themeId: currentTheme.id,
      newChatShortcut: getShortcutDisplay('general.newChat', appSettings),
      searchChatsShortcut: getShortcutDisplay('general.searchChats', appSettings),
      brandHref: buildNewTabHref(chatState.activeSessionId),
      onBrandClick: handleBrandClick,
      displayMode: historyDisplayMode,
      onDisplayModeChange: setHistoryDisplayMode,
    }),
    [
      appSettings,
      chatState.activeSessionId,
      chatState.generatingTitleSessionIds,
      chatState.handleAddNewGroup,
      chatState.handleClearGroup,
      chatState.handleDeleteChatHistorySession,
      chatState.handleDeleteGroup,
      chatState.handleDuplicateSession,
      chatState.handleMoveSessionToGroup,
      chatState.handleRenameGroup,
      chatState.handleRenameSession,
      chatState.handleReorderGroups,
      chatState.handleToggleGroupExpansion,
      chatState.handleNewChatInGroup,
      chatState.handleTogglePinSession,
      chatState.loadingSessionIds,
      chatState.savedGroups,
      chatState.savedSessions,
      handleNewChat,
      currentTheme.id,
      historyDisplayMode,
      openExportModal,
      openSettingsModal,
      selectSession,
      setHistoryDisplayMode,
      setIsHistorySidebarOpenTransient,
      toggleHistorySidebar,
      uiState.isHistorySidebarOpen,
      handleBrandClick,
    ],
  );

  const appModalsProps = useMemo(
    () => ({
      isSettingsModalOpen,
      setIsSettingsModalOpen,
      appSettings,
      currentThemeId: currentTheme.id,
      availableModels: chatState.apiModels,
      handleSaveSettings,
      handleSaveCurrentChatSettings,
      clearCacheAndReload: chatState.clearCacheAndReload,
      clearAllHistory: chatState.clearAllHistory,
      handleInstallPwa: eventsState.handleInstallPwa,
      installState: eventsState.installState.state,
      handleImportAllScenarios,
      handleExportAllScenarios,
      isPreloadedMessagesModalOpen,
      setIsPreloadedMessagesModalOpen,
      savedScenarios: chatState.savedScenarios,
      handleSaveAllScenarios: chatState.handleSaveAllScenarios,
      handleLoadPreloadedScenario: chatState.handleLoadPreloadedScenario,
      isExportModalOpen,
      setIsExportModalOpen,
      handleExportChat,
      exportStatus,
      isLogViewerOpen,
      setIsLogViewerOpen,
      currentChatSettings: chatState.currentChatSettings,
      activeSessionId: chatState.activeSessionId,
      setAvailableModels: chatState.setApiModels,
    }),
    [
      chatState.apiModels,
      chatState.clearAllHistory,
      chatState.clearCacheAndReload,
      chatState.currentChatSettings,
      chatState.handleLoadPreloadedScenario,
      chatState.handleSaveAllScenarios,
      chatState.savedScenarios,
      chatState.setApiModels,
      eventsState.handleInstallPwa,
      eventsState.installState.state,
      exportStatus,
      handleExportAllScenarios,
      handleExportChat,
      handleImportAllScenarios,
      handleSaveCurrentChatSettings,
      handleSaveSettings,
      isExportModalOpen,
      isLogViewerOpen,
      isPreloadedMessagesModalOpen,
      isSettingsModalOpen,
      setIsExportModalOpen,
      setIsLogViewerOpen,
      setIsPreloadedMessagesModalOpen,
      setIsSettingsModalOpen,
      appSettings,
      chatState.activeSessionId,
      currentTheme.id,
    ],
  );

  const sidePanelKey = useMemo(() => buildSidePanelKey(sidePanelContent), [sidePanelContent]);

  return {
    sidebarProps,
    appModalsProps,
    sidePanelContent,
    handleCloseSidePanel,
    sidePanelKey,
    overlayVisible: uiState.isHistorySidebarOpen,
    currentThemeId: currentTheme.id,
    closeHistorySidebar,
    activeView,
    setActiveView,
  };
};
