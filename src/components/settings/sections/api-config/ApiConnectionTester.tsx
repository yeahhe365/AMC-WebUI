import React from 'react';
import { Activity, CheckCircle2, Info, Loader2, XCircle } from 'lucide-react';
import { useI18n } from '@/contexts/I18nContext';
import { Select } from '@/components/shared/Select';
import { type ModelOption } from '@/types';
import { formatLatency, getLatencyBadgeStyles, type LatencyGrade } from '@/utils/thirdPartyDiagnostics';

interface ApiConnectionTesterProps {
  onTest: () => void;
  testStatus: 'idle' | 'testing' | 'success' | 'error';
  testMessage: string | null;
  isTestDisabled: boolean;
  availableModels?: ModelOption[];
  testModelId?: string;
  onModelChange?: (id: string) => void;
  testModelSelectId?: string;
  latencyMs?: number | null;
  latencyGrade?: LatencyGrade | null;
  diagnosticTip?: string | null;
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
  latencyMs,
  latencyGrade,
  diagnosticTip,
}) => {
  const { t } = useI18n();
  const badgeStyles = latencyGrade ? getLatencyBadgeStyles(latencyGrade) : null;

  const gradeLabel =
    latencyGrade === 'fast'
      ? t('apiConfigLatencyFast')
      : latencyGrade === 'normal'
        ? t('apiConfigLatencyNormal')
        : latencyGrade === 'slow'
          ? t('apiConfigLatencySlow')
          : null;

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
        <div className="flex flex-wrap items-center justify-between gap-2 p-2.5 rounded-lg bg-[var(--theme-bg-success)] border border-[var(--theme-text-success)]/25 text-[var(--theme-text-success)] text-sm animate-in fade-in slide-in-from-top-1">
          <div className="flex items-center gap-2">
            <CheckCircle2 size={16} className="flex-shrink-0" />
            <span className="font-medium">{t('apiConfigTestSuccess')}</span>
          </div>
          {latencyMs != null && (
            <div
              className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-xs font-medium ${
                badgeStyles?.badge || 'bg-black/5 dark:bg-white/5 border border-current/20'
              }`}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${badgeStyles?.dot || 'bg-current'}`} />
              <span>{formatLatency(latencyMs)}</span>
              {gradeLabel && <span className="opacity-85 font-normal">({gradeLabel})</span>}
            </div>
          )}
        </div>
      )}
      {testStatus === 'error' && (
        <div className="flex flex-col gap-2 p-2.5 rounded-lg bg-[var(--theme-bg-danger)] border border-[var(--theme-text-danger)]/25 text-[var(--theme-text-danger)] text-sm animate-in fade-in slide-in-from-top-1">
          <div className="flex items-start gap-2">
            <XCircle size={16} className="flex-shrink-0 mt-0.5" />
            <div className="flex flex-col min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium">{t('apiConfigTestFailed')}</span>
                {latencyMs != null && latencyMs > 0 && (
                  <span className="text-xs opacity-75 font-mono">{formatLatency(latencyMs)}</span>
                )}
              </div>
              {testMessage && <span className="text-xs opacity-90 break-all mt-0.5">{testMessage}</span>}
            </div>
          </div>
          {diagnosticTip && (
            <div className="flex items-start gap-1.5 mt-1 pt-1.5 border-t border-[var(--theme-text-danger)]/15 text-xs text-[var(--theme-text-danger)]/90">
              <Info size={14} className="flex-shrink-0 mt-0.5" />
              <div>
                <span className="font-medium mr-1">{t('apiConfigDiagnosticTipLabel')}</span>
                <span>{diagnosticTip}</span>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
