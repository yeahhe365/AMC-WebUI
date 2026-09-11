import React, { useState, useMemo, useRef, useLayoutEffect, useCallback } from 'react';
import { ChevronDown } from 'lucide-react';
import { useI18n } from '@/contexts/I18nContext';
import { type ChatMessage, type LegacyThirdPartyProviderId, type ThirdPartyTemplateId } from '@/types';
import { buildMessageTokenStatsView, formatExactTokens } from './tokenStats';
import { useChatStore } from '@/stores/chatStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { DEFAULT_CHAT_SETTINGS } from '@/constants/settingsDefaults';
import { resolveChatApiRoute } from '@/utils/chatApiRoute';
import { getModelIcon } from '@/components/shared/ModelIcon';
import { THIRD_PARTY_PROVIDER_LABELS, THIRD_PARTY_TEMPLATE_LABELS } from '@/utils/thirdPartyApiProviders';
import { estimateMessageCostUsd, formatCostUsd } from '@/utils/usagePricing';

const PRIMARY_METRIC_FONT_SIZES = [16, 14, 12, 10] as const;

function fitPrimaryMetricValue(element: HTMLElement) {
  element.style.whiteSpace = 'nowrap';
  element.style.overflowWrap = 'normal';

  for (const fontSize of PRIMARY_METRIC_FONT_SIZES) {
    element.style.fontSize = `${fontSize}px`;
    if (element.scrollWidth <= element.clientWidth) return;
  }

  element.style.whiteSpace = 'normal';
  element.style.overflowWrap = 'anywhere';
}

interface PrimaryMetricProps {
  label: string;
  value: string;
  testId?: string;
}

const PrimaryMetric: React.FC<PrimaryMetricProps> = ({ label, value, testId }) => {
  const valueRef = useRef<HTMLElement>(null);

  useLayoutEffect(() => {
    const element = valueRef.current;
    if (!element) return;

    fitPrimaryMetricValue(element);
    const handleResize = () => fitPrimaryMetricValue(element);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [value]);

  return (
    <div
      data-testid={testId}
      className="min-w-0 rounded-lg bg-[var(--theme-bg-tertiary)]/50 px-2.5 py-2 sm:px-3 sm:py-2.5"
    >
      <dt className="truncate text-[11px] text-[var(--theme-text-tertiary)] leading-4" title={label}>
        {label}
      </dt>
      <dd
        ref={valueRef}
        className="mt-1 whitespace-nowrap font-semibold text-base text-[var(--theme-text-primary)] tabular-nums leading-5"
        title={value}
      >
        <span>{value}</span>
      </dd>
    </div>
  );
};

interface DetailMetricProps {
  label: string;
  value: string;
  testId?: string;
}

const DetailMetric: React.FC<DetailMetricProps> = ({ label, value, testId }) => {
  return (
    <div className="min-w-0" data-testid={testId}>
      <dt className="truncate text-[11px] text-[var(--theme-text-tertiary)] leading-4">{label}</dt>
      <dd
        className="truncate text-xs font-medium text-[var(--theme-text-secondary)] tabular-nums leading-5"
        title={value}
      >
        <span>{value}</span>
      </dd>
    </div>
  );
};

export interface TokenDetailsCardProps {
  message: ChatMessage;
  modelTps?: number;
  endToEndTps?: number;
  elapsedSeconds?: number;
  ttftSeconds?: number;
  modelId?: string;
  modelName?: string;
  providerName?: string;
}

/**
 * Cherry Studio 同款 Token 详情悬浮卡：
 * 1. 顶部模型信息栏（模型图标、名称、供应商、消息生成时间）
 * 2. 三栏主要指标卡（输入、输出、模型生成 TPS，支持字号自适应）
 * 3. 详细指标双列网格（未缓存 U、缓存 C、工具 T、推理 R、首字耗时、端到端速度、总耗时、累计 Token）
 * 4. 可折叠的运行时间分布（等待、推理思考、文本生成，带进度条比例可视化）
 */
export const TokenDetailsCard: React.FC<TokenDetailsCardProps> = React.memo(
  ({
    message,
    modelTps,
    endToEndTps,
    elapsedSeconds,
    ttftSeconds,
    modelId: propModelId,
    modelName: propModelName,
    providerName: propProviderName,
  }) => {
    const { t, language } = useI18n();
    const [showMoreDetails, setShowMoreDetails] = useState(false);

    const currentSessionSettings = useChatStore((state) => {
      const s = state.savedSessions.find((session) => session.id === state.activeSessionId);
      return s?.settings;
    });
    const appSettings = useSettingsStore((state) => state.appSettings);

    const view = useMemo(() => buildMessageTokenStatsView(message), [message]);
    const exact = useCallback((v: number) => formatExactTokens(v, language), [language]);

    // 解析模型与供应商信息
    const { resolvedModelId, resolvedProviderId, resolvedModelName, resolvedProviderName } = useMemo(() => {
      const sessionSettings = currentSessionSettings;
      const effectiveChatSettings = sessionSettings || {
        ...DEFAULT_CHAT_SETTINGS,
        modelId: propModelId || appSettings.modelId,
      };
      const route = resolveChatApiRoute(appSettings, effectiveChatSettings);

      const mId = propModelId || route.modelId || appSettings.modelId || 'gemini-2.5-flash';
      const pId = sessionSettings?.providerId || route.providerId;

      let pName = propProviderName;
      if (!pName) {
        if (route.provider?.name) {
          pName = route.provider.name;
        } else if (pId) {
          pName =
            THIRD_PARTY_PROVIDER_LABELS[pId as LegacyThirdPartyProviderId] ||
            THIRD_PARTY_TEMPLATE_LABELS[pId as ThirdPartyTemplateId] ||
            pId.charAt(0).toUpperCase() + pId.slice(1);
        } else {
          pName = 'Google';
        }
      }

      let mName = propModelName;
      if (!mName) {
        const allCandidateModels = [
          ...(route.provider?.models || []),
          ...(appSettings.thirdPartyApi?.connections.flatMap((c) => c.models) || []),
        ];
        const matched = allCandidateModels.find((m) => m.id === mId);
        if (matched?.name) {
          mName = matched.name;
        } else {
          const shortName = mId.split('/').pop() || mId;
          if (shortName.toLowerCase().startsWith('gpt-')) {
            mName = shortName.replace(/^gpt/i, 'GPT');
          } else if (shortName.toLowerCase().startsWith('gemini-')) {
            mName = shortName
              .replace(/^gemini-/i, 'Gemini ')
              .split('-')
              .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
              .join(' ');
          } else {
            mName = shortName;
          }
        }
      }

      return {
        resolvedModelId: mId,
        resolvedProviderId: pId,
        resolvedModelName: mName,
        resolvedProviderName: pName,
      };
    }, [propModelId, propModelName, propProviderName, currentSessionSettings, appSettings]);

    // 格式化时间戳
    const createdAtLabel = useMemo(() => {
      if (!message.timestamp) return undefined;
      try {
        const date = message.timestamp instanceof Date ? message.timestamp : new Date(message.timestamp);
        if (isNaN(date.getTime())) return undefined;
        return new Intl.DateTimeFormat(language, {
          year: 'numeric',
          month: 'numeric',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        }).format(date);
      } catch {
        return undefined;
      }
    }, [message.timestamp, language]);

    // 格式化主要指标值（带 Tokens 单位，对齐 Cherry Studio）
    const tokensUnit = t('metricsTokensUnit');
    const speedUnit = t('metricsSpeedUnit');
    const inputLabel = `${exact(view.promptTokens)} ${tokensUnit}`;
    const outputLabel = `${exact(view.completionTokens)} ${tokensUnit}`;
    const speedLabel = modelTps !== undefined && modelTps > 0 ? `${modelTps.toFixed(1)} ${speedUnit}` : '—';

    // 估算费用（对标 Cherry Studio 的费用行）
    const estimatedCost = useMemo(() => {
      return estimateMessageCostUsd(resolvedModelId, {
        promptTokens: view.promptTokens,
        completionTokens: view.completionTokens,
        cachedPromptTokens: view.cachedPromptTokens,
        toolUsePromptTokens: view.toolUsePromptTokens,
      });
    }, [resolvedModelId, view]);

    const costLabel = useMemo(() => {
      if (estimatedCost === null) return undefined;
      return formatCostUsd(estimatedCost);
    }, [estimatedCost]);

    // 次要详细指标列表（去除单字母前缀，文案与单位完全对齐 Cherry Studio）
    const detailMetrics = useMemo(() => {
      const items: Array<{ id: string; label: string; value: string; testId?: string }> = [];

      if (view.thoughtTokens > 0) {
        items.push({
          id: 'reasoning',
          label: t('metricsReasoningShort'),
          value: `${exact(view.thoughtTokens)} ${tokensUnit}`,
          testId: 'message-metric-reasoning',
        });
      }

      if (view.cachedPromptTokens > 0) {
        items.push({
          id: 'cache-read',
          label: t('metricsCacheRead'),
          value: `${exact(view.cachedPromptTokens)} ${tokensUnit}`,
          testId: 'message-metric-cache-read',
        });
      }

      if (view.uncachedInputTokens > 0) {
        items.push({
          id: 'uncached',
          label: t('metricsUncached'),
          value: `${exact(view.uncachedInputTokens)} ${tokensUnit}`,
          testId: 'message-metric-uncached',
        });
      }

      if (view.toolUsePromptTokens > 0) {
        items.push({
          id: 'tool-use',
          label: t('metricsToolUse'),
          value: `${exact(view.toolUsePromptTokens)} ${tokensUnit}`,
          testId: 'message-metric-tool-use',
        });
      }

      if (ttftSeconds !== undefined) {
        items.push({
          id: 'ttft',
          label: t('metricsTimeToFirstToken'),
          value: `${ttftSeconds.toFixed(2)}s`,
          testId: 'message-metric-ttft',
        });
      }

      if (endToEndTps !== undefined && endToEndTps > 0) {
        items.push({
          id: 'end-to-end-tps',
          label: t('metricsEndToEndThroughputLabel'),
          value: `${endToEndTps.toFixed(1)} ${speedUnit}`,
          testId: 'message-metric-end-to-end-tps',
        });
      }

      if (elapsedSeconds !== undefined && elapsedSeconds > 0) {
        items.push({
          id: 'duration',
          label: t('metricsTotalDurationLabel'),
          value: `${elapsedSeconds.toFixed(1)}s`,
          testId: 'message-metric-duration',
        });
      }

      if (view.cumulativeTotalTokens !== undefined && view.cumulativeTotalTokens > 0) {
        items.push({
          id: 'cumulative-tokens',
          label: t('metricsCumulativeTokens'),
          value: `${exact(view.cumulativeTotalTokens)} ${tokensUnit}`,
          testId: 'message-metric-cumulative-tokens',
        });
      }

      return items;
    }, [view, ttftSeconds, endToEndTps, elapsedSeconds, t, exact, tokensUnit, speedUnit]);

    // 运行时间细分（等待 / 推理 / 文本生成）
    const performanceBreakdown = useMemo(() => {
      if (!elapsedSeconds || elapsedSeconds <= 0) return null;
      const totalMs = elapsedSeconds * 1000;
      const firstToken = Math.min(
        Math.max(message.firstTokenTimeMs ?? (ttftSeconds ? ttftSeconds * 1000 : 0), 0),
        totalMs,
      );
      const reasoning = Math.min(Math.max(message.thinkingTimeMs ?? 0, 0), totalMs);
      const waiting = Math.max(0, firstToken - Math.min(reasoning, firstToken));
      const textStartedAt = Math.min(totalMs, waiting + reasoning);
      const generation = Math.max(0, totalMs - textStartedAt);

      const intervals: Array<{ id: string; label: string; durationMs: number }> = [];
      if (waiting > 0) {
        intervals.push({ id: 'waiting', label: t('metricsWaiting'), durationMs: waiting });
      }
      if (reasoning > 0) {
        intervals.push({ id: 'reasoning', label: t('metricsReasoningShort'), durationMs: reasoning });
      }
      if (generation > 0) {
        intervals.push({ id: 'generation', label: t('metricsTextGeneration'), durationMs: generation });
      }

      return {
        totalMs,
        intervals,
      };
    }, [elapsedSeconds, message.firstTokenTimeMs, message.thinkingTimeMs, ttftSeconds, t]);

    return (
      <div className="w-full text-left select-text" role="dialog" aria-label={t('metricsTokenUsage')}>
        <header className="flex min-w-0 items-center gap-2.5 p-3">
          <div className="flex size-8 items-center justify-center rounded-lg bg-[var(--theme-bg-tertiary)]/60 outline outline-1 outline-[var(--theme-border-secondary)]/50 -outline-offset-1 shrink-0 overflow-hidden">
            {getModelIcon({
              id: resolvedModelId,
              name: resolvedModelName,
              providerId: resolvedProviderId,
            })}
          </div>
          <div className="min-w-0 flex-1">
            <div
              className="truncate font-medium text-sm text-[var(--theme-text-primary)] leading-5"
              title={resolvedModelName}
            >
              {resolvedModelName}
            </div>
            {resolvedProviderName && (
              <div
                className="truncate text-xs text-[var(--theme-text-secondary)] leading-5"
                title={resolvedProviderName}
              >
                {resolvedProviderName}
              </div>
            )}
          </div>
          {createdAtLabel && (
            <time
              dateTime={message.timestamp ? new Date(message.timestamp).toISOString() : undefined}
              className="max-w-44 shrink-0 truncate text-right text-[11px] text-[var(--theme-text-tertiary)] leading-4"
              title={createdAtLabel}
            >
              {createdAtLabel}
            </time>
          )}
        </header>

        <div className="space-y-3 border-t border-[var(--theme-border-secondary)]/50 p-3">
          <dl className="grid grid-cols-3 gap-2" data-testid="message-primary-metrics">
            <PrimaryMetric testId="message-metric-input" label={t('metricsInput')} value={inputLabel} />
            <PrimaryMetric testId="message-metric-output" label={t('metricsOutput')} value={outputLabel} />
            <PrimaryMetric testId="message-metric-speed" label={t('metricsModelThroughputTitle')} value={speedLabel} />
          </dl>

          {costLabel && (
            <div
              data-testid="message-cost"
              className="flex min-w-0 items-center justify-between gap-3 border-y border-[var(--theme-border-secondary)]/30 py-2 text-xs leading-5"
            >
              <span className="truncate text-[var(--theme-text-tertiary)]">{t('metricsCost')}</span>
              <span className="flex shrink-0 items-center gap-1.5 leading-5">
                <span className="text-[11px] text-[var(--theme-text-tertiary)] leading-5">
                  {t('metricsCostEstimated')}
                </span>
                <span className="text-[var(--theme-text-primary)] font-semibold tabular-nums leading-5">
                  {costLabel}
                </span>
              </span>
            </div>
          )}

          {detailMetrics.length > 0 && (
            <dl
              className={`grid grid-cols-2 gap-x-4 gap-y-2 ${!costLabel ? 'border-t border-[var(--theme-border-secondary)]/40 pt-2.5' : ''}`}
              data-testid="message-secondary-metrics"
            >
              {detailMetrics.map((metric) => (
                <DetailMetric key={metric.id} testId={metric.testId} label={metric.label} value={metric.value} />
              ))}
            </dl>
          )}

          {performanceBreakdown && performanceBreakdown.intervals.length > 0 && (
            <div className="border-t border-[var(--theme-border-secondary)]/40 pt-1">
              <button
                type="button"
                className="flex w-full items-center justify-between px-1.5 py-1 text-xs text-[var(--theme-text-secondary)] hover:text-[var(--theme-text-primary)] hover:bg-[var(--theme-bg-tertiary)]/40 rounded-md transition-colors cursor-pointer select-none"
                aria-expanded={showMoreDetails}
                onClick={() => setShowMoreDetails(!showMoreDetails)}
              >
                <span>{showMoreDetails ? t('metricsLessDetails') : t('metricsMoreDetails')}</span>
                <ChevronDown
                  aria-hidden="true"
                  size={14}
                  className={`transition-transform duration-150 ${showMoreDetails ? 'rotate-180' : ''}`}
                />
              </button>

              {showMoreDetails && (
                <section className="space-y-2 pt-2">
                  <h4 className="font-medium text-[var(--theme-text-primary)] text-xs leading-5">
                    {t('metricsRuntimeBreakdown')}
                  </h4>
                  <div className="space-y-2" data-testid="message-performance-breakdown">
                    {performanceBreakdown.intervals.map((interval) => {
                      const width = Math.min(
                        100,
                        Math.max(2, (interval.durationMs / performanceBreakdown.totalMs) * 100),
                      );
                      const durationSec = interval.durationMs / 1000;
                      return (
                        <div key={interval.id}>
                          <div className="mb-1 flex items-center justify-between gap-3 text-[11px] leading-4">
                            <span className="truncate text-[var(--theme-text-secondary)]">{interval.label}</span>
                            <span className="shrink-0 text-[var(--theme-text-tertiary)] tabular-nums">
                              {durationSec >= 1 ? `${durationSec.toFixed(1)}s` : `${durationSec.toFixed(2)}s`}
                            </span>
                          </div>
                          <div className="h-1.5 overflow-hidden rounded-full bg-[var(--theme-bg-tertiary)]">
                            <span
                              className="block h-full rounded-full bg-[var(--theme-text-primary)]/55"
                              style={{ width: `${width}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </section>
              )}
            </div>
          )}
        </div>
      </div>
    );
  },
);
