import React, { useMemo, useState } from 'react';
import { Loader2, Plus, RefreshCw, Settings2 } from 'lucide-react';
import type { ModelOption } from '@/types';
import { useI18n } from '@/contexts/I18nContext';
import { SETTINGS_INLINE_ACTION_BUTTON_CLASS } from '@/constants/buttonClasses';
import { OpenAICompatibleModelFetchResult } from './OpenAICompatibleModelFetchResult';
import { OpenAICompatibleModelRowFields } from './OpenAICompatibleModelRowFields';
import { OpenAICompatibleModelManagerModal } from './OpenAICompatibleModelManagerModal';
import {
  buildOpenAICompatibleModelOptions,
  buildOpenAICompatibleModelsKey,
  collectOpenAICompatibleModels,
  createOpenAICompatibleModelRowId,
  type EditableOpenAICompatibleModelRow,
  type OpenAICompatibleModelEditorState,
  normalizeOpenAICompatibleModelRows,
  toEditableOpenAICompatibleModelRows,
} from './openaiCompatibleModelListState';
import { useOpenAICompatibleModelRowHandlers } from './useOpenAICompatibleModelRowHandlers';

interface OpenAICompatibleModelListEditorProps {
  models: ModelOption[];
  selectedModelId: string;
  onModelsChange: (models: ModelOption[]) => void;
  onSelectedModelChange: (modelId: string) => void;
  onFetchModelsForImportPreview?: () => Promise<ModelOption[]>;
  isFetchModelsDisabled?: boolean;
  isFetchingModels?: boolean;
  fetchModelsStatus?: 'idle' | 'success' | 'error';
  fetchModelsMessage?: string | null;
}

export const OpenAICompatibleModelListEditor: React.FC<OpenAICompatibleModelListEditorProps> = ({
  models,
  selectedModelId,
  onModelsChange,
  onSelectedModelChange,
  onFetchModelsForImportPreview,
  isFetchModelsDisabled = false,
  isFetchingModels = false,
  fetchModelsStatus = 'idle',
  fetchModelsMessage = null,
}) => {
  const { t } = useI18n();
  const externalModels = useMemo(
    () => collectOpenAICompatibleModels(models, selectedModelId),
    [models, selectedModelId],
  );
  const externalModelsKey = buildOpenAICompatibleModelsKey(externalModels);
  const externalRows = useMemo(() => toEditableOpenAICompatibleModelRows(externalModels), [externalModels]);
  const [editorState, setEditorState] = useState<OpenAICompatibleModelEditorState>(() => ({
    rows: toEditableOpenAICompatibleModelRows(externalModels),
    sourceModelsKey: externalModelsKey,
  }));
  const [isManagerOpen, setIsManagerOpen] = useState(false);
  const [fetchRequestId, setFetchRequestId] = useState(0);
  const rows = editorState.sourceModelsKey === externalModelsKey ? editorState.rows : externalRows;
  const currentModelIds = useMemo(() => new Set(normalizeOpenAICompatibleModelRows(rows).map((row) => row.id)), [rows]);

  const commitRows = (nextRows: EditableOpenAICompatibleModelRow[]) => {
    const modelOptions = buildOpenAICompatibleModelOptions(nextRows);
    const modelIds = modelOptions.map((model) => model.id);
    setEditorState({
      rows: nextRows,
      // Use the key of the model list AFTER this commit, not the pre-commit
      // externalModelsKey captured in the closure. Otherwise onModelsChange
      // updates the parent, sourceModelsKey !== externalModelsKey on the next
      // render, rows fall back to externalRows (rebuilt with fresh random
      // rowIds each call), and every keystroke remounts the row inputs, losing
      // focus. buildOpenAICompatibleModelOptions normalizes the committed
      // values (trim id/name, empty name falls back to id, dedupe by id), so
      // the parent round-trip produces an identical idname key.
      sourceModelsKey: buildOpenAICompatibleModelsKey(modelOptions),
    });
    onModelsChange(modelOptions);

    if (modelIds.length > 0 && !modelIds.includes(selectedModelId)) {
      onSelectedModelChange(modelIds[0]);
    }
  };
  const modelRowHandlers = useOpenAICompatibleModelRowHandlers(rows, commitRows);

  const handleAddModel = () => {
    setEditorState({
      rows: [...rows, { id: '', name: '', rowId: createOpenAICompatibleModelRowId() }],
      sourceModelsKey: externalModelsKey,
    });
  };

  const handleOpenFetchPreview = () => {
    setIsManagerOpen(true);
    setFetchRequestId((requestId) => requestId + 1);
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <label className="text-xs font-semibold uppercase tracking-wider text-[var(--theme-text-secondary)]">
          {t('settingsOpenAICompatibleModelId')}
          {rows.length > 0 && (
            <span className="ml-1 font-normal text-[var(--theme-text-secondary)]/70">({rows.length})</span>
          )}
        </label>
        <div className="flex flex-wrap items-center gap-2">
          {onFetchModelsForImportPreview && (
            <button
              type="button"
              onClick={handleOpenFetchPreview}
              disabled={isFetchModelsDisabled || isFetchingModels}
              className={SETTINGS_INLINE_ACTION_BUTTON_CLASS}
              title={isFetchModelsDisabled ? t('settingsFetchModelListNeedsKeyAndUrl') : t('settingsFetchModelList')}
            >
              {isFetchingModels ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
              {isFetchingModels ? t('settingsFetchingModelList') : t('settingsFetchModelList')}
            </button>
          )}
          <button
            type="button"
            onClick={() => setIsManagerOpen(true)}
            className={SETTINGS_INLINE_ACTION_BUTTON_CLASS}
            title={t('settingsOpenAICompatibleManageModels')}
          >
            <Settings2 size={14} />
            {t('settingsOpenAICompatibleManageModels')}
          </button>
          <button
            type="button"
            onClick={handleAddModel}
            className={SETTINGS_INLINE_ACTION_BUTTON_CLASS}
            title={t('settingsAddModel')}
          >
            <Plus size={14} />
            {t('settingsAddModel')}
          </button>
        </div>
      </div>

      <div className="rounded-lg bg-[var(--theme-bg-input)]/45 p-1.5 max-h-60 overflow-y-auto custom-scrollbar">
        {rows.length > 0 ? (
          <div className="space-y-1">
            {rows.map((row, index) => (
              <OpenAICompatibleModelRowFields
                key={row.rowId}
                row={row}
                variant="editor"
                rowIndex={index}
                {...modelRowHandlers}
              />
            ))}
          </div>
        ) : (
          <div className="px-3 py-4 text-center text-xs italic text-[var(--theme-text-secondary)]">
            {t('settingsNoModelsInList')}
          </div>
        )}
      </div>

      <p className="text-xs leading-relaxed text-[var(--theme-text-secondary)]">
        {t('settingsOpenAICompatibleModelIdHelp')}
      </p>

      <OpenAICompatibleModelFetchResult status={fetchModelsStatus} message={fetchModelsMessage} />

      <OpenAICompatibleModelManagerModal
        isOpen={isManagerOpen}
        rows={rows}
        currentModelIds={currentModelIds}
        fetchRequestId={fetchRequestId}
        onClose={() => setIsManagerOpen(false)}
        onCommitRows={commitRows}
        onFetchModelsForImportPreview={onFetchModelsForImportPreview}
        isFetchModelsDisabled={isFetchModelsDisabled}
        isFetchingModels={isFetchingModels}
        fetchModelsStatus={fetchModelsStatus}
        fetchModelsMessage={fetchModelsMessage}
      />
    </div>
  );
};
