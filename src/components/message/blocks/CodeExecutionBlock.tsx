import React from 'react';
import { Terminal } from 'lucide-react';
import { GoogleSpinner } from '@/components/icons/GoogleSpinner';
import { useI18n } from '@/contexts/I18nContext';

interface CodeExecutionBlockProps {
  children: React.ReactNode;
  /** True while the server sandbox is still executing (executableCode seen, no result yet). */
  isRunning?: boolean;
}

/**
 * Wrapper rendered around a server-side code execution block (Gemini native
 * `executableCode` parts). Adds a slim status strip above the code block so the
 * round-trip reads as one tool card: "Python code execution — running…" while
 * the sandbox works, and the sibling ToolResultBlock below carries the outcome.
 */
export const CodeExecutionBlock: React.FC<CodeExecutionBlockProps> = ({ children, isRunning }) => {
  const { t } = useI18n();

  return (
    <div className="code-exec-block group/code-exec" data-code-execution="true">
      <div className="flex select-none items-center justify-between gap-2 px-1 pb-1 pt-0.5 text-xs text-[var(--theme-text-tertiary)]">
        <span className="flex items-center gap-1.5 font-bold uppercase tracking-wider">
          <Terminal size={12} />
          {t('codeExecutionTitle')}
        </span>
        {isRunning && (
          <span className="flex items-center gap-1.5 text-[var(--theme-text-secondary)]" aria-live="polite">
            <GoogleSpinner size={12} />
            {t('codeExecutionRunning')}
          </span>
        )}
      </div>
      {children}
    </div>
  );
};
