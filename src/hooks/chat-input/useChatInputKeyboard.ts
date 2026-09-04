import { useCallback, type Dispatch, type MutableRefObject, type SetStateAction } from 'react';
import type { AppSettings } from '@/types';
import { isShortcutPressed } from '@/utils/keyboardShortcuts';
import type { SlashCommandState } from './useSlashCommands';

const IME_PROCESS_KEY_CODE = 229;

const isKeyboardEventComposing = (event: React.KeyboardEvent<HTMLTextAreaElement>) => event.nativeEvent.isComposing;

const isImeCompositionEvent = (event: React.KeyboardEvent<HTMLTextAreaElement>) =>
  isKeyboardEventComposing(event) ||
  event.key === 'Process' ||
  event.keyCode === IME_PROCESS_KEY_CODE ||
  event.which === IME_PROCESS_KEY_CODE ||
  event.nativeEvent.keyCode === IME_PROCESS_KEY_CODE ||
  event.nativeEvent.which === IME_PROCESS_KEY_CODE;

const IME_CONFIRMATION_GRACE_MS = 100;

interface ChatInputKeyboardState {
  inputText: string;
  isFullscreen: boolean;
  isMobile: boolean;
  isComposingRef: MutableRefObject<boolean>;
  compositionEndedAtRef: MutableRefObject<number>;
  setInputText: Dispatch<SetStateAction<string>>;
  handleToggleFullscreen: () => void;
}

interface UseChatInputKeyboardParams {
  appSettings: AppSettings;
  keyboardState: ChatInputKeyboardState;
  slashCommandState: {
    slashCommandState: SlashCommandState;
    setSlashCommandState: React.Dispatch<React.SetStateAction<SlashCommandState>>;
    handleInputChange: (value: string) => void;
    handleCommandSelect: (command: SlashCommandState['filteredCommands'][number]) => void;
    handleSlashCommandExecution: (rawInput: string) => boolean;
  };
  isLoading: boolean;
  isEditing: boolean;
  canSend: boolean;
  canQueueMessage: boolean;
  handleSubmit: () => void;
  queueCurrentSubmission: () => void;
  onStopGenerating: () => void;
  onCancelEdit: () => void;
  onEditLastUserMessage: () => void;
}

export const useChatInputKeyboard = ({
  appSettings,
  keyboardState,
  slashCommandState,
  isLoading,
  isEditing,
  canSend,
  canQueueMessage,
  handleSubmit,
  queueCurrentSubmission,
  onStopGenerating,
  onCancelEdit,
  onEditLastUserMessage,
}: UseChatInputKeyboardParams) => {
  const {
    inputText,
    isFullscreen,
    isMobile,
    isComposingRef,
    compositionEndedAtRef,
    setInputText,
    handleToggleFullscreen,
  } = keyboardState;

  const handleInputChange = useCallback(
    (event: React.ChangeEvent<HTMLTextAreaElement>) => {
      slashCommandState.handleInputChange(event.target.value);
    },
    [slashCommandState],
  );

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (isComposingRef.current || isImeCompositionEvent(event)) {
        return;
      }

      const isImeConfirmationKey = event.key === 'Enter' || event.key === 'Tab';
      if (isImeConfirmationKey && Date.now() - compositionEndedAtRef.current < IME_CONFIRMATION_GRACE_MS) {
        event.preventDefault();
        compositionEndedAtRef.current = 0;
        return;
      }

      if (slashCommandState.slashCommandState.isOpen) {
        // P0-4: Esc always closes panel first, regardless of isLoading/isEditing
        if (event.key === 'Escape') {
          event.preventDefault();
          event.stopPropagation();
          slashCommandState.setSlashCommandState((prev: SlashCommandState) => ({ ...prev, isOpen: false }));
          return;
        }

        const PAGE_SIZE = 8;
        const isAssistive = event.metaKey || event.ctrlKey;
        const filteredLength = slashCommandState.slashCommandState.filteredCommands.length;

        // Cherry collapsed: Enter/Tab while no results is swallowed, not sent
        if ((event.key === 'Enter' || event.key === 'Tab') && filteredLength === 0) {
          event.preventDefault();
          event.stopPropagation();
          return;
        }

        if (event.key === 'ArrowDown' || event.key === 'PageDown') {
          const offset = event.key === 'PageDown' ? PAGE_SIZE : isAssistive ? PAGE_SIZE : 1;
          const wrap = event.key !== 'PageDown';
          event.preventDefault();
          if (filteredLength === 0) return;
          slashCommandState.setSlashCommandState((prev: SlashCommandState) => {
            const len = prev.filteredCommands?.length || 0;
            if (len === 0) return prev;
            if (wrap) return { ...prev, selectedIndex: (prev.selectedIndex + offset) % len };
            return { ...prev, selectedIndex: Math.min(prev.selectedIndex + offset, len - 1) };
          });
          return;
        }

        if (event.key === 'ArrowUp' || event.key === 'PageUp') {
          const offset = event.key === 'PageUp' ? PAGE_SIZE : isAssistive ? PAGE_SIZE : 1;
          const wrap = event.key !== 'PageUp';
          event.preventDefault();
          if (filteredLength === 0) return;
          slashCommandState.setSlashCommandState((prev: SlashCommandState) => {
            const len = prev.filteredCommands?.length || 0;
            if (len === 0) return prev;
            if (wrap) return { ...prev, selectedIndex: (prev.selectedIndex - offset + len) % len };
            return { ...prev, selectedIndex: Math.max(prev.selectedIndex - offset, 0) };
          });
          return;
        }

        if (event.key === 'Enter' || event.key === 'Tab') {
          if (event.key === 'Tab' && (event.shiftKey || event.ctrlKey || event.metaKey || event.altKey)) {
            return;
          }
          event.preventDefault();
          const command =
            slashCommandState.slashCommandState.filteredCommands[slashCommandState.slashCommandState.selectedIndex];
          if (command) {
            slashCommandState.handleCommandSelect(command);
          }
          return;
        }
      }

      if (isShortcutPressed(event, 'global.stopCancel', appSettings)) {
        if (isLoading) {
          event.preventDefault();
          onStopGenerating();
          return;
        }

        if (isEditing) {
          event.preventDefault();
          onCancelEdit();
          return;
        }

        if (slashCommandState.slashCommandState.isOpen) {
          event.preventDefault();
          slashCommandState.setSlashCommandState((prev: SlashCommandState) => ({ ...prev, isOpen: false }));
          return;
        }

        if (isFullscreen) {
          event.preventDefault();
          handleToggleFullscreen();
          return;
        }
      }

      if (isShortcutPressed(event, 'input.editLast', appSettings) && !isLoading && inputText.length === 0) {
        event.preventDefault();
        onEditLastUserMessage();
        return;
      }

      const isSendPressed = isShortcutPressed(event, 'input.sendMessage', appSettings);
      const isNewLinePressed = isShortcutPressed(event, 'input.newLine', appSettings);

      if (isSendPressed) {
        if (isMobile && event.key === 'Enter' && !event.shiftKey && !event.ctrlKey && !event.altKey && !event.metaKey) {
          return;
        }

        if (inputText.startsWith('/')) {
          const handledSlashCommand = slashCommandState.handleSlashCommandExecution(inputText);
          if (handledSlashCommand) {
            event.preventDefault();
            return;
          }
        }

        if (canSend) {
          event.preventDefault();
          handleSubmit();
          return;
        }

        if (canQueueMessage) {
          event.preventDefault();
          queueCurrentSubmission();
        }
        return;
      }

      if (!isNewLinePressed) {
        return;
      }

      const isNativeEnterNewLine = event.key === 'Enter' && !event.ctrlKey && !event.altKey && !event.metaKey;

      // Let the textarea insert the newline so the native undo stack stays intact.
      if (isNativeEnterNewLine) {
        return;
      }

      event.preventDefault();
      const target = event.target as HTMLTextAreaElement;
      const start = target.selectionStart;
      const end = target.selectionEnd;
      const value = target.value;
      const newValue = `${value.substring(0, start)}\n${value.substring(end)}`;
      setInputText(newValue);

      requestAnimationFrame(() => {
        target.selectionStart = start + 1;
        target.selectionEnd = start + 1;
        target.scrollTop = target.scrollHeight;
      });
    },
    [
      appSettings,
      canQueueMessage,
      canSend,
      compositionEndedAtRef,
      handleSubmit,
      handleToggleFullscreen,
      inputText,
      isComposingRef,
      isEditing,
      isFullscreen,
      isLoading,
      isMobile,
      onCancelEdit,
      onEditLastUserMessage,
      onStopGenerating,
      queueCurrentSubmission,
      setInputText,
      slashCommandState,
    ],
  );

  return {
    handleInputChange,
    handleKeyDown,
  };
};
