import { type Dispatch, type SetStateAction, useRef, useCallback, useMemo } from 'react';
import type { SupportedLanguage } from '@/i18n/languageRegistry';
import { type AppSettings, type UploadedFile } from '@/types';
import { useModels } from '@/hooks/core/useModels';
import { useChatHistory } from './useChatHistory';
import { useFileHandling } from '@/hooks/file-upload/useFileHandling';
import { useFileDragDrop } from '@/hooks/file-upload/useFileDragDrop';
import { usePreloadedScenarios } from '@/hooks/scenarios/usePreloadedScenarios';
import { useMessageSender } from '@/features/message-sender/useMessageSender';
import { useChatScroll } from './useChatScroll';
import { useAutoTitling } from './useAutoTitling';
import { useAutoTitleBackfill } from './useAutoTitleBackfill';
import { useSuggestions } from './useSuggestions';
import { useChatState } from './useChatState';
import { useChatActions } from './useChatActions';
import { useChatEffects } from './useChatEffects';
import { useBackgroundKeepAlive } from '@/hooks/core/useBackgroundKeepAlive';
import { useMessageActions } from './message/useMessageActions';
import { useTextToSpeechHandler } from './message/useTextToSpeechHandler';
import { createLiveClientFunctions } from '@/utils/live-api/liveClientFunctions';
import { getPyodideService } from '@/features/local-python/loadPyodideService';
import { useChatStore } from '@/stores/chatStore';
import { useSettingsStore } from '@/stores/settingsStore';

export const useChat = (
  appSettings: AppSettings,
  setAppSettings: Dispatch<SetStateAction<AppSettings>>,
  language: SupportedLanguage,
) => {
  const { activeChat, currentChatSettings, isLoading, activeSessionId, savedSessions, activeMessages } =
    useChatState(appSettings);
  const isSettingsLoaded = useSettingsStore((state) => state.isSettingsLoaded);

  const savedGroups = useChatStore((state) => state.savedGroups);
  const editingMessageId = useChatStore((state) => state.editingMessageId);
  const editMode = useChatStore((state) => state.editMode);
  const commandedInput = useChatStore((state) => state.commandedInput);
  const loadingSessionIds = useChatStore((state) => state.loadingSessionIds);
  const generatingTitleSessionIds = useChatStore((state) => state.generatingTitleSessionIds);
  const selectedFiles = useChatStore((state) => state.selectedFiles);
  const appFileError = useChatStore((state) => state.appFileError);
  const isAppProcessingFile = useChatStore((state) => state.isAppProcessingFile);
  const aspectRatio = useChatStore((state) => state.aspectRatio);
  const imageSize = useChatStore((state) => state.imageSize);
  const imageOutputMode = useChatStore((state) => state.imageOutputMode);
  const isSwitchingModel = useChatStore((state) => state.isSwitchingModel);

  const setActiveSessionId = useChatStore((state) => state.setActiveSessionId);
  const setActiveMessages = useChatStore((state) => state.setActiveMessages);
  const setCommandedInput = useChatStore((state) => state.setCommandedInput);
  const setSavedSessions = useChatStore((state) => state.setSavedSessions);
  const setSavedGroups = useChatStore((state) => state.setSavedGroups);
  const setEditingMessageId = useChatStore((state) => state.setEditingMessageId);
  const setSelectedFiles = useChatStore((state) => state.setSelectedFiles);
  const setAppFileError = useChatStore((state) => state.setAppFileError);
  const setEditMode = useChatStore((state) => state.setEditMode);
  const setIsAppProcessingFile = useChatStore((state) => state.setIsAppProcessingFile);
  const setAspectRatio = useChatStore((state) => state.setAspectRatio);
  const setImageSize = useChatStore((state) => state.setImageSize);
  const setIsSwitchingModel = useChatStore((state) => state.setIsSwitchingModel);
  const setGeneratingTitleSessionIds = useChatStore((state) => state.setGeneratingTitleSessionIds);
  const updateAndPersistSessions = useChatStore((state) => state.updateAndPersistSessions);
  const updateMessageInSession = useChatStore((state) => state.updateMessageInSession);
  const updateMessageInActiveSession = useChatStore((state) => state.updateMessageInActiveSession);
  const appendMessageToSession = useChatStore((state) => state.appendMessageToSession);
  const updateAndPersistGroups = useChatStore((state) => state.updateAndPersistGroups);
  const setSessionLoading = useChatStore((state) => state.setSessionLoading);
  const setCurrentChatSettings = useChatStore((state) => state.setCurrentChatSettings);

  const activeJobs = useChatStore.getState()._activeJobs;
  const userScrolledUpRef = useChatStore.getState()._userScrolledUp;
  const fileDraftsRef = useChatStore.getState()._fileDrafts;

  // Optimize background performance when loading
  useBackgroundKeepAlive(isLoading);

  const sessionKeyMapRef = useRef<Map<string, string>>(new Map());

  const { apiModels: apiModelsFromHook, isModelsLoading, modelsLoadingError, setApiModels } = useModels();

  const historyHandler = useChatHistory({
    appSettings,
    setSavedSessions,
    setSavedGroups,
    setActiveSessionId,
    setActiveMessages,
    setEditingMessageId,
    setCommandedInput,
    setAppFileError,
    setSelectedFiles,
    activeJobs,
    updateAndPersistSessions,
    activeChat,
    language,
    updateAndPersistGroups,
    userScrolledUpRef,
    selectedFiles,
    fileDraftsRef,
    activeSessionId,
    savedSessions,
  });

  const fileHandler = useFileHandling({
    appSettings,
    selectedFiles,
    setSelectedFiles,
    setAppFileError,
    isAppProcessingFile,
    setIsAppProcessingFile,
    currentChatSettings,
    setCurrentChatSettings,
  });

  const handleAddTempFile = useCallback(
    (file: UploadedFile) => {
      setSelectedFiles((prev) => [...prev, file]);
    },
    [setSelectedFiles],
  );

  const handleRemoveTempFile = useCallback(
    (id: string) => {
      setSelectedFiles((prev) => prev.filter((selectedFile) => selectedFile.id !== id));
    },
    [setSelectedFiles],
  );

  const dragDropHandler = useFileDragDrop({
    onFilesDropped: fileHandler.handleProcessAndAddFiles,
    onAddTempFile: handleAddTempFile,
    onRemoveTempFile: handleRemoveTempFile,
  });

  const scenarioHandler = usePreloadedScenarios({
    appSettings,
    setAppSettings,
    updateAndPersistSessions,
    setActiveSessionId,
  });

  const scrollHandler = useChatScroll();

  const messageSender = useMessageSender({
    appSettings,
    currentChatSettings,
    messages: activeMessages,
    selectedFiles,
    setSelectedFiles,
    editingMessageId,
    setEditingMessageId,
    setAppFileError,
    aspectRatio,
    imageSize,
    imageOutputMode,
    userScrolledUpRef,
    activeSessionId,
    sessionKeyMapRef,
    language,
  });

  const messageActions = useMessageActions({
    messages: activeMessages,
    isLoading,
    activeSessionId,
    editingMessageId,
    activeJobs,
    setCommandedInput,
    setSelectedFiles,
    setEditingMessageId,
    setEditMode,
    setAppFileError,
    updateAndPersistSessions,
    setActiveSessionId,
    userScrolledUpRef,
    handleSendMessage: messageSender.handleSendMessage,
    setSessionLoading,
  });

  const liveClientFunctions = useMemo(
    () =>
      createLiveClientFunctions({
        isLocalPythonEnabled: !!currentChatSettings.isLocalPythonEnabled || !!appSettings.isLocalPythonEnabled,
        selectedFiles,
        runPython: async (code, options) => {
          const pyodideService = await getPyodideService();
          return pyodideService.runPython(code, options);
        },
      }),
    [appSettings.isLocalPythonEnabled, currentChatSettings.isLocalPythonEnabled, selectedFiles],
  );

  const { handleQuickTTS } = useTextToSpeechHandler({
    appSettings,
    currentChatSettings,
  });

  useAutoTitling({
    appSettings,
    activeChat,
    updateAndPersistSessions,
    language,
    generatingTitleSessionIds,
    setGeneratingTitleSessionIds,
    sessionKeyMapRef,
  });
  useAutoTitleBackfill({ appSettings, language });
  useSuggestions({ appSettings, activeChat, isLoading, updateMessageInSession, language, sessionKeyMapRef });

  const { loadChatSession, startNewChat, handleDeleteChatHistorySession } = historyHandler;

  const chatActions = useChatActions({
    appSettings,
    activeSessionId,
    isLoading,
    currentChatSettings,
    selectedFiles,
    setActiveSessionId,
    setIsSwitchingModel,
    setAppFileError,
    setCurrentChatSettings,
    setSelectedFiles,
    updateAndPersistSessions,
    updateMessageInActiveSession,
    appendMessageToSession,
    handleStopGenerating: messageActions.handleStopGenerating,
    startNewChat,
    handleTogglePinSession: historyHandler.handleTogglePinSession,
    userScrolledUpRef,
  });

  useChatEffects({
    activeSessionId,
    savedSessions,
    selectedFiles,
    appFileError,
    setAppFileError,
    isSwitchingModel,
    setIsSwitchingModel,
    currentChatSettings,
    aspectRatio,
    setAspectRatio,
    imageSize,
    setImageSize,
    isSettingsLoaded,
    loadInitialData: historyHandler.loadInitialData,
    loadChatSession,
    startNewChat,
    resumePendingStream: messageSender.resumePendingStream,
  });

  return {
    messages: activeMessages,
    isLoading,
    currentChatSettings,
    activeChat,

    loadingSessionIds,
    generatingTitleSessionIds,
    editingMessageId,
    editMode,
    commandedInput,
    selectedFiles,
    appFileError,
    isAppProcessingFile,
    savedSessions,
    savedGroups,
    activeSessionId,
    apiModels: apiModelsFromHook,
    setApiModels,
    isModelsLoading,
    modelsLoadingError,
    isSwitchingModel,
    aspectRatio,
    imageSize,

    // Persistence
    updateAndPersistSessions,
    updateAndPersistGroups,

    // Scroll
    scrollContainerRef: scrollHandler.scrollContainerRef,
    setScrollContainerRef: scrollHandler.setScrollContainerRef,

    // History handlers
    loadChatSession,
    startNewChat,
    handleDeleteChatHistorySession,
    handleRenameSession: historyHandler.handleRenameSession,
    handleTogglePinSession: historyHandler.handleTogglePinSession,
    handleDuplicateSession: historyHandler.handleDuplicateSession,
    handleAddNewGroup: historyHandler.handleAddNewGroup,
    handleDeleteGroup: historyHandler.handleDeleteGroup,
    handleClearGroup: historyHandler.handleClearGroup,
    handleRenameGroup: historyHandler.handleRenameGroup,
    handleMoveSessionToGroup: historyHandler.handleMoveSessionToGroup,
    handleToggleGroupExpansion: historyHandler.handleToggleGroupExpansion,
    handleReorderGroups: historyHandler.handleReorderGroups,
    handleNewChatInGroup: historyHandler.handleNewChatInGroup,
    clearCacheAndReload: historyHandler.clearCacheAndReload,
    clearAllHistory: historyHandler.clearAllHistory,

    // Drag/drop & Files
    isAppDraggingOver: dragDropHandler.isAppDraggingOver,
    isProcessingDrop: dragDropHandler.isProcessingDrop,
    handleProcessAndAddFiles: fileHandler.handleProcessAndAddFiles,
    handleAppDragEnter: dragDropHandler.handleAppDragEnter,
    handleAppDragOver: dragDropHandler.handleAppDragOver,
    handleAppDragLeave: dragDropHandler.handleAppDragLeave,
    handleAppDrop: dragDropHandler.handleAppDrop,
    handleCancelFileUpload: fileHandler.handleCancelFileUpload,
    handleAddFileById: fileHandler.handleAddFileById,

    // Message handlers
    handleSendMessage: messageSender.handleSendMessage,
    handleStopGenerating: messageActions.handleStopGenerating,
    handleEditMessage: messageActions.handleEditMessage,
    handleCancelEdit: messageActions.handleCancelEdit,
    handleDeleteMessage: messageActions.handleDeleteMessage,
    handleRetryMessage: messageActions.handleRetryMessage,
    handleRetryLastTurn: messageActions.handleRetryLastTurn,
    handleQuickTTS,
    handleEditLastUserMessage: messageActions.handleEditLastUserMessage,
    handleContinueGeneration: messageActions.handleContinueGeneration,
    handleForkMessage: messageActions.handleForkMessage,

    // Scenarios
    savedScenarios: scenarioHandler.savedScenarios,
    handleSaveAllScenarios: scenarioHandler.handleSaveAllScenarios,
    handleLoadPreloadedScenario: scenarioHandler.handleLoadPreloadedScenario,

    handleTranscribeAudio: chatActions.handleTranscribeAudio,
    setCommandedInput,
    setCurrentChatSettings,
    handleSelectModelInHeader: chatActions.handleSelectModelInHeader,
    handleClearCurrentChat: chatActions.handleClearCurrentChat,
    handleTogglePinCurrentSession: chatActions.handleTogglePinCurrentSession,
    handleUpdateMessageContent: chatActions.handleUpdateMessageContent,
    handleUpdateMessageFile: chatActions.handleUpdateMessageFile,
    handleAddUserMessage: chatActions.handleAddUserMessage,
    handleLiveTranscript: chatActions.handleLiveTranscript,
    liveClientFunctions,
  };
};
