import { describe, expect, it } from 'vitest';
import { ensureFeatureTranslations } from '@/i18n/featureTranslations';
import { getTranslator } from '@/i18n/coreTranslations';
import { SETTINGS_TAB_LABEL_KEYS } from '@/constants/settingsTabs';
import type { SettingsSearchEntry } from '@/constants/settingsSearchCatalog';
import type { SettingsTab } from '@/stores/settingsUiStore';
import {
  searchSettingsCatalog,
  groupSettingsSearchResults,
  SETTINGS_SEARCH_GROUP_THRESHOLD,
  type SettingsSearchResult,
} from './settingsSearch';

const makeResult = (id: string, tab: SettingsTab): SettingsSearchResult => ({
  id,
  tab,
  labelKey: id,
  label: `${tab}-${id}`,
  tabLabel: `TabLabel:${tab}`,
});

describe('searchSettingsCatalog', () => {
  it('matches interface toggles by English and Chinese labels', async () => {
    await ensureFeatureTranslations('settings');
    const tEn = getTranslator('en');
    const tZh = getTranslator('zh');

    const mermaidResults = searchSettingsCatalog('mermaid', tEn);
    expect(mermaidResults.some((result) => result.id === 'interface-mermaid')).toBe(true);

    const zhResults = searchSettingsCatalog('流式', tZh);
    expect(zhResults.some((result) => result.id === 'interface-streaming')).toBe(true);
  });

  it('matches across tabs and returns empty for blank queries', async () => {
    await ensureFeatureTranslations('settings');
    const t = getTranslator('en');

    expect(searchSettingsCatalog('   ', t)).toEqual([]);

    const apiResults = searchSettingsCatalog('proxy', t);
    // Files API / third-party / API config should still surface for related terms
    const mcpResults = searchSettingsCatalog('MCP', t);
    expect(mcpResults.some((result) => result.tab === 'mcp')).toBe(true);

    const dataResults = searchSettingsCatalog('reset', t);
    expect(dataResults.some((result) => result.id === 'data-reset')).toBe(true);

    const shortcutResults = searchSettingsCatalog('cycle models', t);
    expect(shortcutResults.some((result) => result.tab === 'shortcuts')).toBe(true);

    // Ensure multi-tab coverage exists in catalog
    expect(apiResults.length + mcpResults.length + dataResults.length).toBeGreaterThan(0);
  });

  it('populates tabLabel from the target tab label key', async () => {
    await ensureFeatureTranslations('settings');
    const t = getTranslator('en');

    const results = searchSettingsCatalog('proxy', t);
    expect(results.length).toBeGreaterThan(0);
    for (const result of results) {
      expect(result.tabLabel).toBe(t(SETTINGS_TAB_LABEL_KEYS[result.tab]));
      expect(result.tabLabel.length).toBeGreaterThan(0);
    }
  });

  it('matches multi-word queries with terms in any order', async () => {
    await ensureFeatureTranslations('settings');
    const t = getTranslator('en');

    // "Clear History" label — the reversed word order must still match.
    const reversed = searchSettingsCatalog('history clear', t);
    expect(reversed.some((result) => result.id === 'data-clear-history')).toBe(true);
  });

  it('matches multi-word queries with terms split across label and group', async () => {
    await ensureFeatureTranslations('settings');
    const t = getTranslator('en');

    // "streaming" lives in the label, "behavior" in the group heading.
    const results = searchSettingsCatalog('streaming behavior', t);
    expect(results.some((result) => result.id === 'interface-streaming')).toBe(true);
  });

  it('requires every term of a multi-word query to match', async () => {
    await ensureFeatureTranslations('settings');
    const t = getTranslator('en');

    const results = searchSettingsCatalog('streaming nonexistent-term', t);
    expect(results.some((result) => result.id === 'interface-streaming')).toBe(false);
  });

  it('ranks label matches before description-only matches', () => {
    const texts: Record<string, string> = {
      'label-primary': 'Notifications',
      'label-secondary': 'Sounds',
      'desc-secondary': 'notification feedback sounds',
    };
    const t = (key: string) => texts[key] ?? key;
    const catalog: SettingsSearchEntry[] = [
      { id: 'entry-secondary', tab: 'interface', labelKey: 'label-secondary', descriptionKey: 'desc-secondary' },
      { id: 'entry-primary', tab: 'interface', labelKey: 'label-primary' },
    ];

    const results = searchSettingsCatalog('notification', t, catalog);

    expect(results.map((result) => result.id)).toEqual(['entry-primary', 'entry-secondary']);
  });
});

describe('groupSettingsSearchResults', () => {
  it('returns an empty array (flat mode) at or below the threshold', () => {
    const results = Array.from({ length: SETTINGS_SEARCH_GROUP_THRESHOLD }, (_, i) =>
      makeResult(`flat-${i}`, 'interface'),
    );

    expect(groupSettingsSearchResults(results)).toEqual([]);
  });

  it('groups above the threshold by tab in sidebar order, preserving in-group order', () => {
    const results: SettingsSearchResult[] = [
      makeResult('api-1', 'api'),
      makeResult('data-1', 'data'),
      makeResult('models-1', 'models'),
      makeResult('api-2', 'api'),
      makeResult('data-2', 'data'),
      makeResult('models-2', 'models'),
      makeResult('api-3', 'api'),
      makeResult('data-3', 'data'),
      makeResult('models-3', 'models'),
    ];

    const groups = groupSettingsSearchResults(results);

    // 9 results (threshold + 1) → grouped, in sidebar order (models → interface → api → …).
    expect(groups.map((group) => group.tab)).toEqual(['models', 'api', 'data']);
    expect(groups.map((group) => group.results.map((r) => r.id))).toEqual([
      ['models-1', 'models-2', 'models-3'],
      ['api-1', 'api-2', 'api-3'],
      ['data-1', 'data-2', 'data-3'],
    ]);
  });

  it('preserves total result count across groups', () => {
    const results = Array.from({ length: 12 }, (_, i) => makeResult(`m${i}`, 'mcp'));

    const groups = groupSettingsSearchResults(results);
    const total = groups.reduce((sum, group) => sum + group.results.length, 0);

    expect(total).toBe(results.length);
  });
});
