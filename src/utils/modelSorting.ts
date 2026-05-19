import { type ModelOption } from '@/types';

import { getModelCapabilities, isImageModel } from './modelCapabilities';

export const sanitizeModelOptions = (models: ModelOption[]): ModelOption[] => {
  const seenIds = new Set<string>();

  return models.reduce<ModelOption[]>((sanitized, model) => {
    const normalizedId = model.id.trim();

    if (!normalizedId || seenIds.has(normalizedId)) {
      return sanitized;
    }

    seenIds.add(normalizedId);
    sanitized.push({
      ...model,
      id: normalizedId,
      name: model.name.trim() || normalizedId,
    });

    return sanitized;
  }, []);
};

export const resolveSupportedModelId = (modelId: string | null | undefined, fallback: string): string =>
  modelId || fallback;

export const sortModels = (models: ModelOption[]): ModelOption[] => {
  const pinnedPriorityOrder: Record<string, number> = {
    'gemini-3.1-pro-preview': 0,
    'gemini-3.5-flash': 1,
    'gemini-3-flash-preview': 2,
    'gemini-3.1-flash-lite': 3,
  };

  const getCategoryWeight = (id: string) => {
    const capabilities = getModelCapabilities(id);
    if (capabilities.isTtsModel) return 3;
    if (capabilities.isRealImagenModel) return 5;
    if (isImageModel(id)) return 4;
    if (capabilities.isNativeAudioModel) return 2;
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
