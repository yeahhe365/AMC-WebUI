import React, { useState, useMemo } from 'react';
import {
  Settings,
  Eye,
  EyeOff,
  KeyRound,
  Activity,
  ExternalLink,
  ChevronDown,
  ChevronRight,
  ChevronsUpDown,
  RefreshCw,
  Plus,
  Lightbulb,
  Wrench,
  Minus,
  Search,
  Loader2,
  X,
  Square,
  CheckSquare,
  MinusSquare,
  ListChecks,
  Trash2,
  AlertCircle,
} from 'lucide-react';
import type { ModelOption, ThirdPartyConnection } from '@/types';
import { useI18n } from '@/contexts/I18nContext';
import { Toggle } from '@/components/shared/Toggle';
import { SETTINGS_INPUT_CLASS } from '@/constants/formClasses';
import { getThirdPartyTemplateLinks, getProxyProviderHeader } from '@/utils/thirdPartyApiProviders';
import {
  probeThirdPartyConnection,
  formatLatency,
  getLatencyBadgeStyles,
  type ConnectionHealthProbeResult,
} from '@/utils/thirdPartyDiagnostics';
import {
  probeSingleModel,
  runBatchModelHealthCheck,
  type BatchHealthCheckSummary,
} from '@/utils/model/modelHealthCheck';
import { fetchOpenAICompatibleModels } from '@/services/api/openaiCompatibleApi';
import { fetchOpenAIResponsesModels } from '@/services/api/openaiResponsesApi';
import { parseApiKeys } from '@/utils/apiKeySelection';
import { getErrorMessage } from '@/utils/errorMessage';
import { toastError, toastSuccess, toastWarning } from '@/stores/toastStore';
import { enrichModelMetadata, formatContextWindow } from '@/utils/model/knownModelsCatalog';
import { ProviderAvatar } from './ProviderAvatar';
import { ModelParameterModal } from './ModelParameterModal';
import { ProviderEditDialog } from './ProviderEditDialog';
import { ModelSyncModal } from './ModelSyncModal';

interface ProviderDetailProps {
  connection: ThirdPartyConnection;
  onUpdateConnection: (updates: Partial<ThirdPartyConnection>) => void;
  onDeleteConnection: () => void;
  onCloseModal?: () => void;
}

export const ProviderDetail: React.FC<ProviderDetailProps> = ({
  connection,
  onUpdateConnection,
  onDeleteConnection,
  onCloseModal: _onCloseModal,
}) => {
  const { t } = useI18n();

  // Dialog states
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [paramModalModel, setParamModalModel] = useState<ModelOption | null>(null);

  // API Key show/hide
  const [showApiKey, setShowApiKey] = useState(false);

  // Health testing
  const [healthStatus, setHealthStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle');
  const [healthResult, setHealthResult] = useState<ConnectionHealthProbeResult | null>(null);

  // Sync models
  const [isSyncingModels, setIsSyncingModels] = useState(false);
  const [isSyncModalOpen, setIsSyncModalOpen] = useState(false);
  const [syncRemoteModels, setSyncRemoteModels] = useState<ModelOption[]>([]);

  // Models filtering and search
  const [modelSearch, setModelSearch] = useState('');
  const [isModelSearchOpen, setIsModelSearchOpen] = useState(false);
  const [groupsCollapsed, setGroupsCollapsed] = useState<Record<string, boolean>>({});

  // Batch model selection
  const [isBatchMode, setIsBatchMode] = useState(false);
  const [selectedModelIds, setSelectedModelIds] = useState<Set<string>>(new Set());

  // Add custom model inline
  const [isAddingModel, setIsAddingModel] = useState(false);
  const [newModelId, setNewModelId] = useState('');
  const [newModelName, setNewModelName] = useState('');

  // Model health check states
  const [modelProbeResults, setModelProbeResults] = useState<Record<string, ConnectionHealthProbeResult>>({});
  const [isCheckingBatch, setIsCheckingBatch] = useState(false);
  const [batchProgress, setBatchProgress] = useState<{ completed: number; total: number } | null>(null);
  const [batchSummary, setBatchSummary] = useState<BatchHealthCheckSummary | null>(null);
  const [probingModelIds, setProbingModelIds] = useState<Set<string>>(new Set());
  const batchAbortControllerRef = React.useRef<AbortController | null>(null);

  const templateLinks = getThirdPartyTemplateLinks(connection.templateId);

  // Batch model health check
  const handleBatchHealthCheck = async () => {
    if (connection.models.length === 0) {
      toastWarning(t('thirdPartyToastNoModelsToProbe'));
      return;
    }
    const controller = new AbortController();
    batchAbortControllerRef.current = controller;
    setIsCheckingBatch(true);
    setBatchSummary(null);
    setBatchProgress({ completed: 0, total: connection.models.length });

    try {
      const summary = await runBatchModelHealthCheck(connection, connection.models, {
        concurrency: 3,
        signal: controller.signal,
        onProgress: (progress) => {
          setBatchProgress({ completed: progress.completed, total: progress.total });
          setModelProbeResults((prev) => ({
            ...prev,
            [progress.currentModelId]: progress.latestResult,
          }));
        },
      });

      setBatchSummary(summary);
      if (!controller.signal.aborted) {
        if (summary.errorCount === 0) {
          toastSuccess(
            t('thirdPartyToastProbeAllSuccess', {
              count: summary.successCount,
              latency: summary.avgLatencyMs,
            }),
          );
        } else {
          toastWarning(
            t('thirdPartyToastProbePartialSuccess', {
              successCount: summary.successCount,
              errorCount: summary.errorCount,
              latency: summary.avgLatencyMs,
            }),
          );
        }
      }
    } catch (batchHealthError) {
      toastError(getErrorMessage(batchHealthError));
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
    toastWarning(t('thirdPartyToastProbeAborted'));
  };

  const handleSingleModelProbe = async (modelId: string) => {
    if (probingModelIds.has(modelId)) return;
    setProbingModelIds((prev) => new Set(prev).add(modelId));

    try {
      const res = await probeSingleModel(connection, modelId);
      setModelProbeResults((prev) => ({ ...prev, [modelId]: res }));
      if (res.status === 'success') {
        toastSuccess(t('thirdPartyToastSingleProbeSuccess', { modelId, latency: formatLatency(res.latencyMs) }));
      } else {
        toastError(
          t('thirdPartyToastSingleProbeFailed', { modelId, error: res.errorMessage || t('thirdPartyFailed') }),
        );
      }
    } catch (probeError) {
      toastError(getErrorMessage(probeError));
    } finally {
      setProbingModelIds((prev) => {
        const next = new Set(prev);
        next.delete(modelId);
        return next;
      });
    }
  };

  const handleDisableFailedModels = () => {
    const failedIds = new Set(
      Object.entries(modelProbeResults)
        .filter(([, r]) => r.status === 'error')
        .map(([id]) => id),
    );
    if (failedIds.size === 0) return;

    const updated = connection.models.map((m) => (failedIds.has(m.id) ? { ...m, visibleInSelector: false } : m));
    onUpdateConnection({ models: updated });
    toastSuccess(t('thirdPartyToastDisabledFailedModels', { count: failedIds.size }));
    setBatchSummary(null);
  };

  // Handle test API key connection
  const handleTestConnection = async () => {
    setHealthStatus('testing');
    try {
      const result = await probeThirdPartyConnection(connection, {
        modelId: connection.modelId || connection.models[0]?.id,
      });
      setHealthResult(result);
      setHealthStatus(result.status);
      if (result.status === 'success') {
        toastSuccess(`${connection.name}: ${t('apiConfigTestSuccess')} (${formatLatency(result.latencyMs)})`);
      } else {
        toastError(
          `${connection.name}: ${t('apiConfigTestFailed')}${result.errorMessage ? ` - ${result.errorMessage}` : ''}`,
        );
      }
    } catch (testError) {
      setHealthStatus('error');
      toastError(getErrorMessage(testError));
    }
  };

  // Sync models from upstream API and open reconcile dialog
  const handleSyncModels = async () => {
    const parsedKey = parseApiKeys(connection.apiKey)[0];
    const effectiveKey = parsedKey || (connection.authOptional ? 'auth-optional' : '');
    if (!effectiveKey && !connection.authOptional) {
      toastWarning(t('apiConfigNoKeyAvailable'));
      return;
    }
    if (!connection.baseUrl) {
      toastWarning(t('thirdPartyApiUrlMissing'));
      return;
    }

    setIsSyncingModels(true);
    try {
      const fetchFn =
        connection.protocol === 'openai-responses' ? fetchOpenAIResponsesModels : fetchOpenAICompatibleModels;

      const rawRemoteModels = await fetchFn(
        effectiveKey,
        connection.baseUrl,
        new AbortController().signal,
        getProxyProviderHeader(connection.templateId),
        connection.extraHeaders,
      );

      if (rawRemoteModels.length === 0) {
        toastWarning(t('thirdPartyToastRemoteZeroModels'));
        return;
      }

      // Enrich raw remote models with catalog metadata & capabilities
      const enriched = rawRemoteModels.map((remote) => enrichModelMetadata(remote));
      setSyncRemoteModels(enriched);
      setIsSyncModalOpen(true);
    } catch (syncError) {
      toastError(t('thirdPartyToastSyncFailed', { error: getErrorMessage(syncError) }));
    } finally {
      setIsSyncingModels(false);
    }
  };

  // Apply reconcile results from ModelSyncModal
  const handleApplySyncModels = (reconciledModels: ModelOption[]) => {
    onUpdateConnection({
      models: reconciledModels,
      modelId: connection.modelId || reconciledModels[0]?.id || '',
    });
    toastSuccess(t('thirdPartyToastSyncSuccess', { count: reconciledModels.length }));
  };

  // Add custom model
  const handleConfirmAddModel = () => {
    const trimmedId = newModelId.trim();
    if (!trimmedId) return;

    const trimmedName = newModelName.trim() || trimmedId;
    const existing = connection.models.find((m) => m.id === trimmedId);
    if (existing) {
      toastWarning(t('thirdPartyToastModelIdExists'));
      return;
    }

    const newOption = enrichModelMetadata({
      id: trimmedId,
      name: trimmedName,
    });

    onUpdateConnection({
      models: [...connection.models, newOption],
      modelId: connection.modelId || trimmedId,
    });

    setNewModelId('');
    setNewModelName('');
    setIsAddingModel(false);
    toastSuccess(t('thirdPartyToastModelAdded', { name: trimmedName }));
  };

  // Synchronize selectedModelIds when connection.models change
  React.useEffect(() => {
    setSelectedModelIds((prev) => {
      if (prev.size === 0) return prev;
      const validIds = new Set(connection.models.map((m) => m.id));
      const next = new Set<string>();
      for (const id of prev) {
        if (validIds.has(id)) next.add(id);
      }
      return next.size === prev.size ? prev : next;
    });
  }, [connection.models]);

  // Filter models by search query
  const filteredModels = useMemo(() => {
    const q = modelSearch.trim().toLowerCase();
    return connection.models.filter((m) => {
      if (!q) return true;
      return m.id.toLowerCase().includes(q) || m.name.toLowerCase().includes(q);
    });
  }, [connection.models, modelSearch]);

  // Group models by prefix or provider name
  const groupedModels = useMemo(() => {
    // Determine group for each model
    const groups: Record<string, ModelOption[]> = {};
    filteredModels.forEach((m) => {
      let groupKey = connection.name.toLowerCase();
      if (m.id.includes('/')) {
        groupKey = m.id.split('/')[0];
      } else if (m.id.includes(':')) {
        groupKey = m.id.split(':')[0];
      } else if (m.id.startsWith('gpt-')) {
        groupKey = 'openai';
      } else if (m.id.startsWith('claude-')) {
        groupKey = 'anthropic';
      } else if (m.id.startsWith('deepseek-')) {
        groupKey = 'deepseek';
      } else if (m.id.startsWith('qwen')) {
        groupKey = 'qwen';
      }

      if (!groups[groupKey]) {
        groups[groupKey] = [];
      }
      groups[groupKey].push(m);
    });

    return groups;
  }, [connection.name, filteredModels]);

  const toggleGroupCollapse = (key: string) => {
    setGroupsCollapsed((prev: Record<string, boolean>) => ({ ...prev, [key]: !prev[key] }));
  };

  const toggleAllGroups = () => {
    const allKeys = Object.keys(groupedModels);
    const anyExpanded = allKeys.some((k) => !groupsCollapsed[k]);
    const next: Record<string, boolean> = {};
    allKeys.forEach((k) => {
      next[k] = anyExpanded;
    });
    setGroupsCollapsed(next);
  };

  // Batch selection derived states
  const visibleSelectedCount = useMemo(() => {
    return filteredModels.filter((m) => selectedModelIds.has(m.id)).length;
  }, [filteredModels, selectedModelIds]);

  const isAllVisibleSelected = filteredModels.length > 0 && visibleSelectedCount === filteredModels.length;
  const isPartialSelected = visibleSelectedCount > 0 && visibleSelectedCount < filteredModels.length;

  const handleToggleModelSelection = (modelId: string) => {
    setSelectedModelIds((prev) => {
      const next = new Set(prev);
      if (next.has(modelId)) {
        next.delete(modelId);
      } else {
        next.add(modelId);
      }
      return next;
    });
  };

  const handleToggleSelectAll = () => {
    if (isAllVisibleSelected) {
      // Deselect all visible models
      setSelectedModelIds((prev) => {
        const next = new Set(prev);
        for (const m of filteredModels) {
          next.delete(m.id);
        }
        return next;
      });
    } else {
      // Select all visible models
      setSelectedModelIds((prev) => {
        const next = new Set(prev);
        for (const m of filteredModels) {
          next.add(m.id);
        }
        return next;
      });
    }
  };

  const handleInvertSelection = () => {
    setSelectedModelIds((prev) => {
      const next = new Set(prev);
      for (const m of filteredModels) {
        if (next.has(m.id)) {
          next.delete(m.id);
        } else {
          next.add(m.id);
        }
      }
      return next;
    });
  };

  const handleBatchSetVisible = (visible: boolean) => {
    if (selectedModelIds.size === 0) return;
    const updated = connection.models.map((m) =>
      selectedModelIds.has(m.id) ? { ...m, visibleInSelector: visible } : m,
    );
    onUpdateConnection({ models: updated });
    toastSuccess(
      visible
        ? t('thirdPartyToastBatchShow', { count: selectedModelIds.size })
        : t('thirdPartyToastBatchHide', { count: selectedModelIds.size }),
    );
  };

  const handleBatchDelete = () => {
    if (selectedModelIds.size === 0) return;
    const count = selectedModelIds.size;
    const remaining = connection.models.filter((m) => !selectedModelIds.has(m.id));
    const newSelectedModelId = selectedModelIds.has(connection.modelId) ? (remaining[0]?.id ?? '') : connection.modelId;

    onUpdateConnection({
      models: remaining,
      modelId: newSelectedModelId,
    });
    setSelectedModelIds(new Set());
    setIsBatchMode(false);
    toastSuccess(t('thirdPartyToastBatchDeleted', { count }));
  };

  const handleBatchProbeSelected = async () => {
    const targetModels = connection.models.filter((m) => selectedModelIds.has(m.id));
    if (targetModels.length === 0) return;

    const controller = new AbortController();
    batchAbortControllerRef.current = controller;
    setIsCheckingBatch(true);
    setBatchSummary(null);
    setBatchProgress({ completed: 0, total: targetModels.length });

    try {
      const summary = await runBatchModelHealthCheck(connection, targetModels, {
        concurrency: 3,
        signal: controller.signal,
        onProgress: (progress) => {
          setBatchProgress({ completed: progress.completed, total: progress.total });
          setModelProbeResults((prev) => ({
            ...prev,
            [progress.currentModelId]: progress.latestResult,
          }));
        },
      });

      setBatchSummary(summary);
      if (!controller.signal.aborted) {
        if (summary.errorCount === 0) {
          toastSuccess(
            t('thirdPartyToastSelectedProbeAllSuccess', {
              count: summary.successCount,
              latency: summary.avgLatencyMs,
            }),
          );
        } else {
          toastWarning(
            t('thirdPartyToastProbePartialSuccess', {
              successCount: summary.successCount,
              errorCount: summary.errorCount,
              latency: summary.avgLatencyMs,
            }),
          );
        }
      }
    } catch (batchProbeError) {
      toastError(getErrorMessage(batchProbeError));
    } finally {
      setIsCheckingBatch(false);
      setBatchProgress(null);
      batchAbortControllerRef.current = null;
    }
  };

  // Single model mutations
  const updateSingleModel = (modelId: string, updates: Partial<ModelOption>) => {
    const updated = connection.models.map((m) => (m.id === modelId ? { ...m, ...updates } : m));
    onUpdateConnection({ models: updated });
  };

  const deleteSingleModel = (modelId: string) => {
    const updated = connection.models.filter((m) => m.id !== modelId);
    onUpdateConnection({
      models: updated,
      modelId: connection.modelId === modelId ? (updated[0]?.id ?? '') : connection.modelId,
    });
  };

  return (
    <div className="flex-1 flex flex-col h-full min-w-0 bg-[var(--theme-bg-primary)] overflow-hidden">
      <div className="flex items-center justify-between gap-3 px-6 py-3.5 border-b border-[var(--theme-border-secondary)]/30 flex-shrink-0 bg-[var(--theme-bg-primary)]">
        <div className="flex items-center gap-3 min-w-0">
          <ProviderAvatar name={connection.name} templateId={connection.templateId} size={28} />
          <h2 className="text-xl font-bold text-[var(--theme-text-primary)] truncate">{connection.name}</h2>
          <button
            type="button"
            onClick={() => setIsEditOpen(true)}
            className="p-1.5 rounded-lg text-[var(--theme-text-secondary)] hover:text-[var(--theme-text-primary)] hover:bg-[var(--theme-bg-tertiary)] transition-colors focus:outline-none"
            title={t('thirdPartyConfigureProvider')}
          >
            <Settings size={16} />
          </button>
        </div>

        <div className="flex items-center gap-3 flex-shrink-0">
          <span
            className={`text-xs font-medium ${
              connection.enabled ? 'text-emerald-600 dark:text-emerald-400' : 'text-[var(--theme-text-secondary)]'
            }`}
          >
            {connection.enabled ? t('enabled') || 'Enabled' : t('disabled') || 'Disabled'}
          </span>
          <Toggle
            checked={connection.enabled}
            onChange={(checked) => onUpdateConnection({ enabled: checked })}
            ariaLabel={`${connection.name} ${connection.enabled ? t('enabled') || 'Enabled' : t('disabled') || 'Disabled'}`}
          />
        </div>
      </div>
      <div className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-6">
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold text-[var(--theme-text-primary)]">{t('thirdPartyApiKeyLabel')}</span>
            {templateLinks.apiKeyUrl && (
              <a
                href={templateLinks.apiKeyUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-[var(--theme-text-link)] hover:underline"
              >
                <span>{t('thirdPartyGetApiKey')}</span>
                <ExternalLink size={11} />
              </a>
            )}
          </div>

          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <input
                type={showApiKey ? 'text' : 'password'}
                value={connection.apiKey ?? ''}
                onChange={(e) => onUpdateConnection({ apiKey: e.target.value })}
                placeholder={connection.authOptional ? t('thirdPartyAuthOptionalPlaceholder') : 'sk-...'}
                className={`w-full pl-3 pr-9 py-2 rounded-xl border text-xs font-mono transition-all ${SETTINGS_INPUT_CLASS}`}
              />
              <button
                type="button"
                onClick={() => setShowApiKey(!showApiKey)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--theme-text-secondary)]/70 hover:text-[var(--theme-text-primary)] p-0.5 focus:outline-none"
                title={showApiKey ? t('thirdPartyHideKey') : t('thirdPartyShowKey')}
              >
                {showApiKey ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
            <button
              type="button"
              onClick={() => {
                if (connection.apiKey) {
                  navigator.clipboard.writeText(connection.apiKey);
                  toastSuccess(t('thirdPartyToastKeyCopied'));
                }
              }}
              className="p-2 rounded-xl border border-[var(--theme-border-secondary)]/70 bg-[var(--theme-bg-secondary)]/60 text-[var(--theme-text-secondary)] hover:text-[var(--theme-text-primary)] hover:bg-[var(--theme-bg-tertiary)] transition-colors flex-shrink-0"
              title={t('thirdPartyCopyKey')}
            >
              <KeyRound size={15} />
            </button>
            <button
              type="button"
              onClick={handleTestConnection}
              disabled={healthStatus === 'testing'}
              className="px-3 py-2 rounded-xl border border-[var(--theme-border-secondary)]/70 bg-[var(--theme-bg-secondary)]/60 hover:bg-[var(--theme-bg-tertiary)] text-xs font-medium text-[var(--theme-text-primary)] transition-all flex items-center gap-1.5 flex-shrink-0 cursor-pointer disabled:opacity-60 shadow-xs"
            >
              {healthStatus === 'testing' ? (
                <Loader2 size={13} className="animate-spin text-[var(--theme-border-focus)]" />
              ) : (
                <Activity size={13} className="text-[var(--theme-text-secondary)]" />
              )}
              <span>{t('thirdPartyDetect')}</span>
            </button>
            {healthResult && (
              <span
                className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-mono font-medium ${
                  getLatencyBadgeStyles(healthResult.grade).badge
                }`}
                title={healthResult.errorMessage ?? undefined}
              >
                <span className={`w-1.5 h-1.5 rounded-full ${getLatencyBadgeStyles(healthResult.grade).dot}`} />
                <span>
                  {healthResult.status === 'success' ? formatLatency(healthResult.latencyMs) : t('thirdPartyFailed')}
                </span>
              </span>
            )}
          </div>
        </div>
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-[var(--theme-text-primary)]">{t('thirdPartyApiUrlLabel')}</span>
              {templateLinks.docUrl && (
                <a
                  href={templateLinks.docUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-[var(--theme-text-link)] hover:underline flex items-center gap-1"
                >
                  <span>{t('thirdPartyAddEndpointOrDocs')}</span>
                  <ExternalLink size={10} />
                </a>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <input
              type="text"
              value={connection.baseUrl ?? ''}
              onChange={(e) => onUpdateConnection({ baseUrl: e.target.value })}
              placeholder="https://..."
              className={`flex-1 p-2 rounded-xl border text-xs font-mono ${SETTINGS_INPUT_CLASS}`}
            />
            <button
              type="button"
              onClick={() => setIsEditOpen(true)}
              className="p-2 rounded-xl border border-[var(--theme-border-secondary)]/70 bg-[var(--theme-bg-secondary)]/60 text-[var(--theme-text-secondary)] hover:text-[var(--theme-text-primary)] hover:bg-[var(--theme-bg-tertiary)] transition-colors flex-shrink-0"
              title={t('thirdPartyConfigureEndpointAndHeaders')}
            >
              <Settings size={15} />
            </button>
          </div>
        </div>
        <div className="space-y-3 pt-2" data-settings-item="providers-models">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-[var(--theme-text-primary)]">
                {t('thirdPartyModelsLabel')}
              </span>
              <button
                type="button"
                onClick={toggleAllGroups}
                className="p-1 rounded-md text-[var(--theme-text-secondary)] hover:text-[var(--theme-text-primary)] hover:bg-[var(--theme-bg-tertiary)] transition-colors"
                title={t('thirdPartyToggleCollapseAll')}
              >
                <ChevronsUpDown size={14} />
              </button>
              <button
                type="button"
                onClick={() => setIsModelSearchOpen(!isModelSearchOpen)}
                className={`p-1 rounded-md transition-colors ${
                  isModelSearchOpen || modelSearch
                    ? 'text-[var(--theme-border-focus)] bg-[var(--theme-border-focus)]/10'
                    : 'text-[var(--theme-text-secondary)] hover:text-[var(--theme-text-primary)] hover:bg-[var(--theme-bg-tertiary)]'
                }`}
                title={t('thirdPartySearchModels')}
              >
                <Search size={14} />
              </button>
              <button
                type="button"
                onClick={() => {
                  const next = !isBatchMode;
                  setIsBatchMode(next);
                  if (!next) setSelectedModelIds(new Set());
                }}
                className={`p-1 rounded-md transition-colors ${
                  isBatchMode || selectedModelIds.size > 0
                    ? 'text-[var(--theme-border-focus)] bg-[var(--theme-border-focus)]/10'
                    : 'text-[var(--theme-text-secondary)] hover:text-[var(--theme-text-primary)] hover:bg-[var(--theme-bg-tertiary)]'
                }`}
                title={t('thirdPartyBatchManage')}
              >
                <ListChecks size={14} />
              </button>
            </div>

            <div className="flex items-center gap-2">
              {isCheckingBatch ? (
                <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border border-amber-500/30 bg-amber-500/10 text-xs font-medium text-amber-600 dark:text-amber-400">
                  <Loader2 size={13} className="animate-spin" />
                  <span>
                    {t('thirdPartyProbingProgress', {
                      completed: batchProgress?.completed ?? 0,
                      total: batchProgress?.total ?? 0,
                    })}
                  </span>
                  <button
                    type="button"
                    onClick={handleStopBatchHealthCheck}
                    className="ml-1 p-0.5 rounded hover:bg-amber-500/20 transition-colors cursor-pointer"
                    title={t('thirdPartyAbortProbe')}
                  >
                    <Square size={11} className="fill-current" />
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={handleBatchHealthCheck}
                  disabled={connection.models.length === 0}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-[var(--theme-border-secondary)]/70 bg-[var(--theme-bg-secondary)]/50 hover:bg-[var(--theme-bg-tertiary)] text-xs font-medium text-[var(--theme-text-primary)] transition-all cursor-pointer disabled:opacity-50 shadow-xs"
                  title={t('thirdPartyProbeAllTooltip')}
                >
                  <Activity size={13} className="text-emerald-500" />
                  <span>{t('thirdPartyProbe')}</span>
                </button>
              )}

              <button
                type="button"
                onClick={handleSyncModels}
                disabled={isSyncingModels || isCheckingBatch}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-[var(--theme-border-secondary)]/70 bg-[var(--theme-bg-secondary)]/50 hover:bg-[var(--theme-bg-tertiary)] text-xs font-medium text-[var(--theme-text-primary)] transition-all cursor-pointer disabled:opacity-60 shadow-xs"
              >
                <RefreshCw size={13} className={isSyncingModels ? 'animate-spin' : ''} />
                <span>{t('thirdPartySyncModels')}</span>
              </button>
              <button
                type="button"
                onClick={() => setIsAddingModel(true)}
                className="p-1.5 rounded-xl border border-[var(--theme-border-secondary)]/70 bg-[var(--theme-bg-secondary)]/50 hover:bg-[var(--theme-bg-tertiary)] text-[var(--theme-text-primary)] transition-all cursor-pointer shadow-xs"
                title={t('thirdPartyManualAddModel')}
              >
                <Plus size={14} />
              </button>
            </div>
          </div>
          {batchSummary && batchSummary.errorCount > 0 && (
            <div className="flex items-center justify-between gap-3 px-3 py-2 rounded-xl border border-amber-500/30 bg-amber-500/10 text-xs text-amber-700 dark:text-amber-300 animate-in fade-in duration-150">
              <div className="flex items-center gap-2">
                <AlertCircle size={15} className="text-amber-500 flex-shrink-0" />
                <span>
                  {t('thirdPartyProbeSummaryBanner', {
                    successCount: batchSummary.successCount,
                    errorCount: batchSummary.errorCount,
                    latency: batchSummary.avgLatencyMs,
                  })}
                </span>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <button
                  type="button"
                  onClick={handleDisableFailedModels}
                  className="px-2.5 py-1 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 font-medium text-amber-800 dark:text-amber-200 transition-colors cursor-pointer"
                >
                  {t('thirdPartyDisableFailedModels')}
                </button>
                <button
                  type="button"
                  onClick={() => setBatchSummary(null)}
                  className="p-1 rounded hover:bg-amber-500/20 text-amber-700 dark:text-amber-300 transition-colors"
                >
                  <X size={13} />
                </button>
              </div>
            </div>
          )}
          {isModelSearchOpen && (
            <div className="relative animate-in fade-in duration-100">
              <Search
                size={13}
                className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--theme-text-secondary)]/60 pointer-events-none"
              />
              <input
                type="text"
                value={modelSearch}
                onChange={(e) => setModelSearch(e.target.value)}
                placeholder={t('thirdPartyFilterModelPlaceholder')}
                className="w-full pl-8 pr-7 py-1.5 text-xs rounded-xl border border-[var(--theme-border-secondary)]/60 bg-[var(--theme-bg-secondary)]/20 text-[var(--theme-text-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--theme-border-focus)]"
                autoFocus
              />
              {modelSearch && (
                <button
                  type="button"
                  onClick={() => setModelSearch('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--theme-text-secondary)] hover:text-[var(--theme-text-primary)] p-0.5"
                >
                  <X size={12} />
                </button>
              )}
            </div>
          )}

          {(isBatchMode || selectedModelIds.size > 0) && (
            <div
              data-testid="batch-action-bar"
              className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 rounded-xl border border-[var(--theme-border-focus)]/30 bg-[var(--theme-border-focus)]/5 text-xs animate-in fade-in duration-150 shadow-xs"
            >
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleToggleSelectAll}
                  className="flex items-center gap-1.5 px-2 py-1 rounded-lg border border-[var(--theme-border-secondary)]/70 bg-[var(--theme-bg-primary)] hover:bg-[var(--theme-bg-secondary)] text-[var(--theme-text-primary)] font-medium cursor-pointer transition-colors"
                >
                  {isAllVisibleSelected ? (
                    <CheckSquare size={13} className="text-[var(--theme-border-focus)]" />
                  ) : isPartialSelected ? (
                    <MinusSquare size={13} className="text-[var(--theme-border-focus)]" />
                  ) : (
                    <Square size={13} className="text-[var(--theme-text-secondary)]" />
                  )}
                  <span>{isAllVisibleSelected ? t('thirdPartyDeselectAll') : t('thirdPartySelectAll')}</span>
                </button>

                <button
                  type="button"
                  onClick={handleInvertSelection}
                  className="px-2 py-1 rounded-lg border border-[var(--theme-border-secondary)]/70 bg-[var(--theme-bg-primary)] hover:bg-[var(--theme-bg-secondary)] text-[var(--theme-text-secondary)] hover:text-[var(--theme-text-primary)] transition-colors cursor-pointer"
                >
                  {t('thirdPartyInvertSelection')}
                </button>

                <span className="text-[var(--theme-text-secondary)] ml-1">
                  {t('thirdPartySelectedCount', { selected: selectedModelIds.size, total: filteredModels.length })}
                </span>
              </div>

              <div className="flex items-center gap-1.5 flex-wrap">
                <button
                  type="button"
                  onClick={() => handleBatchSetVisible(true)}
                  disabled={selectedModelIds.size === 0}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-lg border border-emerald-500/30 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 font-medium transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                  title={t('thirdPartyShowSelectedTooltip')}
                >
                  <Eye size={12} />
                  <span>{t('thirdPartyShow')}</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleBatchSetVisible(false)}
                  disabled={selectedModelIds.size === 0}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-lg border border-[var(--theme-border-secondary)]/70 bg-[var(--theme-bg-primary)] hover:bg-[var(--theme-bg-secondary)] text-[var(--theme-text-secondary)] hover:text-[var(--theme-text-primary)] font-medium transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                  title={t('thirdPartyHideSelectedTooltip')}
                >
                  <EyeOff size={12} />
                  <span>{t('thirdPartyHide')}</span>
                </button>

                <button
                  type="button"
                  onClick={handleBatchProbeSelected}
                  disabled={selectedModelIds.size === 0 || isCheckingBatch}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-lg border border-sky-500/30 bg-sky-500/10 hover:bg-sky-500/20 text-sky-700 dark:text-sky-300 font-medium transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                  title={t('thirdPartyProbeSelectedTooltip')}
                >
                  <Activity size={12} />
                  <span>{t('thirdPartyProbeSelected')}</span>
                </button>

                <button
                  type="button"
                  onClick={handleBatchDelete}
                  disabled={selectedModelIds.size === 0}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-lg border border-rose-500/30 bg-rose-500/10 hover:bg-rose-500/20 text-rose-700 dark:text-rose-300 font-medium transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                  title={t('thirdPartyDeleteSelectedTooltip')}
                >
                  <Trash2 size={12} />
                  <span>{t('delete')}</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setSelectedModelIds(new Set());
                    setIsBatchMode(false);
                  }}
                  className="p-1 rounded-lg text-[var(--theme-text-secondary)] hover:text-[var(--theme-text-primary)] hover:bg-[var(--theme-bg-tertiary)] transition-colors ml-1 cursor-pointer"
                  title={t('thirdPartyExitBatchManageTooltip')}
                >
                  <X size={14} />
                </button>
              </div>
            </div>
          )}

          {isAddingModel && (
            <div className="p-3 rounded-xl border border-[var(--theme-border-focus)]/50 bg-[var(--theme-bg-secondary)]/30 space-y-2.5 animate-in fade-in duration-150">
              <div className="flex items-center justify-between text-xs font-semibold text-[var(--theme-text-primary)]">
                <span>{t('thirdPartyAddCustomModel')}</span>
                <button
                  type="button"
                  onClick={() => setIsAddingModel(false)}
                  className="text-[var(--theme-text-secondary)] hover:text-[var(--theme-text-primary)]"
                >
                  <X size={14} />
                </button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <input
                  type="text"
                  value={newModelId}
                  onChange={(e) => setNewModelId(e.target.value)}
                  placeholder={t('thirdPartyCustomModelIdPlaceholder')}
                  className={`p-2 rounded-lg border text-xs font-mono ${SETTINGS_INPUT_CLASS}`}
                  autoFocus
                />
                <input
                  type="text"
                  value={newModelName}
                  onChange={(e) => setNewModelName(e.target.value)}
                  placeholder={t('thirdPartyCustomModelNamePlaceholder')}
                  className={`p-2 rounded-lg border text-xs ${SETTINGS_INPUT_CLASS}`}
                />
              </div>
              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setIsAddingModel(false)}
                  className="px-2.5 py-1 text-xs rounded-lg text-[var(--theme-text-secondary)] hover:text-[var(--theme-text-primary)]"
                >
                  {t('cancel')}
                </button>
                <button
                  type="button"
                  onClick={handleConfirmAddModel}
                  disabled={!newModelId.trim()}
                  className="px-3 py-1 text-xs rounded-lg bg-[var(--theme-border-focus)] text-white disabled:opacity-50"
                >
                  {t('add')}
                </button>
              </div>
            </div>
          )}
          <div className="rounded-2xl border border-[var(--theme-border-secondary)]/40 bg-[var(--theme-bg-secondary)]/10 p-2 space-y-3">
            {Object.keys(groupedModels).length === 0 ? (
              <div className="py-8 text-center text-xs text-[var(--theme-text-secondary)]">
                {connection.models.length === 0
                  ? t('thirdPartyNoModelsPrompt')
                  : t('thirdPartyNoMatchingFilteredModels')}
              </div>
            ) : (
              (Object.entries(groupedModels) as Array<[string, ModelOption[]]>).map(([groupKey, models]) => {
                const isCollapsed = groupsCollapsed[groupKey] ?? false;

                return (
                  <div key={groupKey} className="space-y-1">
                    <button
                      type="button"
                      onClick={() => toggleGroupCollapse(groupKey)}
                      className="flex items-center gap-1.5 px-2 py-1 text-xs font-medium text-[var(--theme-text-secondary)] hover:text-[var(--theme-text-primary)] cursor-pointer select-none transition-colors"
                    >
                      {isCollapsed ? <ChevronRight size={13} /> : <ChevronDown size={13} />}
                      <span className="font-mono uppercase tracking-wider">{groupKey}</span>
                      <span className="text-[10px] text-[var(--theme-text-secondary)]/60">({models.length})</span>
                    </button>
                    {!isCollapsed && (
                      <div className="space-y-1 pl-1">
                        {models.map((model) => {
                          const isVisible = model.visibleInSelector !== false;
                          const isThinking = Boolean(model.enableThinking);
                          const isTools = model.enableTools !== false;

                          return (
                            <div
                              key={model.id}
                              className={`group flex items-center justify-between gap-3 px-3 py-2 rounded-xl transition-all ${
                                selectedModelIds.has(model.id)
                                  ? 'bg-[var(--theme-border-focus)]/10 border-[var(--theme-border-focus)]/50 ring-1 ring-[var(--theme-border-focus)]/30'
                                  : 'bg-[var(--theme-bg-primary)]/80 hover:bg-[var(--theme-bg-secondary)]/60 border border-[var(--theme-border-secondary)]/30 hover:border-[var(--theme-border-secondary)]'
                              }`}
                            >
                              <div className="flex items-center gap-2 min-w-0 flex-1">
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleToggleModelSelection(model.id);
                                  }}
                                  className={`p-0.5 rounded cursor-pointer transition-all ${
                                    isBatchMode || selectedModelIds.size > 0
                                      ? 'opacity-100'
                                      : 'opacity-0 group-hover:opacity-100 focus:opacity-100'
                                  }`}
                                  title={
                                    selectedModelIds.has(model.id)
                                      ? t('thirdPartyDeselectModel')
                                      : t('thirdPartySelectModel')
                                  }
                                >
                                  {selectedModelIds.has(model.id) ? (
                                    <CheckSquare size={14} className="text-[var(--theme-border-focus)]" />
                                  ) : (
                                    <Square
                                      size={14}
                                      className="text-[var(--theme-text-secondary)]/50 hover:text-[var(--theme-text-secondary)]"
                                    />
                                  )}
                                </button>
                                <ProviderAvatar name={model.name || model.id} size={24} className="text-[11px]" />
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-center gap-1.5 flex-wrap">
                                    <span
                                      className={`text-xs font-medium truncate ${
                                        isVisible
                                          ? 'text-[var(--theme-text-primary)]'
                                          : 'text-[var(--theme-text-secondary)] line-through opacity-70'
                                      }`}
                                      title={model.name || model.id}
                                    >
                                      {model.name || model.id}
                                    </span>
                                    {model.contextWindow ? (
                                      <span className="px-1.5 py-0.2 rounded text-[9px] font-medium bg-[var(--theme-bg-secondary)] text-[var(--theme-text-secondary)] border border-[var(--theme-border-primary)]/60">
                                        {formatContextWindow(model.contextWindow)}
                                      </span>
                                    ) : null}
                                    {model.capabilities?.vision ? (
                                      <span
                                        className="px-1 py-0.2 rounded text-[9px] font-medium bg-teal-500/10 text-teal-400 border border-teal-500/20"
                                        title={t('thirdPartyVisionTooltip')}
                                      >
                                        Vision
                                      </span>
                                    ) : null}
                                    {probingModelIds.has(model.id) ? (
                                      <span className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded text-[9px] bg-[var(--theme-bg-secondary)] text-[var(--theme-text-secondary)] border border-[var(--theme-border-primary)]/60">
                                        <Loader2 size={10} className="animate-spin" />
                                        <span>{t('thirdPartyTesting')}</span>
                                      </span>
                                    ) : modelProbeResults[model.id] ? (
                                      modelProbeResults[model.id].status === 'success' ? (
                                        <span
                                          className={`inline-flex items-center gap-1 px-1.5 py-0.2 rounded text-[9px] font-mono font-medium ${
                                            getLatencyBadgeStyles(modelProbeResults[model.id].grade).badge
                                          }`}
                                          title={t('thirdPartyLatencyTooltip', {
                                            latency: modelProbeResults[model.id].latencyMs,
                                          })}
                                        >
                                          <span
                                            className={`w-1.5 h-1.5 rounded-full ${
                                              getLatencyBadgeStyles(modelProbeResults[model.id].grade).dot
                                            }`}
                                          />
                                          <span>{formatLatency(modelProbeResults[model.id].latencyMs)}</span>
                                        </span>
                                      ) : (
                                        <span
                                          className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded text-[9px] font-mono font-medium bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20 cursor-help"
                                          title={
                                            modelProbeResults[model.id].errorMessage ||
                                            modelProbeResults[model.id].diagnosticTip ||
                                            t('thirdPartyModelProbeFailed')
                                          }
                                        >
                                          <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
                                          <span>
                                            {modelProbeResults[model.id].errorMessage?.includes('404')
                                              ? '404'
                                              : modelProbeResults[model.id].errorMessage?.includes('401')
                                                ? '401'
                                                : modelProbeResults[model.id].errorMessage?.includes('429')
                                                  ? '429'
                                                  : t('thirdPartyFailed')}
                                          </span>
                                        </span>
                                      )
                                    ) : null}
                                  </div>
                                  {model.name && model.name !== model.id && (
                                    <div className="text-[10px] font-mono text-[var(--theme-text-secondary)]/70 truncate">
                                      {model.id}
                                    </div>
                                  )}
                                </div>
                              </div>
                              <div className="flex items-center gap-1 flex-shrink-0">
                                <button
                                  type="button"
                                  onClick={() => handleSingleModelProbe(model.id)}
                                  disabled={probingModelIds.has(model.id) || isCheckingBatch}
                                  className={`p-1.5 rounded-lg transition-colors cursor-pointer disabled:opacity-40 ${
                                    modelProbeResults[model.id]?.status === 'success'
                                      ? 'text-emerald-500 hover:bg-emerald-500/10'
                                      : modelProbeResults[model.id]?.status === 'error'
                                        ? 'text-rose-500 hover:bg-rose-500/10'
                                        : 'text-[var(--theme-text-secondary)]/40 hover:text-[var(--theme-text-primary)] hover:bg-[var(--theme-bg-tertiary)]'
                                  }`}
                                  title={t('thirdPartyProbeSingleModel')}
                                >
                                  {probingModelIds.has(model.id) ? (
                                    <Loader2 size={13} className="animate-spin" />
                                  ) : (
                                    <Activity size={13} />
                                  )}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => updateSingleModel(model.id, { visibleInSelector: !isVisible })}
                                  className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                                    isVisible
                                      ? 'text-emerald-600 bg-emerald-500/10 hover:bg-emerald-500/20'
                                      : 'text-[var(--theme-text-secondary)]/40 hover:text-[var(--theme-text-primary)] hover:bg-[var(--theme-bg-tertiary)]'
                                  }`}
                                  title={
                                    isVisible ? t('thirdPartyModelVisibleTooltip') : t('thirdPartyModelHiddenTooltip')
                                  }
                                >
                                  <Eye size={13} />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => updateSingleModel(model.id, { enableThinking: !isThinking })}
                                  className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                                    isThinking
                                      ? 'text-amber-500 bg-amber-500/10 hover:bg-amber-500/20'
                                      : 'text-[var(--theme-text-secondary)]/40 hover:text-[var(--theme-text-primary)] hover:bg-[var(--theme-bg-tertiary)]'
                                  }`}
                                  title={
                                    isThinking
                                      ? t('thirdPartyThinkingEnabledTooltip')
                                      : t('thirdPartyThinkingDisabledTooltip')
                                  }
                                >
                                  <Lightbulb size={13} />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => updateSingleModel(model.id, { enableTools: !isTools })}
                                  className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                                    isTools
                                      ? 'text-sky-500 bg-sky-500/10 hover:bg-sky-500/20'
                                      : 'text-[var(--theme-text-secondary)]/40 hover:text-[var(--theme-text-primary)] hover:bg-[var(--theme-bg-tertiary)]'
                                  }`}
                                  title={
                                    isTools ? t('thirdPartyToolsEnabledTooltip') : t('thirdPartyToolsDisabledTooltip')
                                  }
                                >
                                  <Wrench size={13} />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setParamModalModel(model)}
                                  className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                                    model.parameters && Object.keys(model.parameters).length > 0
                                      ? 'text-[var(--theme-border-focus)] bg-[var(--theme-border-focus)]/10'
                                      : 'text-[var(--theme-text-secondary)]/40 hover:text-[var(--theme-text-primary)] hover:bg-[var(--theme-bg-tertiary)]'
                                  }`}
                                  title={t('thirdPartyModelParametersTooltip')}
                                >
                                  <Settings size={13} />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => deleteSingleModel(model.id)}
                                  className="p-1.5 rounded-lg text-[var(--theme-text-secondary)]/40 hover:text-[var(--theme-text-danger)] hover:bg-[var(--theme-bg-danger)]/10 transition-colors cursor-pointer"
                                  title={t('thirdPartyDeleteModel')}
                                >
                                  <Minus size={13} />
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
      <ProviderEditDialog
        isOpen={isEditOpen}
        connection={connection}
        onClose={() => setIsEditOpen(false)}
        onSave={(updates) => onUpdateConnection(updates)}
        onDelete={onDeleteConnection}
      />
      <ModelParameterModal
        isOpen={Boolean(paramModalModel)}
        model={paramModalModel}
        onClose={() => setParamModalModel(null)}
        onSave={(params) => {
          if (paramModalModel) {
            updateSingleModel(paramModalModel.id, { parameters: params });
            toastSuccess(t('thirdPartyToastParamSaved', { name: paramModalModel.name }));
          }
        }}
      />
      <ModelSyncModal
        isOpen={isSyncModalOpen}
        onClose={() => setIsSyncModalOpen(false)}
        connectionName={connection.name}
        remoteModels={syncRemoteModels}
        existingModels={connection.models}
        onApply={handleApplySyncModels}
      />
    </div>
  );
};
