import { type Dispatch, type SetStateAction, useCallback, useEffect, useMemo, useState } from 'react';
import type { SupportedLanguage } from '@/i18n/languageRegistry';
import { useAppSettings } from '@/hooks/core/useAppSettings';
import { useChat } from '@/hooks/chat/useChat';
import { useAppUi } from '@/hooks/core/useAppUi';
import { useAppEvents } from '@/hooks/core/useAppEvents';
import { usePictureInPicture } from '@/hooks/core/usePictureInPicture';
import { logService } from '@/services/logService';
import { toastError } from '@/stores/toastStore';
import { getTranslator } from '@/i18n/translations';
import { applyThemeToDocument } from '@/utils/themeDom';
import { useUIStore } from '@/stores/uiStore';
import {
  type AppSettings,
  type ChatSettings,
  type ModelOption,
  type SavedChatSession,
  type SideViewContent,
  type Theme,
  type ThinkingLevel,
} from '@/types';
import { buildProviderAwareModelList } from '@/utils/thirdPartyApiProviders';
import { resolveChatApiRoute } from '@/utils/chatApiRoute';
import { useDataExport } from '@/hooks/data-management/useDataExport';
import { useDataImport } from '@/hooks/data-management/useDataImport';
import { useChatSessionExport } from '@/hooks/data-management/useChatSessionExport';
import { useAppInitialization } from './useAppInitialization';
import { useAppTitle } from './useAppTitle';
import { useAppFavicon } from './useAppFavicon';
import { focusChatInput } from '@/utils/chat-input/focus';
import { useAppPromptModes } from './useAppPromptModes';
import { DEFAULT_THINKING_BUDGET } from '@/constants/modelConfiguration';
import { DEFAULT_CHAT_SETTINGS } from '@/constants/settingsDefaults';
import { getModelCapabilities } from '@/utils/model/modelCapabilities';
import { formatI18nErrorMessage } from '@/i18n/interpolate';

type AppTranslator = ReturnType<typeof getTranslator>;
type ChatViewModel = ReturnType<typeof useChat>;
type AppUiViewModel = ReturnType<typeof useAppUi>;
type PipViewModel = ReturnType<typeof usePictureInPicture>;
type AppEventsViewModel = ReturnType<typeof useAppEvents>;
type AppSuggestionSource = 'homepage' | 'organize' | 'follow-up' | 'follow-up-fill';

export interface AppViewModel {
  appSettings: AppSettings;
  setAppSettings: Dispatch<SetStateAction<AppSettings>>;
  currentTheme: Theme;
  language: SupportedLanguage;
  t: AppTranslator;
  chatState: ChatViewModel;
  uiState: AppUiViewModel;
  pipState: PipViewModel;
  eventsState: AppEventsViewModel;
  sidePanelContent: SideViewContent | null;
  handleOpenSidePanel: (content: SideViewContent) => void;
  handleCloseSidePanel: () => void;
  isExportModalOpen: boolean;
  setIsExportModalOpen: Dispatch<SetStateAction<boolean>>;
  exportStatus: 'idle' | 'exporting';
  handleExportChat: (format: 'png' | 'html' | 'txt' | 'json') => Promise<void>;
  activeChat: SavedChatSession | undefined;
  sessionTitle: string;
  handleSaveSettings: (newSettings: AppSettings) => void;
  handleSaveCurrentChatSettings: (newSettings: ChatSettings) => void;
  handleLoadLiveArtifactsPromptAndSave: () => Promise<void>;
  handleDeactivateLiveArtifactsPrompt: () => void;
  handleToggleBBoxMode: () => Promise<void>;
  handleToggleGuideMode: () => Promise<void>;
  handleSuggestionClick: (type: AppSuggestionSource, text: string) => Promise<void>;
  isLiveArtifactsPromptActive: boolean;
  isLiveArtifactsPromptBusy: boolean;
  handleSetThinkingLevel: (level: ThinkingLevel) => void;
  getCurrentModelDisplayName: () => string;
  handleExportAllScenarios: () => void;
  handleImportAllScenarios: (file: File) => void;
}

export const useApp = (): AppViewModel => {
  const { appSettings, setAppSettings, currentTheme, language } = useAppSettings();
  const t = useMemo(() => getTranslator(language), [language]);

  useAppInitialization();

  const chatState = useChat(appSettings, setAppSettings, language);
  const {
    activeChat,
    activeSessionId,
    apiModels,
    currentChatSettings,
    handleSaveAllScenarios,
    handleSelectModelInHeader,
    handleSendMessage,
    handleStopGenerating,
    isLoading,
    isSwitchingModel,
    messages,
    savedGroups,
    savedScenarios,
    setCommandedInput,
    setCurrentChatSettings,
    startNewChat,
    updateAndPersistGroups,
    updateAndPersistSessions,
  } = chatState;
  const uiState = useAppUi();
  const setIsHistorySidebarOpenTransient = useUIStore((state) => state.setIsHistorySidebarOpenTransient);
  const setIsLogViewerOpen = useUIStore((state) => state.setIsLogViewerOpen);

  const [sidePanelContent, setSidePanelContent] = useState<SideViewContent | null>(null);

  const handleOpenSidePanel = useCallback(
    (content: SideViewContent) => {
      setSidePanelContent(content);
      if (window.innerWidth < 1280) {
        setIsHistorySidebarOpenTransient(false);
      }
    },
    [setIsHistorySidebarOpenTransient],
  );

  const handleCloseSidePanel = useCallback(() => {
    setSidePanelContent(null);
  }, []);

  const pipState = usePictureInPicture(uiState.isHistorySidebarOpen, setIsHistorySidebarOpenTransient);

  useEffect(() => {
    if (pipState.pipWindow?.document) {
      applyThemeToDocument(pipState.pipWindow.document, currentTheme, appSettings);
    }
  }, [pipState.pipWindow, currentTheme, appSettings]);

  const providerAwareModels = useMemo(
    () => buildProviderAwareModelList(appSettings, apiModels, currentChatSettings),
    [appSettings, apiModels, currentChatSettings],
  );

  const eventsState = useAppEvents({
    appSettings,
    setAppSettings,
    startNewChat,
    currentChatSettings,
    availableModels: providerAwareModels,
    handleSelectModelInHeader,
    setIsLogViewerOpen,
    onTogglePip: pipState.togglePip,
    isPipSupported: pipState.isPipSupported,
    pipWindow: pipState.pipWindow,
    isLoading,
    onStopGenerating: handleStopGenerating,
  });

  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [exportStatus, setExportStatus] = useState<'idle' | 'exporting'>('idle');

  const sessionTitle = activeChat?.title === 'New Chat' ? t('newChat') : activeChat?.title || t('newChat');

  useAppTitle({
    isLoading,
    messages,
    language,
    sessionTitle,
  });

  useAppFavicon({ activeSessionId });

  const dataExport = useDataExport({
    appSettings,
    savedGroups,
    savedScenarios,
    t,
  });

  const dataImport = useDataImport({
    setAppSettings,
    updateAndPersistSessions,
    updateAndPersistGroups,
    savedScenarios,
    handleSaveAllScenarios,
    t,
  });

  const { exportChatLogic } = useChatSessionExport({
    activeChat,
    currentTheme,
    language,
    t,
  });

  const handleExportChat = useCallback(
    async (format: 'png' | 'html' | 'txt' | 'json') => {
      if (!activeChat) {
        return;
      }

      setExportStatus('exporting');
      try {
        const didExport = await exportChatLogic(format);
        if (didExport === false) {
          return;
        }
        setIsExportModalOpen(false);
      } catch (error) {
        logService.error(`Chat export failed (format: ${format})`, { error });
        toastError(formatI18nErrorMessage(t, 'exportFailedWithMessage', error));
      } finally {
        setExportStatus('idle');
      }
    },
    [activeChat, exportChatLogic, t],
  );

  const handleSaveSettings = useCallback(
    (newSettings: AppSettings) => {
      // Chat-level keys that changed globally must also be written through to
      // the active session: while a session is open, its settings snapshot
      // shadows appSettings, so without this the settings modal would silently
      // not apply to the open chat. Unchanged keys keep session-local overrides.
      // Model identity (modelId/providerId) stays session-scoped — it is chosen
      // per chat via the header model picker — and lockedApiKey is session-owned.
      const changedChatSettings: Partial<ChatSettings> = {};
      (Object.keys(DEFAULT_CHAT_SETTINGS) as (keyof ChatSettings)[]).forEach((key) => {
        if (key === 'lockedApiKey' || key === 'modelId' || key === 'providerId') {
          return;
        }
        if (!Object.is(appSettings[key], newSettings[key])) {
          (changedChatSettings as Record<string, unknown>)[key] = newSettings[key];
        }
      });
      const hasChatSettingChanges = Object.keys(changedChatSettings).length > 0;

      setAppSettings(newSettings);
      if (activeSessionId && hasChatSettingChanges) {
        setCurrentChatSettings((prevChatSettings) => ({ ...prevChatSettings, ...changedChatSettings }));
      }
    },
    [activeSessionId, appSettings, setCurrentChatSettings, setAppSettings],
  );

  const handleSaveCurrentChatSettings = useCallback(
    (newSettings: ChatSettings) => {
      if (!activeSessionId) {
        return;
      }

      if (newSettings.modelId !== currentChatSettings.modelId) {
        handleSelectModelInHeader(newSettings.modelId);
      }

      setCurrentChatSettings((prevChatSettings) => ({
        ...prevChatSettings,
        ...newSettings,
        lockedApiKey: prevChatSettings.lockedApiKey ?? null,
      }));
    },
    [activeSessionId, currentChatSettings.modelId, handleSelectModelInHeader, setCurrentChatSettings],
  );

  const {
    handleLoadLiveArtifactsPromptAndSave,
    handleDeactivateLiveArtifactsPrompt,
    handleToggleBBoxMode,
    handleToggleGuideMode,
    handleSuggestionClick,
    isLiveArtifactsPromptActive,
    isLiveArtifactsPromptBusy,
  } = useAppPromptModes({
    appSettings,
    setAppSettings,
    activeChat,
    activeSessionId,
    currentChatSettings,
    language,
    setCurrentChatSettings,
    handleSendMessage,
    setCommandedInput,
  });

  const handleSetThinkingLevel = useCallback(
    (level: ThinkingLevel) => {
      const activeModelId = currentChatSettings.modelId || appSettings.modelId;
      const shouldUseThinkingPresets = getModelCapabilities(activeModelId).supportsThinkingLevel;

      setAppSettings((prev) => ({
        ...prev,
        thinkingLevel: level,
        ...(shouldUseThinkingPresets ? { thinkingBudget: DEFAULT_THINKING_BUDGET } : {}),
      }));
      if (activeSessionId) {
        setCurrentChatSettings((prev) => ({
          ...prev,
          thinkingLevel: level,
          ...(shouldUseThinkingPresets ? { thinkingBudget: DEFAULT_THINKING_BUDGET } : {}),
        }));
      }
      focusChatInput();
    },
    [activeSessionId, appSettings.modelId, currentChatSettings.modelId, setAppSettings, setCurrentChatSettings],
  );

  const getCurrentModelDisplayName = useCallback(() => {
    const apiRoute = resolveChatApiRoute(appSettings, currentChatSettings);
    const modelIdToDisplay = apiRoute.modelId;
    const availableModels = apiRoute.provider ? apiRoute.provider.models : apiModels;

    if (isSwitchingModel) {
      return t('appSwitchingModel');
    }

    const model = availableModels.find((candidate: ModelOption) => candidate.id === modelIdToDisplay);
    if (model) {
      return model.name;
    }

    if (modelIdToDisplay) {
      const shortName = modelIdToDisplay.split('/').pop() || modelIdToDisplay;
      if (shortName.toLowerCase().startsWith('gpt-')) {
        return shortName.replace(/^gpt/i, 'GPT');
      }

      const normalizedName = shortName.replace('gemini-', 'Gemini ');
      return normalizedName
        .split('-')
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ')
        .replace(' Preview ', ' Preview ');
    }

    return availableModels.length === 0 ? t('appNoModelsAvailable') : t('appNoModelSelected');
  }, [apiModels, appSettings, currentChatSettings, isSwitchingModel, t]);

  return {
    appSettings,
    setAppSettings,
    currentTheme,
    language,
    t,
    chatState,
    uiState,
    pipState,
    eventsState,
    sidePanelContent,
    handleOpenSidePanel,
    handleCloseSidePanel,
    isExportModalOpen,
    setIsExportModalOpen,
    exportStatus,
    handleExportChat,
    activeChat,
    sessionTitle,
    handleSaveSettings,
    handleSaveCurrentChatSettings,
    handleLoadLiveArtifactsPromptAndSave,
    handleDeactivateLiveArtifactsPrompt,
    handleToggleBBoxMode,
    handleToggleGuideMode,
    handleSuggestionClick,
    isLiveArtifactsPromptActive,
    isLiveArtifactsPromptBusy,
    handleSetThinkingLevel,
    getCurrentModelDisplayName,
    handleExportAllScenarios: dataExport.handleExportAllScenarios,
    handleImportAllScenarios: dataImport.handleImportAllScenarios,
  };
};
