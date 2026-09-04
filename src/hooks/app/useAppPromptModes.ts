import { type Dispatch, type SetStateAction, useCallback, useEffect, useRef, useState } from 'react';
import type { SupportedLanguage } from '@/i18n/languageRegistry';

import {
  isBboxSystemInstruction,
  isLiveArtifactsSystemInstruction,
  isHdGuideSystemInstruction,
  loadBboxSystemPrompt,
  loadLiveArtifactsSystemPrompt,
  loadHdGuideSystemPrompt,
} from '@/features/prompts/promptRegistry';
import { DEFAULT_SYSTEM_INSTRUCTION } from '@/constants/settingsDefaults';
import { logService } from '@/services/logService';
import { focusChatInput } from '@/utils/chat-input/focus';
import { getLiveArtifactsSystemPromptOverride } from '@/utils/live-artifacts/liveArtifactsPromptSettings';
import type { AppSettings, ChatSettings, InputCommand, SavedChatSession } from '@/types';

interface PendingLiveArtifactsPromptActivation {
  systemInstruction: string;
  targetSessionId: string | null;
}

interface LiveArtifactsPromptOverrideState {
  active: boolean;
  targetSessionId: string | null;
}

interface UseAppPromptModesOptions {
  language?: SupportedLanguage;
  appSettings: {
    systemInstruction?: string | null;
    liveArtifactsPromptMode?: AppSettings['liveArtifactsPromptMode'];
    liveArtifactsSystemPrompt?: string | null;
    liveArtifactsSystemPrompts?: AppSettings['liveArtifactsSystemPrompts'];
  };
  setAppSettings: Dispatch<SetStateAction<AppSettings>>;
  activeChat: SavedChatSession | undefined;
  activeSessionId: string | null;
  currentChatSettings: ChatSettings;
  setCurrentChatSettings: (updater: (prev: ChatSettings) => ChatSettings) => void;
  handleSendMessage: (args: { text: string }) => void;
  setCommandedInput: (command: InputCommand) => void;
}

export const useAppPromptModes = ({
  language = 'zh',
  appSettings,
  setAppSettings,
  activeChat,
  activeSessionId,
  currentChatSettings,
  setCurrentChatSettings,
  handleSendMessage,
  setCommandedInput,
}: UseAppPromptModesOptions) => {
  const [pendingLiveArtifactsPromptActivation, setPendingLiveArtifactsPromptActivation] =
    useState<PendingLiveArtifactsPromptActivation | null>(null);
  const [liveArtifactsPromptBusySessionId, setLiveArtifactsPromptBusySessionId] = useState<string | null>(null);
  const [liveArtifactsPromptOverrideState, setLiveArtifactsPromptOverrideState] =
    useState<LiveArtifactsPromptOverrideState | null>(null);
  // The session/app system prompt captured when Live Artifacts was enabled, so
  // disabling restores what the user had before (instead of clobbering it with
  // an empty default). Mirrors the app-level prompt state so a toggle-off on the
  // homepage (no active session) can restore the previous app prompt.
  const previousAppSystemInstructionRef = useRef<string | null>(null);
  const previousSessionSystemInstructionRef = useRef<string | null>(null);
  const liveArtifactsPromptMode = appSettings.liveArtifactsPromptMode ?? 'inline';
  const configuredLiveArtifactsSystemPrompt = getLiveArtifactsSystemPromptOverride(
    appSettings,
    liveArtifactsPromptMode,
  );
  const isConfiguredLiveArtifactsSystemInstruction = useCallback(
    (instruction?: string | null) =>
      isLiveArtifactsSystemInstruction(instruction) ||
      (!!configuredLiveArtifactsSystemPrompt && instruction?.trim() === configuredLiveArtifactsSystemPrompt),
    [configuredLiveArtifactsSystemPrompt],
  );

  const currentLiveArtifactsPromptTargetSessionId = activeSessionId ?? null;
  const liveArtifactsPromptOverrideActive =
    liveArtifactsPromptOverrideState?.targetSessionId === currentLiveArtifactsPromptTargetSessionId
      ? liveArtifactsPromptOverrideState.active
      : null;
  const liveArtifactsPromptBusy = liveArtifactsPromptBusySessionId === currentLiveArtifactsPromptTargetSessionId;
  // Button reflects the active session only. Global appSettings.systemInstruction is still
  // written on toggle so newly created chats inherit Live Artifacts via createSettingsForNewChat.
  const persistedLiveArtifactsPromptActive = isConfiguredLiveArtifactsSystemInstruction(
    currentChatSettings.systemInstruction,
  );

  const isLiveArtifactsPromptActive = liveArtifactsPromptOverrideActive ?? persistedLiveArtifactsPromptActive;
  const loadBuiltInLiveArtifactsPrompt = useCallback(
    () => loadLiveArtifactsSystemPrompt(language, liveArtifactsPromptMode),
    [language, liveArtifactsPromptMode],
  );

  useEffect(() => {
    if (!pendingLiveArtifactsPromptActivation) {
      return;
    }

    const { systemInstruction, targetSessionId } = pendingLiveArtifactsPromptActivation;
    // A null target (homepage toggle) only mirrors the app-level prompt for new
    // chats; it must NOT write into whatever session happens to be active when
    // the effect fires later. An explicit session target requires an exact match
    // so a pending activation cannot leak into an unrelated session.
    if (targetSessionId === null) {
      queueMicrotask(() => {
        setPendingLiveArtifactsPromptActivation((current) =>
          current === pendingLiveArtifactsPromptActivation ? null : current,
        );
      });
      return;
    }
    if (targetSessionId !== activeSessionId) {
      return;
    }

    if (activeChat && isConfiguredLiveArtifactsSystemInstruction(activeChat.settings.systemInstruction)) {
      queueMicrotask(() => {
        setPendingLiveArtifactsPromptActivation((current) =>
          current === pendingLiveArtifactsPromptActivation ? null : current,
        );
      });
      return;
    }

    if (!activeSessionId || !activeChat) {
      return;
    }

    setCurrentChatSettings((prev) =>
      isConfiguredLiveArtifactsSystemInstruction(prev.systemInstruction)
        ? prev
        : {
            ...prev,
            systemInstruction,
          },
    );

    queueMicrotask(() => {
      setPendingLiveArtifactsPromptActivation((current) =>
        current === pendingLiveArtifactsPromptActivation ? null : current,
      );
    });
  }, [
    activeChat,
    activeSessionId,
    isConfiguredLiveArtifactsSystemInstruction,
    pendingLiveArtifactsPromptActivation,
    setCurrentChatSettings,
  ]);

  useEffect(() => {
    if (
      !liveArtifactsPromptOverrideState ||
      liveArtifactsPromptOverrideState.targetSessionId !== currentLiveArtifactsPromptTargetSessionId
    ) {
      return;
    }

    const actualActive = isConfiguredLiveArtifactsSystemInstruction(currentChatSettings.systemInstruction);
    if (actualActive === liveArtifactsPromptOverrideState.active) {
      queueMicrotask(() => {
        setLiveArtifactsPromptOverrideState((current) =>
          current &&
          current.targetSessionId === liveArtifactsPromptOverrideState.targetSessionId &&
          current.active === liveArtifactsPromptOverrideState.active
            ? null
            : current,
        );
        setLiveArtifactsPromptBusySessionId((current) =>
          current === liveArtifactsPromptOverrideState.targetSessionId ? null : current,
        );
      });
    }
  }, [
    isConfiguredLiveArtifactsSystemInstruction,
    liveArtifactsPromptOverrideState,
    currentLiveArtifactsPromptTargetSessionId,
    currentChatSettings.systemInstruction,
  ]);

  const activateLiveArtifactsPrompt = useCallback(
    async (targetSessionId: string | null) => {
      const newSystemInstruction = configuredLiveArtifactsSystemPrompt || (await loadBuiltInLiveArtifactsPrompt());

      setPendingLiveArtifactsPromptActivation({
        systemInstruction: newSystemInstruction,
        targetSessionId,
      });
      setAppSettings((prev) => ({ ...prev, systemInstruction: newSystemInstruction }));

      return newSystemInstruction;
    },
    [configuredLiveArtifactsSystemPrompt, loadBuiltInLiveArtifactsPrompt, setAppSettings],
  );

  const handleLoadLiveArtifactsPromptAndSave = useCallback(async () => {
    const targetSessionId = activeSessionId ?? null;

    if (liveArtifactsPromptBusy) {
      return;
    }

    const isCurrentlyLiveArtifactsPrompt = liveArtifactsPromptOverrideActive ?? persistedLiveArtifactsPromptActive;

    // Capture the pre-enable prompt so toggling off can restore it instead of
    // permanently wiping a user's custom system prompt.
    if (!isCurrentlyLiveArtifactsPrompt) {
      previousAppSystemInstructionRef.current = appSettings.systemInstruction ?? null;
      previousSessionSystemInstructionRef.current = currentChatSettings.systemInstruction ?? null;
    }

    setLiveArtifactsPromptBusySessionId(targetSessionId);
    setLiveArtifactsPromptOverrideState({
      active: !isCurrentlyLiveArtifactsPrompt,
      targetSessionId,
    });

    if (isCurrentlyLiveArtifactsPrompt) {
      setPendingLiveArtifactsPromptActivation(null);
      setAppSettings((prev) => ({
        ...prev,
        systemInstruction: previousAppSystemInstructionRef.current ?? DEFAULT_SYSTEM_INSTRUCTION,
      }));
      if (activeSessionId) {
        setCurrentChatSettings((prev) => ({
          ...prev,
          systemInstruction: previousSessionSystemInstructionRef.current ?? DEFAULT_SYSTEM_INSTRUCTION,
        }));
      }
    } else {
      try {
        await activateLiveArtifactsPrompt(targetSessionId);
      } catch (error) {
        // Restore the button state so a failed prompt load does not leave the
        // toggle stuck busy. Do not rethrow: this runs from an onClick that
        // ignores the returned promise, so a rejection would surface as an
        // unhandled promise rejection.
        setLiveArtifactsPromptOverrideState((current) =>
          current?.targetSessionId === targetSessionId
            ? { active: isCurrentlyLiveArtifactsPrompt, targetSessionId }
            : current,
        );
        setLiveArtifactsPromptBusySessionId((current) => (current === targetSessionId ? null : current));
        logService.error('Failed to activate Live Artifacts prompt:', error);
      }
    }

    focusChatInput();
  }, [
    activateLiveArtifactsPrompt,
    activeSessionId,
    appSettings.systemInstruction,
    currentChatSettings.systemInstruction,
    liveArtifactsPromptBusy,
    liveArtifactsPromptOverrideActive,
    persistedLiveArtifactsPromptActive,
    setAppSettings,
    setCurrentChatSettings,
  ]);

  const setCodePromptModeSettings = useCallback(
    (systemInstruction: string, isCodeExecutionEnabled: boolean) => {
      setAppSettings((prev) => ({
        ...prev,
        systemInstruction,
        isCodeExecutionEnabled,
      }));
      if (activeSessionId) {
        setCurrentChatSettings((prev) => ({
          ...prev,
          systemInstruction,
          isCodeExecutionEnabled,
        }));
      }
    },
    [activeSessionId, setAppSettings, setCurrentChatSettings],
  );

  const toggleCodePromptMode = useCallback(
    async (isCurrentlyActive: boolean, loadPrompt: () => Promise<string>) => {
      if (isCurrentlyActive) {
        setCodePromptModeSettings(DEFAULT_SYSTEM_INSTRUCTION, false);
        return;
      }

      setCodePromptModeSettings(await loadPrompt(), true);
    },
    [setCodePromptModeSettings],
  );

  const handleToggleBBoxMode = useCallback(async () => {
    await toggleCodePromptMode(isBboxSystemInstruction(currentChatSettings.systemInstruction), loadBboxSystemPrompt);
  }, [currentChatSettings.systemInstruction, toggleCodePromptMode]);

  const handleToggleGuideMode = useCallback(async () => {
    await toggleCodePromptMode(
      isHdGuideSystemInstruction(currentChatSettings.systemInstruction),
      loadHdGuideSystemPrompt,
    );
  }, [currentChatSettings.systemInstruction, toggleCodePromptMode]);

  const handleSuggestionClick = useCallback(
    async (type: 'homepage' | 'organize' | 'follow-up' | 'follow-up-fill', text: string) => {
      if (type === 'organize') {
        setLiveArtifactsPromptOverrideState({
          active: true,
          targetSessionId: currentLiveArtifactsPromptTargetSessionId,
        });

        if (!isConfiguredLiveArtifactsSystemInstruction(currentChatSettings.systemInstruction)) {
          await activateLiveArtifactsPrompt(activeSessionId);
        }

        setCommandedInput({ text: `${text}\n`, id: Date.now(), mode: 'replace' });
        // Keep the caret on the trailing blank line so the user can continue typing.
        focusChatInput(50, { caret: 'end' });
        return;
      }

      if (type === 'follow-up') {
        handleSendMessage({ text });
        return;
      }

      setCommandedInput({ text: `${text}\n`, id: Date.now() });
      focusChatInput(50, { caret: 'end' });
    },
    [
      activeSessionId,
      activateLiveArtifactsPrompt,
      currentLiveArtifactsPromptTargetSessionId,
      currentChatSettings.systemInstruction,
      handleSendMessage,
      isConfiguredLiveArtifactsSystemInstruction,
      setCommandedInput,
    ],
  );

  return {
    handleLoadLiveArtifactsPromptAndSave,
    handleToggleBBoxMode,
    handleToggleGuideMode,
    handleSuggestionClick,
    isLiveArtifactsPromptActive,
    isLiveArtifactsPromptBusy: liveArtifactsPromptBusy,
  };
};
