import { useEffect, useRef, type Dispatch, type MutableRefObject, type RefObject, type SetStateAction } from 'react';
import type { AppSettings, InputCommand } from '@/types';
import { isShortcutPressed } from '@/utils/keyboardShortcuts';
import { isEditableElement } from '@/utils/chat-input/focus';

interface UseChatInputGlobalEffectsParams {
  appSettings: AppSettings;
  commandedInput: InputCommand | null;
  isAnyModalOpen: boolean;
  isProcessingFile: boolean;
  isAddingById: boolean;
  selectedFileCount: number;
  targetDocument: Document;
  textareaRef: RefObject<HTMLTextAreaElement>;
  prevIsProcessingFileRef: MutableRefObject<boolean>;
  justInitiatedFileOpRef: MutableRefObject<boolean>;
  setInputText: Dispatch<SetStateAction<string>>;
  setQuotes: Dispatch<SetStateAction<string[]>>;
  insertText: (text: string) => void;
  handlePasteAction: (
    clipboardData: DataTransfer | null,
    options?: { forceTextInsertion?: boolean },
  ) => Promise<boolean>;
}

export const useChatInputGlobalEffects = ({
  appSettings,
  commandedInput,
  isAnyModalOpen,
  isProcessingFile,
  isAddingById,
  selectedFileCount,
  targetDocument,
  textareaRef,
  prevIsProcessingFileRef,
  justInitiatedFileOpRef,
  setInputText,
  setQuotes,
  insertText,
  handlePasteAction,
}: UseChatInputGlobalEffectsParams) => {
  const appliedCommandKeyRef = useRef<string | null>(null);

  useEffect(() => {
    if (!commandedInput) {
      return;
    }

    const commandKey = `${commandedInput.id}:${commandedInput.mode ?? 'replace'}:${commandedInput.text}`;
    if (appliedCommandKeyRef.current === commandKey) {
      return;
    }

    appliedCommandKeyRef.current = commandKey;

    if (commandedInput.mode === 'quote') {
      setQuotes((prev) => [...prev, commandedInput.text]);
    } else if (commandedInput.mode === 'append') {
      setInputText((prev) => prev + (prev ? '\n' : '') + commandedInput.text);
    } else if (commandedInput.mode === 'insert') {
      insertText(commandedInput.text);
    } else {
      setInputText(commandedInput.text);
    }

    if (commandedInput.mode === 'insert') {
      return;
    }

    // Wait for the controlled textarea value to commit before placing the caret.
    // setTimeout(0) alone can race React's state update and leave the caret at index 0.
    let cancelled = false;
    let retryTimeoutId: number | null = null;

    const placeCaretAtEnd = (): boolean => {
      const textarea = textareaRef.current;
      if (!textarea || cancelled) {
        return false;
      }

      // For replace commands, ensure the new value is present before locking the caret.
      if (
        (commandedInput.mode === undefined || commandedInput.mode === 'replace') &&
        textarea.value !== commandedInput.text
      ) {
        return false;
      }

      textarea.focus();
      const textLength = textarea.value.length;
      textarea.setSelectionRange(textLength, textLength);
      textarea.scrollTop = textarea.scrollHeight;
      return true;
    };

    const schedulePlaceCaret = () => {
      if (cancelled) {
        return;
      }

      if (placeCaretAtEnd()) {
        return;
      }

      requestAnimationFrame(() => {
        if (cancelled) {
          return;
        }

        if (placeCaretAtEnd()) {
          return;
        }

        // Final fallback once React has almost certainly flushed the value update.
        retryTimeoutId = window.setTimeout(() => {
          if (cancelled) {
            return;
          }

          const textarea = textareaRef.current;
          if (!textarea) {
            return;
          }

          textarea.focus();
          const textLength = textarea.value.length;
          textarea.setSelectionRange(textLength, textLength);
          textarea.scrollTop = textarea.scrollHeight;
        }, 0);
      });
    };

    const frameId = requestAnimationFrame(schedulePlaceCaret);

    return () => {
      cancelled = true;
      cancelAnimationFrame(frameId);
      if (retryTimeoutId !== null) {
        window.clearTimeout(retryTimeoutId);
      }
    };
  }, [commandedInput, insertText, setInputText, setQuotes, textareaRef]);

  useEffect(() => {
    if (prevIsProcessingFileRef.current && !isProcessingFile && !isAddingById) {
      textareaRef.current?.focus();
      justInitiatedFileOpRef.current = false;
    }
    prevIsProcessingFileRef.current = isProcessingFile;
  }, [isAddingById, isProcessingFile, justInitiatedFileOpRef, prevIsProcessingFileRef, textareaRef]);

  useEffect(() => {
    const handleGlobalPaste = async (event: ClipboardEvent) => {
      if (isAnyModalOpen) {
        return;
      }

      const target = event.target as HTMLElement;
      const isInput = isEditableElement(target);

      if (isInput) {
        return;
      }

      const didHandle = await handlePasteAction(event.clipboardData, { forceTextInsertion: true });

      if (!didHandle) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();

      const textarea = textareaRef.current;
      if (!textarea) {
        return;
      }

      textarea.focus();
      setTimeout(() => {
        const textLength = textarea.value.length;
        textarea.setSelectionRange(textLength, textLength);
        textarea.scrollTop = textarea.scrollHeight;
      }, 0);
    };

    targetDocument.addEventListener('paste', handleGlobalPaste);
    return () => targetDocument.removeEventListener('paste', handleGlobalPaste);
  }, [handlePasteAction, isAnyModalOpen, targetDocument, textareaRef]);

  useEffect(() => {
    const handleGlobalKeyDown = (event: KeyboardEvent) => {
      if (isAnyModalOpen) {
        return;
      }

      if (event.isComposing || event.key === 'Process' || event.keyCode === 229) {
        return;
      }

      const target = event.target as HTMLElement;
      const isInput = isEditableElement(target);

      if (isShortcutPressed(event, 'input.clearDraft', appSettings)) {
        if (isInput && target !== textareaRef.current) {
          return;
        }
        event.preventDefault();
        setInputText('');
        textareaRef.current?.focus();
        return;
      }

      if (isInput || event.ctrlKey || event.metaKey || event.altKey) {
        return;
      }

      if (event.key.length !== 1) {
        return;
      }

      const textarea = textareaRef.current;
      if (!textarea) {
        return;
      }

      event.preventDefault();
      textarea.focus();
      setInputText((prev) => prev + event.key);
      setTimeout(() => {
        const textLength = textarea.value.length;
        textarea.setSelectionRange(textLength, textLength);
        textarea.scrollTop = textarea.scrollHeight;
      }, 0);
    };

    targetDocument.addEventListener('keydown', handleGlobalKeyDown);
    return () => targetDocument.removeEventListener('keydown', handleGlobalKeyDown);
  }, [appSettings, isAnyModalOpen, setInputText, targetDocument, textareaRef]);

  const prevFileCountRef = useRef(selectedFileCount);
  useEffect(() => {
    if (selectedFileCount > prevFileCountRef.current) {
      setTimeout(() => {
        textareaRef.current?.focus();
      }, 50);
    }

    prevFileCountRef.current = selectedFileCount;
  }, [selectedFileCount, textareaRef]);
};
