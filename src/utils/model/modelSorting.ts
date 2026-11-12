import { normalizeModelApiModeTag, type ModelOption } from '@/types';

import { getModelCapabilities, isImageGenerationModel } from './modelCapabilities';

export const sanitizeModelOptions = (models: ModelOption[]): ModelOption[] => {
  const seenIds = new Set<string>();

  return models.reduce<ModelOption[]>((sanitized, model) => {
    // Ids are kept exactly as stored — both for custom list entries and for the
    // selected-model pointer. Deprecated ids are no longer remapped (see
    // modelConfiguration.ts), so a stale id surfaces as a provider error rather
    // than being silently swapped for a model the user never picked.
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
  modelId || fallback;

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
    'gemini-4-hydrogen': -1,
    'gemini-4-carbon': 0,
    'gemini-4-argon': 1,
    'gemini-3.1-pro-preview': 2,
    'gemini-3.8-flash': 3,
    'gemini-3.7-flash': 4,
    'gemini-3.5-flash-lite': 5,
    'gemini-3.6-flash': 6,
    'gemini-3-flash-preview': 7,
  };

  const getCategoryWeight = (modelId: string) => {
    const capabilities = getModelCapabilities(modelId);
    if (capabilities.isTtsModel) return 3;
    if (isImageGenerationModel(modelId)) return 4;
    if (capabilities.isNativeAudioModel || capabilities.isTranscribeModel) return 2;
    return 1;
  };

  // Unpinned companion models (image generation today) are ordered by an explicit
  // rank instead of the display name, so the model Google recommends for new work
  // leads its section. Without this, "Nano Banana 2 Lite" sorted above 2.1 because
  // a space sorts before the dot in "2.1".
  const companionModelOrder: Record<string, number> = {
    'gemini-nano-banana-2.1': 0,
    'gemini-3-pro-image': 1,
    'gemini-3.1-flash-lite-image': 2,
  };

  return [...models].sort((modelA, modelB) => {
    if (modelA.isPinned && !modelB.isPinned) return -1;
    if (!modelA.isPinned && modelB.isPinned) return 1;

    if (modelA.isPinned && modelB.isPinned) {
      const categoryWeightA = getCategoryWeight(modelA.id);
      const categoryWeightB = getCategoryWeight(modelB.id);
      if (categoryWeightA !== categoryWeightB) return categoryWeightA - categoryWeightB;

      const pinnedPriorityA = pinnedPriorityOrder[modelA.id];
      const pinnedPriorityB = pinnedPriorityOrder[modelB.id];
      if (pinnedPriorityA !== undefined || pinnedPriorityB !== undefined) {
        if (pinnedPriorityA === undefined) return 1;
        if (pinnedPriorityB === undefined) return -1;
        if (pinnedPriorityA !== pinnedPriorityB) return pinnedPriorityA - pinnedPriorityB;
      }

      const isModelAGeminiModern = modelA.id.includes('gemini-4') || modelA.id.includes('gemini-3');
      const isModelBGeminiModern = modelB.id.includes('gemini-4') || modelB.id.includes('gemini-3');
      if (isModelAGeminiModern && !isModelBGeminiModern) return -1;
      if (!isModelAGeminiModern && isModelBGeminiModern) return 1;
    }

    const companionOrderA = companionModelOrder[modelA.id];
    const companionOrderB = companionModelOrder[modelB.id];
    if (companionOrderA !== undefined || companionOrderB !== undefined) {
      if (companionOrderA === undefined) return 1;
      if (companionOrderB === undefined) return -1;
      if (companionOrderA !== companionOrderB) return companionOrderA - companionOrderB;
    }

    return modelA.name.localeCompare(modelB.name);
  });
};
