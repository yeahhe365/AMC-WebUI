import React from 'react';
import { CheckCircle2 } from 'lucide-react';
import { useI18n } from '@/contexts/I18nContext';

interface ConnectionChangeCardProps {
  connectionId: string;
  changed: string[];
}

/** Field names are data, not copy, so they stay in their wire form. */
export const ConnectionChangeCard: React.FC<ConnectionChangeCardProps> = ({ connectionId, changed }) => {
  const { t } = useI18n();

  return (
    <div
      data-testid={`assistant-change-${connectionId}`}
      className="rounded-lg border border-[var(--theme-border-secondary)] bg-[var(--theme-bg-secondary)] p-3 space-y-1.5"
    >
      <div className="flex items-center gap-2 text-xs font-semibold text-[var(--theme-text-primary)]">
        <CheckCircle2 size={14} className="text-[var(--theme-text-success)]" />
        <span>{t('assistantChangeApplied')}</span>
      </div>
      <div className="flex flex-wrap gap-1">
        {changed.map((field) => (
          <code
            key={field}
            className="px-1.5 py-0.5 rounded bg-[var(--theme-bg-tertiary)] text-[11px] text-[var(--theme-text-secondary)]"
          >
            {field}
          </code>
        ))}
      </div>
    </div>
  );
};
