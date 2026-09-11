import { useCallback, useMemo } from 'react';
import { type ChatSettings, GEMINI_PROVIDER_ID } from '@/types';
import type { ChatToolSettingKey, ChatToolToggleStates, ToggleableChatToolId } from '@/types/chatTools';
import { useChatStore } from '@/stores/chatStore';
import { supportsSearchMapsCombination } from '@/utils/model/modelCapabilities';

interface UseChatInputToolStatesParams {
  currentChatSettings: ChatSettings;
  isLoading: boolean;
  onStopGenerating: () => void;
}

const TOOL_SETTING_KEYS: Record<ToggleableChatToolId, ChatToolSettingKey> = {
  deepSearch: 'isDeepSearchEnabled',
  googleSearch: 'isGoogleSearchEnabled',
  googleMaps: 'isGoogleMapsEnabled',
  codeExecution: 'isCodeExecutionEnabled',
  localPython: 'isLocalPythonEnabled',
  urlContext: 'isUrlContextEnabled',
  alwaysKeepThinking: 'alwaysKeepThinkingInContext',
};

export const getNextSettingsForToolToggle = (settings: ChatSettings, toolId: ToggleableChatToolId): ChatSettings => {
  if (toolId === 'codeExecution') {
    return {
      ...settings,
      isCodeExecutionEnabled: !settings.isCodeExecutionEnabled,
      isLocalPythonEnabled: !settings.isCodeExecutionEnabled ? false : settings.isLocalPythonEnabled,
    };
  }

  if (toolId === 'localPython') {
    return {
      ...settings,
      isLocalPythonEnabled: !settings.isLocalPythonEnabled,
      isCodeExecutionEnabled: !settings.isLocalPythonEnabled ? false : settings.isCodeExecutionEnabled,
    };
  }

  // googleSearch and deepSearch are mutually exclusive search prompt modes:
  // enabling either one disables the other.
  // Google Maps can be combined with Google Search on Gemini 3.5+ models.
  // On older models (e.g. Gemini 2.5), Google Search and Google Maps remain mutually exclusive.
  const canCombineSearchMaps = supportsSearchMapsCombination(settings.modelId);

  if (toolId === 'googleSearch') {
    const willEnable = !settings.isGoogleSearchEnabled;
    return {
      ...settings,
      isGoogleSearchEnabled: willEnable,
      isDeepSearchEnabled: willEnable ? false : settings.isDeepSearchEnabled,
      isGoogleMapsEnabled: willEnable && !canCombineSearchMaps ? false : settings.isGoogleMapsEnabled,
    };
  }

  if (toolId === 'deepSearch') {
    const willEnable = !settings.isDeepSearchEnabled;
    return {
      ...settings,
      isDeepSearchEnabled: willEnable,
      isGoogleSearchEnabled: willEnable ? false : settings.isGoogleSearchEnabled,
      isGoogleMapsEnabled: willEnable && !canCombineSearchMaps ? false : settings.isGoogleMapsEnabled,
    };
  }

  if (toolId === 'googleMaps') {
    const willEnable = !settings.isGoogleMapsEnabled;
    return {
      ...settings,
      isGoogleMapsEnabled: willEnable,
      isGoogleSearchEnabled: willEnable && !canCombineSearchMaps ? false : settings.isGoogleSearchEnabled,
      isDeepSearchEnabled: willEnable && !canCombineSearchMaps ? false : settings.isDeepSearchEnabled,
    };
  }

  // alwaysKeepThinking and hideThinkingInContext are mutually exclusive — keeping
  // the model's prior thinking in context only makes sense when it isn't being
  // collapsed out of history. Mirrors the two-way mutex in GenerationSection.
  if (toolId === 'alwaysKeepThinking') {
    return {
      ...settings,
      alwaysKeepThinkingInContext: !settings.alwaysKeepThinkingInContext,
      hideThinkingInContext: !settings.alwaysKeepThinkingInContext ? false : settings.hideThinkingInContext,
    };
  }

  const settingKey = TOOL_SETTING_KEYS[toolId];
  return {
    ...settings,
    [settingKey]: !settings[settingKey],
  };
};

export const useChatInputToolStates = ({
  currentChatSettings,
  isLoading,
  onStopGenerating,
}: UseChatInputToolStatesParams): ChatToolToggleStates => {
  const activeSessionId = useChatStore((state) => state.activeSessionId);
  const setCurrentChatSettings = useChatStore((state) => state.setCurrentChatSettings);
  // The Gemini tools below only work on the Gemini-native API, so the gate must mirror
  // the active session's routing decision — the session's own providerId, which can
  // never drift stale the way a global appSettings mode could.
  const isThirdPartyChat =
    currentChatSettings.providerId !== undefined && currentChatSettings.providerId !== GEMINI_PROVIDER_ID;

  const createToggle = useCallback(
    (toolId: ToggleableChatToolId) => () => {
      if (!activeSessionId) return;
      if (isLoading) onStopGenerating();

      setCurrentChatSettings((previousSettings) => getNextSettingsForToolToggle(previousSettings, toolId));
    },
    [activeSessionId, isLoading, onStopGenerating, setCurrentChatSettings],
  );

  return useMemo(
    () => ({
      deepSearch: {
        isEnabled: !isThirdPartyChat && !!currentChatSettings.isDeepSearchEnabled,
        onToggle: createToggle('deepSearch'),
      },
      googleSearch: {
        isEnabled: !isThirdPartyChat && !!currentChatSettings.isGoogleSearchEnabled,
        onToggle: createToggle('googleSearch'),
      },
      googleMaps: {
        isEnabled: !isThirdPartyChat && !!currentChatSettings.isGoogleMapsEnabled,
        onToggle: createToggle('googleMaps'),
      },
      codeExecution: {
        isEnabled: !isThirdPartyChat && !!currentChatSettings.isCodeExecutionEnabled,
        onToggle: createToggle('codeExecution'),
      },
      localPython: {
        isEnabled: !isThirdPartyChat && !!currentChatSettings.isLocalPythonEnabled,
        onToggle: createToggle('localPython'),
      },
      urlContext: {
        isEnabled: !isThirdPartyChat && !!currentChatSettings.isUrlContextEnabled,
        onToggle: createToggle('urlContext'),
      },
      alwaysKeepThinking: {
        isEnabled: !!currentChatSettings.alwaysKeepThinkingInContext,
        onToggle: createToggle('alwaysKeepThinking'),
      },
    }),
    [createToggle, currentChatSettings, isThirdPartyChat],
  );
};
