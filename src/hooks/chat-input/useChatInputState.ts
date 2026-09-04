import { useState, useRef, useCallback, useEffect, useReducer, type SetStateAction } from 'react';
import { useChatDraftStore, type ChatDraft } from '@/stores/chatDraftStore';
import { resolveUpdaterOrValue } from '@/stores/stateUpdaters';
import { useIsMobile } from '@/hooks/useDevice';
import {
  chatInputStateReducer,
  createSetChatInputFlagAction,
  createToggleChatInputFullscreenAction,
  initialChatInputMachineState,
  type ChatInputBooleanUpdate,
  type ChatInputMachineFlag,
} from '@/utils/chat-input/chatInputStateMachine';

const EMPTY_EDITING_DRAFT: ChatDraft = {
  inputText: '',
  quotes: [],
  ttsContext: '',
};
const EMPTY_QUOTES: string[] = [];
const FULLSCREEN_TEXTAREA_FOCUS_DELAY_MS = 50;

export const useChatInputState = (activeSessionId: string | null, isEditing: boolean) => {
  const persistedInputText = useChatDraftStore((state) =>
    activeSessionId && !isEditing ? (state.drafts[activeSessionId]?.inputText ?? '') : '',
  );
  const persistedQuotes = useChatDraftStore((state) =>
    activeSessionId && !isEditing ? (state.drafts[activeSessionId]?.quotes ?? EMPTY_QUOTES) : EMPTY_QUOTES,
  );
  const persistedTtsContext = useChatDraftStore((state) =>
    activeSessionId && !isEditing ? (state.drafts[activeSessionId]?.ttsContext ?? '') : '',
  );
  const hydrateLegacySessionDraft = useChatDraftStore((state) => state.hydrateLegacySessionDraft);
  const setDraftText = useChatDraftStore((state) => state.setDraftText);
  const setDraftQuotes = useChatDraftStore((state) => state.setDraftQuotes);
  const setDraftTtsContext = useChatDraftStore((state) => state.setDraftTtsContext);
  const clearPersistedCurrentDraft = useChatDraftStore((state) => state.clearCurrentDraft);
  const [editingDraft, setEditingDraft] = useState<ChatDraft>(EMPTY_EDITING_DRAFT);
  const [fileIdInput, setFileIdInput] = useState('');
  const [urlInput, setUrlInput] = useState('');
  const [machineState, dispatchMachineState] = useReducer(chatInputStateReducer, initialChatInputMachineState);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const justInitiatedFileOpRef = useRef(false);
  const prevIsProcessingFileRef = useRef(false);
  const isComposingRef = useRef(false);
  const compositionEndedAtRef = useRef(0);

  const isMobile = useIsMobile();

  const setMachineFlag = useCallback((flag: ChatInputMachineFlag, value: ChatInputBooleanUpdate) => {
    dispatchMachineState(createSetChatInputFlagAction(flag, value));
  }, []);

  const setTranslating = useCallback(
    (value: ChatInputBooleanUpdate) => setMachineFlag('isTranslating', value),
    [setMachineFlag],
  );
  const startSendAnimation = useCallback(() => setMachineFlag('isAnimatingSend', true), [setMachineFlag]);
  const stopSendAnimation = useCallback(() => setMachineFlag('isAnimatingSend', false), [setMachineFlag]);
  const setAddingById = useCallback(
    (value: ChatInputBooleanUpdate) => setMachineFlag('isAddingById', value),
    [setMachineFlag],
  );
  const setAddingByUrl = useCallback(
    (value: ChatInputBooleanUpdate) => setMachineFlag('isAddingByUrl', value),
    [setMachineFlag],
  );
  const setWaitingForUpload = useCallback(
    (value: ChatInputBooleanUpdate) => setMachineFlag('isWaitingForUpload', value),
    [setMachineFlag],
  );
  const exitFullscreen = useCallback(() => setMachineFlag('isFullscreen', false), [setMachineFlag]);

  useEffect(() => {
    if (activeSessionId && !isEditing) {
      hydrateLegacySessionDraft(activeSessionId);
    }
  }, [activeSessionId, hydrateLegacySessionDraft, isEditing]);

  const inputText = isEditing ? editingDraft.inputText : persistedInputText;
  const quotes = isEditing ? editingDraft.quotes : persistedQuotes;
  const ttsContext = isEditing ? editingDraft.ttsContext : persistedTtsContext;

  const setInputText = useCallback(
    (value: SetStateAction<string>) => {
      if (!activeSessionId || isEditing) {
        setEditingDraft((draft) => ({
          ...draft,
          inputText: resolveUpdaterOrValue(value, draft.inputText),
        }));
        return;
      }

      setDraftText(activeSessionId, value);
    },
    [activeSessionId, isEditing, setDraftText],
  );

  const setQuotes = useCallback(
    (value: SetStateAction<string[]>) => {
      if (!activeSessionId || isEditing) {
        setEditingDraft((draft) => ({
          ...draft,
          quotes: resolveUpdaterOrValue(value, draft.quotes),
        }));
        return;
      }

      setDraftQuotes(activeSessionId, value);
    },
    [activeSessionId, isEditing, setDraftQuotes],
  );

  const setTtsContext = useCallback(
    (value: SetStateAction<string>) => {
      if (!activeSessionId || isEditing) {
        setEditingDraft((draft) => ({
          ...draft,
          ttsContext: resolveUpdaterOrValue(value, draft.ttsContext),
        }));
        return;
      }

      setDraftTtsContext(activeSessionId, value);
    },
    [activeSessionId, isEditing, setDraftTtsContext],
  );

  const clearCurrentDraft = useCallback(() => {
    if (activeSessionId) {
      clearPersistedCurrentDraft(activeSessionId);
    }
  }, [activeSessionId, clearPersistedCurrentDraft]);

  const handleToggleFullscreen = useCallback(() => {
    if (!machineState.isFullscreen) {
      setTimeout(() => textareaRef.current?.focus(), FULLSCREEN_TEXTAREA_FOCUS_DELAY_MS);
    }

    dispatchMachineState(createToggleChatInputFullscreenAction());
  }, [machineState.isFullscreen]);

  const handleCompositionStart = useCallback(() => {
    isComposingRef.current = true;
  }, []);

  const handleCompositionEnd = useCallback(() => {
    isComposingRef.current = false;
    compositionEndedAtRef.current = Date.now();
  }, []);

  return {
    inputText,
    setInputText,
    quotes,
    setQuotes,
    ttsContext,
    setTtsContext,
    machineState,
    isTranslating: machineState.isTranslating,
    setTranslating,
    isAnimatingSend: machineState.isAnimatingSend,
    startSendAnimation,
    stopSendAnimation,
    fileIdInput,
    setFileIdInput,
    isAddingById: machineState.isAddingById,
    setAddingById,
    urlInput,
    setUrlInput,
    isAddingByUrl: machineState.isAddingByUrl,
    setAddingByUrl,
    isWaitingForUpload: machineState.isWaitingForUpload,
    setWaitingForUpload,
    isFullscreen: machineState.isFullscreen,
    exitFullscreen,
    textareaRef,
    justInitiatedFileOpRef,
    prevIsProcessingFileRef,
    isComposingRef,
    compositionEndedAtRef,
    handleCompositionStart,
    handleCompositionEnd,
    clearCurrentDraft,
    handleToggleFullscreen,
    isMobile,
  };
};
