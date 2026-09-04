import { useCallback, useMemo } from 'react';
import { type ChatSettings, GEMINI_PROVIDER_ID } from '@/types';
import type { ChatToolSettingKey, ChatToolToggleStates, ToggleableChatToolId } from '@/types/chatTools';
import { useChatStore } from '@/stores/chatStore';

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

  // googleSearch and googleMaps are mutually exclusive (SDK rejects a request that
  // carries both tools), so enabling one disables the other.
  if (toolId === 'googleSearch') {
    return {
      ...settings,
      isGoogleSearchEnabled: !settings.isGoogleSearchEnabled,
      isGoogleMapsEnabled: !settings.isGoogleSearchEnabled ? false : settings.isGoogleMapsEnabled,
    };
  }

  if (toolId === 'googleMaps') {
    return {
      ...settings,
      isGoogleMapsEnabled: !settings.isGoogleMapsEnabled,
      isGoogleSearchEnabled: !settings.isGoogleMapsEnabled ? false : settings.isGoogleSearchEnabled,
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
