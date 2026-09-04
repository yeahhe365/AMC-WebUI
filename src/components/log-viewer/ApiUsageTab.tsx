import React from 'react';
import { KeyRound } from 'lucide-react';

import { useI18n } from '@/contexts/I18nContext';
import { type AppSettings, type ChatSettings } from '@/types';
import { parseApiKeys } from '@/utils/apiKeySelection';
import { maskApiKeyForStorage } from '@/services/logUsageTracker';

import { ObfuscatedApiKey } from './ObfuscatedApiKey';

interface ApiUsageTabProps {
  apiKeyUsage: Map<string, number>;
  appSettings: AppSettings;
  currentChatSettings: ChatSettings;
}

export const ApiUsageTab: React.FC<ApiUsageTabProps> = ({ apiKeyUsage, appSettings, currentChatSettings }) => {
  const { t } = useI18n();
  const allApiKeys = parseApiKeys(appSettings.apiKey).map(maskApiKeyForStorage);
  const lockedKeyMasked = currentChatSettings.lockedApiKey
    ? maskApiKeyForStorage(currentChatSettings.lockedApiKey)
    : null;

  const displayApiKeyUsage = new Map<string, number>();

  allApiKeys.forEach((key) => displayApiKeyUsage.set(key, apiKeyUsage.get(key) || 0));

  apiKeyUsage.forEach((count, key) => {
    if (!displayApiKeyUsage.has(key)) {
      displayApiKeyUsage.set(key, count);
    }
  });

  const totalApiUsage = Array.from(displayApiKeyUsage.values()).reduce((sum, count) => sum + count, 0);
  const usageRows = Array.from(displayApiKeyUsage.entries()).sort(([, a], [, b]) => b - a);

  return (
    <div className="custom-scrollbar h-full overflow-y-auto p-4">
      <h4 className="mb-3 flex items-center gap-2 text-sm font-semibold text-[var(--theme-text-primary)]">
        <KeyRound size={16} className="text-[var(--theme-text-tertiary)]" /> {t('logViewerApiUsageTitle')}
      </h4>
      <ul className="divide-y divide-[var(--theme-border-secondary)]/40 rounded-xl border border-[var(--theme-border-secondary)]/60 bg-[var(--theme-bg-secondary)]/35">
        {usageRows.map(([key, count], index) => {
          const percentage = totalApiUsage > 0 ? (count / totalApiUsage) * 100 : 0;
          const isActive = lockedKeyMasked === key;
          return (
            <li key={key} className="flex items-center gap-3 px-3 py-2.5">
              <span className="w-6 flex-shrink-0 font-mono text-xs text-[var(--theme-text-tertiary)]">
                #{index + 1}
              </span>
              <div className="min-w-0 flex-1">
                <ObfuscatedApiKey apiKey={key} />
              </div>
              {isActive ? (
                <span className="flex-shrink-0 text-xs font-medium text-[var(--theme-text-primary)]">
                  {t('logViewerActive')}
                </span>
              ) : null}
              <span className="flex-shrink-0 text-sm font-medium tabular-nums text-[var(--theme-text-primary)]">
                {count}
              </span>
              <span className="w-10 flex-shrink-0 text-right text-xs tabular-nums text-[var(--theme-text-tertiary)]">
                {percentage.toFixed(0)}%
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
};
