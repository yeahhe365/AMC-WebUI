import React, { useState, useMemo, useRef } from 'react';
import { SlidersHorizontal, ArrowUpRight } from 'lucide-react';
import type { AppSettings, ModelOption } from '@/types';
import { useI18n } from '@/contexts/I18nContext';
import { getDefaultModelOptions } from '@/utils/model/defaultModelOptions';
import { useModelPreferencesStore } from '@/stores/modelPreferencesStore';
import { useProviderUiStore } from '@/stores/providerUiStore';
import { useSettingsUiStore } from '@/stores/settingsUiStore';
import { ApiConfigSection } from '@/components/settings/sections/ApiConfigSection';
import { ProviderModelListSection } from './models/ProviderModelListSection';
import { SafetySection } from '@/components/settings/sections/SafetySection';
import { ConfirmationModal } from '@/components/modals/ConfirmationModal';
import { getClient } from '@/services/api/apiClient';
import {
  isServerManagedApiEnabledForProxyRequests,
  parseApiKeys,
  SERVER_MANAGED_API_KEY,
} from '@/utils/api/apiKeySelection';
import {
  formatLatency,
  getLatencyGrade,
  type ConnectionHealthProbeResult,
} from '@/utils/third-party/thirdPartyDiagnostics';
import { getErrorMessage } from '@/utils/errorMessage';
import { toastError, toastSuccess, toastWarning } from '@/stores/toastStore';

const EMPTY_PROBE_RESULTS: Record<string, ConnectionHealthProbeResult> = {};

export interface GeminiProviderDetailProps {
  settings: AppSettings;
  onUpdateSettings: (updates: Partial<AppSettings>) => void;
  onCloseModal?: () => void;
}

export const GeminiProviderDetail: React.FC<GeminiProviderDetailProps> = ({
  settings,
  onUpdateSettings,
  onCloseModal: _onCloseModal,
}) => {
  const { t } = useI18n();

  // Models from store or default
  const customModels = useModelPreferencesStore((state) => state.customModels);
  const effectiveModels = useMemo(
    () => (customModels && customModels.length > 0 ? customModels : getDefaultModelOptions()),
    [customModels],
  );

  // Model probe results and probing state
  const modelProbeResults = useProviderUiStore(
    (state) => state.modelProbeResultsByConnection['gemini'] ?? EMPTY_PROBE_RESULTS,
  );
  const [probingModelIds, setProbingModelIds] = useState<Set<string>>(new Set());
  const [isCheckingBatch, setIsCheckingBatch] = useState(false);
  const [batchProgress, setBatchProgress] = useState<{ completed: number; total: number } | null>(null);
  const [isResetConfirmOpen, setIsResetConfirmOpen] = useState(false);
  const batchAbortControllerRef = useRef<AbortController | null>(null);

  const handleUpdateModels = (updated: ModelOption[]) => {
    useModelPreferencesStore.getState().setCustomModels(updated);
  };

  const handleConfirmResetModels = () => {
    const defaults = getDefaultModelOptions();
    handleUpdateModels(defaults);
    toastSuccess(t('thirdPartyResetDefaultModelsSuccess') || '已恢复官方预设模型列表');
    setIsResetConfirmOpen(false);
  };

  const handleSingleModelProbe = async (modelId: string) => {
    if (probingModelIds.has(modelId)) return;
    setProbingModelIds((prev) => new Set(prev).add(modelId));

    const startTime = performance.now();
    try {
      const canUseServerManaged = isServerManagedApiEnabledForProxyRequests({
        serverManagedApi: settings.serverManagedApi ?? false,
        useCustomApiConfig: settings.useCustomApiConfig,
        useApiProxy: settings.useApiProxy ?? false,
        apiProxyUrl: settings.apiProxyUrl,
      });

      const keyToTest = settings.apiKey || '';
      const firstKey = parseApiKeys(keyToTest)[0];
      if (!firstKey && settings.useCustomApiConfig && !canUseServerManaged) {
        throw new Error(t('apiConfigNoKeyProvided') || 'No API key provided');
      }

      const effectiveUrl =
        settings.useCustomApiConfig && settings.useApiProxy && settings.apiProxyUrl ? settings.apiProxyUrl : null;

      const effectiveKey = firstKey || (canUseServerManaged ? SERVER_MANAGED_API_KEY : 'default');
      const ai = await getClient(effectiveKey, effectiveUrl);
      await ai.models.generateContent({
        model: modelId,
        contents: 'Hello',
      });

      const latency = Math.round(performance.now() - startTime);
      const probeResult: ConnectionHealthProbeResult = {
        connectionId: 'gemini',
        modelId,
        status: 'success',
        latencyMs: latency,
        grade: getLatencyGrade(latency, true),
        timestamp: Date.now(),
      };
      useProviderUiStore.getState().setModelProbeResult('gemini', modelId, probeResult);
      toastSuccess(t('thirdPartyToastSingleProbeSuccess', { modelId, latency: formatLatency(latency) }));
    } catch (probeError) {
      const latency = Math.round(performance.now() - startTime);
      const probeResult: ConnectionHealthProbeResult = {
        connectionId: 'gemini',
        modelId,
        status: 'error',
        latencyMs: latency,
        grade: 'error',
        errorMessage: getErrorMessage(probeError),
        timestamp: Date.now(),
      };
      useProviderUiStore.getState().setModelProbeResult('gemini', modelId, probeResult);
      toastError(t('thirdPartyToastSingleProbeFailed', { modelId, error: getErrorMessage(probeError) }));
    } finally {
      setProbingModelIds((prev) => {
        const next = new Set(prev);
        next.delete(modelId);
        return next;
      });
    }
  };

  const handleBatchHealthCheck = async (targetModels: ModelOption[]) => {
    if (targetModels.length === 0) return;
    const controller = new AbortController();
    batchAbortControllerRef.current = controller;
    setIsCheckingBatch(true);
    setBatchProgress({ completed: 0, total: targetModels.length });

    try {
      let completed = 0;
      for (const model of targetModels) {
        if (controller.signal.aborted) break;
        await handleSingleModelProbe(model.id);
        completed++;
        setBatchProgress({ completed, total: targetModels.length });
      }
      if (!controller.signal.aborted) {
        toastSuccess(t('thirdPartyToastBatchProbeComplete') || 'Batch testing completed');
      }
    } catch (batchError) {
      toastError(getErrorMessage(batchError));
    } finally {
      setIsCheckingBatch(false);
      setBatchProgress(null);
      batchAbortControllerRef.current = null;
    }
  };

  const handleStopBatchHealthCheck = () => {
    batchAbortControllerRef.current?.abort();
    setIsCheckingBatch(false);
    setBatchProgress(null);
    toastWarning(t('thirdPartyToastProbeAborted') || 'Testing aborted');
  };

  return (
    <div className="min-w-0 bg-[var(--theme-bg-primary)]">
      <div className="space-y-6">
        <div className="flex items-center justify-between gap-3 px-4 py-2.5 rounded-xl border border-[var(--theme-border-secondary)]/40 bg-[var(--theme-bg-secondary)]/25 text-xs text-[var(--theme-text-secondary)]">
          <div className="flex items-center gap-2 min-w-0">
            <SlidersHorizontal size={14} className="text-[var(--theme-text-link)] shrink-0" />
            <span className="truncate">{t('geminiGenerationSettingsHint')}</span>
          </div>
          <button
            type="button"
            onClick={() => useSettingsUiStore.getState().setActiveTab('models')}
            className="shrink-0 flex items-center gap-1 font-medium text-[var(--theme-text-link)] hover:underline hover:text-[var(--theme-text-primary)] transition-colors cursor-pointer"
          >
            <span>{t('settingsTabModels')}</span>
            <ArrowUpRight size={13} />
          </button>
        </div>

        <div className="rounded-2xl border border-[var(--theme-border-secondary)]/40 bg-[var(--theme-bg-secondary)]/10 p-4">
          <ApiConfigSection
            useCustomApiConfig={settings.useCustomApiConfig}
            setUseCustomApiConfig={(val) => onUpdateSettings({ useCustomApiConfig: val })}
            apiKey={settings.apiKey}
            setApiKey={(val) => onUpdateSettings({ apiKey: val })}
            apiProxyUrl={settings.apiProxyUrl}
            setApiProxyUrl={(val) => onUpdateSettings({ apiProxyUrl: val })}
            useApiProxy={settings.useApiProxy ?? false}
            setUseApiProxy={(val) => onUpdateSettings({ useApiProxy: val })}
            serverManagedApi={settings.serverManagedApi ?? false}
            settings={settings}
            onUpdate={(key, val) => onUpdateSettings({ [key]: val } as any)}
            hideProviderRedirect={true}
          />
        </div>

        <div className="space-y-2">
          <ProviderModelListSection
            providerId="gemini"
            providerName="Gemini"
            protocol="gemini"
            models={effectiveModels}
            onUpdateModels={handleUpdateModels}

            onProbeSingleModel={handleSingleModelProbe}
            onProbeBatchModels={handleBatchHealthCheck}
            isProbingBatch={isCheckingBatch}
            probingModelIds={probingModelIds}
            modelProbeResults={modelProbeResults}
            onStopProbe={handleStopBatchHealthCheck}
            batchProgress={batchProgress}
            onResetDefaultModels={() => setIsResetConfirmOpen(true)}
          />
        </div>

        <div
          data-settings-item="gemini-safety"
          className="rounded-2xl border border-[var(--theme-border-secondary)]/40 bg-[var(--theme-bg-secondary)]/10 p-5"
        >
          <SafetySection
            safetySettings={settings.safetySettings}
            setSafetySettings={(safetySettings) => onUpdateSettings({ safetySettings })}
            showIntro={true}
          />
        </div>

        <ConfirmationModal
          isOpen={isResetConfirmOpen}
          onClose={() => setIsResetConfirmOpen(false)}
          onConfirm={handleConfirmResetModels}
          title={t('thirdPartyResetDefaultModelsConfirmTitle') || '恢复官方预设模型列表'}
          message={
            t('thirdPartyResetDefaultModelsConfirmMessage') ||
            '确定要将模型列表恢复为 Google Gemini 官方推荐预设吗？这将还原官方的 15 个核心模型及其默认可见性与能力配置，并移除您手动添加的自定义模型。'
          }
          confirmLabel={t('thirdPartyResetDefaultModelsConfirmTitle') || '恢复预设'}
          cancelLabel={t('cancel') || '取消'}
          isDanger={false}
        />
      </div>
    </div>
  );
};
