import React, { useRef, useLayoutEffect, type CSSProperties, type RefObject } from 'react';
import { useI18n } from '@/contexts/I18nContext';
import { INITIAL_TEXTAREA_HEIGHT_PX, MAX_TEXTAREA_HEIGHT_PX } from '@/components/chat/input/chatInputTextAreaMetrics';

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
  initialTextareaHeight = INITIAL_TEXTAREA_HEIGHT_PX,
  isConverting,
  editorContentStyle,
  compactEditorContentStyle,
  editorElementStyle: _editorElementStyle,
  isCompact,
}) => {
  const isExpandedMode = hasCustomHeight ?? isFullscreen;
  const contentStyle = (editorContentStyle ?? (isCompact ? compactEditorContentStyle : undefined)) as
    ComposerCustomCssProps | undefined;
  const { t } = useI18n();
  const shadowRef = useRef<HTMLTextAreaElement>(null);
  const isComposingRef = useRef(false);

  const handleShellClick = () => {
    if (disabled || isConverting) {
      return;
    }

    textareaRef.current?.focus();
  };

  useLayoutEffect(() => {
    const target = textareaRef.current;
    const shadow = shadowRef.current;
    if (!target || !shadow) return;

    if (!isComposingRef.current && target.value !== value) {
      const selectionStart = target.selectionStart;
      const selectionEnd = target.selectionEnd;
      target.value = value;
      const nextStart = Math.min(selectionStart, value.length);
      const nextEnd = Math.min(selectionEnd, value.length);
      target.setSelectionRange(nextStart, nextEnd);
    }

    shadow.style.height = '0px';
    shadow.value = target.value;

    // Cherry parity: when CSS vars are provided, fixed modes use 100% + var(--max-height), auto mode measures via shadow
    if (contentStyle) {
      const cssOverflow = contentStyle['--composer-editor-overflow-y'];
      const cssHeight = contentStyle['--composer-editor-height'] ?? (contentStyle.height as string | undefined);
      const isFixedHeight = cssHeight === '100%';
      if (isExpandedMode || isCompact || isFixedHeight) {
        target.style.height = '100%';
        target.style.overflowY = cssOverflow ?? (isCompact ? 'hidden' : 'auto');
        target.style.maxHeight = 'var(--composer-editor-max-height)';
        return;
      }
      const scrollHeight = shadow.scrollHeight;
      const cssMinHeight = contentStyle['--composer-editor-min-height'];
      const baseHeight = cssMinHeight ? parseInt(cssMinHeight, 10) : isMobile ? 26 : initialTextareaHeight + 2;
      const maxHeight = isMobile ? 120 : Math.max(220, Math.round(window.innerHeight * 0.4));
      const newHeight = Math.max(baseHeight, Math.min(scrollHeight, maxHeight));
      target.style.height = `${newHeight}px`;
      target.style.overflowY = scrollHeight > maxHeight ? 'auto' : 'hidden';
      target.style.maxHeight = 'var(--composer-editor-max-height)';
      return;
    }

    if (isExpandedMode) {
      target.style.height = '100%';
      target.style.overflowY = 'auto';
      return;
    }
    const scrollHeight = shadow.scrollHeight;
    const baseHeight = isMobile ? 26 : initialTextareaHeight + 2;
    const maxHeight = isMobile ? 120 : Math.max(MAX_TEXTAREA_HEIGHT_PX, Math.round(window.innerHeight * 0.4));
    const newHeight = Math.max(baseHeight, Math.min(scrollHeight, maxHeight));
    target.style.height = `${newHeight}px`;
    target.style.overflowY = scrollHeight > maxHeight ? 'auto' : 'hidden';
  }, [
    value,
    isExpandedMode,
    isFullscreen,
    isMobile,
    initialTextareaHeight,
    textareaRef,
    contentStyle,
    isCompact,
    hasCustomHeight,
  ]);

  const handleCompositionStart = () => {
    isComposingRef.current = true;
    onCompositionStart();
  };

  const handleCompositionEnd = (event: React.CompositionEvent<HTMLTextAreaElement>) => {
    isComposingRef.current = false;
    onCompositionEnd(event.currentTarget.value);
  };

  return (
    <div
      className={`relative w-full flex flex-col min-h-0 cursor-text ${isExpandedMode ? 'h-full' : 'flex-grow'} ${isCompact ? 'compact' : ''}`}
      onClick={handleShellClick}
      style={contentStyle as React.CSSProperties}
    >
      {/* Shadow Textarea for Height Calculation */}
      <textarea
        ref={shadowRef}
        className="absolute top-0 left-0 w-full -z-50 opacity-0 pointer-events-none resize-none px-1 pr-9 pt-0.5 pb-0 text-base custom-scrollbar"
        style={{
          height: '0',
          overflow: 'hidden',
          fontFamily: 'inherit',
          lineHeight: 'inherit',
          padding: '2px 2.25rem 0 0.25rem', // Matches px-1 pr-9 pt-0.5 pb-0 (right 36px to avoid expand corner)
        }}
        aria-hidden="true"
        tabIndex={-1}
        readOnly
      />

      <textarea
        ref={textareaRef}
        defaultValue={value}
        onChange={onChange}
        onKeyDown={onKeyDown}
        onPaste={onPaste}
        onCompositionStart={handleCompositionStart}
        onCompositionEnd={handleCompositionEnd}
        placeholder={placeholder}
        className="w-full bg-transparent border-0 resize-none px-1 pr-9 pt-0.5 pb-0 text-base placeholder:text-[var(--theme-text-tertiary)] focus:ring-0 focus:outline-none custom-scrollbar flex-grow min-h-[26px]"
        style={{
          height: isExpandedMode ? '100%' : `${isMobile ? 26 : initialTextareaHeight + 2}px`,
          overflowY: isExpandedMode ? 'auto' : 'hidden',
        }}
        aria-label={t('chatInputTextareaAria')}
        data-chat-input-textarea="true"
        onFocus={onFocus}
        disabled={disabled || isConverting}
        rows={1}
      />
    </div>
  );
};

export const ChatTextArea = React.memo(ChatTextAreaComponent);
