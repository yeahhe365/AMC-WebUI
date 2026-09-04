import React from 'react';
import { Activity, CheckCircle2, Loader2, XCircle } from 'lucide-react';
import { useI18n } from '@/contexts/I18nContext';
import { Select } from '@/components/shared/Select';
import { type ModelOption } from '@/types';

interface ApiConnectionTesterProps {
  onTest: () => void;
  testStatus: 'idle' | 'testing' | 'success' | 'error';
  testMessage: string | null;
  isTestDisabled: boolean;
  availableModels?: ModelOption[];
  testModelId?: string;
  onModelChange?: (id: string) => void;
  testModelSelectId?: string;
}

export const ApiConnectionTester: React.FC<ApiConnectionTesterProps> = ({
  onTest,
  testStatus,
  testMessage,
  isTestDisabled,
  availableModels,
  testModelId,
  onModelChange,
  testModelSelectId = 'api-test-model',
}) => {
  const { t } = useI18n();
  return (
    <div className="pt-2 flex flex-col gap-2">
      <div className="flex items-center gap-2">
        {availableModels && availableModels.length > 0 && onModelChange && testModelId && (
          <div className="flex-grow">
            <Select
              id={testModelSelectId}
              label={t('settingsApiTestModel')}
              layout="horizontal"
              value={testModelId}
              onChange={(e) => onModelChange(e.target.value)}
              labelContent={
                <span className="text-xs font-semibold uppercase tracking-wider text-[var(--theme-text-secondary)]">
                  {t('settingsApiTestModel')}
                </span>
              }
              className="mb-0"
            >
              {availableModels.map((model) => (
                <option key={model.id} value={model.id}>
                  {model.name}
                </option>
              ))}
            </Select>
          </div>
        )}

        <button
          type="button"
          onClick={onTest}
          disabled={isTestDisabled}
          className={`flex-shrink-0 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium border transition-all h-[42px] ${
            testStatus === 'testing'
              ? 'bg-[var(--theme-bg-tertiary)] border-transparent cursor-wait'
              : 'bg-transparent border-[var(--theme-border-secondary)] hover:bg-[var(--theme-bg-tertiary)] hover:border-[var(--theme-border-focus)] text-[var(--theme-text-primary)]'
          } disabled:opacity-50 disabled:cursor-not-allowed`}
        >
          {testStatus === 'testing' ? (
            <Loader2 size={16} className="animate-spin" />
          ) : (
            <Activity size={16} strokeWidth={1.5} />
          )}
          <span>{testStatus === 'testing' ? t('apiConfigTesting') : t('apiConfigTestConnection')}</span>
        </button>
      </div>

      {testStatus === 'success' && (
        <div className="flex items-center gap-2 p-2 rounded-lg bg-[var(--theme-bg-success)] border border-[var(--theme-text-success)]/25 text-[var(--theme-text-success)] text-sm animate-in fade-in slide-in-from-top-1">
          <CheckCircle2 size={16} />
          <span>{t('apiConfigTestSuccess')}</span>
        </div>
      )}
      {testStatus === 'error' && (
        <div className="flex items-start gap-2 p-2 rounded-lg bg-[var(--theme-bg-danger)] border border-[var(--theme-text-danger)]/25 text-[var(--theme-text-danger)] text-sm animate-in fade-in slide-in-from-top-1">
          <XCircle size={16} className="flex-shrink-0 mt-0.5" />
          <div className="flex flex-col">
            <span className="font-medium">{t('apiConfigTestFailed')}</span>
            {testMessage && <span className="text-xs opacity-90 break-all">{testMessage}</span>}
          </div>
        </div>
      )}
    </div>
  );
};
