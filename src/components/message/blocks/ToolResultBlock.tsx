import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { AlertTriangle, Check, CheckCircle2, Copy, Download, FileOutput, TimerOff, XCircle } from 'lucide-react';
import { createManagedObjectUrl } from '@/services/objectUrlManager';
import { triggerDownload } from '@/utils/export/core';
import { extractTextFromNode } from '@/utils/reactNodeText';
import { MESSAGE_BLOCK_BUTTON_CLASS } from '@/constants/buttonClasses';
import { type UploadedFile } from '@/types';
import { FileDisplay } from '@/components/message/FileDisplay';
import { useI18n } from '@/contexts/I18nContext';

interface ToolResultBlockProps extends React.HTMLAttributes<HTMLDivElement> {
  files?: UploadedFile[];
  onImageClick?: (file: UploadedFile) => void;
}

const DOWNLOAD_FEEDBACK_MS = 2000;
const COPY_FEEDBACK_MS = 2000;
const OUTPUT_COLLAPSE_HEIGHT_PX = 320;

type CodeExecutionOutcome = 'ok' | 'failed' | 'dead' | 'unknown';

const resolveOutcome = (className?: string): CodeExecutionOutcome => {
  if (!className) return 'unknown';
  if (className.includes('outcome-ok')) return 'ok';
  if (className.includes('outcome-failed')) return 'failed';
  if (className.includes('outcome-dead')) return 'dead';
  return 'unknown';
};

const OUTCOME_ICON: Record<CodeExecutionOutcome, React.ReactNode> = {
  ok: <CheckCircle2 size={13} className="text-[var(--theme-text-success)]" />,
  failed: <XCircle size={13} className="text-[var(--theme-icon-error)]" />,
  dead: <TimerOff size={13} className="text-[var(--theme-icon-error)]" />,
  unknown: <AlertTriangle size={13} className="text-[var(--theme-text-tertiary)]" />,
};

export const ToolResultBlock: React.FC<ToolResultBlockProps> = ({
  className,
  children,
  files,
  onImageClick,
  ...props
}) => {
  const { t } = useI18n();
  const [downloaded, setDownloaded] = useState(false);
  const [copied, setCopied] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [isOverflowing, setIsOverflowing] = useState(false);
  const outputRef = useRef<HTMLDivElement>(null);

  const outcome = resolveOutcome(className);

  // Legacy sessions baked a "<strong>Execution Result (OUTCOME_OK):</strong>"
  // header into the content; the localized header below replaces it, so the
  // baked one is filtered out of what we render.
  const visibleChildren = React.Children.toArray(children).filter(
    (child) =>
      !(
        React.isValidElement(child) &&
        child.type === 'strong' &&
        extractTextFromNode(child).startsWith('Execution Result')
      ),
  );

  const preElement = visibleChildren.find((child) => React.isValidElement(child) && child.type === 'pre');

  const rawOutput = preElement
    ? extractTextFromNode(preElement)
    : extractTextFromNode(visibleChildren)
        .replace(/^Execution Result.*:/, '')
        .trim();

  const hasOutput = rawOutput.length > 0;

  // Collapse very long sandbox output (runaway loops can print megabytes);
  // measure after render so wrapping/typography is accounted for.
  useLayoutEffect(() => {
    const element = outputRef.current;
    if (!element) {
      setIsOverflowing(false);
      return;
    }
    setIsOverflowing(element.scrollHeight > OUTPUT_COLLAPSE_HEIGHT_PX + 24);
  }, [rawOutput]);

  // Re-measure when the output changes mid-stream or after a theme/font swap.
  useEffect(() => {
    const element = outputRef.current;
    if (!element || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => {
      setIsOverflowing(element.scrollHeight > OUTPUT_COLLAPSE_HEIGHT_PX + 24);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const guessDownloadExtension = (value: string): string => {
    const lines = value.split('\n').filter((line) => line.trim());
    if (lines.length > 1 && lines[0].includes(',') && lines[1].includes(',')) {
      return 'csv';
    }
    if (value.trim().startsWith('{') || value.trim().startsWith('[')) {
      return 'json';
    }
    return 'txt';
  };

  const handleDownload = () => {
    if (!hasOutput) return;

    const blob = new Blob([rawOutput], { type: 'text/plain;charset=utf-8' });
    const url = createManagedObjectUrl(blob);
    triggerDownload(url, `execution-output-${Date.now()}.${guessDownloadExtension(rawOutput)}`);

    setDownloaded(true);
    setTimeout(() => setDownloaded(false), DOWNLOAD_FEEDBACK_MS);
  };

  const handleCopy = async () => {
    if (!hasOutput) return;
    try {
      await navigator.clipboard.writeText(rawOutput);
      setCopied(true);
      setTimeout(() => setCopied(false), COPY_FEEDBACK_MS);
    } catch {
      // Clipboard permission denied — keep the button silent, the user can
      // still select/download the output.
    }
  };

  const hasActions = hasOutput;

  return (
    <div className={`${className} group relative`} {...props}>
      <div className="flex select-none items-center justify-between gap-2 pr-1">
        <strong className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider opacity-90">
          {OUTCOME_ICON[outcome]}
          {t(`codeExecutionResult${outcome.charAt(0).toUpperCase()}${outcome.slice(1)}`)}
        </strong>
        {hasActions && (
          <div className="flex items-center gap-1">
            <button onClick={handleCopy} className={MESSAGE_BLOCK_BUTTON_CLASS} title={t('codeExecutionCopyOutput')}>
              {copied ? (
                <Check size={14} className="text-[var(--theme-text-success)] icon-animate-pop" />
              ) : (
                <Copy size={14} />
              )}
            </button>
            <button onClick={handleDownload} className={MESSAGE_BLOCK_BUTTON_CLASS} title={t('codeDownloadOutput')}>
              {downloaded ? (
                <Check size={14} className="text-[var(--theme-text-success)] icon-animate-pop" />
              ) : (
                <Download size={14} />
              )}
            </button>
          </div>
        )}
      </div>

      {hasOutput ? (
        <div
          ref={outputRef}
          className="relative"
          style={{
            maxHeight: isExpanded || !isOverflowing ? 'none' : `${OUTPUT_COLLAPSE_HEIGHT_PX}px`,
            overflowY: isExpanded || !isOverflowing ? 'visible' : 'hidden',
          }}
        >
          {visibleChildren}
          {isOverflowing && !isExpanded && (
            <div className="absolute bottom-0 left-0 right-0 h-16 flex items-end justify-center bg-gradient-to-t from-[var(--theme-bg-code-block)] to-transparent">
              <button
                onClick={() => setIsExpanded(true)}
                className="mb-1 flex items-center gap-1 rounded-full border border-[var(--theme-border-secondary)] bg-[var(--theme-bg-primary)] px-3 py-1 text-xs font-medium text-[var(--theme-text-tertiary)] shadow-sm transition-colors hover:text-[var(--theme-text-primary)]"
                title={t('codeExecutionExpandOutput')}
              >
                {t('codeExecutionExpandOutput')}
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className="text-xs italic text-[var(--theme-text-tertiary)]">{t('codeExecutionNoOutput')}</div>
      )}

      {isOverflowing && isExpanded && (
        <button
          onClick={() => setIsExpanded(false)}
          className="mt-1 flex select-none items-center gap-1 text-xs font-medium text-[var(--theme-text-tertiary)] transition-colors hover:text-[var(--theme-text-primary)]"
          title={t('codeExecutionCollapseOutput')}
        >
          {t('codeExecutionCollapseOutput')}
        </button>
      )}

      {(() => {
        const generatedFiles = files?.filter((file) => file.name.startsWith('generated-')) || [];
        if (generatedFiles.length === 0) return null;
        return (
          <div className="mt-3 border-t border-[var(--theme-border-secondary)]/50 pt-3">
            <span className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-[var(--theme-text-tertiary)]">
              <FileOutput size={12} /> {t('codeGeneratedOutputFiles')}
            </span>
            <div className="flex flex-wrap gap-2">
              {generatedFiles.map((file) => (
                <FileDisplay
                  key={file.id}
                  file={file}
                  onFileClick={onImageClick}
                  isFromMessageList={true}
                  isGemini3={false}
                />
              ))}
            </div>
          </div>
        );
      })()}
    </div>
  );
};
