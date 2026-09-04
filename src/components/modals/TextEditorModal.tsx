import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useI18n } from '@/contexts/I18nContext';
import { X, Check, Copy, CheckCheck, Eye, Edit3, RotateCcw, Eraser } from 'lucide-react';
import { TextEditorModalShell } from './TextEditorModalShell';
import { FOCUS_VISIBLE_RING_SECONDARY_OFFSET_CLASS } from '@/constants/focusClasses';
import { countLines, estimateTokens } from '@/utils/import-context/textStats';
import { LazyMarkdownRenderer } from '@/components/message/LazyMarkdownRenderer';

interface TextEditorModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  readOnly?: boolean;
  confirmLabel?: string;
}

type TextEditorModalContentProps = Omit<TextEditorModalProps, 'isOpen'>;

const TEXT_EDITOR_AUTO_FOCUS_DELAY_MS = 100;
const COPY_FEEDBACK_MS = 1500;

const TextEditorModalContent: React.FC<TextEditorModalContentProps> = ({
  onClose,
  title,
  value,
  onChange,
  placeholder,
  readOnly,
  confirmLabel,
}) => {
  const { t } = useI18n();
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const [draftValue, setDraftValue] = useState(value);
  const [viewMode, setViewMode] = useState<'edit' | 'preview'>('edit');
  const [isCopied, setIsCopied] = useState(false);
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (viewMode === 'edit') {
      const focusTimeout = setTimeout(() => textareaRef.current?.focus(), TEXT_EDITOR_AUTO_FOCUS_DELAY_MS);
      return () => clearTimeout(focusTimeout);
    }
  }, [viewMode]);

  useEffect(() => {
    return () => {
      if (copyTimerRef.current) {
        clearTimeout(copyTimerRef.current);
      }
    };
  }, []);

  const stats = useMemo(
    () => ({
      chars: draftValue.length,
      lines: countLines(draftValue),
      tokens: estimateTokens(draftValue),
    }),
    [draftValue],
  );

  const handleValueChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    if (readOnly) return;
    setDraftValue(e.target.value);
  };

  const handleDone = () => {
    if (!readOnly && draftValue !== value) {
      onChange(draftValue);
    }
    onClose();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      handleDone();
    }
  };

  const handleCopy = useCallback(async () => {
    if (!draftValue) return;
    try {
      await navigator.clipboard.writeText(draftValue);
      setIsCopied(true);
      if (copyTimerRef.current) {
        clearTimeout(copyTimerRef.current);
      }
      copyTimerRef.current = setTimeout(() => setIsCopied(false), COPY_FEEDBACK_MS);
    } catch {
      // ignore clipboard error
    }
  }, [draftValue]);

  const handleReset = () => {
    setDraftValue(value);
  };

  const handleClear = () => {
    setDraftValue('');
  };

  return (
    <TextEditorModalShell
      onClose={handleDone}
      contentClassName="w-full h-full sm:h-[88vh] sm:w-[90vw] max-w-5xl bg-[var(--theme-bg-primary)] sm:rounded-2xl shadow-2xl flex flex-col overflow-hidden border border-[var(--theme-border-primary)]/80"
      header={
        <div className="flex items-center justify-between px-4 sm:px-6 py-3 border-b border-[var(--theme-border-secondary)] bg-[var(--theme-bg-secondary)]/60 backdrop-blur-sm select-none gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <h2 className="text-base sm:text-lg font-semibold text-[var(--theme-text-primary)] truncate tracking-tight">
              {title}
            </h2>
            <span className="hidden sm:inline-flex items-center px-2 py-0.5 text-[11px] font-medium rounded-full bg-[var(--theme-bg-accent)]/10 text-[var(--theme-text-accent)] border border-[var(--theme-bg-accent)]/20">
              Markdown
            </span>
          </div>

          <div className="flex items-center gap-1 p-0.5 rounded-xl bg-[var(--theme-bg-tertiary)]/70 border border-[var(--theme-border-secondary)]/50">
            <button
              type="button"
              onClick={() => setViewMode('edit')}
              className={`flex items-center gap-1.5 px-3 py-1 text-xs font-medium rounded-lg transition-all ${
                viewMode === 'edit'
                  ? 'bg-[var(--theme-bg-primary)] text-[var(--theme-text-primary)] shadow-sm font-semibold'
                  : 'text-[var(--theme-text-secondary)] hover:text-[var(--theme-text-primary)]'
              } ${FOCUS_VISIBLE_RING_SECONDARY_OFFSET_CLASS}`}
            >
              <Edit3 size={13} />
              <span>{t('edit') || 'Edit'}</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode('preview')}
              className={`flex items-center gap-1.5 px-3 py-1 text-xs font-medium rounded-lg transition-all ${
                viewMode === 'preview'
                  ? 'bg-[var(--theme-bg-primary)] text-[var(--theme-text-primary)] shadow-sm font-semibold'
                  : 'text-[var(--theme-text-secondary)] hover:text-[var(--theme-text-primary)]'
              } ${FOCUS_VISIBLE_RING_SECONDARY_OFFSET_CLASS}`}
            >
              <Eye size={13} />
              <span>{t('preview') || 'Preview'}</span>
            </button>
          </div>

          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={handleCopy}
              disabled={!draftValue}
              title={isCopied ? t('copied') || 'Copied' : t('copy') || 'Copy'}
              aria-label={isCopied ? t('copied') || 'Copied' : t('copy') || 'Copy'}
              className={`p-1.5 text-[var(--theme-text-secondary)] hover:text-[var(--theme-text-primary)] hover:bg-[var(--theme-bg-tertiary)] rounded-lg transition-colors ${FOCUS_VISIBLE_RING_SECONDARY_OFFSET_CLASS} disabled:opacity-40 disabled:pointer-events-none`}
            >
              {isCopied ? <CheckCheck size={18} className="text-emerald-500" /> : <Copy size={18} />}
            </button>
            <button
              type="button"
              onClick={handleDone}
              title={t('close') || 'Close'}
              aria-label={t('close') || 'Close'}
              className={`p-1.5 text-[var(--theme-text-secondary)] hover:text-[var(--theme-text-primary)] hover:bg-[var(--theme-bg-tertiary)] rounded-lg transition-colors ${FOCUS_VISIBLE_RING_SECONDARY_OFFSET_CLASS}`}
            >
              <X size={18} />
            </button>
          </div>
        </div>
      }
      body={
        <div className="flex-grow flex flex-col min-h-0 bg-[var(--theme-bg-primary)] relative">
          {viewMode === 'edit' ? (
            <textarea
              ref={textareaRef}
              value={draftValue}
              onChange={handleValueChange}
              onKeyDown={handleKeyDown}
              readOnly={readOnly}
              className="w-full h-full p-4 sm:p-6 bg-transparent text-[var(--theme-text-primary)] placeholder-[var(--theme-text-tertiary)] outline-none resize-none custom-scrollbar font-mono text-xs sm:text-sm leading-relaxed border-0"
              placeholder={placeholder}
              spellCheck={false}
            />
          ) : (
            <div className="w-full h-full p-4 sm:p-8 overflow-y-auto custom-scrollbar">
              {draftValue.trim() ? (
                <div className="markdown-body max-w-4xl mx-auto leading-relaxed">
                  <LazyMarkdownRenderer
                    content={draftValue}
                    isLoading={false}
                    interactiveMode="disabled"
                    fallbackMode="raw"
                  />
                </div>
              ) : (
                <div className="flex h-full min-h-[240px] items-center justify-center text-sm text-[var(--theme-text-tertiary)] italic">
                  {placeholder || '暂无内容可供预览'}
                </div>
              )}
            </div>
          )}
        </div>
      }
      footer={
        <div className="px-4 sm:px-6 py-2.5 sm:py-3 border-t border-[var(--theme-border-secondary)] bg-[var(--theme-bg-secondary)]/40 backdrop-blur-sm flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 text-xs font-mono text-[var(--theme-text-tertiary)] select-none">
            <span title="字符数">
              <span className="text-[var(--theme-text-secondary)] font-semibold">{stats.chars.toLocaleString()}</span> 字符
            </span>
            <span className="w-1 h-1 rounded-full bg-[var(--theme-border-secondary)]" />
            <span title="行数">
              <span className="text-[var(--theme-text-secondary)] font-semibold">{stats.lines.toLocaleString()}</span> 行
            </span>
            <span className="w-1 h-1 rounded-full bg-[var(--theme-border-secondary)]" />
            <span title="估算 Token 消耗 (基于字符/分词启发式)">
              约 <span className="text-[var(--theme-text-secondary)] font-semibold">{stats.tokens.toLocaleString()}</span> Tokens
            </span>
          </div>

          <div className="flex items-center gap-2 ml-auto">
            {!readOnly && draftValue !== value && (
              <button
                type="button"
                onClick={handleReset}
                className={`px-3 py-1.5 text-xs font-medium text-[var(--theme-text-secondary)] hover:text-[var(--theme-text-primary)] hover:bg-[var(--theme-bg-tertiary)] rounded-lg transition-colors flex items-center gap-1.5 ${FOCUS_VISIBLE_RING_SECONDARY_OFFSET_CLASS}`}
                title="还原到初始内容"
              >
                <RotateCcw size={13} />
                <span className="hidden sm:inline">还原</span>
              </button>
            )}

            {!readOnly && draftValue.length > 0 && (
              <button
                type="button"
                onClick={handleClear}
                className={`px-3 py-1.5 text-xs font-medium text-[var(--theme-text-secondary)] hover:text-[var(--theme-text-danger)] hover:bg-[var(--theme-bg-tertiary)] rounded-lg transition-colors flex items-center gap-1.5 ${FOCUS_VISIBLE_RING_SECONDARY_OFFSET_CLASS}`}
                title="清空所有内容"
              >
                <Eraser size={13} />
                <span className="hidden sm:inline">清空</span>
              </button>
            )}

            <span className="hidden md:inline-block text-[11px] text-[var(--theme-text-tertiary)] select-none mr-1">
              按 <kbd className="px-1.5 py-0.5 text-[10px] rounded bg-[var(--theme-bg-tertiary)] border border-[var(--theme-border-secondary)] font-mono">Ctrl+Enter</kbd> 保存
            </span>

            <button
              type="button"
              onClick={onClose}
              className={`px-3.5 py-1.5 text-xs font-medium text-[var(--theme-text-secondary)] hover:text-[var(--theme-text-primary)] hover:bg-[var(--theme-bg-tertiary)] rounded-lg transition-colors ${FOCUS_VISIBLE_RING_SECONDARY_OFFSET_CLASS}`}
            >
              {t('cancel') || 'Cancel'}
            </button>

            <button
              type="button"
              onClick={handleDone}
              className={`px-4 sm:px-5 py-1.5 text-xs font-semibold bg-[var(--theme-bg-accent)] hover:bg-[var(--theme-bg-accent-hover)] text-[var(--theme-text-accent)] rounded-lg shadow-sm transition-all flex items-center gap-1.5 ${FOCUS_VISIBLE_RING_SECONDARY_OFFSET_CLASS}`}
            >
              <Check size={14} strokeWidth={2.5} />
              {confirmLabel || t('close') || 'Done'}
            </button>
          </div>
        </div>
      }
    />
  );
};

export const TextEditorModal: React.FC<TextEditorModalProps> = ({ isOpen, ...props }) => {
  if (!isOpen) {
    return null;
  }

  return (
    <TextEditorModalContent
      key={`${props.title}:${props.value}:${props.readOnly ? 'readonly' : 'editable'}`}
      {...props}
    />
  );
};
