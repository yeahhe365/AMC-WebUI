import React from 'react';
import { Coins } from 'lucide-react';
import type { TokenUsageStats } from '@/types/logging';
import { useI18n } from '@/contexts/I18nContext';

interface TokenUsageTabProps {
  tokenUsage: Map<string, TokenUsageStats>;
}

export const TokenUsageTab: React.FC<TokenUsageTabProps> = ({ tokenUsage }) => {
  const { t } = useI18n();
  const tokenUsageArray = Array.from(tokenUsage.entries())
    .map(([modelId, stats]) => ({
      modelId,
      input: stats.input,
      output: stats.output,
      total: stats.input + stats.output,
    }))
    .sort((a, b) => b.total - a.total);

  return (
    <div className="p-4 overflow-y-auto custom-scrollbar h-full">
      <h4 className="mb-3 flex items-center gap-2 text-sm font-semibold text-[var(--theme-text-primary)]">
        <Coins size={16} className="text-[var(--theme-text-tertiary)]" /> {t('logViewerTokenUsageTitle')}
      </h4>

      {tokenUsageArray.length === 0 ? (
        <div className="flex h-40 items-center justify-center text-sm text-[var(--theme-text-tertiary)]">
          {t('logViewerTokenUsageEmpty')}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-[var(--theme-border-secondary)]/60">
          <table className="min-w-full divide-y divide-[var(--theme-border-secondary)] bg-[var(--theme-bg-primary)]">
            <thead className="bg-[var(--theme-bg-tertiary)]">
              <tr>
                <th
                  scope="col"
                  className="px-6 py-3 text-left text-xs font-medium text-[var(--theme-text-tertiary)] uppercase tracking-wider"
                >
                  {t('usageModelColumn')}
                </th>
                <th
                  scope="col"
                  className="px-6 py-3 text-right text-xs font-medium text-[var(--theme-text-tertiary)] uppercase tracking-wider"
                >
                  {t('usagePromptTokens')}
                </th>
                <th
                  scope="col"
                  className="px-6 py-3 text-right text-xs font-medium text-[var(--theme-text-tertiary)] uppercase tracking-wider"
                >
                  {t('usageCompletionTokens')}
                </th>
                <th
                  scope="col"
                  className="px-6 py-3 text-right text-xs font-medium text-[var(--theme-text-primary)] uppercase tracking-wider"
                >
                  {t('usageTotalTokens')}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--theme-border-secondary)]">
              {tokenUsageArray.map((item) => (
                <tr key={item.modelId} className="hover:bg-[var(--theme-bg-input)] transition-colors">
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-[var(--theme-text-primary)]">
                    {item.modelId}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-right text-[var(--theme-text-secondary)] font-mono">
                    {item.input.toLocaleString()}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-right text-[var(--theme-text-secondary)] font-mono">
                    {item.output.toLocaleString()}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-right text-[var(--theme-text-primary)] font-mono font-medium">
                    {item.total.toLocaleString()}
                  </td>
                </tr>
              ))}
              <tr className="bg-[var(--theme-bg-tertiary)]/20 font-semibold">
                <td className="px-6 py-4 whitespace-nowrap text-sm text-[var(--theme-text-primary)]">
                  {t('logViewerTotalRow')}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-right text-[var(--theme-text-primary)] font-mono">
                  {tokenUsageArray.reduce((sum, item) => sum + item.input, 0).toLocaleString()}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-right text-[var(--theme-text-primary)] font-mono">
                  {tokenUsageArray.reduce((sum, item) => sum + item.output, 0).toLocaleString()}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-right text-[var(--theme-text-primary)] font-mono">
                  {tokenUsageArray.reduce((sum, item) => sum + item.total, 0).toLocaleString()}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
