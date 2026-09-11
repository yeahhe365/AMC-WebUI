import React, { useState, useMemo } from 'react';
import { X, Search, Check, Eye, Wrench, Lightbulb, Trash2, RefreshCw, AlertTriangle } from 'lucide-react';
import type { ModelOption } from '@/types';
import { useI18n } from '@/contexts/I18nContext';
import { formatContextWindow } from '@/utils/model/knownModelsCatalog';
import { reconcileModels, applyModelReconcile } from '@/utils/model/modelReconcile';

export interface ModelSyncModalProps {
  isOpen: boolean;
  onClose: () => void;
  connectionName: string;
  remoteModels: ModelOption[];
  existingModels: ModelOption[];
  onApply: (reconciledModels: ModelOption[]) => void;
}

type FilterTab = 'all' | 'new' | 'stale' | 'existing';

export const ModelSyncModal: React.FC<ModelSyncModalProps> = ({
  isOpen,
  onClose,
  connectionName,
  remoteModels,
  existingModels,
  onApply,
}) => {
  const { t } = useI18n();
  const [filterTab, setFilterTab] = useState<FilterTab>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Reconcile remote with existing
  const reconcileResult = useMemo(() => reconcileModels(remoteModels, existingModels), [remoteModels, existingModels]);

  const { newModels, existingModels: mergedExisting, staleModels, stats } = reconcileResult;

  // By default, select all new models for addition
  const [selectedNewIds, setSelectedNewIds] = useState<Set<string>>(() => {
    return new Set(newModels.map((m) => m.id));
  });

  // By default, keep stale models unchecked unless user explicitly wants to purge them
  const [selectedStaleRemoveIds, setSelectedStaleRemoveIds] = useState<Set<string>>(new Set());

  // Reset selection states when remote models change
  React.useEffect(() => {
    setSelectedNewIds(new Set(newModels.map((m) => m.id)));
    setSelectedStaleRemoveIds(new Set());
  }, [newModels]);

  // Toggle single new model
  const toggleNewModel = (id: string) => {
    setSelectedNewIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  // Toggle single stale model for removal
  const toggleStaleModel = (id: string) => {
    setSelectedStaleRemoveIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  // Toggle all new models
  const toggleAllNew = () => {
    if (selectedNewIds.size === newModels.length) {
      setSelectedNewIds(new Set());
    } else {
      setSelectedNewIds(new Set(newModels.map((m) => m.id)));
    }
  };

  // Select all stale models for removal
  const selectAllStaleForRemoval = () => {
    if (selectedStaleRemoveIds.size === staleModels.length) {
      setSelectedStaleRemoveIds(new Set());
    } else {
      setSelectedStaleRemoveIds(new Set(staleModels.map((m) => m.id)));
    }
  };

  // Handle final submission
  const handleConfirm = () => {
    const selectedNewModels = newModels.filter((m) => selectedNewIds.has(m.id));
    const remoteMetadataMap = new Map(remoteModels.map((m) => [m.id, m]));

    const finalized = applyModelReconcile({
      existingModels,
      selectedNewModels,
      removeStaleModelIds: selectedStaleRemoveIds,
      updateMetadataFromRemote: remoteMetadataMap,
    });

    onApply(finalized);
    onClose();
  };

  // Filter display list
  const displayItems = useMemo(() => {
    let items: Array<{
      model: ModelOption;
      status: 'new' | 'existing' | 'stale';
    }> = [];

    if (filterTab === 'all' || filterTab === 'new') {
      newModels.forEach((m) => items.push({ model: m, status: 'new' }));
    }
    if (filterTab === 'all' || filterTab === 'existing') {
      mergedExisting.forEach((m) => items.push({ model: m, status: 'existing' }));
    }
    if (filterTab === 'all' || filterTab === 'stale') {
      staleModels.forEach((m) => items.push({ model: m, status: 'stale' }));
    }

    const q = searchQuery.trim().toLowerCase();
    if (q) {
      items = items.filter(
        ({ model }) =>
          model.id.toLowerCase().includes(q) ||
          model.name.toLowerCase().includes(q) ||
          (model.ownedBy && model.ownedBy.toLowerCase().includes(q)),
      );
    }

    return items;
  }, [filterTab, newModels, mergedExisting, staleModels, searchQuery]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200"
      role="dialog"
      aria-modal="true"
      aria-labelledby="model-sync-title"
    >
      <div className="relative w-full max-w-3xl max-h-[88vh] flex flex-col bg-[var(--theme-bg-primary)] border border-[var(--theme-border-primary)] rounded-2xl shadow-2xl overflow-hidden text-[var(--theme-text-primary)]">
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--theme-border-primary)] bg-[var(--theme-bg-secondary)]/40">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-blue-500/10 text-blue-500">
              <RefreshCw size={19} />
            </div>
            <div>
              <h2 id="model-sync-title" className="text-base font-semibold leading-tight">
                {t('thirdPartySyncModelsTitle')}
              </h2>
              <p className="text-xs text-[var(--theme-text-secondary)] mt-0.5">
                {t('thirdPartyProvider')}:{' '}
                <span className="font-medium text-[var(--theme-text-primary)]">{connectionName}</span>
                <span className="mx-2">·</span>
                {t('thirdPartyRemoteFoundModels', { count: stats.totalRemote })}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-[var(--theme-text-secondary)] hover:text-[var(--theme-text-primary)] hover:bg-[var(--theme-bg-secondary)] rounded-lg transition-colors"
            aria-label={t('close')}
          >
            <X size={18} />
          </button>
        </div>

        <div className="px-6 pt-3.5 pb-3 border-b border-[var(--theme-border-primary)]/80 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-[var(--theme-bg-primary)]">
          <div className="flex items-center gap-1.5 p-1 bg-[var(--theme-bg-secondary)] rounded-xl text-xs font-medium">
            <button
              type="button"
              onClick={() => setFilterTab('all')}
              className={`px-3 py-1.5 rounded-lg transition-all ${
                filterTab === 'all'
                  ? 'bg-[var(--theme-bg-primary)] text-[var(--theme-text-primary)] shadow-xs font-semibold'
                  : 'text-[var(--theme-text-secondary)] hover:text-[var(--theme-text-primary)]'
              }`}
            >
              {t('settingsOpenAICompatibleTabAll')} ({stats.totalRemote + stats.staleCount})
            </button>
            <button
              type="button"
              onClick={() => setFilterTab('new')}
              className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 ${
                filterTab === 'new'
                  ? 'bg-[var(--theme-bg-primary)] text-emerald-500 shadow-xs font-semibold'
                  : 'text-[var(--theme-text-secondary)] hover:text-emerald-500'
              }`}
            >
              <span>{t('settingsOpenAICompatibleTabNew')}</span>
              <span className="px-1.5 py-0.2 rounded-full bg-emerald-500/15 text-emerald-500 text-[10px] font-bold">
                {stats.newCount}
              </span>
            </button>
            <button
              type="button"
              onClick={() => setFilterTab('existing')}
              className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 ${
                filterTab === 'existing'
                  ? 'bg-[var(--theme-bg-primary)] text-[var(--theme-text-primary)] shadow-xs font-semibold'
                  : 'text-[var(--theme-text-secondary)] hover:text-[var(--theme-text-primary)]'
              }`}
            >
              <span>{t('settingsOpenAICompatibleTabExisting')}</span>
              <span className="px-1.5 py-0.2 rounded-full bg-[var(--theme-bg-primary)] text-[var(--theme-text-secondary)] text-[10px]">
                {stats.existingCount}
              </span>
            </button>
            {stats.staleCount > 0 && (
              <button
                type="button"
                onClick={() => setFilterTab('stale')}
                className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 ${
                  filterTab === 'stale'
                    ? 'bg-[var(--theme-bg-primary)] text-rose-500 shadow-xs font-semibold'
                    : 'text-[var(--theme-text-secondary)] hover:text-rose-500'
                }`}
              >
                <span>{t('thirdPartyTabStale')}</span>
                <span className="px-1.5 py-0.2 rounded-full bg-rose-500/15 text-rose-500 text-[10px] font-bold">
                  {stats.staleCount}
                </span>
              </button>
            )}
          </div>

          <div className="relative flex-1 max-w-xs">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--theme-text-secondary)]" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t('settingsOpenAICompatibleModelSearch')}
              className="w-full pl-8.5 pr-8 py-1.5 text-xs rounded-xl bg-[var(--theme-bg-secondary)] border border-[var(--theme-border-primary)] focus:outline-none focus:ring-1 focus:ring-blue-500/50"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--theme-text-secondary)] hover:text-[var(--theme-text-primary)]"
              >
                <X size={12} />
              </button>
            )}
          </div>
        </div>

        <div className="px-6 py-2 bg-[var(--theme-bg-secondary)]/30 border-b border-[var(--theme-border-primary)]/40 flex items-center justify-between text-xs text-[var(--theme-text-secondary)]">
          <div className="flex items-center gap-4">
            {newModels.length > 0 && (
              <label className="flex items-center gap-1.5 cursor-pointer hover:text-[var(--theme-text-primary)] select-none">
                <input
                  type="checkbox"
                  checked={selectedNewIds.size === newModels.length && newModels.length > 0}
                  onChange={toggleAllNew}
                  className="rounded text-blue-600 focus:ring-0 cursor-pointer"
                />
                <span>{t('thirdPartySelectAllNew', { selected: selectedNewIds.size, total: newModels.length })}</span>
              </label>
            )}
            {staleModels.length > 0 && (
              <button
                type="button"
                onClick={selectAllStaleForRemoval}
                className="flex items-center gap-1 text-rose-500 hover:text-rose-600 font-medium"
              >
                <Trash2 size={13} />
                <span>
                  {selectedStaleRemoveIds.size === staleModels.length
                    ? t('thirdPartyUncheckPruneStale')
                    : t('thirdPartyCheckPruneStale')}{' '}
                  ({selectedStaleRemoveIds.size}/{staleModels.length})
                </span>
              </button>
            )}
          </div>
          <span className="text-[11px] opacity-75">{t('thirdPartyDisplayItems', { count: displayItems.length })}</span>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-2 divide-y divide-[var(--theme-border-primary)]/40">
          {displayItems.length === 0 ? (
            <div className="py-14 text-center text-[var(--theme-text-secondary)] flex flex-col items-center gap-2">
              <Search size={28} className="opacity-30" />
              <p className="text-sm">{t('thirdPartyNoMatchingModels')}</p>
            </div>
          ) : (
            displayItems.map(({ model, status }) => {
              const isNew = status === 'new';
              const isStale = status === 'stale';
              const isExisting = status === 'existing';

              const isNewChecked = isNew && selectedNewIds.has(model.id);
              const isStaleChecked = isStale && selectedStaleRemoveIds.has(model.id);

              const contextLabel = formatContextWindow(model.contextWindow);

              return (
                <div
                  key={`${status}-${model.id}`}
                  onClick={() => {
                    if (isNew) toggleNewModel(model.id);
                    if (isStale) toggleStaleModel(model.id);
                  }}
                  className={`group flex items-center justify-between gap-3 py-2.5 px-2 rounded-xl transition-colors cursor-pointer select-none ${
                    isNewChecked
                      ? 'bg-emerald-500/5 hover:bg-emerald-500/10'
                      : isStaleChecked
                        ? 'bg-rose-500/5 hover:bg-rose-500/10'
                        : 'hover:bg-[var(--theme-bg-secondary)]/40'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <div className="shrink-0 flex items-center">
                      {isNew && (
                        <input
                          type="checkbox"
                          checked={isNewChecked}
                          onChange={() => toggleNewModel(model.id)}
                          onClick={(e) => e.stopPropagation()}
                          className="w-4 h-4 rounded text-emerald-600 focus:ring-0 cursor-pointer"
                        />
                      )}
                      {isStale && (
                        <input
                          type="checkbox"
                          checked={isStaleChecked}
                          onChange={() => toggleStaleModel(model.id)}
                          onClick={(e) => e.stopPropagation()}
                          className="w-4 h-4 rounded text-rose-600 focus:ring-0 cursor-pointer"
                        />
                      )}
                      {isExisting && (
                        <div className="w-4 h-4 flex items-center justify-center text-[var(--theme-text-secondary)]/50">
                          <Check size={14} />
                        </div>
                      )}
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-semibold text-[var(--theme-text-primary)] truncate">
                          {model.name}
                        </span>

                        {isNew && (
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-500/15 text-emerald-500 border border-emerald-500/20">
                            {t('thirdPartyNew')}
                          </span>
                        )}
                        {isStale && (
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-rose-500/15 text-rose-500 border border-rose-500/20">
                            {t('thirdPartyStale')}
                          </span>
                        )}
                        {isExisting && (
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-[var(--theme-bg-secondary)] text-[var(--theme-text-secondary)]">
                            {t('thirdPartyConfigured')}
                          </span>
                        )}

                        {contextLabel && (
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-[var(--theme-bg-secondary)] text-[var(--theme-text-secondary)] border border-[var(--theme-border-primary)]">
                            {contextLabel}
                          </span>
                        )}

                        {model.capabilities?.thinking && (
                          <span
                            className="flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium bg-purple-500/15 text-purple-400 border border-purple-500/20"
                            title={t('thirdPartyThinkingSupported')}
                          >
                            <Lightbulb size={10} />
                            <span>Thinking</span>
                          </span>
                        )}
                        {model.capabilities?.vision && (
                          <span
                            className="flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium bg-teal-500/15 text-teal-400 border border-teal-500/20"
                            title={t('thirdPartyVisionSupported')}
                          >
                            <Eye size={10} />
                            <span>Vision</span>
                          </span>
                        )}
                        {model.capabilities?.tools && (
                          <span
                            className="flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium bg-blue-500/15 text-blue-400 border border-blue-500/20"
                            title={t('thirdPartyToolsSupported')}
                          >
                            <Wrench size={10} />
                            <span>Tools</span>
                          </span>
                        )}
                      </div>

                      <div className="text-[11px] text-[var(--theme-text-secondary)] font-mono truncate mt-0.5">
                        {model.id}
                      </div>
                    </div>
                  </div>

                  <div className="shrink-0 text-xs">
                    {isNew && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleNewModel(model.id);
                        }}
                        className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
                          isNewChecked
                            ? 'bg-emerald-500/15 text-emerald-500 hover:bg-emerald-500/25'
                            : 'bg-[var(--theme-bg-secondary)] text-[var(--theme-text-secondary)] hover:text-[var(--theme-text-primary)]'
                        }`}
                      >
                        {isNewChecked ? t('thirdPartyWillImport') : t('thirdPartyIgnore')}
                      </button>
                    )}
                    {isStale && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleStaleModel(model.id);
                        }}
                        className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
                          isStaleChecked
                            ? 'bg-rose-500/15 text-rose-500 hover:bg-rose-500/25'
                            : 'bg-[var(--theme-bg-secondary)] text-[var(--theme-text-secondary)] hover:text-[var(--theme-text-primary)]'
                        }`}
                      >
                        {isStaleChecked ? t('thirdPartyWillRemove') : t('thirdPartyKeep')}
                      </button>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        <div className="px-6 py-4 border-t border-[var(--theme-border-primary)] bg-[var(--theme-bg-secondary)]/40 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="text-xs text-[var(--theme-text-secondary)] flex items-center gap-1.5">
            {selectedStaleRemoveIds.size > 0 && (
              <span className="flex items-center gap-1 text-rose-400">
                <AlertTriangle size={13} />
                {t('thirdPartyWillPruneCount', { count: selectedStaleRemoveIds.size })}
              </span>
            )}
            {selectedStaleRemoveIds.size > 0 && selectedNewIds.size > 0 && <span>·</span>}
            {selectedNewIds.size > 0 && (
              <span className="text-emerald-400 font-medium">
                {t('thirdPartyWillAddCount', { count: selectedNewIds.size })}
              </span>
            )}
            {selectedStaleRemoveIds.size === 0 && selectedNewIds.size === 0 && (
              <span>{t('thirdPartyNoModelChanges')}</span>
            )}
          </div>

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-medium rounded-xl border border-[var(--theme-border-primary)] hover:bg-[var(--theme-bg-secondary)] text-[var(--theme-text-secondary)] hover:text-[var(--theme-text-primary)] transition-colors"
            >
              {t('cancel')}
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              className="px-5 py-2 text-xs font-semibold rounded-xl bg-blue-600 hover:bg-blue-500 text-white shadow-sm transition-colors flex items-center gap-1.5"
            >
              <Check size={14} />
              <span>{t('thirdPartyApplyChanges')}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
