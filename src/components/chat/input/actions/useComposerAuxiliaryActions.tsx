import React, { useMemo } from 'react';
import { ClipboardPaste, Eraser, Languages, Loader2 } from 'lucide-react';
import { useI18n } from '@/contexts/I18nContext';
import {
  useChatInputActionsContext,
  useChatInputComposerStatusContext,
} from '@/components/chat/input/ChatInputContext';

export type ComposerAuxiliaryActionId = 'translate' | 'clear' | 'paste';

export interface ComposerAuxiliaryAction {
  id: ComposerAuxiliaryActionId;
  label: string;
  ariaLabel: string;
  title: string;
  icon: React.ReactNode;
  disabled: boolean;
  action: () => void;
  testId?: string;
}

const actionText = (label: string, ariaLabel = label) => ({
  label,
  ariaLabel,
  title: label,
});

export const useComposerAuxiliaryActions = (): ComposerAuxiliaryAction[] => {
  const {
    isTranslating,
    disabled,
    isWaitingForUpload,
    isTranscribing,
    isMicInitializing,
    isNativeAudioModel,
    isEditing,
    showInputTranslationButton,
    showInputPasteButton,
    showInputClearButton,
  } = useChatInputActionsContext();
  const { hasTrimmedInput, onTranslate, onPasteFromClipboard, onClearInput } = useChatInputComposerStatusContext();
  const { t } = useI18n();
  const canTranslate = hasTrimmedInput && !isEditing && !isTranscribing && !isMicInitializing;
  const localInputEditBlocked = disabled || isWaitingForUpload;

  return useMemo(() => {
    const translateLabel = isTranslating ? t('translatingButtonTitle') : t('translateButtonTitle');

    const actions: Array<ComposerAuxiliaryAction | null> = [
      !isNativeAudioModel && showInputTranslationButton
        ? {
            id: 'translate',
            ...actionText(translateLabel),
            icon: isTranslating ? (
              <Loader2 size={20} className="animate-spin text-[var(--theme-text-link)]" strokeWidth={2} />
            ) : (
              <Languages size={20} strokeWidth={2} />
            ),
            disabled: !canTranslate || isTranslating,
            action: onTranslate,
            testId: 'translate-button',
          }
        : null,
      showInputClearButton
        ? {
            id: 'clear',
            ...actionText(t('clearInputTitle'), t('clearInputAria')),
            icon: <Eraser size={18} strokeWidth={2} />,
            disabled: localInputEditBlocked,
            action: onClearInput,
            testId: 'clear-input-button',
          }
        : null,
      showInputPasteButton
        ? {
            id: 'paste',
            ...actionText(t('pasteClipboardTitle'), t('pasteClipboardAria')),
            icon: <ClipboardPaste size={18} strokeWidth={2} />,
            disabled: localInputEditBlocked,
            action: onPasteFromClipboard,
            testId: 'paste-button',
          }
        : null,
    ];

    return actions.filter((item): item is ComposerAuxiliaryAction => item !== null);
  }, [
    canTranslate,
    isNativeAudioModel,
    isTranslating,
    localInputEditBlocked,
    onClearInput,
    onPasteFromClipboard,
    onTranslate,
    showInputClearButton,
    showInputPasteButton,
    showInputTranslationButton,
    t,
  ]);
};
