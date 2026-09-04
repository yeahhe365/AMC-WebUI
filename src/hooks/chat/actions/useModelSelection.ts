import { type MutableRefObject, useCallback } from 'react';
import {
  type AppSettings,
  type ChatSettings as IndividualChatSettings,
  type SavedChatSession,
  type ChatProviderId,
  GEMINI_PROVIDER_ID,
} from '@/types';
import { DEFAULT_CHAT_SETTINGS } from '@/constants/settingsDefaults';
import { createNewSession } from '@/utils/chat/session';
import { focusChatInput } from '@/utils/chat-input/focus';
import { resolveModelSwitchSettings } from '@/utils/model/modelSwitchSettings';
import {
  findThirdPartyConnection,
  getEnabledThirdPartyProviders,
  resolveProviderForModelId,
} from '@/utils/thirdPartyApiProviders';

interface UseModelSelectionProps {
  appSettings: AppSettings;
  activeSessionId: string | null;
  currentChatSettings: IndividualChatSettings;
  isLoading: boolean;
  updateAndPersistSessions: (
    updater: (prev: SavedChatSession[]) => SavedChatSession[],
    options?: { persist?: boolean },
  ) => void;
  setActiveSessionId: (id: string | null) => void;
  setCurrentChatSettings: (updater: (prevSettings: IndividualChatSettings) => IndividualChatSettings) => void;
  setIsSwitchingModel: (switching: boolean) => void;
  handleStopGenerating: () => void;
  userScrolledUpRef: MutableRefObject<boolean>;
}

const hasResolvedModelSettingChanges = (
  currentSettings: IndividualChatSettings,
  resolvedModelSettings: Partial<IndividualChatSettings>,
): boolean =>
  currentSettings.thinkingBudget !== resolvedModelSettings.thinkingBudget ||
  currentSettings.thinkingLevel !== resolvedModelSettings.thinkingLevel;

export const useModelSelection = ({
  appSettings,
  activeSessionId,
  currentChatSettings,
  isLoading,
  updateAndPersistSessions,
  setActiveSessionId,
  setCurrentChatSettings,
  setIsSwitchingModel,
  handleStopGenerating,
  userScrolledUpRef,
}: UseModelSelectionProps) => {
  const handleSelectModelInHeader = useCallback(
    (modelId: string, explicitProviderId?: ChatProviderId) => {
      const thirdPartyModels = getEnabledThirdPartyProviders(appSettings);
      const isThirdPartyModel = thirdPartyModels.some(({ config }) => config.models.some((m) => m.id === modelId));
      const explicitConnection =
        explicitProviderId && explicitProviderId !== GEMINI_PROVIDER_ID
          ? findThirdPartyConnection(appSettings, explicitProviderId)
          : undefined;
      const inferredProvider =
        !explicitProviderId || explicitProviderId === GEMINI_PROVIDER_ID
          ? isThirdPartyModel
            ? resolveProviderForModelId(appSettings, modelId)
            : undefined
          : undefined;
      const sourceSettings = activeSessionId ? currentChatSettings : appSettings;
      const resolvedModelSettings: Partial<IndividualChatSettings> = resolveModelSwitchSettings({
        currentSettings: currentChatSettings,
        sourceSettings,
        targetModelId: modelId,
      });
      // The routing key is a single derived value: which provider this modelId
      // belongs to. Writing only (providerId) — with modelId coming from
      // resolvedModelSettings — keeps the session self-consistent and never
      // touches a global mode.
      const routingSettings: Pick<IndividualChatSettings, 'providerId'> =
        explicitProviderId && explicitProviderId !== GEMINI_PROVIDER_ID
          ? { providerId: explicitConnection?.id ?? explicitProviderId }
          : inferredProvider
            ? { providerId: inferredProvider.id }
            : { providerId: GEMINI_PROVIDER_ID };
      const nextModelSettings = { ...resolvedModelSettings, ...routingSettings };

      if (!activeSessionId) {
        const sessionSettings = { ...DEFAULT_CHAT_SETTINGS, ...appSettings, ...nextModelSettings };
        const newSession = createNewSession(sessionSettings);

        updateAndPersistSessions((prev) => [newSession, ...prev]);
        setActiveSessionId(newSession.id);
      } else {
        if (isLoading) handleStopGenerating();
        if (modelId !== currentChatSettings.modelId) {
          setIsSwitchingModel(true);
          updateAndPersistSessions((prev) =>
            prev.map((session) =>
              session.id === activeSessionId
                ? { ...session, settings: { ...session.settings, ...nextModelSettings } }
                : session,
            ),
          );
        } else {
          const routingChanged = currentChatSettings.providerId !== routingSettings.providerId;
          if (routingChanged || hasResolvedModelSettingChanges(currentChatSettings, resolvedModelSettings)) {
            setCurrentChatSettings((prev) => ({
              ...prev,
              ...nextModelSettings,
            }));
          }
        }
      }

      userScrolledUpRef.current = false;
      focusChatInput();
    },
    [
      isLoading,
      currentChatSettings,
      updateAndPersistSessions,
      activeSessionId,
      userScrolledUpRef,
      handleStopGenerating,
      appSettings,
      setActiveSessionId,
      setCurrentChatSettings,
      setIsSwitchingModel,
    ],
  );

  return { handleSelectModelInHeader };
};
