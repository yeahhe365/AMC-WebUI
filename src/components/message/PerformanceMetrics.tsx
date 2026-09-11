import React, { useState, useEffect, useRef } from 'react';
import { type ChatMessage } from '@/types';
import { useI18n } from '@/contexts/I18nContext';
import { useCopyToClipboard } from '@/hooks/useCopyToClipboard';
import { TokenDetailsCard } from './TokenDetailsCard';
import { buildMessageTokenStatsView, buildTokenStatsCopyText, formatCompactTokens } from './tokenStats';

interface PerformanceMetricsProps {
  message: ChatMessage;
  hideTimer?: boolean;
}

const MIN_GENERATION_DURATION_SECONDS = 0.2;
const LIVE_TIMER_REFRESH_MS = 100;
const COPY_FEEDBACK_MS = 1500;

export const PerformanceMetrics: React.FC<PerformanceMetricsProps> = ({ message, hideTimer }) => {
  const { t } = useI18n();
  const { generationStartTime, generationEndTime, firstTokenTimeMs, isLoading, role } = message;
  const view = buildMessageTokenStatsView(message);

  const [liveElapsedTime, setLiveElapsedTime] = useState<number>(() => {
    if (!generationStartTime) return 0;
    return (Date.now() - new Date(generationStartTime).getTime()) / 1000;
  });
  const [isDismissed, setIsDismissed] = useState(false);
  const pointerDownPositionRef = useRef<{ x: number; y: number } | undefined>(undefined);
  const { isCopied: copied, copyToClipboard } = useCopyToClipboard(COPY_FEEDBACK_MS);

  useEffect(() => {
    if (!generationStartTime || !isLoading) return;
    const startTime = new Date(generationStartTime).getTime();
    const updateTimer = () => setLiveElapsedTime((Date.now() - startTime) / 1000);
    const intervalId = setInterval(updateTimer, LIVE_TIMER_REFRESH_MS);
    return () => clearInterval(intervalId);
  }, [generationStartTime, isLoading]);

  const elapsedTime = (() => {
    if (!generationStartTime) return 0;
    if (generationEndTime && !isLoading) {
      const startTime = new Date(generationStartTime).getTime();
      const endTime = new Date(generationEndTime).getTime();
      return Math.max(0, (endTime - startTime) / 1000);
    }
    return Math.max(0, liveElapsedTime);
  })();

  const generatedTokens = view.completionTokens + view.thoughtTokens;
  const ttftSeconds = firstTokenTimeMs !== undefined ? firstTokenTimeMs / 1000 : undefined;

  let modelDuration = elapsedTime;
  if (ttftSeconds !== undefined) {
    modelDuration = Math.max(0, elapsedTime - ttftSeconds);
  }
  if (modelDuration < MIN_GENERATION_DURATION_SECONDS) {
    modelDuration = Math.max(MIN_GENERATION_DURATION_SECONDS, elapsedTime);
  }
  const modelTps = generatedTokens > 0 && modelDuration > 0 ? generatedTokens / modelDuration : 0;
  const endToEndTps = generatedTokens > 0 && elapsedTime > 0 ? generatedTokens / elapsedTime : 0;

  const showTokens = view.hasAnyTokens;
  const showTimer = Boolean((isLoading && !hideTimer) || (generationStartTime && generationEndTime));

  if (!showTokens && !showTimer) return null;

  const tokensUnit = t('metricsTokensUnit');
  const speedUnit = t('metricsSpeedUnit');
  const totalCompact = formatCompactTokens(view.totalTokens);
  const tokenLabel = `${totalCompact} ${tokensUnit}`;
  const throughputLabel = modelTps > 0 ? `${modelTps.toFixed(1)} ${speedUnit}` : undefined;
  const triggerLabel = throughputLabel ? `${tokenLabel} · ${throughputLabel}` : tokenLabel;

  const handleCopy = () => {
    const text = buildTokenStatsCopyText(view, {
      modelTps: modelTps > 0 ? modelTps : undefined,
      endToEndTps: endToEndTps > 0 ? endToEndTps : undefined,
      elapsedSeconds: showTimer ? elapsedTime : undefined,
    });
    void copyToClipboard(text);
  };

  const handleMouseDown = (event: React.MouseEvent<HTMLButtonElement>) => {
    if (event.button !== 0) return;
    pointerDownPositionRef.current = { x: event.clientX, y: event.clientY };
    setIsDismissed(true);
  };

  const handleMouseBoundary = (event: React.MouseEvent<HTMLButtonElement>) => {
    const pointerDownPosition = pointerDownPositionRef.current;
    if (!pointerDownPosition) {
      setIsDismissed(false);
      return;
    }
    const movedDistance = Math.hypot(event.clientX - pointerDownPosition.x, event.clientY - pointerDownPosition.y);
    if (movedDistance < 2) return;
    pointerDownPositionRef.current = undefined;
    setIsDismissed(false);
  };

  const handleBlur = () => {
    pointerDownPositionRef.current = undefined;
    setIsDismissed(false);
  };

  // 用户提问消息的 Token 显示（对标 Cherry Studio 的 UserMessageTokens）
  if (role === 'user') {
    if (!showTokens) return null;
    return (
      <div className="mt-1 flex justify-end items-center text-xs">
        <button
          type="button"
          onClick={handleCopy}
          aria-label={`${t('metricsTokenUsage')}: ${tokenLabel}`}
          className="message-tokens cursor-pointer select-text text-right text-[var(--theme-text-tertiary)] text-xs tabular-nums leading-5 transition-colors duration-150 hover:text-[var(--theme-text-primary)] focus-visible:text-[var(--theme-text-primary)] focus-visible:underline focus-visible:outline-none"
        >
          {tokenLabel}
          {copied && <span className="ml-1 text-[var(--theme-text-link)]">✓ {t('metricsCopied')}</span>}
        </button>
      </div>
    );
  }

  // 助手/模型消息的 Token 显示（对标 Cherry Studio AssistantMessageTokens 极简纯文本链接样式）
  return (
    <div className="mt-1 flex justify-end items-center flex-wrap gap-x-3 gap-y-1 text-xs text-[var(--theme-text-primary)] font-mono">
      {showTokens && (
        <div className="group/tokens relative">
          <button
            type="button"
            onClick={handleCopy}
            onMouseDown={handleMouseDown}
            onMouseEnter={handleMouseBoundary}
            onMouseLeave={handleMouseBoundary}
            onBlur={handleBlur}
            aria-label={`${t('metricsTokenUsage')}: ${triggerLabel}`}
            title={t('metricsTokenBreakdown')}
            className="message-tokens cursor-pointer select-text text-right text-[var(--theme-text-tertiary)] text-xs tabular-nums leading-5 transition-colors duration-150 hover:text-[var(--theme-text-primary)] focus-visible:text-[var(--theme-text-primary)] focus-visible:underline focus-visible:outline-none"
          >
            <span>{triggerLabel}</span>
            {copied && <span className="ml-1 text-[var(--theme-text-link)]">✓ {t('metricsCopied')}</span>}
          </button>

          {!isDismissed && (
            <div className="absolute bottom-full right-0 z-20 pb-2 invisible opacity-0 translate-y-1 transition-all duration-150 pointer-events-none group-hover/tokens:visible group-hover/tokens:opacity-100 group-hover/tokens:translate-y-0 group-hover/tokens:delay-200 group-hover/tokens:pointer-events-auto group-focus-within/tokens:visible group-focus-within/tokens:opacity-100 group-focus-within/tokens:translate-y-0 group-focus-within/tokens:pointer-events-auto">
              <div className="w-[28rem] max-w-[calc(100vw-2.5rem)] rounded-2xl border border-[var(--theme-border-secondary)]/60 bg-[var(--theme-bg-primary)] shadow-2xl overflow-hidden">
                <TokenDetailsCard
                  message={message}
                  modelTps={modelTps > 0 ? modelTps : undefined}
                  endToEndTps={endToEndTps > 0 ? endToEndTps : undefined}
                  elapsedSeconds={elapsedTime > 0 ? elapsedTime : undefined}
                  ttftSeconds={ttftSeconds}
                />
              </div>
            </div>
          )}
        </div>
      )}

      {showTimer && !showTokens && (
        <div className="tabular-nums select-none text-[var(--theme-text-tertiary)]" title={t('metricsTotalDuration')}>
          {elapsedTime.toFixed(1)}s
        </div>
      )}
    </div>
  );
};
