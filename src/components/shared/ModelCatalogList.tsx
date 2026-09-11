import React from 'react';
import { Check } from 'lucide-react';
import { useI18n } from '@/contexts/I18nContext';
import { type ApiMode, type ModelOption } from '@/types';
import { getModelProviderSectionLabelKey, type ModelCatalogEntry } from '@/utils/model/modelCatalog';

/** Structural mirror of the (private) ModelCatalogSection from utils/model/modelCatalog. */
interface ModelCatalogSectionView {
  entries: ModelCatalogEntry[];
  key: string;
  providerKey?: ApiMode;
  label?: string;
  unavailable?: boolean;
  missingApiKey?: boolean;
}

export type ModelCatalogListVariant = 'picker' | 'settings';

interface ModelCatalogListProps {
  sections: ModelCatalogSectionView[];
  variant: ModelCatalogListVariant;
  /** Injected so both call sites keep their own icon dependency (shared/ModelIcon). */
  renderModelIcon: (model: ModelOption) => React.ReactNode;
  /** Selection predicate: plain id match in the picker, id+apiMode match in settings. */
  isEntrySelected: (entry: ModelCatalogEntry) => boolean;
  /**
   * Settings-variant badge text for the selected model. Callers in a scoped
   * surface should pass the scope name (e.g. "New chat default") — the default
   * ("Active") would be misleading when the selection is not the in-use model.
   */
  activeBadgeLabel?: string;
  /**
   * Picker keyboard navigation highlight (matched by model id, mirroring the
   * original `visibleEntries[activeIndex]?.id === entry.id` check). Settings
   * lists have no keyboard highlight and omit this prop.
   */
  activeEntryId?: string;
  /** Click behavior for an available entry; unavailable entries stay inert. */
  onSelectEntry: (entry: ModelCatalogEntry) => void;
  /** Optional hover callback for showing detailed model specifications card. */
  onHoverEntry?: (entry: ModelCatalogEntry | null) => void;
}

/**
 * Shared model-catalog rendering extracted from ModelPicker and the settings
 * ModelListView: catalog sections → provider header (+ unavailable / missing
 * key suffixes) → entry buttons (icon / name / missing-key badge / id /
 * selected state). Styling details differ between the two surfaces, so each
 * variant keeps its exact original class strings and attributes — only the
 * structure, section labels, and option-key rule are single-sourced here.
 */
export const ModelCatalogList: React.FC<ModelCatalogListProps> = ({
  sections,
  variant,
  renderModelIcon,
  isEntrySelected,
  activeBadgeLabel,
  activeEntryId,
  onSelectEntry,
  onHoverEntry,
}) => {
  const { t } = useI18n();

  // Muted text color differs per surface: tertiary in the picker dropdown,
  // secondary in the settings list — same tokens as the original components.
  const mutedTextClass =
    variant === 'picker' ? 'text-[var(--theme-text-tertiary)]' : 'text-[var(--theme-text-secondary)]';
  // Option keys must stay scoped per surface: the picker falls back to
  // `gemini`, the settings list to `gemini-native`, matching the DOM ids /
  // testids rendered before this extraction.
  const optionKeyFallbackProviderId = variant === 'picker' ? 'gemini' : 'gemini-native';

  return (
    <>
      {sections.map((section) => (
        <div key={section.key} className="space-y-1" data-provider-section={section.providerKey}>
          {section.providerKey && (
            <div className={`px-2 pt-1 pb-1 text-xs font-semibold uppercase tracking-[0.08em] ${mutedTextClass}`}>
              {section.label ?? t(getModelProviderSectionLabelKey(section.providerKey))}
              {section.unavailable ? ` · ${t('thirdPartyConnectionUnavailable')}` : ''}
              {section.missingApiKey ? ` · ${t('thirdPartyApiKeyMissing')}` : ''}
            </div>
          )}
          {section.unavailable && (
            <p className={`px-2 pb-1 text-xs ${mutedTextClass}`}>{t('thirdPartyConnectionUnavailableHint')}</p>
          )}
          {section.entries.map((entry) => {
            const isSelected = isEntrySelected(entry);
            const isActive = activeEntryId !== undefined && entry.id === activeEntryId;
            const optionKey = `${entry.model.providerId ?? optionKeyFallbackProviderId}:${entry.id}`;
            const isUnavailable = Boolean(entry.model.unavailable);

            if (variant === 'picker') {
              return (
                <button
                  key={optionKey}
                  id={`model-picker-option-${optionKey}`}
                  role="option"
                  type="button"
                  aria-selected={isSelected}
                  aria-disabled={isUnavailable}
                  disabled={isUnavailable}
                  onClick={() => onSelectEntry(entry)}
                  onMouseEnter={() => onHoverEntry?.(entry)}
                  onMouseLeave={() => onHoverEntry?.(null)}
                  onPointerEnter={() => onHoverEntry?.(entry)}
                  onFocus={() => onHoverEntry?.(entry)}
                  onBlur={() => onHoverEntry?.(null)}
                  className={`group w-full text-left px-3 py-2.5 text-sm rounded-xl flex items-start justify-between transition-colors outline-none border ${
                    isUnavailable
                      ? 'opacity-50 cursor-not-allowed border-transparent'
                      : `cursor-pointer ${
                          isSelected
                            ? 'bg-[var(--theme-bg-tertiary)]/60 border-[var(--theme-border-secondary)]'
                            : 'bg-transparent border-transparent hover:bg-[var(--theme-bg-tertiary)] hover:border-[var(--theme-border-secondary)]'
                        } ${isActive && !isSelected ? 'bg-[var(--theme-bg-tertiary)] border-[var(--theme-border-secondary)]' : ''}`
                  }`}
                >
                  <div className="flex items-start gap-2.5 min-w-0 flex-grow overflow-hidden">
                    <div className="mt-0.5 flex-shrink-0">{renderModelIcon(entry.model)}</div>
                    <div className="min-w-0 flex-grow">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span
                          className={`truncate ${isSelected ? 'text-[var(--theme-text-link)] font-semibold' : 'text-[var(--theme-text-primary)]'}`}
                          title={entry.name}
                        >
                          {entry.name}
                        </span>
                        {entry.model.missingApiKey && (
                          <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-[var(--theme-bg-warning)] text-[var(--theme-text-warning)]">
                            {t('thirdPartyApiKeyMissing')}
                          </span>
                        )}
                      </div>
                      <div className="mt-1 truncate font-mono text-xs text-[var(--theme-text-tertiary)]">
                        {entry.id}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-1 flex-shrink-0 pl-3 pt-0.5">
                    {isSelected && <Check size={14} className="text-[var(--theme-text-link)]" strokeWidth={1.5} />}
                  </div>
                </button>
              );
            }

            return (
              <button
                type="button"
                key={optionKey}
                data-testid={`settings-model-option-${optionKey}`}
                aria-disabled={isUnavailable}
                disabled={isUnavailable}
                onPointerDown={(event) => {
                  event.preventDefault();
                }}
                onClick={() => {
                  if (isUnavailable) {
                    return;
                  }
                  onSelectEntry(entry);
                }}
                className={`w-full flex items-start gap-3 px-3 py-2.5 text-sm rounded-xl border transition-colors text-left ${
                  isUnavailable
                    ? 'opacity-50 cursor-not-allowed border-transparent text-[var(--theme-text-secondary)]'
                    : isSelected
                      ? 'bg-[var(--theme-bg-accent)]/10 border-[var(--theme-border-focus)] text-[var(--theme-text-primary)]'
                      : 'border-transparent text-[var(--theme-text-secondary)] hover:bg-[var(--theme-bg-tertiary)]/50 hover:border-[var(--theme-border-secondary)] hover:text-[var(--theme-text-primary)]'
                }`}
              >
                <div className={`flex-shrink-0 mt-0.5 ${isSelected ? 'text-[var(--theme-text-link)]' : 'opacity-70'}`}>
                  {renderModelIcon(entry.model)}
                </div>
                <div className="flex-grow min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`font-medium truncate ${isSelected ? 'text-[var(--theme-text-link)]' : ''}`}>
                      {entry.name}
                    </span>
                    {entry.model.missingApiKey && (
                      <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-[var(--theme-bg-warning)] text-[var(--theme-text-warning)]">
                        {t('thirdPartyApiKeyMissing')}
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-[var(--theme-text-secondary)] font-mono truncate opacity-70">
                    {entry.id}
                  </div>
                </div>

                <div className="flex-shrink-0 ml-2">
                  {isSelected && (
                    <div className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-[var(--theme-bg-accent)] text-[var(--theme-text-accent)] text-xs font-semibold shadow-xs border border-transparent">
                      <Check size={11} strokeWidth={2.5} />
                      <span>{activeBadgeLabel ?? t('settingsActiveModel')}</span>
                    </div>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      ))}
    </>
  );
};
