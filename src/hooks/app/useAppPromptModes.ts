import { type Dispatch, type SetStateAction, useCallback, useEffect, useRef, useState } from 'react';
import type { SupportedLanguage } from '@/i18n/languageRegistry';

import {
  isBboxSystemInstruction,
  isLiveArtifactsSystemInstruction,
  isHdGuideSystemInstruction,
  loadLiveArtifactsSystemPrompt,
} from '@/features/prompts/promptRegistry';
import { stripLegacyFeatureMarkers } from '@/features/prompts/promptCompositor';
import { DEFAULT_SYSTEM_INSTRUCTION } from '@/constants/settingsDefaults';
import { logService } from '@/services/logService';
import { focusChatInput } from '@/utils/chat-input/focus';
import { getLiveArtifactsSystemPromptOverride } from '@/utils/live-artifacts/liveArtifactsPromptSettings';
import { closeMediaNavPanel } from '@/stores/mediaNavStore';
import { useChatStore } from '@/stores/chatStore';
import { updateSessionById as updateSessionByIdInSessions } from '@/utils/chat/sessionMutations';
import type { AppSettings, ChatSettings, InputCommand, SavedChatSession, VisionPromptMode } from '@/types';

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
    isLiveArtifactsEnabled?: boolean;
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
  const activeSessionIdRef = useRef(activeSessionId);
  activeSessionIdRef.current = activeSessionId;

  const activatingSessionIdRef = useRef<string | null | undefined>(undefined);
  const isMountedRef = useRef(true);
  const operationVersionRef = useRef(0);
  const deactivationTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      if (deactivationTimerRef.current) {
        clearTimeout(deactivationTimerRef.current);
      }
    };
  }, []);

  const [liveArtifactsPromptBusySessionId, setLiveArtifactsPromptBusySessionId] = useState<string | null | undefined>(
    undefined,
  );
  const [liveArtifactsPromptOverrideState, setLiveArtifactsPromptOverrideState] =
    useState<LiveArtifactsPromptOverrideState | null>(null);

  // Previous system instruction storage mapped per session id, preventing
  // prompt cross-contamination when toggling in multiple sessions.
  const previousAppSystemInstructionRef = useRef<string | null>(null);
  const previousSessionSystemInstructionsRef = useRef<Map<string, string | null>>(new Map());

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
  const liveArtifactsPromptBusy =
    liveArtifactsPromptBusySessionId !== undefined &&
    liveArtifactsPromptBusySessionId === currentLiveArtifactsPromptTargetSessionId;

  // Button reflects the active session settings. Explicit boolean takes precedence over prompt markers.
  const persistedLiveArtifactsPromptActive = Boolean(
    currentChatSettings.isLiveArtifactsEnabled === true
      ? true
      : currentChatSettings.isLiveArtifactsEnabled === false
        ? false
        : isConfiguredLiveArtifactsSystemInstruction(currentChatSettings.systemInstruction),
  );

  const isLiveArtifactsPromptActive = liveArtifactsPromptOverrideActive ?? persistedLiveArtifactsPromptActive;
  const loadBuiltInLiveArtifactsPrompt = useCallback(
    () => loadLiveArtifactsSystemPrompt(language, liveArtifactsPromptMode),
    [language, liveArtifactsPromptMode],
  );

  // Clear stale busy or override states when active session changes so they never
  // leak into another session or cause deadlocks.
  useEffect(() => {
    if (deactivationTimerRef.current) {
      clearTimeout(deactivationTimerRef.current);
      deactivationTimerRef.current = null;
    }
    setLiveArtifactsPromptBusySessionId((current) => (current !== activeSessionId ? undefined : current));
    setLiveArtifactsPromptOverrideState((current) =>
      current && current.targetSessionId !== (activeSessionId ?? null) ? null : current,
    );
  }, [activeSessionId]);

  // Reconcile override state once persisted settings match.
  useEffect(() => {
    if (
      !liveArtifactsPromptOverrideState ||
      liveArtifactsPromptOverrideState.targetSessionId !== currentLiveArtifactsPromptTargetSessionId
    ) {
      return;
    }

    const actualActive = Boolean(
      currentChatSettings.isLiveArtifactsEnabled === true
        ? true
        : currentChatSettings.isLiveArtifactsEnabled === false
          ? false
          : isConfiguredLiveArtifactsSystemInstruction(currentChatSettings.systemInstruction),
    );
    if (actualActive === liveArtifactsPromptOverrideState.active) {
      setLiveArtifactsPromptOverrideState(null);
      if (!liveArtifactsPromptOverrideState.active) {
        setLiveArtifactsPromptBusySessionId(undefined);
        if (deactivationTimerRef.current) {
          clearTimeout(deactivationTimerRef.current);
          deactivationTimerRef.current = null;
        }
      }
    }
  }, [
    currentChatSettings.isLiveArtifactsEnabled,
    currentChatSettings.systemInstruction,
    currentLiveArtifactsPromptTargetSessionId,
    isConfiguredLiveArtifactsSystemInstruction,
    liveArtifactsPromptOverrideState,
  ]);

  // When an activation occurs while activeChat is still loading/stabilizing in the session store,
  // re-apply to currentChatSettings as soon as activeChat is available.
  useEffect(() => {
    if (!pendingLiveArtifactsPromptActivation) {
      return;
    }

    const { systemInstruction, targetSessionId } = pendingLiveArtifactsPromptActivation;

    // If user switched away from target session, discard pending activation so it doesn't leak.
    if (targetSessionId !== null && targetSessionId !== activeSessionId) {
      setPendingLiveArtifactsPromptActivation(null);
      return;
    }

    // Target session is active, but activeChat is still stabilizing. Wait for it.
    if (activeSessionId && !activeChat) {
      return;
    }

    setCurrentChatSettings((prev) => {
      const isAlreadyPrompt = isConfiguredLiveArtifactsSystemInstruction(prev.systemInstruction);
      if (prev.isLiveArtifactsEnabled === true && isAlreadyPrompt) {
        return prev;
      }
      return {
        ...prev,
        isLiveArtifactsEnabled: true,
        systemInstruction: isAlreadyPrompt ? prev.systemInstruction : systemInstruction,
      };
    });

    setPendingLiveArtifactsPromptActivation(null);
  }, [
    activeChat,
    activeSessionId,
    isConfiguredLiveArtifactsSystemInstruction,
    pendingLiveArtifactsPromptActivation,
    setCurrentChatSettings,
  ]);

  const activateLiveArtifactsPrompt = useCallback(
    async (targetSessionId: string | null) => {
      const opId = ++operationVersionRef.current;
      const newSystemInstruction = configuredLiveArtifactsSystemPrompt || (await loadBuiltInLiveArtifactsPrompt());

      // If user cancelled, toggled off, or switched sessions while the prompt was loading asynchronously, discard!
      if (opId !== operationVersionRef.current || !isMountedRef.current) {
        return '';
      }

      setAppSettings((prev) => ({
        ...prev,
        isLiveArtifactsEnabled: true,
        systemInstruction:
          prev.systemInstruction && !isConfiguredLiveArtifactsSystemInstruction(prev.systemInstruction)
            ? prev.systemInstruction
            : newSystemInstruction,
      }));

      const currentActiveId = activeSessionIdRef.current;
      const isTargetActive = targetSessionId === null || targetSessionId === currentActiveId;
      if (isTargetActive) {
        if (targetSessionId !== null && !activeChat) {
          setPendingLiveArtifactsPromptActivation({
            systemInstruction: newSystemInstruction,
            targetSessionId,
          });
        }
        setCurrentChatSettings((prev) => {
          const isAlreadyPrompt = isConfiguredLiveArtifactsSystemInstruction(prev.systemInstruction);
          const hasCustomPrompt = prev.systemInstruction && !isAlreadyPrompt;
          if (
            prev.isLiveArtifactsEnabled === true &&
            (hasCustomPrompt || isAlreadyPrompt) &&
            !prev.isPdfNavEnabled &&
            !prev.isVideoNavEnabled &&
            !prev.isAudioNavEnabled &&
            !prev.isImageNavEnabled
          ) {
            return prev;
          }
          return {
            ...prev,
            isPdfNavEnabled: false,
            isVideoNavEnabled: false,
            isAudioNavEnabled: false,
            isImageNavEnabled: false,
            isLiveArtifactsEnabled: true,
            systemInstruction: hasCustomPrompt
              ? prev.systemInstruction
              : isAlreadyPrompt
                ? prev.systemInstruction
                : newSystemInstruction,
          };
        });
      } else if (targetSessionId !== null) {
        useChatStore.getState().updateAndPersistSessions((prevSessions) =>
          updateSessionByIdInSessions(prevSessions, targetSessionId, (session) => {
            const isAlreadyPrompt = isConfiguredLiveArtifactsSystemInstruction(session.settings.systemInstruction);
            const hasCustomPrompt = session.settings.systemInstruction && !isAlreadyPrompt;
            return {
              ...session,
              settings: {
                ...session.settings,
                isPdfNavEnabled: false,
                isVideoNavEnabled: false,
                isAudioNavEnabled: false,
                isImageNavEnabled: false,
                isLiveArtifactsEnabled: true,
                systemInstruction: hasCustomPrompt
                  ? session.settings.systemInstruction
                  : isAlreadyPrompt
                    ? session.settings.systemInstruction
                    : newSystemInstruction,
              },
            };
          }),
        );
      }

      return newSystemInstruction;
    },
    [
      activeChat,
      configuredLiveArtifactsSystemPrompt,
      isConfiguredLiveArtifactsSystemInstruction,
      loadBuiltInLiveArtifactsPrompt,
      setAppSettings,
      setCurrentChatSettings,
    ],
  );

  const handleDeactivateLiveArtifactsPrompt = useCallback(() => {
    const targetSessionId = activeSessionId ?? null;
    const isCurrentlyLiveArtifactsPrompt = liveArtifactsPromptOverrideActive ?? persistedLiveArtifactsPromptActive;
    const isAppLiveArtifacts = Boolean(
      appSettings.isLiveArtifactsEnabled || isConfiguredLiveArtifactsSystemInstruction(appSettings.systemInstruction),
    );
    const isSessionLiveArtifacts = Boolean(
      currentChatSettings.isLiveArtifactsEnabled ||
      isConfiguredLiveArtifactsSystemInstruction(currentChatSettings.systemInstruction),
    );

    if (!isCurrentlyLiveArtifactsPrompt && !isAppLiveArtifacts && !isSessionLiveArtifacts) {
      return;
    }

    // Invalidate any in-flight activation operation so delayed async loads cannot re-enable.
    const opId = ++operationVersionRef.current;

    const safeAppPrompt =
      previousAppSystemInstructionRef.current &&
      !isConfiguredLiveArtifactsSystemInstruction(previousAppSystemInstructionRef.current)
        ? previousAppSystemInstructionRef.current
        : DEFAULT_SYSTEM_INSTRUCTION;

    const previousSessionPrompt = targetSessionId
      ? previousSessionSystemInstructionsRef.current.get(targetSessionId)
      : previousAppSystemInstructionRef.current;

    const safeSessionPrompt =
      previousSessionPrompt && !isConfiguredLiveArtifactsSystemInstruction(previousSessionPrompt)
        ? previousSessionPrompt
        : DEFAULT_SYSTEM_INSTRUCTION;

    previousAppSystemInstructionRef.current = safeAppPrompt;
    if (targetSessionId) {
      previousSessionSystemInstructionsRef.current.set(targetSessionId, safeSessionPrompt);
    }

    setPendingLiveArtifactsPromptActivation(null);
    setLiveArtifactsPromptBusySessionId(targetSessionId);
    setLiveArtifactsPromptOverrideState({
      active: false,
      targetSessionId,
    });

    if (deactivationTimerRef.current) {
      clearTimeout(deactivationTimerRef.current);
    }
    deactivationTimerRef.current = setTimeout(() => {
      if (isMountedRef.current && operationVersionRef.current === opId) {
        setLiveArtifactsPromptBusySessionId(undefined);
      }
    }, 200);

    setAppSettings((prev) => {
      const isLegacyPrompt = isConfiguredLiveArtifactsSystemInstruction(prev.systemInstruction);
      const strippedPrompt = stripLegacyFeatureMarkers(prev.systemInstruction);
      return {
        ...prev,
        isLiveArtifactsEnabled: false,
        systemInstruction: isLegacyPrompt ? strippedPrompt || safeAppPrompt : prev.systemInstruction,
      };
    });

    setCurrentChatSettings((prev) => {
      const isAlreadyDisabled = prev.isLiveArtifactsEnabled === false;
      const isLegacyPrompt = isConfiguredLiveArtifactsSystemInstruction(prev.systemInstruction);
      if (isAlreadyDisabled && !isLegacyPrompt) {
        return prev;
      }
      const strippedPrompt = stripLegacyFeatureMarkers(prev.systemInstruction);
      return {
        ...prev,
        isLiveArtifactsEnabled: false,
        systemInstruction: isLegacyPrompt ? strippedPrompt || safeSessionPrompt : prev.systemInstruction,
      };
    });
  }, [
    activeSessionId,
    appSettings.isLiveArtifactsEnabled,
    appSettings.systemInstruction,
    currentChatSettings.isLiveArtifactsEnabled,
    currentChatSettings.systemInstruction,
    isConfiguredLiveArtifactsSystemInstruction,
    liveArtifactsPromptOverrideActive,
    persistedLiveArtifactsPromptActive,
    setAppSettings,
    setCurrentChatSettings,
  ]);

  const handleLoadLiveArtifactsPromptAndSave = useCallback(async () => {
    const targetSessionId = activeSessionId ?? null;

    if (
      (activatingSessionIdRef.current !== undefined && activatingSessionIdRef.current === targetSessionId) ||
      liveArtifactsPromptBusy
    ) {
      return;
    }

    const isCurrentlyLiveArtifactsPrompt = liveArtifactsPromptOverrideActive ?? persistedLiveArtifactsPromptActive;

    // Capture the pre-enable prompt so toggling off can restore it instead of
    // permanently wiping a user's custom system prompt.
    if (!isCurrentlyLiveArtifactsPrompt) {
      if (appSettings.systemInstruction && !isConfiguredLiveArtifactsSystemInstruction(appSettings.systemInstruction)) {
        previousAppSystemInstructionRef.current = appSettings.systemInstruction;
      }
      if (
        targetSessionId &&
        currentChatSettings.systemInstruction &&
        !isConfiguredLiveArtifactsSystemInstruction(currentChatSettings.systemInstruction)
      ) {
        previousSessionSystemInstructionsRef.current.set(targetSessionId, currentChatSettings.systemInstruction);
      }
      closeMediaNavPanel();
    }

    if (isCurrentlyLiveArtifactsPrompt) {
      handleDeactivateLiveArtifactsPrompt();
      focusChatInput();
      return;
    }

    activatingSessionIdRef.current = targetSessionId;
    setLiveArtifactsPromptBusySessionId(targetSessionId);
    setLiveArtifactsPromptOverrideState({
      active: true,
      targetSessionId,
    });

    try {
      await activateLiveArtifactsPrompt(targetSessionId);
    } catch (error) {
      if (isMountedRef.current) {
        setLiveArtifactsPromptOverrideState(null);
      }
      logService.error('Failed to activate Live Artifacts prompt:', error);
    } finally {
      if (activatingSessionIdRef.current === targetSessionId) {
        activatingSessionIdRef.current = undefined;
      }
      if (isMountedRef.current) {
        setLiveArtifactsPromptBusySessionId(undefined);
      }
    }

    focusChatInput();
  }, [
    activateLiveArtifactsPrompt,
    activeSessionId,
    appSettings.systemInstruction,
    currentChatSettings,
    handleDeactivateLiveArtifactsPrompt,
    isConfiguredLiveArtifactsSystemInstruction,
    liveArtifactsPromptBusy,
    liveArtifactsPromptOverrideActive,
    persistedLiveArtifactsPromptActive,
  ]);

  const setCodePromptModeSettings = useCallback(
    (isCodeExecutionEnabled: boolean, visionPromptMode: VisionPromptMode = null) => {
      setAppSettings((prev) => ({
        ...prev,
        visionPromptMode,
        isCodeExecutionEnabled,
      }));
      setCurrentChatSettings((prev) => {
        if (prev.visionPromptMode === visionPromptMode && prev.isCodeExecutionEnabled === isCodeExecutionEnabled) {
          return prev;
        }
        return {
          ...prev,
          visionPromptMode,
          isCodeExecutionEnabled,
        };
      });
    },
    [setAppSettings, setCurrentChatSettings],
  );

  const toggleCodePromptMode = useCallback(
    async (isCurrentlyActive: boolean, mode: VisionPromptMode) => {
      if (isCurrentlyActive) {
        setCodePromptModeSettings(false, null);
        return;
      }

      setCodePromptModeSettings(true, mode);
    },
    [setCodePromptModeSettings],
  );

  const handleToggleBBoxMode = useCallback(async () => {
    const isCurrentlyActive =
      currentChatSettings.visionPromptMode === 'bbox' || isBboxSystemInstruction(currentChatSettings.systemInstruction);
    await toggleCodePromptMode(isCurrentlyActive, 'bbox');
  }, [currentChatSettings.systemInstruction, currentChatSettings.visionPromptMode, toggleCodePromptMode]);

  const handleToggleGuideMode = useCallback(async () => {
    const isCurrentlyActive =
      currentChatSettings.visionPromptMode === 'hdGuide' ||
      isHdGuideSystemInstruction(currentChatSettings.systemInstruction);
    await toggleCodePromptMode(isCurrentlyActive, 'hdGuide');
  }, [currentChatSettings.systemInstruction, currentChatSettings.visionPromptMode, toggleCodePromptMode]);

  const handleSuggestionClick = useCallback(
    async (type: 'homepage' | 'organize' | 'follow-up' | 'follow-up-fill', text: string) => {
      if (type === 'organize') {
        const targetSessionId = activeSessionId ?? null;

        if (
          !isLiveArtifactsPromptActive &&
          ((activatingSessionIdRef.current !== undefined && activatingSessionIdRef.current === targetSessionId) ||
            liveArtifactsPromptBusy)
        ) {
          return;
        }

        if (!isLiveArtifactsPromptActive) {
          if (
            appSettings.systemInstruction &&
            !isConfiguredLiveArtifactsSystemInstruction(appSettings.systemInstruction)
          ) {
            previousAppSystemInstructionRef.current = appSettings.systemInstruction;
          }
          if (
            targetSessionId &&
            currentChatSettings.systemInstruction &&
            !isConfiguredLiveArtifactsSystemInstruction(currentChatSettings.systemInstruction)
          ) {
            previousSessionSystemInstructionsRef.current.set(targetSessionId, currentChatSettings.systemInstruction);
          }

          closeMediaNavPanel();

          activatingSessionIdRef.current = targetSessionId;
          setLiveArtifactsPromptBusySessionId(targetSessionId);
          setLiveArtifactsPromptOverrideState({
            active: true,
            targetSessionId,
          });

          try {
            await activateLiveArtifactsPrompt(targetSessionId);
          } catch (error) {
            if (isMountedRef.current) {
              setLiveArtifactsPromptOverrideState(null);
            }
            logService.error('Failed to activate Live Artifacts prompt from suggestion:', error);
          } finally {
            if (activatingSessionIdRef.current === targetSessionId) {
              activatingSessionIdRef.current = undefined;
            }
            if (isMountedRef.current) {
              setLiveArtifactsPromptBusySessionId(undefined);
            }
          }
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
      activateLiveArtifactsPrompt,
      activeSessionId,
      appSettings.systemInstruction,
      currentChatSettings.systemInstruction,
      handleSendMessage,
      isConfiguredLiveArtifactsSystemInstruction,
      isLiveArtifactsPromptActive,
      liveArtifactsPromptBusy,
      setCommandedInput,
      setLiveArtifactsPromptBusySessionId,
      setLiveArtifactsPromptOverrideState,
    ],
  );

  const isAnyNavSettingActive = Boolean(
    currentChatSettings.isPdfNavEnabled ||
    currentChatSettings.isVideoNavEnabled ||
    currentChatSettings.isAudioNavEnabled ||
    currentChatSettings.isImageNavEnabled,
  );

  useEffect(() => {
    if (!isAnyNavSettingActive) {
      return;
    }

    // Do not auto-deactivate while an activation is in-flight, or while an active override is pending reconciliation
    if (
      liveArtifactsPromptBusy ||
      activatingSessionIdRef.current !== undefined ||
      liveArtifactsPromptOverrideState?.active === true
    ) {
      return;
    }

    const isCurrentSessionLiveArtifacts = Boolean(
      currentChatSettings.isLiveArtifactsEnabled === true ||
      (currentChatSettings.isLiveArtifactsEnabled !== false &&
        isConfiguredLiveArtifactsSystemInstruction(currentChatSettings.systemInstruction)),
    );
    const isHomepageLiveArtifacts =
      activeSessionId === null &&
      Boolean(
        appSettings.isLiveArtifactsEnabled === true ||
        (appSettings.isLiveArtifactsEnabled !== false &&
          isConfiguredLiveArtifactsSystemInstruction(appSettings.systemInstruction)),
      );

    if (isCurrentSessionLiveArtifacts || isHomepageLiveArtifacts) {
      handleDeactivateLiveArtifactsPrompt();
    }
  }, [
    activeSessionId,
    appSettings.isLiveArtifactsEnabled,
    appSettings.systemInstruction,
    currentChatSettings.isLiveArtifactsEnabled,
    currentChatSettings.systemInstruction,
    handleDeactivateLiveArtifactsPrompt,
    isAnyNavSettingActive,
    isConfiguredLiveArtifactsSystemInstruction,
    liveArtifactsPromptBusy,
    liveArtifactsPromptOverrideState?.active,
  ]);

  return {
    handleLoadLiveArtifactsPromptAndSave,
    handleDeactivateLiveArtifactsPrompt,
    handleToggleBBoxMode,
    handleToggleGuideMode,
    handleSuggestionClick,
    isLiveArtifactsPromptActive,
    isLiveArtifactsPromptBusy: liveArtifactsPromptBusy,
  };
};
