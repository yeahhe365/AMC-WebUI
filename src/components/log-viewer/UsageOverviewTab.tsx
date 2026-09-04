import React from 'react';
import { Loader2 } from 'lucide-react';
import { useI18n } from '@/contexts/I18nContext';
import {
  SETTINGS_SECTION_CARD_CLASS,
  SETTINGS_SECTION_LABEL_CLASS,
  SETTINGS_SEGMENTED_ACTIVE_CLASS,
  SETTINGS_SEGMENTED_IDLE_CLASS,
  SETTINGS_SEGMENTED_TRACK_CLASS,
} from '@/constants/designTokens';
import { useUsageStats, type UsageTimeRange } from './useUsageStats';
import { formatPriceUsd } from '@/utils/usagePricing';

const RANGE_OPTIONS: Array<{ value: UsageTimeRange; labelKey: string }> = [
  { value: 'today', labelKey: 'usageToday' },
  { value: '7d', labelKey: 'usageLast7Days' },
  { value: '30d', labelKey: 'usageLast30Days' },
  { value: 'all', labelKey: 'usageAllTime' },
];

import type { SupportedLanguage } from '@/i18n/languageRegistry';

const getUnavailablePriceLabel = (count: number, language: SupportedLanguage) =>
  language === 'zh' ? `${count.toLocaleString()} 条不可定价` : `${count.toLocaleString()} unavailable`;

const PriceValue: React.FC<{
  amount: number;
  pricedRequests: number;
  unavailableRequests: number;
  language: SupportedLanguage;
}> = ({ amount, pricedRequests, unavailableRequests, language }) => {
  const hasPricedAmount = pricedRequests > 0;

  return (
    <span className="inline-flex flex-col items-end gap-0.5">
      <span>{hasPricedAmount ? formatPriceUsd(amount) : '—'}</span>
      {unavailableRequests > 0 && (
        <span className="text-xs font-medium text-[var(--theme-text-tertiary)]">
          {getUnavailablePriceLabel(unavailableRequests, language)}
        </span>
      )}
    </span>
  );
};

export const UsageOverviewTab: React.FC = () => {
  const { t, language } = useI18n();
  const { timeRange, setTimeRange, isLoading, summary, byModel } = useUsageStats();

  const metrics = [
    { title: t('usageTotalRequests'), value: summary.totalRequests.toLocaleString() },
    { title: t('usagePromptTokens'), value: summary.totalPromptTokens.toLocaleString() },
    { title: t('usageCachedTokens'), value: summary.totalCachedPromptTokens.toLocaleString() },
    { title: t('usageCompletionTokens'), value: summary.totalCompletionTokens.toLocaleString() },
    { title: t('usageTotalTokens'), value: summary.totalTokens.toLocaleString() },
    {
      title: t('usageEstimatedCost'),
      value: (
        <PriceValue
          amount={summary.estimatedCostUsd}
          pricedRequests={summary.estimatedCostPricedRequests}
          unavailableRequests={summary.estimatedCostUnavailableRequests}
          language={language}
        />
      ),
    },
  ];

  return (
    <div className="custom-scrollbar h-full overflow-y-auto p-4">
      <div className="space-y-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-1">
            <h3 className="text-lg font-semibold text-[var(--theme-text-primary)]">{t('usageTitle')}</h3>
            <p className="max-w-2xl text-sm text-[var(--theme-text-secondary)]">{t('usageDescription')}</p>
          </div>

          <div className="flex min-w-[220px] flex-col gap-2">
            <span className={SETTINGS_SECTION_LABEL_CLASS}>{t('usageTimeRange')}</span>
            <div className={`${SETTINGS_SEGMENTED_TRACK_CLASS} w-full sm:w-auto`}>
              {RANGE_OPTIONS.map((option) => {
                const isActive = timeRange === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setTimeRange(option.value)}
                    className={`flex-1 sm:flex-none ${isActive ? SETTINGS_SEGMENTED_ACTIVE_CLASS : SETTINGS_SEGMENTED_IDLE_CLASS}`}
                  >
                    {t(option.labelKey)}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {isLoading ? (
          <div
            className={`${SETTINGS_SECTION_CARD_CLASS} flex items-center justify-center gap-3 py-10 text-sm text-[var(--theme-text-secondary)]`}
          >
            <Loader2 size={16} className="animate-spin" />
            <span>{t('usageLoading')}</span>
          </div>
        ) : (
          <>
            <div className={SETTINGS_SECTION_CARD_CLASS}>
              <div className="flex flex-col gap-2.5">
                {metrics.map((metric) => (
                  <div key={metric.title} className="flex items-center justify-between gap-3">
                    <span className="text-sm text-[var(--theme-text-secondary)]">{metric.title}</span>
                    <span className="text-sm font-medium tabular-nums text-[var(--theme-text-primary)]">
                      {metric.value}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className={SETTINGS_SECTION_CARD_CLASS}>
              <div className={`${SETTINGS_SECTION_LABEL_CLASS} mb-3`}>{t('usageByModel')}</div>

              {byModel.length === 0 ? (
                <div className="px-1 py-8 text-center text-sm text-[var(--theme-text-secondary)]">
                  {t('usageNoData')}
                </div>
              ) : (
                <div className="overflow-x-auto rounded-lg border border-[var(--theme-border-secondary)]/60">
                  <table className="min-w-full divide-y divide-[var(--theme-border-secondary)] bg-[var(--theme-bg-primary)]">
                    <thead className="bg-[var(--theme-bg-tertiary)]/60">
                      <tr>
                        <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-[var(--theme-text-tertiary)]">
                          {t('usageModelColumn')}
                        </th>
                        <th className="px-4 py-2.5 text-right text-xs font-semibold uppercase tracking-wider text-[var(--theme-text-tertiary)]">
                          {t('usageRequestsColumn')}
                        </th>
                        <th className="px-4 py-2.5 text-right text-xs font-semibold uppercase tracking-wider text-[var(--theme-text-tertiary)]">
                          {t('usagePromptTokens')}
                        </th>
                        <th className="px-4 py-2.5 text-right text-xs font-semibold uppercase tracking-wider text-[var(--theme-text-tertiary)]">
                          {t('usageCachedTokens')}
                        </th>
                        <th className="px-4 py-2.5 text-right text-xs font-semibold uppercase tracking-wider text-[var(--theme-text-tertiary)]">
                          {t('usageCompletionTokens')}
                        </th>
                        <th className="px-4 py-2.5 text-right text-xs font-semibold uppercase tracking-wider text-[var(--theme-text-primary)]">
                          {t('usageTotalTokens')}
                        </th>
                        <th className="px-4 py-2.5 text-right text-xs font-semibold uppercase tracking-wider text-[var(--theme-text-primary)]">
                          {t('usagePriceColumn')}
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--theme-border-secondary)]">
                      {byModel.map((item) => (
                        <tr key={item.modelId} className="hover:bg-[var(--theme-bg-secondary)]/40">
                          <td className="px-4 py-2.5 text-sm font-medium text-[var(--theme-text-primary)]">
                            {item.modelId}
                          </td>
                          <td className="px-4 py-2.5 text-right font-mono text-sm text-[var(--theme-text-secondary)]">
                            {item.totalRequests.toLocaleString()}
                          </td>
                          <td className="px-4 py-2.5 text-right font-mono text-sm text-[var(--theme-text-secondary)]">
                            {item.totalPromptTokens.toLocaleString()}
                          </td>
                          <td className="px-4 py-2.5 text-right font-mono text-sm text-[var(--theme-text-secondary)]">
                            {item.totalCachedPromptTokens.toLocaleString()}
                          </td>
                          <td className="px-4 py-2.5 text-right font-mono text-sm text-[var(--theme-text-secondary)]">
                            {item.totalCompletionTokens.toLocaleString()}
                          </td>
                          <td className="px-4 py-2.5 text-right font-mono text-sm font-medium text-[var(--theme-text-primary)]">
                            {item.totalTokens.toLocaleString()}
                          </td>
                          <td className="px-4 py-2.5 text-right font-mono text-sm font-medium text-[var(--theme-text-primary)]">
                            <PriceValue
                              amount={item.estimatedCostUsd}
                              pricedRequests={item.estimatedCostPricedRequests}
                              unavailableRequests={item.estimatedCostUnavailableRequests}
                              language={language}
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <p className="mt-3 text-xs text-[var(--theme-text-tertiary)]">{t('usagePricingNote')}</p>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
