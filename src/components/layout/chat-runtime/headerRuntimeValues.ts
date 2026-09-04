import { useCallback, useMemo } from 'react';

import type { AppViewModel } from '@/hooks/app/useApp';
import type { ChatProviderId } from '@/types';
import { buildProviderAwareModelList } from '@/utils/thirdPartyApiProviders';
import { resolveChatApiRoute } from '@/utils/chatApiRoute';
import { buildNewTabHref } from '@/utils/chat/lastActiveSession';
import type { ChatHeaderRuntimeValue } from './chatRuntimeTypes';

interface HeaderRuntimeValuesOptions {
  app: AppViewModel;
  onOpenScenariosModal: () => void;
  onToggleHistorySidebar: () => void;
}

const buildHeaderModels = (
  appSettings: AppViewModel['appSettings'],
  apiModels: AppViewModel['chatState']['apiModels'],
  currentChatSettings: AppViewModel['chatState']['currentChatSettings'],
) => {
  const geminiModels = apiModels.map((model) => ({ ...model, apiMode: 'gemini-native' as const }));
  return buildProviderAwareModelList(appSettings, geminiModels, currentChatSettings);
};

export const useChatHeaderRuntimeValues = ({
  app,
  onOpenScenariosModal,
  onToggleHistorySidebar,
}: HeaderRuntimeValuesOptions) => {
  const {
    appSettings,
    chatState,
    pipState,
    handleLoadLiveArtifactsPromptAndSave,
    isLiveArtifactsPromptActive,
    isLiveArtifactsPromptBusy,
    getCurrentModelDisplayName,
  } = app;

  // Destructure the chatState members into stable local references so the
  // callbacks and memo below are not invalidated by the whole chatState object
  // changing identity on every render (see inputRuntimeValues.ts for details).
  const {
    currentChatSettings,
    apiModels,
    isAppDraggingOver,
    modelsLoadingError,
    handleAppDragEnter,
    handleAppDragOver,
    handleAppDragLeave,
    handleAppDrop,
    startNewChat,
    activeSessionId,
    handleSelectModelInHeader,
  } = chatState;

  const currentModelName = getCurrentModelDisplayName();
  const currentApiRoute = resolveChatApiRoute(appSettings, currentChatSettings);
  const headerAvailableModels = useMemo(
    () => buildHeaderModels(appSettings, apiModels, currentChatSettings),
    [appSettings, apiModels, currentChatSettings],
  );
  const headerSelectedModelId = currentApiRoute.modelId;
  // Picking a model only affects the active session's (providerId, modelId) —
  // it no longer flips a global apiMode/isThirdPartyApiEnabled.
  const handleHeaderSelectModel = useCallback(
    (modelId: string, providerId?: ChatProviderId) => {
      handleSelectModelInHeader(modelId, providerId);
    },
    [handleSelectModelInHeader],
  );

  const header = useMemo<ChatHeaderRuntimeValue>(
    () => ({
      isAppDraggingOver,
      modelsLoadingError,
      handleAppDragEnter,
      handleAppDragOver,
      handleAppDragLeave,
      handleAppDrop,
      currentModelName,
      availableModels: headerAvailableModels,
      selectedModelId: headerSelectedModelId,
      isLiveArtifactsPromptActive,
      isLiveArtifactsPromptBusy: !!isLiveArtifactsPromptBusy,
      isPipSupported: pipState.isPipSupported,
      isPipActive: pipState.isPipActive,
      onNewChat: startNewChat,
      newChatHref: buildNewTabHref(activeSessionId),
      onOpenScenariosModal,
      onToggleHistorySidebar,
      onLoadLiveArtifactsPrompt: handleLoadLiveArtifactsPromptAndSave,
      onSelectModel: handleHeaderSelectModel,
      onTogglePip: pipState.togglePip,
    }),
    [
      activeSessionId,
      currentModelName,
      handleAppDragEnter,
      handleAppDragLeave,
      handleAppDragOver,
      handleAppDrop,
      handleHeaderSelectModel,
      handleLoadLiveArtifactsPromptAndSave,
      headerAvailableModels,
      headerSelectedModelId,
      isAppDraggingOver,
      isLiveArtifactsPromptActive,
      isLiveArtifactsPromptBusy,
      modelsLoadingError,
      onOpenScenariosModal,
      onToggleHistorySidebar,
      pipState.isPipActive,
      pipState.isPipSupported,
      pipState.togglePip,
      startNewChat,
    ],
  );

  return {
    header,
    headerAvailableModels,
    handleHeaderSelectModel,
  };
};
