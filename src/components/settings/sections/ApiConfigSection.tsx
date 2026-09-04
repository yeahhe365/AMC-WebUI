import React, { useState, useEffect, useRef } from 'react';
import { getErrorMessage } from '@/utils/errorMessage';
import { RadioTower } from 'lucide-react';
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
import { ThirdPartyApiSettingsPanel } from './api-config/ThirdPartyApiSettingsPanel';
import { FileStrategyControl } from './appearance/FileStrategyControl';

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
}) => {
  const { t } = useI18n();
  const [testStatus, setTestStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle');
  const [testMessage, setTestMessage] = useState<string | null>(null);
  const [testModelId, setTestModelId] = useState<string>(DEFAULT_LIVE_ARTIFACTS_MODEL_ID);
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
      setTestStatus('error');
      setTestMessage(t('apiConfigNoKeyProvided'));
      return;
    }

    if (!keyToTest) {
      setTestStatus('error');
      setTestMessage(t('apiConfigNoKeyAvailable'));
      return;
    }

    const keys = parseApiKeys(keyToTest);
    const firstKey = keys[0];

    if (!firstKey) {
      setTestStatus('error');
      setTestMessage(t('apiConfigInvalidKeyFormat'));
      return;
    }

    const effectiveUrl = useCustomApiConfig && useApiProxy && apiProxyUrl ? apiProxyUrl : null;

    setTestStatus('testing');
    setTestMessage(null);

    try {
      const ai = await getClient(firstKey, effectiveUrl);

      await ai.models.generateContent({
        model: testModelId || DEFAULT_LIVE_ARTIFACTS_MODEL_ID,
        contents: 'Hello',
      });

      setTestStatus('success');
    } catch (error) {
      setTestStatus('error');
      setTestMessage(getErrorMessage(error));
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
                setTestStatus('idle');
              }}
            />

            <ApiProxySettings
              useApiProxy={useApiProxy}
              setUseApiProxy={(nextUseApiProxy) => {
                setUseApiProxy(nextUseApiProxy);
                setTestStatus('idle');
              }}
              apiProxyUrl={apiProxyUrl}
              setApiProxyUrl={(nextApiProxyUrl) => {
                setApiProxyUrl(nextApiProxyUrl);
                setTestStatus('idle');
              }}
            />

            <div className="space-y-3 pt-2">
              <div className="rounded-lg border border-[var(--theme-border-secondary)] bg-[var(--theme-bg-tertiary)]/20 p-3 space-y-3">
                <div className="flex items-start gap-3">
                  <RadioTower
                    size={16}
                    className="mt-0.5 flex-shrink-0 text-[var(--theme-text-link)]"
                    strokeWidth={1.5}
                  />
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <p className="text-sm font-medium text-[var(--theme-text-primary)]">
                      {t('settingsLiveAutomaticTitle')}
                    </p>
                    <p className="text-xs leading-relaxed text-[var(--theme-text-secondary)]">
                      {t('settingsLiveAutomaticHelp')}
                    </p>
                    {useApiProxy && (
                      <p className="text-xs leading-relaxed text-[var(--theme-text-secondary)]">
                        {t('settingsLiveProxyCompatibilityHelp')}
                      </p>
                    )}
                  </div>
                </div>

                <div className="pt-2 border-t border-[var(--theme-border-secondary)]/40">
                  <ApiKeyInput
                    inputId="live-api-key-input"
                    label={t('settingsLiveApiKey')}
                    apiKey={settings.liveApiKey ?? null}
                    setApiKey={(nextKey) => onUpdate('liveApiKey', nextKey)}
                    placeholder={t('settingsLiveApiKeyPlaceholder')}
                    helpText={t('settingsLiveApiKeyHelp')}
                  />
                </div>
              </div>
            </div>

            <ApiConnectionTester
              onTest={handleTestConnection}
              testStatus={testStatus}
              testMessage={testMessage}
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

      <ThirdPartyApiSettingsPanel
        settings={settings}
        onUpdateSettings={(partial) => {
          (Object.entries(partial) as Array<[keyof AppSettings, AppSettings[keyof AppSettings]]>).forEach(
            ([key, value]) => {
              onUpdate(key, value);
            },
          );
        }}
      />

      <FileStrategyControl settings={settings} onUpdate={onUpdate} />
    </div>
  );
};
