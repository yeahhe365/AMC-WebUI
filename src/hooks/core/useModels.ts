import { logService } from '@/services/logService';
import { useState, useCallback, useEffect, useRef } from 'react';
import { type ModelOption } from '@/types';
import { sanitizeModelOptions, sortModels } from '@/utils/model/modelSorting';
import { useModelPreferencesStore } from '@/stores/modelPreferencesStore';
import { getDefaultModelOptions } from '@/utils/defaultModelOptions';

const reconcileCustomModelsWithDefaults = (
  customModels: ModelOption[],
  defaultModels: ModelOption[],
): { merged: ModelOption[]; hasChanges: boolean } => {
  const existingIds = new Set(customModels.map((model) => model.id.trim().toLowerCase()));
  const missingDefaults = defaultModels.filter(
    (defaultModel) => !existingIds.has(defaultModel.id.trim().toLowerCase()),
  );

  if (missingDefaults.length === 0) {
    return { merged: customModels, hasChanges: false };
  }

  // Auto-merge newly introduced official default models while preserving existing custom entries
  return {
    merged: sortModels([...customModels, ...missingDefaults]),
    hasChanges: true,
  };
};

export const useModels = () => {
  const customModels = useModelPreferencesStore((state) => state.customModels);
  const setCustomModels = useModelPreferencesStore((state) => state.setCustomModels);
  const [defaultModels] = useState<ModelOption[]>(() => getDefaultModelOptions());
  const [modelsLoadingError, setModelsLoadingError] = useState<string | null>(null);
  const initialReconciledRef = useRef(false);

  useEffect(() => {
    useModelPreferencesStore.getState().hydrateLegacyModelPreferences();
  }, []);

  // Reconcile once on initial startup if customModels was already populated from persistence
  // (e.g. user updated Docker container from a previous version without Gemini 3.5 Transcribe).
  useEffect(() => {
    if (!initialReconciledRef.current) {
      initialReconciledRef.current = true;
      const initialCustom = useModelPreferencesStore.getState().customModels;
      if (initialCustom && initialCustom.length > 0) {
        const defaults = getDefaultModelOptions();
        const { merged, hasChanges } = reconcileCustomModelsWithDefaults(initialCustom, defaults);
        if (hasChanges) {
          useModelPreferencesStore.getState().setCustomModels(merged);
          logService.info('Auto-reconciled user model list with new built-in default models', {
            count: merged.length,
          });
        }
      }
    }
  }, []);

  const setApiModels = useCallback(
    (models: ModelOption[]) => {
      const sanitizedModels = sanitizeModelOptions(models);
      setModelsLoadingError(null);
      setCustomModels(sanitizedModels);
    },
    [setCustomModels],
  );

  const hasCustomModels = !!customModels?.length;

  return {
    apiModels: hasCustomModels ? customModels : defaultModels,
    setApiModels,
    isModelsLoading: false,
    modelsLoadingError,
  };
};
