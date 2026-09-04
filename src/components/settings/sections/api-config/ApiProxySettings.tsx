import React from 'react';
import { AlertCircle, ArrowRight, RotateCcw } from 'lucide-react';
import { Toggle } from '@/components/shared/Toggle';
import { SETTINGS_INPUT_CLASS } from '@/constants/formClasses';
import { DEFAULT_MODEL_ID } from '@/constants/modelConfiguration';
import { useI18n } from '@/contexts/I18nContext';
import {
  buildGeminiRequestPreviewUrl,
  DEFAULT_GEMINI_API_BASE_URL,
  DEFAULT_GEMINI_PROXY_URL,
} from '@/utils/apiProxyUrl';

interface ApiProxySettingsProps {
  useApiProxy: boolean;
  setUseApiProxy: (value: boolean) => void;
  apiProxyUrl: string | null;
  setApiProxyUrl: (value: string | null) => void;
}

export const ApiProxySettings: React.FC<ApiProxySettingsProps> = ({
  useApiProxy,
  setUseApiProxy,
  apiProxyUrl,
  setApiProxyUrl,
}) => {
  const { t } = useI18n();
  const inputBaseClasses =
    'w-full p-3 rounded-lg border transition-all duration-200 focus:ring-2 focus:ring-offset-0 text-sm custom-scrollbar font-mono';

  const handleResetProxy = () => {
    setApiProxyUrl(DEFAULT_GEMINI_PROXY_URL);
  };

  const currentBaseUrl = apiProxyUrl?.trim() || DEFAULT_GEMINI_API_BASE_URL;
  const previewUrl = buildGeminiRequestPreviewUrl(currentBaseUrl, DEFAULT_MODEL_ID, 'generateContent');

  return (
    <div className="space-y-3 pt-2" data-settings-item="api-proxy">
      <div className="flex items-center justify-between py-2">
        <div className="flex items-center gap-2">
          <label
            htmlFor="use-api-proxy-toggle"
            className="text-xs font-semibold uppercase tracking-wider text-[var(--theme-text-secondary)] cursor-pointer"
          >
            {t('settingsApiProxyLabel')}
          </label>
          {useApiProxy && (
            <button
              type="button"
              onClick={handleResetProxy}
              className="flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium transition-colors border text-[var(--theme-text-secondary)] hover:text-[var(--theme-text-primary)] hover:bg-[var(--theme-bg-tertiary)] border-transparent hover:border-[var(--theme-border-secondary)]"
              title={t('settingsApiProxyReset')}
            >
              <RotateCcw size={10} strokeWidth={1.5} />
              <span>{t('settingsApiProxyReset')}</span>
            </button>
          )}
        </div>
        <Toggle
          id="use-api-proxy-toggle"
          checked={useApiProxy}
          onChange={(enabled) => {
            setUseApiProxy(enabled);
          }}
        />
      </div>

      {useApiProxy && (
        <div className="transition-all duration-200 opacity-100">
          <input
            id="api-proxy-url-input"
            type="text"
            value={apiProxyUrl || ''}
            onChange={(e) => setApiProxyUrl(e.target.value)}
            className={`${inputBaseClasses} ${SETTINGS_INPUT_CLASS}`}
            placeholder={`e.g., ${DEFAULT_GEMINI_PROXY_URL}`}
            aria-label={t('settingsApiProxyUrlAria')}
          />

          <div className="mt-3 p-3 rounded-lg bg-[var(--theme-bg-tertiary)]/30 border border-[var(--theme-border-secondary)]">
            <div className="flex gap-2 text-xs text-[var(--theme-text-secondary)] mb-1.5">
              <AlertCircle size={14} className="flex-shrink-0 mt-0.5" strokeWidth={1.5} />
              <span>{t('settingsApiProxyPreview')}</span>
            </div>
            <div className="flex items-start gap-2 pl-5">
              <ArrowRight size={12} className="mt-1 text-[var(--theme-text-secondary)]" />
              <code className="font-mono text-xs text-[var(--theme-text-primary)] break-all leading-relaxed">
                {previewUrl}
              </code>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
