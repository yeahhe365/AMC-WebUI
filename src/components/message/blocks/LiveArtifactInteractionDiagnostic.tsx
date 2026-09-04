import React, { useCallback } from 'react';
import { AlertTriangle, RefreshCcw, ChevronDown, ChevronUp } from 'lucide-react';
import { useI18n } from '@/contexts/I18nContext';
import type { LiveArtifactFollowupPayload } from '@/utils/live-artifacts/liveArtifactFollowup';
import type {
  LiveArtifactInteractionDiagnosis,
  LiveArtifactInteractionParseError,
} from '@/utils/live-artifacts/liveArtifactInteraction';
import { interpolate } from '@/i18n/interpolate';

interface LiveArtifactInteractionDiagnosticProps {
  diagnosis: LiveArtifactInteractionDiagnosis;
  rawJson: string;
  baseFontSize?: number;
  onFollowUp?: (payload: LiveArtifactFollowupPayload) => void;
}

const ERROR_ICON_COLOR = 'var(--theme-text-danger)';

export const LiveArtifactInteractionDiagnostic: React.FC<LiveArtifactInteractionDiagnosticProps> = ({
  diagnosis,
  rawJson,
  baseFontSize,
  onFollowUp,
}) => {
  const { t } = useI18n();
  const [showRawJson, setShowRawJson] = React.useState(false);
  const [isRetrying, setIsRetrying] = React.useState(false);

  const handleRetry = useCallback(() => {
    if (isRetrying || !onFollowUp) return;
    setIsRetrying(true);

    const reasons = diagnosis.errors.map((e) => e.message).join('；');
    const payload: LiveArtifactFollowupPayload = {
      instruction: interpolate(t('liveArtifactInteractionRetryPrompt'), { reasons }),
      title: t('liveArtifactInteractionInvalidTitle'),
      source: 'amc-live-artifact-interaction:diagnostic',
      state: { errors: diagnosis.errors.map((e) => e.code) },
    };
    onFollowUp(payload);
  }, [diagnosis.errors, isRetrying, onFollowUp, t]);

  return (
    <div
      data-live-artifact-interaction-diagnostic="true"
      className="my-3 rounded-lg border border-[var(--theme-border-primary)] bg-[var(--theme-bg-model-message)] p-4 shadow-sm"
      style={baseFontSize ? { fontSize: `${baseFontSize}px` } : undefined}
    >
      <div className="flex items-start gap-3">
        <AlertTriangle size={20} style={{ color: ERROR_ICON_COLOR, flexShrink: 0, marginTop: '0.15em' }} />
        <div className="min-w-0 flex-1">
          <h3 className="text-[1em] font-semibold" style={{ color: 'var(--theme-text-danger)' }}>
            {t('liveArtifactInteractionInvalidTitle')}
          </h3>

          {diagnosis.errors.length > 0 && (
            <div className="mt-2">
              <p className="text-[0.875em] font-medium text-[var(--theme-text-primary)]">
                {t('liveArtifactInteractionInvalidReasonLead')}
              </p>
              <ul className="mt-1 list-disc pl-4 space-y-0.5">
                {diagnosis.errors.map((error, index) => (
                  <li
                    key={`err-${index}`}
                    className="text-[0.875em] leading-relaxed"
                    style={{ color: 'var(--theme-text-primary)' }}
                  >
                    {renderError(error)}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {diagnosis.repairs.length > 0 && (
            <div className="mt-2">
              <p className="text-[0.8em] italic" style={{ color: 'var(--theme-text-secondary)' }}>
                {t('liveArtifactInteractionRepairsApplied')}
              </p>
              <ul className="mt-0.5 list-disc pl-4 space-y-0.5">
                {diagnosis.repairs.map((repair, index) => (
                  <li
                    key={`rep-${index}`}
                    className="text-[0.8em] leading-relaxed"
                    style={{ color: 'var(--theme-text-secondary)' }}
                  >
                    {repair.message}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>

      <div className="mt-3">
        <button
          type="button"
          onClick={() => setShowRawJson(!showRawJson)}
          className="flex items-center gap-1 text-[0.8em] font-medium transition-colors"
          style={{ color: 'var(--theme-text-tertiary)' }}
        >
          {showRawJson ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          <span>{t('liveArtifactInteractionRawJson')}</span>
        </button>
        {showRawJson && (
          <pre
            className="mt-1 rounded-md border border-[var(--theme-border-secondary)] bg-[var(--theme-bg-code-block)] p-2 font-mono text-[0.75em] leading-relaxed whitespace-pre-wrap max-h-40 overflow-auto"
            style={{ color: 'var(--theme-text-primary)' }}
          >
            {rawJson.length > 200 ? `${rawJson.slice(0, 200)}...` : rawJson}
          </pre>
        )}
      </div>

      {onFollowUp && diagnosis.errors.length > 0 && (
        <div className="mt-3 flex justify-start">
          <button
            type="button"
            onClick={handleRetry}
            disabled={isRetrying}
            className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[0.85em] font-medium transition-all duration-150 disabled:opacity-50"
            style={{
              backgroundColor: 'var(--theme-bg-accent)',
              color: 'var(--theme-text-accent)',
            }}
          >
            <RefreshCcw size={14} className={isRetrying ? 'animate-spin' : ''} />
            <span>{t('liveArtifactInteractionRetry')}</span>
          </button>
        </div>
      )}
    </div>
  );
};

function renderError(error: LiveArtifactInteractionParseError): string {
  return error.message;
}
