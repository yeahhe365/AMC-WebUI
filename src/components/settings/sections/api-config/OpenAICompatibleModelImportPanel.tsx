import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ClipboardList, Filter, Loader2, Plus, RefreshCw, Search, X } from 'lucide-react';
import type { ModelOption } from '@/types';
import { useI18n } from '@/contexts/I18nContext';
import { useChatStore } from '@/stores/chatStore';
import {
  SETTINGS_PRIMARY_ACTION_BUTTON_CLASS,
  SETTINGS_SECONDARY_ACTION_BUTTON_CLASS,
} from '@/constants/buttonClasses';
import { OpenAICompatibleModelFetchResult } from './OpenAICompatibleModelFetchResult';
import {
  createOpenAICompatibleModelRowId,
  dedupeOpenAICompatibleModelOptions,
  type EditableOpenAICompatibleModelRow,
  parsePastedOpenAICompatibleModelIds,
} from './openaiCompatibleModelListState';
import { interpolate } from '@/i18n/interpolate';

const isNonChatModel = (id: string): boolean => {
  const lower = id.toLowerCase();
  return (
    lower.includes('embed') ||
    lower.includes('rerank') ||
    lower.includes('whisper') ||
    lower.includes('tts') ||
    lower.includes('voice') ||
    lower.includes('moderation') ||
    lower.includes('flux') ||
    lower.includes('dall-e') ||
    lower.includes('stable-diffusion')
  );
};

interface OpenAICompatibleModelImportPanelProps {
  rows: EditableOpenAICompatibleModelRow[];
  currentModelIds: ReadonlySet<string>;
  fetchRequestId: number;
  onCommitRows: (rows: EditableOpenAICompatibleModelRow[]) => void;
  onFetchModelsForImportPreview?: () => Promise<ModelOption[]>;
  isOpen: boolean;
  isFetchModelsDisabled?: boolean;
  isFetchingModels?: boolean;
  fetchModelsStatus?: 'idle' | 'success' | 'error';
  fetchModelsMessage?: string | null;
}

export const OpenAICompatibleModelImportPanel: React.FC<OpenAICompatibleModelImportPanelProps> = ({
  rows,
  currentModelIds,
  fetchRequestId,
  onCommitRows,
  onFetchModelsForImportPreview,
  isOpen,
  isFetchModelsDisabled = false,
  isFetchingModels = false,
  fetchModelsStatus = 'idle',
  fetchModelsMessage = null,
}) => {
  const { t } = useI18n();
  const [batchModelText, setBatchModelText] = useState('');
  const [fetchedPreviewModels, setFetchedPreviewModels] = useState<ModelOption[]>([]);
  const [searchFilter, setSearchFilter] = useState('');
  const [filterChatOnly, setFilterChatOnly] = useState(false);
  const [selectedFetchedModelIds, setSelectedFetchedModelIds] = useState<Set<string>>(() => new Set());
  const [managerMessage, setManagerMessage] = useState<string | null>(null);
  const [activeCategoryTab, setActiveCategoryTab] = useState<'all' | 'new' | 'existing' | 'missing'>('all');
  const handledFetchRequestIdRef = useRef(0);

  const inUseModelIds = useMemo(() => {
    const inUse = new Set<string>();
    const state = useChatStore.getState();
    const allSessions = state.savedSessions || [];
    for (const session of allSessions) {
      if (session.settings?.modelId) {
        inUse.add(session.settings.modelId);
      }
    }
    return inUse;
  }, []);

  const fetchedModelIdSet = useMemo(() => new Set(fetchedPreviewModels.map((m) => m.id)), [fetchedPreviewModels]);

  const filteredFetchedModels = useMemo(() => {
    if (!filterChatOnly) return fetchedPreviewModels;
    return fetchedPreviewModels.filter((m) => !isNonChatModel(m.id));
  }, [fetchedPreviewModels, filterChatOnly]);

  const newModels = useMemo(
    () => filteredFetchedModels.filter((model) => !currentModelIds.has(model.id)),
    [currentModelIds, filteredFetchedModels],
  );

  const existingModels = useMemo(
    () => filteredFetchedModels.filter((model) => currentModelIds.has(model.id)),
    [currentModelIds, filteredFetchedModels],
  );

  const missingModels = useMemo(() => {
    if (fetchedPreviewModels.length === 0) return [];
    return rows.filter((r) => !fetchedModelIdSet.has(r.id)).map((r) => ({ id: r.id, name: r.name }));
  }, [fetchedModelIdSet, fetchedPreviewModels.length, rows]);

  const displayedModels = useMemo(() => {
    let list: Array<{ id: string; name: string; isMissing?: boolean; isInUse?: boolean }>;
    if (activeCategoryTab === 'new') {
      list = newModels;
    } else if (activeCategoryTab === 'existing') {
      list = existingModels;
    } else if (activeCategoryTab === 'missing') {
      list = missingModels.map((m) => ({ ...m, isMissing: true, isInUse: inUseModelIds.has(m.id) }));
    } else {
      list = [
        ...filteredFetchedModels,
        ...missingModels.map((m) => ({ ...m, isMissing: true, isInUse: inUseModelIds.has(m.id) })),
      ];
    }

    if (!searchFilter.trim()) return list;
    const query = searchFilter.toLowerCase().trim();
    return list.filter((m) => m.id.toLowerCase().includes(query) || m.name.toLowerCase().includes(query));
  }, [activeCategoryTab, existingModels, filteredFetchedModels, inUseModelIds, missingModels, newModels, searchFilter]);

  const importableFetchedModelIds = useMemo(() => newModels.map((model) => model.id), [newModels]);

  const selectedImportableFetchedModelIds = useMemo(
    () => importableFetchedModelIds.filter((modelId) => selectedFetchedModelIds.has(modelId)),
    [importableFetchedModelIds, selectedFetchedModelIds],
  );

  const handleFetchModelsForPreview = useCallback(async () => {
    if (!onFetchModelsForImportPreview) return;

    setManagerMessage(null);
    const fetchedModels = await onFetchModelsForImportPreview();
    const dedupedFetchedModels = dedupeOpenAICompatibleModelOptions(fetchedModels);
    setFetchedPreviewModels(dedupedFetchedModels);
    setSelectedFetchedModelIds(
      new Set(dedupedFetchedModels.filter((model) => !currentModelIds.has(model.id)).map((model) => model.id)),
    );
  }, [currentModelIds, onFetchModelsForImportPreview]);

  useEffect(() => {
    if (!isOpen || fetchRequestId === 0 || handledFetchRequestIdRef.current === fetchRequestId) {
      return;
    }

    handledFetchRequestIdRef.current = fetchRequestId;
    const fetchTimerId = window.setTimeout(() => {
      void handleFetchModelsForPreview();
    }, 0);

    return () => window.clearTimeout(fetchTimerId);
  }, [fetchRequestId, handleFetchModelsForPreview, isOpen]);

  const handleAddPastedModels = () => {
    const pastedModelIds = parsePastedOpenAICompatibleModelIds(batchModelText);
    const rowsToAdd = pastedModelIds
      .filter((modelId) => !currentModelIds.has(modelId))
      .map((modelId) => ({ id: modelId, name: modelId, rowId: createOpenAICompatibleModelRowId() }));

    if (rowsToAdd.length === 0) {
      setManagerMessage(t('settingsOpenAICompatibleModelPasteNoNewModels'));
      return;
    }

    onCommitRows([...rows, ...rowsToAdd]);
    setBatchModelText('');
    setManagerMessage(interpolate(t('settingsOpenAICompatibleModelPasteAdded'), { count: String(rowsToAdd.length) }));
  };

  const handleToggleFetchedModel = (modelId: string, checked: boolean) => {
    setSelectedFetchedModelIds((previous) => {
      const next = new Set(previous);
      if (checked) {
        next.add(modelId);
      } else {
        next.delete(modelId);
      }
      return next;
    });
  };

  const handleSelectAllNew = () => {
    setSelectedFetchedModelIds(new Set(importableFetchedModelIds));
  };

  const handleClearFetchedSelection = () => {
    setSelectedFetchedModelIds(new Set());
  };

  const handleImportFetchedModels = () => {
    const rowsToAdd = fetchedPreviewModels
      .filter((model) => selectedFetchedModelIds.has(model.id) && !currentModelIds.has(model.id))
      .map((model) => ({
        id: model.id,
        name: model.name,
        rowId: createOpenAICompatibleModelRowId(),
      }));

    if (rowsToAdd.length === 0) {
      setManagerMessage(t('settingsOpenAICompatibleModelImportNoSelection'));
      return;
    }

    onCommitRows([...rows, ...rowsToAdd]);
    setSelectedFetchedModelIds(new Set());
    setManagerMessage(interpolate(t('settingsOpenAICompatibleModelImportAdded'), { count: String(rowsToAdd.length) }));
  };

  const handlePruneMissingModels = () => {
    if (missingModels.length === 0) return;
    const prunableModels = missingModels.filter((m) => !inUseModelIds.has(m.id));
    if (prunableModels.length === 0) {
      setManagerMessage(t('settingsOpenAICompatiblePruneAllProtected'));
      return;
    }
    const missingIdSet = new Set(prunableModels.map((m) => m.id));
    const remainingRows = rows.filter((r) => !missingIdSet.has(r.id));
    onCommitRows(remainingRows);
    const protectedCount = missingModels.length - prunableModels.length;
    if (protectedCount > 0) {
      setManagerMessage(
        interpolate(t('settingsOpenAICompatiblePruneWithProtectedConfirm'), {
          count: String(prunableModels.length),
          protectedCount: String(protectedCount),
        }),
      );
    } else {
      setManagerMessage(
        interpolate(t('settingsOpenAICompatiblePruneMissingConfirm'), { count: String(prunableModels.length) }),
      );
    }
  };

  return (
    <section className="min-w-0 space-y-4">
      <div className="space-y-2">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-[var(--theme-text-secondary)]">
          <ClipboardList size={14} />
          {t('settingsOpenAICompatibleBatchPasteTitle')}
        </div>
        <textarea
          value={batchModelText}
          onChange={(event) => setBatchModelText(event.target.value)}
          data-openai-compatible-batch-model-input="true"
          className="min-h-28 w-full resize-y rounded-lg border border-[var(--theme-border-secondary)] bg-[var(--theme-bg-input)] p-3 font-mono text-sm text-[var(--theme-text-primary)] outline-none transition-colors placeholder:text-[var(--theme-text-tertiary)] focus:border-[var(--theme-border-focus)] focus:ring-2 focus:ring-[var(--theme-border-focus)]/15"
          placeholder={t('settingsOpenAICompatibleBatchPastePlaceholder')}
        />
        <div className="flex justify-end">
          <button type="button" onClick={handleAddPastedModels} className={SETTINGS_SECONDARY_ACTION_BUTTON_CLASS}>
            <Plus size={14} />
            {t('settingsOpenAICompatibleAddPastedModels')}
          </button>
        </div>
      </div>

      <div className="space-y-2 rounded-lg border border-[var(--theme-border-secondary)] p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="text-xs font-semibold uppercase tracking-wider text-[var(--theme-text-secondary)]">
            {t('settingsOpenAICompatibleFetchedPreviewTitle')}
          </div>
          {onFetchModelsForImportPreview && (
            <button
              type="button"
              onClick={() => void handleFetchModelsForPreview()}
              disabled={isFetchModelsDisabled || isFetchingModels}
              className={SETTINGS_SECONDARY_ACTION_BUTTON_CLASS}
            >
              {isFetchingModels ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
              {isFetchingModels ? t('settingsFetchingModelList') : t('settingsFetchModelList')}
            </button>
          )}
        </div>

        <OpenAICompatibleModelFetchResult status={fetchModelsStatus} message={fetchModelsMessage} />

        {fetchedPreviewModels.length > 0 ? (
          <>
            <div className="flex items-center gap-1.5 border-b border-[var(--theme-border-secondary)]/50 pb-2 overflow-x-auto">
              <button
                type="button"
                onClick={() => setActiveCategoryTab('all')}
                className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                  activeCategoryTab === 'all'
                    ? 'bg-[var(--theme-bg-tertiary)] text-[var(--theme-text-primary)] font-semibold'
                    : 'text-[var(--theme-text-secondary)] hover:text-[var(--theme-text-primary)]'
                }`}
              >
                {t('settingsOpenAICompatibleTabAll')} ({fetchedPreviewModels.length + missingModels.length})
              </button>
              <button
                type="button"
                onClick={() => setActiveCategoryTab('new')}
                className={`px-2.5 py-1 rounded text-xs font-medium flex items-center gap-1.5 transition-colors ${
                  activeCategoryTab === 'new'
                    ? 'bg-emerald-500/20 text-emerald-400 font-semibold'
                    : 'text-[var(--theme-text-secondary)] hover:text-[var(--theme-text-primary)]'
                }`}
              >
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                {t('settingsOpenAICompatibleTabNew')} ({newModels.length})
              </button>
              <button
                type="button"
                onClick={() => setActiveCategoryTab('existing')}
                className={`px-2.5 py-1 rounded text-xs font-medium flex items-center gap-1.5 transition-colors ${
                  activeCategoryTab === 'existing'
                    ? 'bg-sky-500/20 text-sky-400 font-semibold'
                    : 'text-[var(--theme-text-secondary)] hover:text-[var(--theme-text-primary)]'
                }`}
              >
                <span className="w-1.5 h-1.5 rounded-full bg-sky-400" />
                {t('settingsOpenAICompatibleTabExisting')} ({existingModels.length})
              </button>
              {missingModels.length > 0 && (
                <button
                  type="button"
                  onClick={() => setActiveCategoryTab('missing')}
                  className={`px-2.5 py-1 rounded text-xs font-medium flex items-center gap-1.5 transition-colors ${
                    activeCategoryTab === 'missing'
                      ? 'bg-amber-500/20 text-amber-400 font-semibold'
                      : 'text-[var(--theme-text-secondary)] hover:text-[var(--theme-text-primary)]'
                  }`}
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                  {t('settingsOpenAICompatibleTabMissing')} ({missingModels.length})
                </button>
              )}
            </div>

            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Search
                  size={14}
                  className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--theme-text-secondary)]"
                />
                <input
                  type="text"
                  value={searchFilter}
                  onChange={(event) => setSearchFilter(event.target.value)}
                  placeholder={t('settingsOpenAICompatibleModelSearch')}
                  className="w-full rounded-md border border-[var(--theme-border-secondary)] bg-[var(--theme-bg-input)] py-1.5 pl-8 pr-8 text-xs text-[var(--theme-text-primary)] outline-none placeholder:text-[var(--theme-text-tertiary)] focus:border-[var(--theme-border-focus)] focus:ring-1 focus:ring-[var(--theme-border-focus)]"
                />
                {searchFilter && (
                  <button
                    type="button"
                    onClick={() => setSearchFilter('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--theme-text-secondary)] hover:text-[var(--theme-text-primary)]"
                  >
                    <X size={12} />
                  </button>
                )}
              </div>
              <button
                type="button"
                onClick={() => setFilterChatOnly((prev) => !prev)}
                className={`px-2.5 py-1.5 rounded-md text-xs font-medium border transition-colors flex items-center gap-1.5 shrink-0 ${
                  filterChatOnly
                    ? 'border-[var(--theme-border-focus)] bg-[var(--theme-border-focus)]/15 text-[var(--theme-text-primary)] font-semibold'
                    : 'border-[var(--theme-border-secondary)] text-[var(--theme-text-secondary)] hover:text-[var(--theme-text-primary)] hover:bg-[var(--theme-bg-tertiary)]'
                }`}
                title={t('settingsOpenAICompatibleFilterChatOnlyTitle')}
              >
                <Filter size={12} />
                <span>{t('settingsOpenAICompatibleFilterChatOnly')}</span>
              </button>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs text-[var(--theme-text-secondary)]">
                {interpolate(t('settingsOpenAICompatibleFetchedPreviewCount'), {
                  count: String(displayedModels.length),
                  selected: String(selectedImportableFetchedModelIds.length),
                })}
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleSelectAllNew}
                  disabled={importableFetchedModelIds.length === 0}
                  className="text-xs font-medium text-[var(--theme-text-link)] hover:underline disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {t('settingsOpenAICompatibleSelectAllNew')}
                </button>
                <button
                  type="button"
                  onClick={handleClearFetchedSelection}
                  disabled={selectedFetchedModelIds.size === 0}
                  className="text-xs font-medium text-[var(--theme-text-secondary)] hover:text-[var(--theme-text-primary)] hover:underline disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {t('settingsOpenAICompatibleClearFetchedSelection')}
                </button>
              </div>
            </div>
            <div className="max-h-56 overflow-y-auto rounded-md bg-[var(--theme-bg-input)]/45 p-1 custom-scrollbar">
              {displayedModels.map((model) => {
                const isMissing = model.isMissing === true;
                const alreadyAdded = !isMissing && currentModelIds.has(model.id);
                const checked = !isMissing && !alreadyAdded && selectedFetchedModelIds.has(model.id);

                return (
                  <label
                    key={model.id}
                    className={`flex items-center gap-2 rounded-md px-2 py-2 text-sm transition-colors ${
                      alreadyAdded || isMissing ? 'opacity-70' : 'hover:bg-[var(--theme-bg-tertiary)]/35'
                    }`}
                  >
                    {!isMissing && (
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={alreadyAdded}
                        onChange={(event) => handleToggleFetchedModel(model.id, event.target.checked)}
                        className="mt-0.5"
                        data-openai-compatible-fetched-model-checkbox="true"
                      />
                    )}
                    <span className="min-w-0 flex-1 flex items-center justify-between gap-2">
                      <span className="truncate font-mono text-xs text-[var(--theme-text-primary)]">{model.id}</span>
                      <div className="flex items-center gap-1 shrink-0">
                        {inUseModelIds.has(model.id) && (
                          <span className="px-1.5 py-0.5 text-[10px] font-medium rounded bg-indigo-500/20 text-indigo-300">
                            {t('modelInUseBadge')}
                          </span>
                        )}
                        {isMissing ? (
                          <span className="px-1.5 py-0.5 text-[10px] font-medium rounded bg-amber-500/15 text-amber-400">
                            {t('settingsOpenAICompatibleTabMissing')}
                          </span>
                        ) : alreadyAdded ? (
                          <span className="px-1.5 py-0.5 text-[10px] font-medium rounded bg-sky-500/15 text-sky-400">
                            {t('settingsOpenAICompatibleTabExisting')}
                          </span>
                        ) : (
                          <span className="px-1.5 py-0.5 text-[10px] font-medium rounded bg-emerald-500/15 text-emerald-400">
                            {t('settingsOpenAICompatibleTabNew')}
                          </span>
                        )}
                      </div>
                    </span>
                  </label>
                );
              })}
            </div>
            <div className="flex items-center justify-between gap-2 pt-1">
              {missingModels.length > 0 ? (
                <button
                  type="button"
                  onClick={handlePruneMissingModels}
                  className="text-xs text-[var(--theme-text-warning)] hover:underline"
                >
                  {t('settingsOpenAICompatiblePruneMissing')} ({missingModels.length})
                </button>
              ) : (
                <div />
              )}
              <button
                type="button"
                onClick={handleImportFetchedModels}
                disabled={selectedImportableFetchedModelIds.length === 0}
                className={SETTINGS_PRIMARY_ACTION_BUTTON_CLASS}
              >
                {t('settingsOpenAICompatibleImportSelectedModels')} ({selectedImportableFetchedModelIds.length})
              </button>
            </div>
          </>
        ) : (
          <div className="rounded-md bg-[var(--theme-bg-input)]/45 px-3 py-6 text-center text-xs italic text-[var(--theme-text-secondary)]">
            {t('settingsOpenAICompatibleFetchedPreviewEmpty')}
          </div>
        )}
      </div>

      {managerMessage && (
        <div className="rounded-lg border border-[var(--theme-border-secondary)] bg-[var(--theme-bg-input)]/45 px-3 py-2 text-xs text-[var(--theme-text-secondary)]">
          {managerMessage}
        </div>
      )}
    </section>
  );
};
