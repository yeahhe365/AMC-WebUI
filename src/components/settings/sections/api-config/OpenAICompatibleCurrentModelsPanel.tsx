import React, { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { useI18n } from '@/contexts/I18nContext';
import { SETTINGS_SEARCH_INPUT_CLASS } from '@/constants/designTokens';
import {
  type EditableOpenAICompatibleModelRow,
  getOpenAICompatibleModelName,
  openaiCompatibleModelMatchesSearch,
} from './openaiCompatibleModelListState';
import { useOpenAICompatibleModelRowHandlers } from './useOpenAICompatibleModelRowHandlers';
import { OpenAICompatibleModelRowFields } from './OpenAICompatibleModelRowFields';

interface OpenAICompatibleCurrentModelsPanelProps {
  rows: EditableOpenAICompatibleModelRow[];
  onCommitRows: (rows: EditableOpenAICompatibleModelRow[]) => void;
}

export const OpenAICompatibleCurrentModelsPanel: React.FC<OpenAICompatibleCurrentModelsPanelProps> = ({
  rows,
  onCommitRows,
}) => {
  const { t } = useI18n();
  const [modelSearchText, setModelSearchText] = useState('');
  const filteredRows = useMemo(
    () =>
      rows.filter((row) =>
        openaiCompatibleModelMatchesSearch(
          { id: row.id, name: getOpenAICompatibleModelName(row.id, row.name) },
          modelSearchText,
        ),
      ),
    [modelSearchText, rows],
  );
  const modelRowHandlers = useOpenAICompatibleModelRowHandlers(rows, onCommitRows);

  return (
    <section className="min-w-0 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div className="text-xs font-semibold uppercase tracking-wider text-[var(--theme-text-secondary)]">
          {t('settingsOpenAICompatibleCurrentModels')}
        </div>
        <span className="rounded-full bg-[var(--theme-bg-tertiary)] px-2 py-0.5 text-xs font-medium text-[var(--theme-text-secondary)]">
          {rows.length}
        </span>
      </div>
      <label className="relative block">
        <Search
          size={14}
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--theme-text-secondary)]"
        />
        <input
          type="search"
          value={modelSearchText}
          onChange={(event) => setModelSearchText(event.target.value)}
          className={SETTINGS_SEARCH_INPUT_CLASS}
          placeholder={t('settingsOpenAICompatibleModelSearch')}
          aria-label={t('settingsOpenAICompatibleModelSearch')}
          data-openai-compatible-model-search-input="true"
        />
      </label>

      <div className="max-h-[430px] overflow-y-auto rounded-lg bg-[var(--theme-bg-input)]/45 p-1.5 custom-scrollbar">
        {filteredRows.length > 0 ? (
          <div className="space-y-1">
            {filteredRows.map((row) => (
              <OpenAICompatibleModelRowFields key={row.rowId} row={row} variant="manager" {...modelRowHandlers} />
            ))}
          </div>
        ) : (
          <div className="px-3 py-8 text-center text-xs italic text-[var(--theme-text-secondary)]">
            {t('modelPickerNoResults')}
          </div>
        )}
      </div>
    </section>
  );
};
