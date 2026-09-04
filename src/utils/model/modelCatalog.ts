import type { ApiMode, ModelOption } from '@/types';
import { getModelCapabilities, isGeminiRoboticsModel } from './modelCapabilities';
import { sortModels } from './modelSorting';
import { THIRD_PARTY_PROVIDER_LABELS, THIRD_PARTY_TEMPLATE_LABELS } from '@/utils/thirdPartyApiProviders';

type ModelCatalogGroup = 'pinned' | 'standard';
type ModelCatalogCategory = 'text' | 'live' | 'tts' | 'image' | 'robotics' | 'other';
type ModelBadgeKey = 'pinned' | 'live' | 'tts' | 'image' | 'robotics' | 'gemma' | 'flash' | 'pro';
type ModelCatalogProviderKey = ApiMode;

interface ModelCatalogSection {
  entries: ModelCatalogEntry[];
  key: string;
  providerKey?: ModelCatalogProviderKey;
  label?: string;
  unavailable?: boolean;
  missingApiKey?: boolean;
}

export interface ModelCatalogEntry {
  badgeKeys: ModelBadgeKey[];
  category: ModelCatalogCategory;
  group: ModelCatalogGroup;
  id: string;
  model: ModelOption;
  name: string;
  searchText: string;
}

const getCategory = (model: ModelOption): ModelCatalogCategory => {
  const { id } = model;
  const capabilities = getModelCapabilities(id);

  if (isGeminiRoboticsModel(id)) {
    return 'robotics';
  }

  if (capabilities.isNativeAudioModel) {
    return 'live';
  }

  if (capabilities.isTtsModel) {
    return 'tts';
  }

  if (capabilities.isImageGenerationModel) {
    return 'image';
  }

  if (capabilities.isGemmaModel || id.toLowerCase().includes('gemini')) {
    return 'text';
  }

  return 'other';
};

const getBadgeKeys = (model: ModelOption): ModelBadgeKey[] => {
  const { id, isPinned } = model;
  const lowerId = id.toLowerCase();
  const capabilities = getModelCapabilities(id);
  const badges: ModelBadgeKey[] = [];

  if (isPinned) {
    badges.push('pinned');
  }
  if (capabilities.isNativeAudioModel) {
    badges.push('live');
  }
  if (capabilities.isTtsModel) {
    badges.push('tts');
  }
  if (isGeminiRoboticsModel(id)) {
    badges.push('robotics');
  }
  if (capabilities.isImageGenerationModel) {
    badges.push('image');
  }
  if (capabilities.isGemmaModel) {
    badges.push('gemma');
  }
  if (lowerId.includes('flash')) {
    badges.push('flash');
  }
  if (lowerId.includes('pro')) {
    badges.push('pro');
  }

  return badges;
};

const buildSearchText = (model: ModelOption, category: ModelCatalogCategory, badgeKeys: ModelBadgeKey[]) => {
  return [model.name, model.id, category, ...badgeKeys].join(' ').toLowerCase();
};

export const buildModelCatalog = (models: ModelOption[]): ModelCatalogEntry[] => {
  return sortModels(models).map((model) => {
    const category = getCategory(model);
    const badgeKeys = getBadgeKeys(model);

    return {
      badgeKeys,
      category,
      group: model.isPinned ? 'pinned' : 'standard',
      id: model.id,
      model,
      name: model.name,
      searchText: buildSearchText(model, category, badgeKeys),
    };
  });
};

export const filterModelCatalog = (entries: ModelCatalogEntry[], query: string): ModelCatalogEntry[] => {
  if (!query.trim()) {
    return entries;
  }

  return entries.filter((entry) => entry.searchText.includes(query.trim().toLowerCase()));
};

export const buildModelCatalogSections = (entries: ModelCatalogEntry[]): ModelCatalogSection[] => {
  const hasProviderSections = entries.some((entry) => entry.model.apiMode);
  if (hasProviderSections) {
    const sections: ModelCatalogSection[] = [];
    const baseProviderOrder: ModelCatalogProviderKey[] = ['gemini-native'];

    baseProviderOrder.forEach((providerKey) => {
      const providerEntries = entries.filter((entry) => entry.model.apiMode === providerKey);
      if (providerEntries.length > 0) {
        sections.push({ key: providerKey, providerKey, entries: providerEntries });
      }
    });

    // Split third-party models into per-provider subsections so OpenAI / Anthropic /
    // Qwen ... stay distinguishable instead of collapsing into one merged bucket.
    const thirdPartyEntries = entries.filter((entry) => entry.model.apiMode === 'third-party');
    if (thirdPartyEntries.length > 0) {
      const seenConnectionIds = new Set<string>();
      for (const entry of thirdPartyEntries) {
        const connectionId = entry.model.providerId;
        if (!connectionId || seenConnectionIds.has(connectionId)) {
          continue;
        }
        seenConnectionIds.add(connectionId);
        const providerEntries = thirdPartyEntries.filter((candidate) => candidate.model.providerId === connectionId);
        const label =
          providerEntries[0]?.model.connectionName ||
          THIRD_PARTY_PROVIDER_LABELS[connectionId as keyof typeof THIRD_PARTY_PROVIDER_LABELS] ||
          THIRD_PARTY_TEMPLATE_LABELS[connectionId as keyof typeof THIRD_PARTY_TEMPLATE_LABELS] ||
          connectionId;
        sections.push({
          key: `third-party:${connectionId}`,
          providerKey: 'third-party',
          label,
          unavailable: providerEntries.every((candidate) => candidate.model.unavailable),
          missingApiKey: providerEntries.some((candidate) => candidate.model.missingApiKey),
          entries: providerEntries,
        });
      }

      const orphanEntries = thirdPartyEntries.filter((entry) => !entry.model.providerId);
      if (orphanEntries.length > 0) {
        sections.push({ key: 'third-party', providerKey: 'third-party', entries: orphanEntries });
      }
    }

    return sections;
  }

  const pinned = entries.filter((entry) => entry.group === 'pinned');
  const standard = entries.filter((entry) => entry.group === 'standard');
  const categories: ModelCatalogCategory[] = ['text', 'live', 'tts', 'image', 'robotics', 'other'];
  const sections: ModelCatalogSection[] = [];

  if (pinned.length > 0) {
    sections.push({ key: 'pinned', entries: pinned });
  }

  categories.forEach((category) => {
    const categoryEntries = standard.filter((entry) => entry.category === category);
    if (categoryEntries.length > 0) {
      sections.push({ key: category, entries: categoryEntries });
    }
  });

  return sections;
};

export const getModelProviderSectionLabelKey = (providerKey: ModelCatalogProviderKey): string => {
  if (providerKey === 'third-party') {
    return 'modelPickerProviderThirdParty';
  }

  return 'modelPickerProviderGemini';
};

/**
 * Model ids for the Tab-cycle quick switch. Deduplicated by bare id keeping the
 * first occurrence (Gemini models come first in the merged list, then providers
 * in fixed order), matching the route-inference order. Known limitation: two
 * providers exposing the same model id cannot be told apart in the Tab cycle —
 * the cycle only reaches the first one. Point-to-point picks in the header
 * carry an explicit providerId and are not affected.
 */
export const getQuickSwitchModelIds = (models: ModelOption[]): string[] => [
  ...new Set(buildModelCatalog(models).map((entry) => entry.id)),
];

const DEFAULT_TAB_CYCLE_MODEL_IDS = ['gemini-3.1-pro-preview', 'gemini-3.8-flash'] as const;

export const getTabCycleModelIds = (models: ModelOption[], configuredIds?: string[]): string[] => {
  const orderedIds = getQuickSwitchModelIds(models);
  const defaultIds = orderedIds.filter((id) =>
    DEFAULT_TAB_CYCLE_MODEL_IDS.includes(id as (typeof DEFAULT_TAB_CYCLE_MODEL_IDS)[number]),
  );

  if (!configuredIds || configuredIds.length === 0) {
    return defaultIds.length > 0 ? defaultIds : orderedIds;
  }

  const configuredSet = new Set(configuredIds);
  const filteredIds = orderedIds.filter((id) => configuredSet.has(id));

  if (filteredIds.length > 0) return filteredIds;
  if (defaultIds.length > 0) return defaultIds;
  return orderedIds;
};
