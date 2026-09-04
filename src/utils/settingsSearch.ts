import { translations } from '@/i18n/coreTranslations';
import { SETTINGS_SEARCH_CATALOG, type SettingsSearchEntry } from '@/constants/settingsSearchCatalog';
import { SETTINGS_TAB_IDS, SETTINGS_TAB_LABEL_KEYS } from '@/constants/settingsTabs';
import type { SettingsTab } from '@/stores/settingsUiStore';

const normalizeQuery = (value: string): string => value.trim().toLowerCase().replace(/\s+/g, ' ');

const normalizeTerms = (rawQuery: string): string[] =>
  Array.from(new Set(normalizeQuery(rawQuery).split(' ').filter(Boolean)));

const collectTextsForKey = (key: string, resolveText: (key: string) => string): string[] => {
  const texts = new Set<string>();
  const live = resolveText(key);
  if (live && live !== key) {
    texts.add(live);
  }

  const entry = translations[key];
  if (entry) {
    if (entry.en) texts.add(entry.en);
    if (entry.zh) texts.add(entry.zh);
  }

  return Array.from(texts);
};

const matchesAllTerms = (haystack: string, terms: string[]): boolean => terms.every((term) => haystack.includes(term));

const LABEL_MATCH_TIER = 0;
const DESCRIPTION_MATCH_TIER = 1;

/**
 * Rank of an entry for a query, or null when it does not match. Every term
 * must appear somewhere (label/description/group/id); entries whose label or
 * id alone covers all terms outrank description/group-only matches.
 */
const entryMatchTier = (
  entry: SettingsSearchEntry,
  terms: string[],
  resolveText: (key: string) => string,
): number | null => {
  const idText = entry.id.replace(/[-_]/g, ' ');
  const labelHaystack = normalizeQuery([...collectTextsForKey(entry.labelKey, resolveText), idText].join(' '));
  if (matchesAllTerms(labelHaystack, terms)) {
    return LABEL_MATCH_TIER;
  }

  const contextParts = [
    ...(entry.descriptionKey ? collectTextsForKey(entry.descriptionKey, resolveText) : []),
    ...(entry.groupKey ? collectTextsForKey(entry.groupKey, resolveText) : []),
  ];
  const fullHaystack = normalizeQuery([...labelHaystack.split(' '), ...contextParts].join(' '));
  return matchesAllTerms(fullHaystack, terms) ? DESCRIPTION_MATCH_TIER : null;
};

export interface SettingsSearchResult extends SettingsSearchEntry {
  label: string;
  /** Localized name of the target tab, shown as a breadcrumb in flat mode. */
  tabLabel: string;
  groupLabel?: string;
  description?: string;
}

/**
 * Filter the settings search catalog by a free-text query.
 * Matches against current-language and bilingual label/description text.
 * Multi-word queries require every term to match (in any field, any order);
 * label matches rank before description/group-only matches.
 */
export const searchSettingsCatalog = (
  rawQuery: string,
  resolveText: (key: string) => string,
  catalog: SettingsSearchEntry[] = SETTINGS_SEARCH_CATALOG,
): SettingsSearchResult[] => {
  const terms = normalizeTerms(rawQuery);
  if (terms.length === 0) {
    return [];
  }

  return catalog
    .map((entry) => ({ entry, tier: entryMatchTier(entry, terms, resolveText) }))
    .filter((match): match is { entry: SettingsSearchEntry; tier: number } => match.tier !== null)
    .sort((a, b) => a.tier - b.tier)
    .map(({ entry }) => ({
      ...entry,
      label: resolveText(entry.labelKey),
      tabLabel: resolveText(SETTINGS_TAB_LABEL_KEYS[entry.tab]),
      groupLabel: entry.groupKey ? resolveText(entry.groupKey) : undefined,
      description: entry.descriptionKey ? resolveText(entry.descriptionKey) : undefined,
    }));
};

/**
 * When a query matches many results, group them by target tab so the user can
 * see where each hit lives. Below the threshold the results stay flat (the
 * component renders them ungrouped with a per-item breadcrumb).
 */
export const SETTINGS_SEARCH_GROUP_THRESHOLD = 8;

interface SettingsSearchResultGroup {
  tab: SettingsTab;
  results: SettingsSearchResult[];
}

export const groupSettingsSearchResults = (
  results: SettingsSearchResult[],
  tabOrder: SettingsTab[] = SETTINGS_TAB_IDS,
): SettingsSearchResultGroup[] => {
  if (results.length <= SETTINGS_SEARCH_GROUP_THRESHOLD) {
    return []; // empty array = flat mode
  }

  const byTab = new Map<SettingsTab, SettingsSearchResult[]>();
  results.forEach((result) => {
    const list = byTab.get(result.tab) ?? [];
    list.push(result);
    byTab.set(result.tab, list);
  });

  // Follow sidebar tab order; preserve catalog order within each group.
  return tabOrder.filter((tab) => byTab.has(tab)).map((tab) => ({ tab, results: byTab.get(tab)! }));
};
