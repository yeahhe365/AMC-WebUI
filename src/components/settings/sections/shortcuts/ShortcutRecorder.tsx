import React, { useState, useEffect, useRef, useCallback } from 'react';
import { X, RotateCcw } from 'lucide-react';
import { useI18n } from '@/contexts/I18nContext';
import { formatShortcut, recordKeyCombination } from '@/utils/keyboardShortcuts';

interface ShortcutRecorderProps {
  value: string;
  defaultValue: string;
  onChange: (newValue: string) => void;
}

export const ShortcutRecorder: React.FC<ShortcutRecorderProps> = ({ value, defaultValue, onChange }) => {
  const { t } = useI18n();
  const [isRecording, setIsRecording] = useState(false);
  const [tempKey, setTempKey] = useState<string | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const commitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const displayValue = tempKey !== null ? tempKey : value || defaultValue;
  const formattedKeys = formatShortcut(displayValue);

  const clearCommitTimer = useCallback(() => {
    if (commitTimerRef.current !== null) {
      clearTimeout(commitTimerRef.current);
      commitTimerRef.current = null;
    }
  }, []);

  useEffect(() => () => clearCommitTimer(), [clearCommitTimer]);

  useEffect(() => {
    if (!isRecording) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();

      if (e.key === 'Escape') {
        clearCommitTimer();
        setIsRecording(false);
        setTempKey(null);
        return;
      }

      const combo = recordKeyCombination(e);

      if (combo) {
        clearCommitTimer();
        setTempKey(combo);
        commitTimerRef.current = setTimeout(() => {
          commitTimerRef.current = null;
          onChange(combo);
          setIsRecording(false);
          setTempKey(null);
        }, 150);
      }
    };

    const handleMouseDown = (e: MouseEvent) => {
      if (buttonRef.current && !buttonRef.current.contains(e.target as Node)) {
        clearCommitTimer();
        setIsRecording(false);
        setTempKey(null);
      }
    };

    window.addEventListener('keydown', handleKeyDown, { capture: true });
    window.addEventListener('mousedown', handleMouseDown);

    return () => {
      clearCommitTimer();
      window.removeEventListener('keydown', handleKeyDown, { capture: true });
      window.removeEventListener('mousedown', handleMouseDown);
    };
  }, [clearCommitTimer, isRecording, onChange]);

  const handleReset = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange(defaultValue);
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange('');
  };

  const hasChanged = value !== defaultValue;
  const isBound = !!displayValue;

  return (
    <div className="flex items-center gap-3 group/recorder relative">
      <div
        className={`flex items-center gap-1 transition-opacity duration-200 ${hasChanged || isRecording ? 'opacity-100' : 'opacity-0 group-hover/recorder:opacity-100 focus-within:opacity-100'}`}
      >
        {hasChanged && (
          <button
            onClick={handleReset}
            className="p-1.5 text-[var(--theme-text-secondary)] hover:text-[var(--theme-text-primary)] hover:bg-[var(--theme-bg-tertiary)] rounded-md transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--theme-border-focus)]"
            title={t('shortcutsResetDefault')}
            aria-label={t('shortcutsResetAria')}
          >
            <RotateCcw size={12} />
          </button>
        )}
        {isBound && (
          <button
            onClick={handleClear}
            className="p-1.5 text-[var(--theme-text-secondary)] hover:text-[var(--theme-text-danger)] hover:bg-[var(--theme-bg-danger)]/10 rounded-md transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--theme-border-focus)]"
            title={t('shortcutsClear')}
            aria-label={t('shortcutsClearAria')}
          >
            <X size={12} />
          </button>
        )}
      </div>

      <button
        ref={buttonRef}
        onClick={() => setIsRecording(true)}
        className={`
                    relative flex items-center justify-end min-h-[32px] px-2 rounded-lg transition-all duration-200 outline-none
                    focus-visible:ring-2 focus-visible:ring-[var(--theme-border-focus)]
                    ${
                      isRecording
                        ? 'bg-[var(--theme-bg-accent)]/10 ring-1 ring-[var(--theme-bg-accent)] text-[var(--theme-text-link)] min-w-[100px] justify-center'
                        : 'hover:bg-[var(--theme-bg-tertiary)]/50'
                    }
                `}
        title={isRecording ? t('shortcutsPressKeys') : t('shortcutsClickRecord')}
        aria-label={
          isRecording ? t('shortcutsRecording') : `${t('shortcutsCurrentAria')}: ${formattedKeys.join(' plus ')}`
        }
      >
        {isRecording ? (
          <span className="text-xs font-medium animate-pulse whitespace-nowrap font-mono">
            {tempKey ? formatShortcut(tempKey).join(' + ') : t('shortcutsRecording')}
          </span>
        ) : isBound ? (
          <div className="flex items-center gap-1">
            {formattedKeys.map((k, i) => (
              <kbd
                key={i}
                // Cherry Studio: packages/ui/src/components/primitives/kbd.tsx + ShortcutSettings.tsx Kbd
                // min-w-6 rounded-md border border-border-subtle bg-card px-1.5 py-0.75 text-xs
                className="inline-flex min-w-6 items-center justify-center rounded-md border border-[var(--theme-border-secondary)] bg-[var(--theme-bg-primary)] px-1.5 py-[3px] text-xs font-medium leading-none text-[var(--theme-text-primary)] shadow-none select-none"
              >
                {k}
              </kbd>
            ))}
          </div>
        ) : (
          <span className="text-xs text-[var(--theme-text-secondary)] italic px-2">{t('shortcutsNone')}</span>
        )}
      </button>
    </div>
  );
};
