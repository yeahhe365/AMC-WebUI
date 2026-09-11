import React, { useRef, useLayoutEffect, type CSSProperties, type RefObject } from 'react';
import TextareaAutosize from 'react-textarea-autosize';
import { useI18n } from '@/contexts/I18nContext';
import { INITIAL_TEXTAREA_HEIGHT_PX } from '@/components/chat/input/chatInputTextAreaMetrics';

type ComposerCustomCssProps = CSSProperties & {
  '--composer-editor-overflow-y'?: 'auto' | 'hidden';
  '--composer-editor-height'?: string;
  '--composer-editor-min-height'?: string;
  '--composer-editor-max-height'?: string;
};

interface ChatTextAreaProps {
  textareaRef: RefObject<HTMLTextAreaElement>;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  onPaste: (e: React.ClipboardEvent<HTMLTextAreaElement>) => void;
  onCompositionStart: () => void;
  onCompositionEnd: (value: string) => void;
  onFocus?: () => void;
  placeholder: string;
  disabled: boolean;
  isFullscreen: boolean;
  hasCustomHeight?: boolean;
  isMobile: boolean;
  initialTextareaHeight: number;
  isConverting: boolean;
  editorContentStyle?: React.CSSProperties;
  compactEditorContentStyle?: React.CSSProperties;
  editorElementStyle?: string;
  isCompact?: boolean;
}

const ChatTextAreaComponent: React.FC<ChatTextAreaProps> = ({
  textareaRef,
  value,
  onChange,
  onKeyDown,
  onPaste,
  onCompositionStart,
  onCompositionEnd,
  onFocus,
  placeholder,
  disabled,
  isFullscreen,
  hasCustomHeight,
  isMobile,
  initialTextareaHeight: _initialTextareaHeight = INITIAL_TEXTAREA_HEIGHT_PX,
  isConverting,
  editorContentStyle,
  compactEditorContentStyle,
  isCompact,
}) => {
  const isExpandedMode = hasCustomHeight ?? isFullscreen;
  const contentStyle = (editorContentStyle ?? (isCompact ? compactEditorContentStyle : undefined)) as
    ComposerCustomCssProps | undefined;
  const { t } = useI18n();
  const isComposingRef = useRef(false);

  const handleShellClick = () => {
    if (disabled || isConverting) {
      return;
    }
    textareaRef.current?.focus();
  };

  // Sync value from parent while protecting IME composition buffer and preserving caret position
  useLayoutEffect(() => {
    const target = textareaRef.current;
    if (!target) return;

    if (!isComposingRef.current && target.value !== value) {
      const selectionStart = target.selectionStart;
      const selectionEnd = target.selectionEnd;
      target.value = value;
      const nextStart = Math.min(selectionStart, value.length);
      const nextEnd = Math.min(selectionEnd, value.length);
      target.setSelectionRange(nextStart, nextEnd);
    }
  }, [value, textareaRef]);

  const handleCompositionStart = () => {
    isComposingRef.current = true;
    onCompositionStart();
  };

  const handleCompositionEnd = (event: React.CompositionEvent<HTMLTextAreaElement>) => {
    isComposingRef.current = false;
    onCompositionEnd(event.currentTarget.value);
  };

  const minRows = 1;
  const maxRows = isMobile ? 5 : 10;

  return (
    <div
      className={`relative w-full flex flex-col min-h-0 cursor-text ${isExpandedMode ? 'h-full' : 'flex-grow'} ${isCompact ? 'compact' : ''}`}
      onClick={handleShellClick}
      style={contentStyle as React.CSSProperties}
    >
      {isExpandedMode ? (
        <textarea
          ref={textareaRef}
          defaultValue={value}
          onChange={onChange}
          onKeyDown={onKeyDown}
          onPaste={onPaste}
          onCompositionStart={handleCompositionStart}
          onCompositionEnd={handleCompositionEnd}
          placeholder={placeholder}
          className="w-full h-full bg-transparent border-0 resize-none px-1 pr-9 pt-0.5 pb-0 text-base placeholder:text-[var(--theme-text-tertiary)] focus:ring-0 focus:outline-none custom-scrollbar overflow-y-auto leading-relaxed"
          aria-label={t('chatInputTextareaAria')}
          data-chat-input-textarea="true"
          onFocus={onFocus}
          disabled={disabled || isConverting}
        />
      ) : (
        <TextareaAutosize
          ref={textareaRef as React.Ref<HTMLTextAreaElement>}
          defaultValue={value}
          onChange={onChange}
          onKeyDown={onKeyDown}
          onPaste={onPaste}
          onCompositionStart={handleCompositionStart}
          onCompositionEnd={handleCompositionEnd}
          placeholder={placeholder}
          className="w-full bg-transparent border-0 resize-none px-1 pr-9 pt-0.5 pb-0 text-base placeholder:text-[var(--theme-text-tertiary)] focus:ring-0 focus:outline-none custom-scrollbar flex-grow leading-relaxed"
          minRows={minRows}
          maxRows={maxRows}
          aria-label={t('chatInputTextareaAria')}
          data-chat-input-textarea="true"
          onFocus={onFocus}
          disabled={disabled || isConverting}
        />
      )}
    </div>
  );
};

export const ChatTextArea = React.memo(ChatTextAreaComponent);
