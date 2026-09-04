import React from 'react';
import { useI18n } from '@/contexts/I18nContext';
import { type ScenarioCategory } from '@/types';
import { ScrollText, Save, ChevronDown } from 'lucide-react';
import { CATEGORY_META, CATEGORY_ORDER, getCategory } from '@/features/scenarios/scenarioCategories';

interface ScenarioEditorHeaderProps {
  title: string;
  setTitle: (title: string) => void;
  description?: string;
  setDescription: (description: string) => void;
  category?: ScenarioCategory;
  setCategory: (category: ScenarioCategory) => void;
  onSave: () => void;
  onOpenSystemPrompt: () => void;
  isSaveDisabled: boolean;
  readOnly: boolean;
}

export const ScenarioEditorHeader: React.FC<ScenarioEditorHeaderProps> = ({
  title,
  setTitle,
  description,
  setDescription,
  category,
  setCategory,
  onSave,
  onOpenSystemPrompt,
  isSaveDisabled,
  readOnly,
}) => {
  const { t } = useI18n();
  const activeMeta = CATEGORY_META[getCategory(category)];
  const ActiveCategoryIcon = activeMeta.icon;

  return (
    <div className="bg-[var(--theme-bg-primary)] border-b border-[var(--theme-border-secondary)] px-3 sm:px-4 pt-3 sm:pt-3.5 pb-3 flex-shrink-0 z-10">
      <div className="flex items-center gap-3 sm:gap-3.5">
        <label htmlFor="scenario-title-input" className="sr-only">
          {t('scenariosEditorTitleLabel')}
        </label>
        <input
          id="scenario-title-input"
          type="text"
          value={title}
          onChange={(e) => !readOnly && setTitle(e.target.value)}
          placeholder={t('scenariosEditorTitlePlaceholder')}
          aria-label={t('scenariosEditorTitleLabel')}
          className="flex-1 min-w-0 bg-[var(--theme-bg-input)]/40 hover:bg-[var(--theme-bg-input)]/70 focus:bg-[var(--theme-bg-input)] px-3 py-1.5 -mx-3 rounded-lg text-lg sm:text-xl font-bold text-[var(--theme-text-primary)] placeholder-[var(--theme-text-tertiary)] outline-none focus:ring-2 focus:ring-[var(--theme-border-focus)] transition-all"
          readOnly={readOnly}
        />

        <button
          onClick={onOpenSystemPrompt}
          className={`${readOnly ? 'cursor-default' : 'hover:bg-[var(--theme-bg-tertiary)]'} flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg border border-[var(--theme-border-secondary)] text-[var(--theme-text-secondary)] transition-colors flex-shrink-0`}
          title={t('scenariosSystemPromptLabel')}
          aria-label={t('scenariosSystemPromptLabel')}
        >
          <ScrollText size={16} />
          <span className="hidden sm:inline">{t('scenariosSystemPromptLabel')}</span>
        </button>

        {!readOnly && (
          <button
            onClick={onSave}
            disabled={isSaveDisabled}
            title={t('scenariosEditorSaveScenarioTitle')}
            className="px-3 sm:px-5 py-2 bg-[var(--theme-bg-accent)] hover:bg-[var(--theme-bg-accent-hover)] text-[var(--theme-text-accent)] rounded-lg font-semibold text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 flex-shrink-0"
          >
            <Save size={16} strokeWidth={2.5} />
            <span className="hidden sm:inline">{t('scenariosEditorSaveScenario')}</span>
          </button>
        )}
      </div>

      {!readOnly && (
        <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 mt-2.5 sm:mt-3">
          <div className="flex items-center gap-2 min-w-0">
            <label
              htmlFor="scenario-category-select"
              className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-[var(--theme-text-tertiary)] flex-shrink-0"
            >
              {t('scenariosEditorCategoryLabel')}
            </label>
            <div className="relative">
              <span className="absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none text-[var(--theme-text-tertiary)]">
                <ActiveCategoryIcon size={12} strokeWidth={2.5} />
              </span>
              <select
                id="scenario-category-select"
                value={getCategory(category)}
                onChange={(e) => setCategory(e.target.value as ScenarioCategory)}
                className="appearance-none pl-7 pr-7 py-1.5 bg-[var(--theme-bg-input)] border border-[var(--theme-border-secondary)] rounded-lg text-xs font-semibold text-[var(--theme-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--theme-border-focus)] cursor-pointer min-w-[8.5rem]"
              >
                {CATEGORY_ORDER.map((value) => (
                  <option key={value} value={value}>
                    {t(CATEGORY_META[value].labelKey)}
                  </option>
                ))}
              </select>
              <ChevronDown
                size={12}
                className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none text-[var(--theme-text-tertiary)]"
              />
            </div>
          </div>

          <div className="flex items-center gap-2 min-w-0 flex-1">
            <label
              htmlFor="scenario-description-input"
              className="text-xs font-bold uppercase tracking-wider text-[var(--theme-text-tertiary)] flex-shrink-0"
            >
              {t('scenariosEditorDescriptionLabel')}
            </label>
            <input
              id="scenario-description-input"
              type="text"
              value={description ?? ''}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t('scenariosEditorDescriptionPlaceholder')}
              aria-label={t('scenariosEditorDescriptionLabel')}
              className="min-w-0 flex-1 bg-transparent border-b border-[var(--theme-border-secondary)] focus:border-[var(--theme-border-focus)] text-xs text-[var(--theme-text-secondary)] placeholder-[var(--theme-text-tertiary)] outline-none py-1 transition-colors"
            />
          </div>
        </div>
      )}
    </div>
  );
};
