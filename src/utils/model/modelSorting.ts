import { normalizeModelApiModeTag, type ModelOption } from '@/types';
import { migrateRemovedModelId } from '@/constants/modelConfiguration';

import { getModelCapabilities, isImageGenerationModel } from './modelCapabilities';

export const sanitizeModelOptions = (models: ModelOption[]): ModelOption[] => {
  const seenIds = new Set<string>();

  return models.reduce<ModelOption[]>((sanitized, model) => {
    // Removed-model migrations (migrateRemovedModelId) apply ONLY to the
    // selected-model pointer (resolveSupportedModelId / tab cycle ids), never to
    // user-defined custom list entries. Rewriting an entry here silently changed
    // or dropped ids the user typed in the list editor (issue #114).
    const normalizedId = model.id.trim();

    if (!normalizedId || seenIds.has(normalizedId)) {
      return sanitized;
    }

    seenIds.add(normalizedId);
    const normalized: ModelOption = {
      ...model,
      id: normalizedId,
      name: model.name.trim() || normalizedId,
    };
    // Normalize the persisted provider-family tag so the legacy
    // 'openai-compatible' tag folds into 'third-party' (and bogus tags are
    // dropped) instead of being spread through verbatim.
    const apiModeTag = normalizeModelApiModeTag(model.apiMode);
    if (apiModeTag) {
      normalized.apiMode = apiModeTag;
    } else {
      delete normalized.apiMode;
    }
    sanitized.push(normalized);

    return sanitized;
  }, []);
};

export const resolveSupportedModelId = (modelId: string | null | undefined, fallback: string): string =>
  migrateRemovedModelId(modelId) || fallback;

/**
 * De-duplicate a model list by id, preserving the first occurrence of each id.
 * Unlike {@link sanitizeModelOptions}, this does not trim/normalize — use it to
 * merge already-sanitized lists (e.g. built-in + third-party + OpenAI-compatible).
 */
export const deduplicateModelsById = (models: ModelOption[]): ModelOption[] => {
  const seenIds = new Set<string>();
  return models.filter((model) => {
    if (seenIds.has(model.id)) {
      return false;
    }
    seenIds.add(model.id);
    return true;
  });
};

export const sortModels = (models: ModelOption[]): ModelOption[] => {
  const pinnedPriorityOrder: Record<string, number> = {
    'gemini-3.1-pro-preview': 0,
    'gemini-3.8-flash': 1,
    'gemini-3.7-flash': 2,
    'gemini-3.5-flash-lite': 3,
    'gemini-3.6-flash': 4,
    'gemini-3-flash-preview': 5,
  };

  const getCategoryWeight = (id: string) => {
    const capabilities = getModelCapabilities(id);
    if (capabilities.isTtsModel) return 3;
    if (isImageGenerationModel(id)) return 4;
    if (capabilities.isNativeAudioModel || capabilities.isTranscribeModel) return 2;
    return 1;
  };

  return [...models].sort((a, b) => {
    if (a.isPinned && !b.isPinned) return -1;
    if (!a.isPinned && b.isPinned) return 1;

    if (a.isPinned && b.isPinned) {
      const weightA = getCategoryWeight(a.id);
      const weightB = getCategoryWeight(b.id);
      if (weightA !== weightB) return weightA - weightB;

      const pinnedPriorityA = pinnedPriorityOrder[a.id];
      const pinnedPriorityB = pinnedPriorityOrder[b.id];
      if (pinnedPriorityA !== undefined || pinnedPriorityB !== undefined) {
        if (pinnedPriorityA === undefined) return 1;
        if (pinnedPriorityB === undefined) return -1;
        if (pinnedPriorityA !== pinnedPriorityB) return pinnedPriorityA - pinnedPriorityB;
      }

      const isA3 = a.id.includes('gemini-3');
      const isB3 = b.id.includes('gemini-3');
      if (isA3 && !isB3) return -1;
      if (!isA3 && isB3) return 1;
    }

    return a.name.localeCompare(b.name);
  });
};
