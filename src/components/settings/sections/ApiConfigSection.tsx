import React, { useState, useEffect, useRef } from 'react';
import { getErrorMessage } from '@/utils/errorMessage';
import { ChevronDown, ChevronRight, Server } from 'lucide-react';
import type { AppSettings } from '@/types';
import { useI18n } from '@/contexts/I18nContext';
import { DEFAULT_LIVE_ARTIFACTS_MODEL_ID } from '@/constants/modelConfiguration';
import { CONNECTION_TEST_MODELS } from '@/constants/settingsModelOptions';
import { getClient } from '@/services/api/apiClient';
import {
  isServerManagedApiEnabledForProxyRequests,
  parseApiKeys,
  SERVER_MANAGED_API_KEY,
} from '@/utils/apiKeySelection';
import { ApiConfigToggle } from './api-config/ApiConfigToggle';
import { ApiKeyInput } from './api-config/ApiKeyInput';
import { ApiProxySettings } from './api-config/ApiProxySettings';
import { ApiConnectionTester } from './api-config/ApiConnectionTester';
import { useSettingsUiStore } from '@/stores/settingsUiStore';
import { useProviderUiStore } from '@/stores/providerUiStore';
import { getLatencyGrade } from '@/utils/thirdPartyDiagnostics';

interface ApiConfigSectionProps {
  useCustomApiConfig: boolean;
  setUseCustomApiConfig: (value: boolean) => void;
  apiKey: string | null;
  setApiKey: (value: string | null) => void;
  apiProxyUrl: string | null;
  setApiProxyUrl: (value: string | null) => void;
  useApiProxy: boolean;
  setUseApiProxy: (value: boolean) => void;
  serverManagedApi: boolean;
  settings: AppSettings;
  onUpdate: <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => void;
  hideProviderRedirect?: boolean;
}

export const ApiConfigSection: React.FC<ApiConfigSectionProps> = ({
  useCustomApiConfig,
  setUseCustomApiConfig,
  apiKey,
  setApiKey,
  apiProxyUrl,
  setApiProxyUrl,
  useApiProxy,
  setUseApiProxy,
  serverManagedApi,
  settings,
  onUpdate,
  hideProviderRedirect = false,
}) => {
  const { t } = useI18n();
  const testModelId = useProviderUiStore((s) => s.geminiTestModelId);
  const setTestModelId = useProviderUiStore((s) => s.setGeminiTestModelId);
  const geminiTestResult = useProviderUiStore((s) => s.geminiTestResult);
  const setGeminiTestResult = useProviderUiStore((s) => s.setGeminiTestResult);

  const [isTesting, setIsTesting] = useState(false);
  const testStatus = isTesting ? 'testing' : (geminiTestResult?.status ?? 'idle');
  const testMessage = isTesting ? null : (geminiTestResult?.message ?? null);
  const testLatencyMs = isTesting ? null : (geminiTestResult?.latencyMs ?? null);
  const testGrade = isTesting ? null : (geminiTestResult?.grade ?? null);

  const [allowOverflow, setAllowOverflow] = useState(useCustomApiConfig);
  const overflowTimerRef = useRef<number | null>(null);
  const viteEnv = (import.meta as ImportMeta & { env?: { VITE_GEMINI_API_KEY?: string } }).env;

  const hasEnvKey = !!viteEnv?.VITE_GEMINI_API_KEY;
  const canUseServerManagedTestKey = isServerManagedApiEnabledForProxyRequests({
    serverManagedApi,
    useCustomApiConfig,
    useApiProxy,
    apiProxyUrl,
  });

  const [showDedicatedLiveKey, setShowDedicatedLiveKey] = useState(() =>
    Boolean(settings.liveApiKey && settings.liveApiKey.trim().length > 0),
  );

  useEffect(() => {
    if (settings.liveApiKey && settings.liveApiKey.trim().length > 0) {
      setShowDedicatedLiveKey(true);
    }
  }, [settings.liveApiKey]);

  useEffect(() => {
    return () => {
      if (overflowTimerRef.current !== null) {
        window.clearTimeout(overflowTimerRef.current);
      }
    };
  }, []);

  const handleUseCustomApiConfigChange = (value: boolean) => {
    if (overflowTimerRef.current !== null) {
      window.clearTimeout(overflowTimerRef.current);
      overflowTimerRef.current = null;
    }

    setUseCustomApiConfig(value);

    if (value) {
      setAllowOverflow(false);
      overflowTimerRef.current = window.setTimeout(() => {
        setAllowOverflow(true);
        overflowTimerRef.current = null;
      }, 300);
      return;
    }

    setAllowOverflow(false);
  };

  const handleTestConnection = async () => {
    const resolveKeyToTest = (): string | null => {
      if (apiKey) return apiKey;
      if (!useCustomApiConfig && hasEnvKey) {
        return viteEnv?.VITE_GEMINI_API_KEY || null;
      }
      if (canUseServerManagedTestKey) return SERVER_MANAGED_API_KEY;
      return null;
    };

    const keyToTest = resolveKeyToTest();

    if (!keyToTest && useCustomApiConfig && !canUseServerManagedTestKey) {
      setGeminiTestResult({
        status: 'error',
        latencyMs: null,
        grade: 'error',
        message: t('apiConfigNoKeyProvided'),
      });
      return;
    }

    if (!keyToTest) {
      setGeminiTestResult({
        status: 'error',
        latencyMs: null,
        grade: 'error',
        message: t('apiConfigNoKeyAvailable'),
      });
      return;
    }

    const keys = parseApiKeys(keyToTest);
    const firstKey = keys[0];

    if (!firstKey) {
      setGeminiTestResult({
        status: 'error',
        latencyMs: null,
        grade: 'error',
        message: t('apiConfigInvalidKeyFormat'),
      });
      return;
    }

    const effectiveUrl = useCustomApiConfig && useApiProxy && apiProxyUrl ? apiProxyUrl : null;

    setIsTesting(true);

    const startTime = performance.now();
    try {
      const ai = await getClient(firstKey, effectiveUrl);

      await ai.models.generateContent({
        model: testModelId || DEFAULT_LIVE_ARTIFACTS_MODEL_ID,
        contents: 'Hello',
      });

      const latency = Math.round(performance.now() - startTime);
      setGeminiTestResult({
        status: 'success',
        latencyMs: latency,
        grade: getLatencyGrade(latency, true),
        message: null,
      });
    } catch (error) {
      const latency = Math.round(performance.now() - startTime);
      setGeminiTestResult({
        status: 'error',
        latencyMs: latency,
        grade: 'error',
        message: getErrorMessage(error),
      });
    } finally {
      setIsTesting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="space-y-3 pb-4" data-settings-item="api-config">
        <ApiConfigToggle
          useCustomApiConfig={useCustomApiConfig}
          setUseCustomApiConfig={handleUseCustomApiConfigChange}
          hasEnvKey={hasEnvKey}
        />

        <div
          className={`transition-all duration-300 ease-in-out ${useCustomApiConfig ? 'opacity-100 max-h-[1000px] pt-4' : 'opacity-50 max-h-0'} ${allowOverflow ? 'overflow-visible' : 'overflow-hidden'}`}
        >
          <div className="space-y-5">
            <ApiKeyInput
              inputId="gemini-api-key-input"
              apiKey={apiKey}
              setApiKey={(nextApiKey) => {
                setApiKey(nextApiKey);
                setGeminiTestResult(null);
              }}
            />

            <ApiProxySettings
              useApiProxy={useApiProxy}
              setUseApiProxy={(nextUseApiProxy) => {
                setUseApiProxy(nextUseApiProxy);
                setGeminiTestResult(null);
              }}
              apiProxyUrl={apiProxyUrl}
              setApiProxyUrl={(nextApiProxyUrl) => {
                setApiProxyUrl(nextApiProxyUrl);
                setGeminiTestResult(null);
              }}
            />

            <div className="pt-1">
              <button
                type="button"
                onClick={() => setShowDedicatedLiveKey((prev) => !prev)}
                className="inline-flex items-center gap-1.5 text-xs text-[var(--theme-text-secondary)] hover:text-[var(--theme-text-primary)] transition-colors cursor-pointer select-none focus:outline-none py-0.5"
              >
                {showDedicatedLiveKey ? (
                  <ChevronDown size={14} className="text-[var(--theme-text-secondary)] flex-shrink-0" />
                ) : (
                  <ChevronRight size={14} className="text-[var(--theme-text-secondary)] flex-shrink-0" />
                )}
                <span className="font-medium">{t('settingsLiveApiKey')}</span>
                {settings.liveApiKey ? (
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 flex-shrink-0" />
                ) : (
                  <span className="text-[10px] text-[var(--theme-text-secondary)]/60">
                    ({t('settingsLiveDefaultKeyNotice')})
                  </span>
                )}
              </button>

              {showDedicatedLiveKey && (
                <div className="mt-2.5 pl-3.5 border-l-2 border-[var(--theme-border-secondary)]/40 space-y-2">
                  <ApiKeyInput
                    inputId="live-api-key-input"
                    label={t('settingsLiveApiKey')}
                    apiKey={settings.liveApiKey ?? null}
                    setApiKey={(nextKey) => onUpdate('liveApiKey', nextKey)}
                    placeholder={t('settingsLiveApiKeyPlaceholder')}
                    helpText={t('settingsLiveApiKeyHelp')}
                  />
                  {settings.liveApiKey && (
                    <div className="flex justify-end">
                      <button
                        type="button"
                        onClick={() => onUpdate('liveApiKey', null)}
                        className="text-xs text-[var(--theme-text-secondary)] hover:text-[var(--theme-text-danger)] transition-colors hover:underline"
                      >
                        {t('delete')}
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>

            <ApiConnectionTester
              onTest={handleTestConnection}
              testStatus={testStatus}
              testMessage={testMessage}
              latencyMs={testLatencyMs}
              latencyGrade={testGrade}
              isTestDisabled={
                testStatus === 'testing' || (!apiKey && useCustomApiConfig && !canUseServerManagedTestKey)
              }
              availableModels={CONNECTION_TEST_MODELS}
              testModelId={testModelId}
              onModelChange={setTestModelId}
            />
          </div>
        </div>
      </div>

      <div
        className={
          hideProviderRedirect
            ? 'hidden'
            : 'rounded-xl border border-[var(--theme-border-secondary)] bg-[var(--theme-bg-surface-secondary)]/50 p-4 transition-all duration-200'
        }
        data-settings-item="api-provider"
      >
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-start sm:items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--theme-accent-primary)]/10 text-[var(--theme-accent-primary)]">
              <Server size={18} />
            </div>
            <div>
              <div className="text-sm font-medium text-[var(--theme-text-primary)]">{t('settingsTabProviders')}</div>
              <div className="text-xs text-[var(--theme-text-secondary)] mt-0.5">{t('apiThirdPartyRedirectDesc')}</div>
            </div>
          </div>
          <button
            type="button"
            onClick={() => useSettingsUiStore.getState().setActiveTab('providers')}
            className="self-start sm:self-auto inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-[var(--theme-accent-primary)] hover:bg-[var(--theme-accent-primary)]/10 border border-[var(--theme-accent-primary)]/30 transition-colors"
          >
            <span>{t('settingsGoToProviders')}</span>
            <ChevronRight size={14} />
          </button>
        </div>
      </div>
    </div>
  );
};
